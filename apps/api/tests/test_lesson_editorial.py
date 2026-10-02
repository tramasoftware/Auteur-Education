"""Editorial contract: internal lesson plan stays off the visible prose."""

from __future__ import annotations

import json

from tests.fixtures import blueprint, review
from tests.test_build import approved_course

from auteur_api.ai.client import StructuredResult
from auteur_api.ai.tracing import TokenUsage
from auteur_api.modules.blueprints.schemas import BlueprintOutput
from auteur_api.modules.generation.prompts import (
    COURSE_SYNTHESIS_INSTRUCTIONS,
    MODULE_SYNTHESIS_INSTRUCTIONS,
    REVIEW_LESSON_INSTRUCTIONS,
    REVIEW_LESSON_V1,
    WRITE_LESSON_INSTRUCTIONS,
    WRITE_LESSON_V1,
    BuildContext,
    _previous_lessons_block,
    lesson_reading_text,
    review_lesson_input,
    write_lesson_input,
)
from auteur_api.modules.generation.schemas import (
    LessonDraftOutput,
    LessonDraftWriteOutput,
    LessonMovementOutput,
    LessonRecord,
    LessonReviewOutput,
    LessonSectionOutput,
    LessonSpecOutput,
    LessonWriteOutput,
    ModuleRecord,
    stored_lesson_draft,
)
from auteur_api.modules.generation.validators import validate_review

_LEGACY_KINDS = (
    "problem",
    "central_idea",
    "concepts",
    "argument",
    "example",
    "limit_or_contrast",
    "synthesis",
    "bridge",
)


def _spec() -> LessonSpecOutput:
    return LessonSpecOutput(
        lesson_objective="Explain the fiscal crisis.",
        intellectual_gain="Debt was already a political fact.",
        entry_knowledge="None",
        core_concepts=["debt", "privilege"],
        main_claims=["Claim A"],
        assigned_evidence_refs=["S1"],
        argument_path="From debt to crisis.",
        verbal_examples=["The 1786 deficit."],
        limit_or_controversy="Figures are contested.",
        link_to_previous="None",
        bridge_to_next="The assembly is the next question.",
        target_words=1600,
        acceptance_criteria=["Explains the deficit."],
    )


def _context() -> BuildContext:
    parsed = BlueprintOutput.model_validate(blueprint(modules=1, lessons=2))
    return BuildContext(
        experience_level="basic",
        prior_knowledge="Read one narrative history.",
        objective_statement=parsed.visible.objective_statement,
        achievement_criteria=["Distinguish causes from triggers."],
        visible=parsed.visible,
        internal=parsed.internal,
    )


def _lesson(
    index: int,
    *,
    title: str,
    spec: LessonSpecOutput | None = None,
    draft: LessonDraftOutput | None = None,
) -> LessonRecord:
    return LessonRecord(
        id=f"lesson-{index}",
        index=index,
        title=title,
        purpose=f"Purpose of {title}",
        spec=spec,
        draft=draft,
    )


def _module(*lessons: LessonRecord) -> ModuleRecord:
    return ModuleRecord(
        id="module-1",
        index=1,
        title="Structures",
        function="Show how debt became political.",
        guiding_questions=["Why did debt matter?"],
        outcome="The learner can explain the fiscal crisis.",
        qa_criteria=["Stays with the evidence."],
        lessons=list(lessons),
    )


def _review_result(payload: dict) -> StructuredResult[LessonReviewOutput]:
    return StructuredResult(
        parsed=LessonReviewOutput.model_validate(payload),
        usage=TokenUsage(),
        model="fake",
        duration_ms=1,
    )


def test_model_facing_draft_has_no_pedagogical_section_kinds() -> None:
    schema = LessonWriteOutput.model_json_schema()
    movement = schema["$defs"]["LessonMovementOutput"]
    assert set(movement["properties"]) == {"heading", "body"}
    heading = movement["properties"]["heading"]
    assert any(option.get("type") == "null" for option in heading["anyOf"])
    assert movement["properties"]["body"]["type"] == "string"
    blob = json.dumps(movement)
    for kind in _LEGACY_KINDS:
        assert kind not in blob
    assert "kind" not in movement["properties"]


def test_one_movement_keeps_several_paragraphs_and_an_example() -> None:
    body = (
        "The deficit of 1786 made debt a political fact, not a note.\n\n"
        "For example, the same shortfall that ministers treated as an accounting "
        "problem forced the crown to ask the privileged orders for consent.\n\n"
        "The controversy is that the figures themselves remain contested, and that "
        "contest does not reopen the question as a separate topic."
    )
    stored = stored_lesson_draft(
        LessonDraftWriteOutput(
            title="The Fiscal Crisis",
            sections=[LessonMovementOutput(heading=None, body=body)],
            sources_used_refs=["S1", "S2"],
        )
    )
    assert len(stored.sections) == 1
    assert stored.sections[0].kind == "prose"
    assert stored.sections[0].heading == ""
    assert stored.sections[0].body.count("\n\n") == 2
    assert "For example" in stored.sections[0].body
    assert "controversy" in stored.sections[0].body


def test_blank_heading_is_stored_as_empty_string() -> None:
    stored = stored_lesson_draft(
        LessonDraftWriteOutput(
            title="Debt",
            sections=[
                LessonMovementOutput(heading=None, body="word " * 40),
                LessonMovementOutput(heading="   ", body="word " * 40),
            ],
            sources_used_refs=["S1"],
        )
    )
    assert [section.heading for section in stored.sections] == ["", ""]
    assert all(section.kind == "prose" for section in stored.sections)


