/**
 * TypeScript mirror of the backend contracts in apps/api (Pydantic models).
 * Keep in sync with auteur_api.modules.*.schemas. Never invent fields here.
 */

export type ExperienceLevel = "None" | "Basic" | "Intermediate" | "Advanced";

export type RequestState =
  | "draft"
  | "incompatible"
  | "precision_required"
  | "objective_confirmation"
  | "objective_confirmed"
  | "proposals_ready"
  | "proposal_selected"
  | "blueprint_generating"
  | "awaiting_approval"
  | "approved";

export type Compatibility = "Allowed" | "Allowed with reframing" | "Incompatible";

export type ErrorCode =
  | "validation_error"
  | "non_english_input"
  | "not_found"
  | "invalid_state"
  | "stale_version"
  | "generation_failed"
  | "provider_unavailable"
  | "internal_error";

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    support_reference: string;
    details: { field: string | null; issue: string }[];
  };
};

export type CreateLearningRequest = {
  initial_intent: string;
  experience_level: ExperienceLevel;
  prior_knowledge: string | null;
  expected_outcome: string;
};

export type CompatibilityAssessment = {
  classification: Compatibility;
  explanation: string;
  compatible_aspects: string[];
  unreachable_aspects: string[];
  safe_reframing: string | null;
  risk_category: string | null;
};

export type PrecisionOption = {
  id: string;
  title: string;
  explanation: string;
  relation_to_intention: string;
};

export type PrecisionResult = {
  needs_precision: boolean;
  reason: string;
  options: PrecisionOption[];
  allows_free_text: boolean;
};

export type SelectedPrecision = {
  option_id: string | null;
  free_text: string | null;
  learning_object: string;
};

export type Objective = {
  version: number;
  confirmed: boolean;
  statement: string;
  observable_capability: string;
  learning_object: string;
  assumed_level_and_knowledge: string;
  scope: string[];
  exclusions: string[];
  achievement_criteria: string[];
  medium_limitations: string[];
};

export type CourseProposal = {
  id: string;
  title: string;
  description: string;
  central_question: string;
  intellectual_outcome: string;
  distinctive_trajectory: string;
  organizing_principle: string;
  scope: string[];
  exclusions: string[];
  level_fit: string;
  guiding_authors_or_traditions: string[];
  estimated_modules: number;
  estimated_duration: string;
  main_advantage: string;
  trade_off: string;
};

export type ProposalSet = {
  id: string;
  objective_version: number;
  proposals: CourseProposal[];
  recommended_proposal_id: string | null;
  recommendation_reason: string | null;
};

export type LearningRequest = {
  id: string;
  state: RequestState;
  inputs: CreateLearningRequest;
  compatibility: CompatibilityAssessment;
  precision: PrecisionResult;
  selected_precision: SelectedPrecision | null;
  objective: Objective | null;
  proposals: ProposalSet | null;
  selected_proposal_id: string | null;
  blueprint_id: string | null;
  course_id: string | null;
};

// --- Blueprint ---

export type BlueprintState =
  | "generating"
  | "awaiting_approval"
  | "approved"
  | "failed";

export type PlannedLesson = { title: string; purpose: string };

export type PlannedModule = {
  title: string;
  function: string;
  guiding_questions: string[];
  outcome: string;
  lessons: PlannedLesson[];
};

export type BlueprintVisible = {
  title: string;
  subtitle: string;
  objective_statement: string;
  expected_outcome: string;
  central_problem: string;
  level_and_assumed_knowledge: string;
  scope: string[];
  exclusions: string[];
  organizing_principle: string;
  intellectual_arc: string;
  modules: PlannedModule[];
  order_justification: string;
  length_justification: string;
  estimates: {
    modules: number;
    lessons: number;
    words: number;
    study_hours: string;
  };
  guiding_sources_or_traditions: string[];
  relevant_controversies: string[];
  risks_and_limitations: string[];
};

