"""Prompt for AI-STG-04: differentiated learning directions."""

from __future__ import annotations

from auteur_api.modules.onboarding.prompts import SHARED_RULES
from auteur_api.modules.onboarding.schemas import (
    LearningObjectiveOutput,
    LearningRequestInputs,
)

GENERATE_PROPOSALS_V1 = "generate_proposals_v1"

GENERATE_PROPOSALS_INSTRUCTIONS = (
    SHARED_RULES
    + """
Task: propose between 1 and 5 genuinely different LEARNING DIRECTIONS that all serve
the confirmed learning objective (AI-STG-04).

Each proposal is a distinct intellectual trajectory: a different way of organizing
the journey toward the same objective. It is NOT a course structure. Do not list
modules, lessons, sources or Knowledge Checks (that belongs to the Blueprint).

Differentiation (mandatory):
- Every pair of proposals must differ in at least three of these dimensions:
  central_question, perspective, organizing_principle, scale_or_scope,
  authors_or_traditions, content_order, balance_history_theory_system_cases,
  intellectual_outcome, depth, reasoning_type.
- Report every pair in pairwise_differences with the dimensions that actually differ
  and a concrete explanation. Cosmetic variations (title, tone, duration) do not count.
- If the objective honestly admits only one sound direction, return exactly one
  proposal, no recommendation, and an empty pairwise_differences list. Do not pad.

Each proposal must state: title, description, central_question, intellectual_outcome
(what the learner will be able to do/understand), distinctive_trajectory (the arc
in prose), organizing_principle, scope, exclusions, level_fit (how it suits the
declared level), guiding_authors_or_traditions (real, verifiable), estimated_modules
(usually 4-8), estimated_duration, main_advantage and a real trade_off. Do not hide
limitations.

Recommendation: only when one direction is clearly superior for THIS learner's
declared level, expected outcome and prior knowledge, set recommended_proposal_index
and give a concrete recommendation_reason. Never rank, score or declare a proposal
objectively superior. Otherwise leave both null.

Do not propose directions that drift from the confirmed objective or that require
practical demonstration.
"""
)


def generate_proposals_input(
    inputs: LearningRequestInputs,
    objective: LearningObjectiveOutput,
    *,
    learning_object: str | None,
    materialist_hint: bool,
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
        "",
        "LEARNER CONTEXT",
        f"experience_level: {inputs.experience_level.value}",
        f"prior_knowledge: {inputs.prior_knowledge or '(not provided)'}",
        f"expected_outcome: {inputs.expected_outcome}",
    ]
    if learning_object:
        parts.append(f"selected_learning_object: {learning_object}")
    if materialist_hint:
        parts.append(
            "NOTE: A materialist analytical perspective (material conditions, "
            "structures, interests and their historical transformation) may be one "
            "legitimate direction among others when it is intellectually relevant to "
            "this subject. Do not force it."
        )
    return "\n".join(parts)