def test_legacy_section_kinds_still_validate() -> None:
    for kind in _LEGACY_KINDS:
        loaded = LessonDraftOutput.model_validate(
            {
                "title": "Stored lesson",
                "sections": [
                    {
                        "kind": kind,
                        "heading": "A heading that was already published",
                        "body": "word " * 40,
                    }
                ],
                "sources_used_refs": ["S1"],
            }
        )
        assert loaded.sections[0].kind == kind


def test_headingless_draft_is_valid_and_review_reads_prose() -> None:
    draft = LessonDraftOutput(
        title="The Fiscal Crisis",
        sections=[
            LessonSectionOutput(
                kind="example",
                heading="",
                body=(
                    "The deficit of 1786 made debt a political fact.\n\n"
                    "A second paragraph stays with that same fact."
                ),
            )
        ],
        sources_used_refs=["S1", "S2"],
    )
    LessonDraftWriteOutput.model_validate(
        {
            "title": draft.title,
            "sections": [{"heading": None, "body": draft.sections[0].body}],
            "sources_used_refs": ["S1", "S2"],
        }
    )
    assert "kind" not in lesson_reading_text(draft)
    assert '"kind"' not in lesson_reading_text(draft)

    current = _lesson(2, title="The Assembly", spec=_spec(), draft=draft)
    module = _module(
        _lesson(
            1,
            title="Debt",
            spec=_spec(),
            draft=LessonDraftOutput(
                title="Debt",
                sections=[
                    {
                        "kind": "example",
                        "heading": "Example",
                        "body": "UNIQUE_PREVIOUS_BODY",
                    }
                ],
                sources_used_refs=["S1"],
            ),
        ),
        current,
    )
    reviewed = review_lesson_input(_context(), module, current, draft, word_count=900)
    repaired = write_lesson_input(
        _context(),
        module,
        current,
        previous_draft=draft,
        review=LessonReviewOutput.model_validate(review("Revise")),
    )
    assert '"kind"' not in reviewed
    assert '"kind"' not in repaired
    assert "The deficit of 1786" in reviewed
    assert "INTERNAL LESSON PLAN" in reviewed
    assert "without headings may Pass" in REVIEW_LESSON_INSTRUCTIONS
    assert "fragmented sections" in REVIEW_LESSON_INSTRUCTIONS
    assert "whose kinds may include" not in WRITE_LESSON_INSTRUCTIONS


def test_failed_editorial_check_cannot_pass() -> None:
    for name in ("editorial_continuity", "rhetorical_patterns"):
        payload = review("Pass")
        for check in payload["checks"]:
            if check["check"] == name:
                check["passed"] = False
        assert "review_inconsistent_pass" in validate_review(_review_result(payload))

    unsupported = review("Pass", claim_status="Needs revision")
    assert "review_inconsistent_pass" in validate_review(_review_result(unsupported))


def test_stored_review_without_new_checks_still_loads() -> None:
    payload = review("Pass")
    payload["checks"] = [
        check
        for check in payload["checks"]
        if check["check"] not in ("editorial_continuity", "rhetorical_patterns")
    ]
    loaded = LessonReviewOutput.model_validate(payload)
    assert "editorial_continuity" not in {check.check for check in loaded.checks}


def test_previous_lessons_carry_concepts_not_full_text() -> None:
    previous = _lesson(
        1,
        title="Debt",
        spec=_spec(),
        draft=LessonDraftOutput(
            title="Debt",
            sections=[
                {
                    "kind": "prose",
                    "heading": "",
                    "body": "UNIQUE_PREVIOUS_BODY should not be copied forward.",
                }
            ],
            sources_used_refs=["S1"],
        ),
    )
    current = _lesson(2, title="The Assembly")
    block = _previous_lessons_block(_module(previous, current), current)
    assert "Debt was already a political fact." in block
    assert "debt" in block
    assert "privilege" in block
    assert "The assembly is the next question." in block
    assert "UNIQUE_PREVIOUS_BODY" not in block


def test_synthesis_prompts_reject_a_table_of_contents() -> None:
    assert "Lesson 1 showed" in MODULE_SYNTHESIS_INSTRUCTIONS
    assert "ideas bear on one another" in MODULE_SYNTHESIS_INSTRUCTIONS
    assert "Lesson 1 showed" in COURSE_SYNTHESIS_INSTRUCTIONS
    assert "Module 1" in COURSE_SYNTHESIS_INSTRUCTIONS
    assert WRITE_LESSON_V1 == "write_lesson_v2"
    assert REVIEW_LESSON_V1 == "review_lesson_v2"
    assert LessonWriteOutput.SCHEMA_VERSION == "lesson_write_v2"
    assert LessonReviewOutput.SCHEMA_VERSION == "lesson_review_v2"


def test_published_lesson_keeps_section_contract(client, fake_ai) -> None:
    course_id = approved_course(client, fake_ai)
    course = client.get(f"/api/v1/courses/{course_id}").json()
    module_id = course["modules"][0]["id"]
    module = client.get(f"/api/v1/courses/{course_id}/modules/{module_id}").json()
    lesson_id = module["lessons"][0]["id"]
    lesson = client.get(
        f"/api/v1/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}"
    ).json()
    assert lesson["sections"]
    for section in lesson["sections"]:
        assert set(section) == {"kind", "heading", "body"}
        assert section["kind"] == "prose"
        assert section["heading"] == ""
        assert section["body"]
