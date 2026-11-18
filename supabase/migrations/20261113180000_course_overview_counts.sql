-- Course overview reads counts instead of synthesis text, knowledge checks, and evidence.
-- has_synthesis matches bool(synthesis and synthesis.strip()).
-- question_count is null when the module has no knowledge check.
-- evidence_urls is the url of each evidence item, in order, including duplicates.
-- The API dedupes those urls the same way it counts sources on a full lesson.

alter table public.modules
  add column has_synthesis boolean
    generated always as (
      synthesis is not null and btrim(synthesis) <> ''
    ) stored,
  add column question_count integer
    generated always as (
      case
        when knowledge_check is null then null
        when jsonb_typeof(knowledge_check -> 'questions') = 'array'
          then jsonb_array_length(knowledge_check -> 'questions')
        else 0
      end
    ) stored;

alter table public.lessons
  add column evidence_urls jsonb
    generated always as (
      coalesce(
        jsonb_path_query_array(
          case
            when jsonb_typeof(evidence) = 'array' then evidence
            else '[]'::jsonb
          end,
          '$[*].url'
        ),
        '[]'::jsonb
      )
    ) stored;