export type Blueprint = {
  id: string;
  request_id: string;
  proposal_id: string;
  state: BlueprintState;
  current_version: number | null;
  blueprint: BlueprintVisible | null;
  previous_versions: number[];
  approved_version: number | null;
  course_id: string | null;
  failure_message: string | null;
};

export type ApproveBlueprintResponse = {
  course_id: string;
  blueprint_version: number;
};

// --- Course ---

export type CourseState =
  | "queued"
  | "researching"
  | "writing"
  | "reviewing"
  | "partially_available"
  | "complete"
  | "failed";

export type ModuleState =
  | "queued"
  | "researching"
  | "writing"
  | "reviewing"
  | "published"
  | "failed"
  | "not_built";

export type ModuleSummary = {
  id: string;
  index: number;
  title: string;
  function: string;
  state: ModuleState;
  lesson_count: number;
  published_at: string | null;
};

export type CourseSynthesis = { body: string; new_questions: string[] };

export type Course = {
  id: string;
  request_id: string;
  blueprint_id: string;
  blueprint_version: number;
  title: string;
  subtitle: string;
  objective_statement: string;
  state: CourseState;
  current_activity: string | null;
  modules: ModuleSummary[];
  final_synthesis: CourseSynthesis | null;
  failure: string | null;
  module_limit: number | null;
};

export type LessonSummary = {
  id: string;
  index: number;
  title: string;
  purpose: string;
  word_count: number;
};

export type SourceView = {
  ref: string;
  url: string;
  title: string;
  author_or_institution: string | null;
  date: string | null;
  source_type: string;
  role: string;
  verification: "retrieved" | "unverified";
};

export type KnowledgeCheckOption = {
  text: string;
  is_correct: boolean;
  explanation: string;
};

export type KnowledgeCheckQuestion = {
  question: string;
  options: KnowledgeCheckOption[];
  assessed_concepts: string[];
  related_lesson_titles: string[];
};

export type KnowledgeCheck = { questions: KnowledgeCheckQuestion[] };

export type CourseModule = {
  id: string;
  course_id: string;
  index: number;
  title: string;
  function: string;
  guiding_questions: string[];
  outcome: string;
  state: ModuleState;
  lessons: LessonSummary[];
  synthesis: string | null;
  knowledge_check: KnowledgeCheck | null;
  sources: SourceView[];
  published_at: string | null;
};

export type LessonSection = {
  kind: string;
  heading: string;
  body: string;
};

export type Lesson = {
  id: string;
  course_id: string;
  module_id: string;
  index: number;
  title: string;
  purpose: string;
  sections: LessonSection[];
  sources: SourceView[];
  word_count: number;
  previous_lesson_id: string | null;
  next_lesson_id: string | null;
};

// --- Demo diagnostics (DEC-005) ---

export type StageTrace = {
  stage: string;
  target: string;
  prompt_version: string;
  schema_version: string;
  model: string;
  attempt: number;
  started_at: string;
  duration_ms: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    total_tokens: number;
  };
  status: "ok" | "invalid" | "failed";
  validation_codes: string[];
  qa_result: string | null;
  web_search: boolean;
};

export type CourseDiagnostics = {
  course_id: string;
  state: CourseState;
  model: string;
  blueprint_internal: {
    materialist_classification: string;
    materialist_justification: string;
    conceptual_dependencies: string[];
    foreseeable_confusions: string[];
    claims_requiring_research: string[];
    evidence_risks: string[];
    structure_deviation_reasons: string | null;
  };
  modules: {
    id: string;
    title: string;
    state: ModuleState;
    lessons: {
      id: string;
      title: string;
      state: string;
      attempts: number;
      research_rounds: number;
      evidence_total: number;
      evidence_retrieved: number;
      word_count: number;
      review_result: string | null;
      review_issues: string[];
    }[];
    audit: { result: string; issues: string[]; notes: string } | null;
  }[];
  course_audit: { result: string; issues: string[]; notes: string } | null;
  trace_summary: {
    calls: number;
    failed_calls: number;
    total_duration_ms: number;
    usage: StageTrace["usage"];
  };
  traces: StageTrace[];
};
