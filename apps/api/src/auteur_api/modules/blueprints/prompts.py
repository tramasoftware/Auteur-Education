"""Prompt for AI-STG-05: Blueprint generation and revision."""

from __future__ import annotations

from auteur_api.ai.stages import untrusted
from auteur_api.modules.onboarding.prompts import SHARED_RULES
from auteur_api.modules.onboarding.schemas import (
    LearningObjectiveOutput,
    LearningRequestInputs,
)
from auteur_api.modules.proposals.schemas import CourseProposal

GENERATE_BLUEPRINT_V1 = "generate_blueprint_v1"

GENERATE_BLUEPRINT_INSTRUCTIONS = (
    SHARED_RULES
    + """
Task: turn the confirmed objective and the selected learning direction into a
BLUEPRINT: a justifiable, revisable pedagogical contract (AI-STG-05). It is the plan
for learning, not the course content. Do not write lesson prose.

The Blueprint must answer: "What intellectual journey are we going to take, and why is
this structure appropriate for this learner and objective?" — not merely "what topics
can we put into a course?".

VISIBLE part (the learner reviews and approves it):
- title, subtitle; objective_statement and expected_outcome (faithful to the
  confirmed objective; never promise professional mastery or certification);
- central_problem (the question that organizes the course);
- level_and_assumed_knowledge; scope; exclusions;
- organizing_principle (the selected direction must remain visible throughout);
- intellectual_arc: how understanding develops across modules, in prose;
- modules, ordered. Each with function (what it contributes to the arc),
  guiding_questions, outcome, and planned lessons with title and purpose. Each lesson
  must have one recognizable function and produce a distinct intellectual gain; no
  lesson may substantively duplicate another; later lessons may not depend on ideas
  not yet introduced;
- order_justification and length_justification (why this structure is the minimum
  sufficient journey — no filler, no artificial fragmentation);
- estimates: modules, lessons, words (~1500-2000 per lesson), study_hours;
- guiding_sources_or_traditions (real authors, works, institutions or traditions the
  course will draw on; do not invent);
- relevant_controversies; risks_and_limitations (including what text and audio
  cannot deliver for this subject, if anything).

Structural references (references, not quotas): usually 4-8 modules, minimum 2; the
first module usually has 3 lessons, later ones 3-6, minimum 2 per module. Derive the
structure from the objective. If you deviate from these references, explain why in
internal.structure_deviation_reasons; otherwise set it to null.

INTERNAL part (used for generation and QA, never shown as product content):
- conceptual_dependencies; prerequisites; foreseeable_confusions;
- claims_requiring_research (factual claims the lessons will need to verify);
- evidence_risks (where sources may be scarce, contested or unreliable);
- materialist_classification: "Central", "Complementary" or "Not applicable", with a
  brief materialist_justification. The materialist analytical criterion favours
  explanations through mechanisms, material conditions, institutions, resources,
  scales, causality and mediations, and distinguishes explanation from description and
  interpretation. Classify honestly: it is Not applicable when it would not improve
  understanding or would interfere with the discipline's own methods. It is never a
  doctrinal label for the learner;
- qa_criteria_per_module: concrete, checkable acceptance criteria for each module,
  derived from the objective's achievement criteria.

If web search is available, use it only for light orientation: to confirm that the
guiding sources, authors or traditions exist and to notice major controversies. Do not
research lesson content now. Never fabricate sources.

If learner revision feedback is provided, produce a complete new version that
addresses the feedback, updates dependent structure, removes obsolete elements, and
does not silently keep contradictory previous decisions. Preserve the learner's
intent unless the feedback explicitly changes it.
"""
)


def generate_blueprint_input(
    inputs: LearningRequestInputs,
    objective: LearningObjectiveOutput,
    proposal: CourseProposal,
    *,
    previous_visible_json: str | None,
    feedback: str | None,
) -> str:
    parts = [
        "CONFIRMED LEARNING OBJECTIVE",
        f"statement: {objective.statement}",
        f"observable_capability: {objective.observable_capability}",
        f"learning_object: {objective.learning_object}",
        f"assumed_level_and_knowledge: {objective.assumed_level_and_knowledge}",
        "scope: " + "; ".join(objective.scope),
        "exclusions: " + "; ".join(objective.exclusions),
        "achievement_criteria: " + "; ".join(objective.achievement_criteria),
        "medium_limitations: " + "; ".join(objective.medium_limitations),
        "",
        "SELECTED LEARNING DIRECTION",
        f"title: {proposal.title}",
        f"description: {proposal.description}",
        f"central_question: {proposal.central_question}",
        f"intellectual_outcome: {proposal.intellectual_outcome}",
        f"distinctive_trajectory: {proposal.distinctive_trajectory}",
        f"organizing_principle: {proposal.organizing_principle}",
        "scope: " + "; ".join(proposal.scope),
        "exclusions: " + "; ".join(proposal.exclusions),
        "guiding_authors_or_traditions: "
        + "; ".join(proposal.guiding_authors_or_traditions),
        f"estimated_modules: {proposal.estimated_modules}",
        f"trade_off: {proposal.trade_off}",
        "",
        "LEARNER CONTEXT",
        f"experience_level: {inputs.experience_level.value}",
        f"prior_knowledge: {inputs.prior_knowledge or '(not provided)'}",
        f"expected_outcome: {inputs.expected_outcome}",
    ]
    if previous_visible_json:
        parts += [
            "",
            "PREVIOUS BLUEPRINT VERSION (visible part)",
            previous_visible_json,
        ]
    if feedback:
        parts += ["", untrusted("learner_revision_feedback", feedback)]
    return "\n".join(parts)
