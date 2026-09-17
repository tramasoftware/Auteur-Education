"""Proposal behavior (BR-PRP-001..007, UF-03)."""

from __future__ import annotations

from itertools import combinations

from auteur_api.ai.client import AIClient, StructuredResult
from auteur_api.ai.stages import StageFailed, run_stage
from auteur_api.ai.tracing import now
from auteur_api.core.config import settings
from auteur_api.core.errors import invalid_state, not_found
from auteur_api.core.store import DemoStore, new_id
from auteur_api.modules.onboarding.schemas import LearningRequestRecord, RequestState
from auteur_api.modules.onboarding.service import stage_failure
from auteur_api.modules.proposals import prompts
from auteur_api.modules.proposals.schemas import (
    CourseProposal,
    ProposalSetOutput,
    ProposalSetRecord,
)

MIN_DIFFERING_DIMENSIONS = 3  # BR-PRP-002


def validate_proposal_set(result: StructuredResult[ProposalSetOutput]) -> list[str]:
    out = result.parsed
    codes: list[str] = []
    count = len(out.proposals)
    if not 1 <= count <= 5:
        codes.append("proposal_count_out_of_range")  # BR-PRP-001
        return codes

    titles = {p.title.strip().lower() for p in out.proposals}
    if len(titles) != count:
        codes.append("proposal_titles_duplicated")

    expected_pairs = {(a, b) for a, b in combinations(range(count), 2)}
    reported: dict[tuple[int, int], set[str]] = {}
    for diff in out.pairwise_differences:
        key = tuple(sorted((diff.proposal_a_index, diff.proposal_b_index)))
        if key[0] == key[1] or key[1] >= count or key[0] < 0:
            codes.append("pairwise_difference_invalid_index")
            continue
        reported.setdefault(key, set()).update(diff.differing_dimensions)
    if set(reported) != expected_pairs:
        codes.append("pairwise_differences_incomplete")
    for key in expected_pairs & set(reported):
        if len(reported[key]) < MIN_DIFFERING_DIMENSIONS:
            codes.append("proposals_insufficiently_differentiated")
            break

    for p in out.proposals:
        if p.estimated_modules < 1:
            codes.append("proposal_estimated_modules_invalid")
            break

    idx = out.recommended_proposal_index
    if idx is not None:
        if not 0 <= idx < count:
            codes.append("recommendation_index_invalid")
        if not (out.recommendation_reason or "").strip():
            codes.append("recommendation_without_reason")  # BR-PRP-004
        if count == 1:
            codes.append("recommendation_with_single_proposal")
    elif out.recommendation_reason:
        codes.append("recommendation_reason_without_index")
    return codes


async def generate_proposals(
    request_id: str, *, ai: AIClient, store: DemoStore
) -> LearningRequestRecord:
    record = store.get_learning_request(request_id)
    if record.state in (RequestState.PROPOSALS_READY, RequestState.PROPOSAL_SELECTED):
        return record  # idempotent: BR-PRP-003 keeps the existing set
    if record.state != RequestState.OBJECTIVE_CONFIRMED or not record.current_objective:
        raise invalid_state(
            "Proposals can only be generated after the objective is confirmed."
        )
    objective_version = record.current_objective
    try:
        result = await run_stage(
            ai=ai,
            store=store,
            scope_id=record.id,
            stage="AI-STG-04",
            target=f"learning_request:{record.id}",
            prompt_version=prompts.GENERATE_PROPOSALS_V1,
            instructions=prompts.GENERATE_PROPOSALS_INSTRUCTIONS,
            input=prompts.generate_proposals_input(
                record.inputs,
                objective_version.objective,
                learning_object=(
                    record.selected_precision.learning_object
                    if record.selected_precision
                    else None
                ),
                materialist_hint=True,
            ),
            schema=ProposalSetOutput,
            validate=validate_proposal_set,
            max_attempts=settings.generation_max_attempts,
        )
    except StageFailed as exc:
        raise stage_failure(exc) from exc

    out = result.parsed
    proposals = [
        CourseProposal(id=new_id()[:8], **p.model_dump()) for p in out.proposals
    ]
    recommended_id = (
        proposals[out.recommended_proposal_index].id
        if out.recommended_proposal_index is not None
        else None
    )
    record.proposal_set = ProposalSetRecord(
        id=new_id(),
        objective_version=objective_version.version,
        proposals=proposals,
        recommended_proposal_id=recommended_id,
        recommendation_reason=out.recommendation_reason if recommended_id else None,
        pairwise_differences=out.pairwise_differences,
        created_at=now(),
    )
    record.state = RequestState.PROPOSALS_READY
    store.save_learning_request(record)
    return record


def select_proposal(
    request_id: str, proposal_id: str, *, store: DemoStore
) -> LearningRequestRecord:
    record = store.get_learning_request(request_id)
    # BR-BLP-011: another proposal can be chosen while a Blueprint awaits approval
    # (or failed); the un-approved Blueprint is discarded from the request.
    selectable = (
        RequestState.PROPOSALS_READY,
        RequestState.PROPOSAL_SELECTED,
        RequestState.AWAITING_APPROVAL,
    )
    if record.state not in selectable:
        raise invalid_state(
            "A proposal can only be selected while proposals or the Blueprint are "
            "under review."
        )
    assert record.proposal_set is not None
    if not any(p.id == proposal_id for p in record.proposal_set.proposals):
        raise not_found("Proposal")
    # BR-PRP-005/006: exactly one selection; changing it is allowed before approval.
    if record.blueprint_id and proposal_id != record.selected_proposal_id:
        record.blueprint_id = None
    elif record.blueprint_id:
        return record
    record.selected_proposal_id = proposal_id
    record.state = RequestState.PROPOSAL_SELECTED
    store.save_learning_request(record)
    return record
