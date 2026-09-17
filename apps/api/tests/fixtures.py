"""Scripted model outputs shared across tests. Structure matters, not wording."""

from __future__ import annotations

from typing import Any


def compatibility(
    classification: str = "Allowed", *, reframing: str | None = None
) -> dict[str, Any]:
    return {
        "classification": classification,
        "explanation": "The request can be taught through theory in text and audio.",
        "compatible_aspects": ["history", "concepts"],
        "unreachable_aspects": [],
        "safe_reframing": reframing,
        "risk_category": None,
    }


def analysis(
    *,
    english: bool = True,
    classification: str = "Allowed",
    needs_precision: bool = False,
    options: int = 3,
    reframing: str | None = None,
) -> dict[str, Any]:
    return {
        "input_is_english": english,
        "detected_language": "English" if english else "Spanish",
        "interpreted_intention": "Understand the causes of the French Revolution.",
        "learning_domain": "Modern European history",
        "explicitly_stated": ["subject: French Revolution"],
        "reasonably_inferred": ["interest in causation"],
        "ambiguities": [],
        "compatibility": compatibility(classification, reframing=reframing),
        "precision": {
            "needs_precision": needs_precision,
            "reason": "Broad field" if needs_precision else "Specific enough",
            "options": [
                {
                    "title": f"Option {i}",
                    "explanation": f"Explanation {i}",
                    "relation_to_intention": "Narrows the field",
                }
                for i in range(options)
            ]
            if needs_precision
            else [],
            "allows_free_text": needs_precision,
        },
    }


def objective(statement: str | None = None) -> dict[str, Any]:
    return {
        "statement": statement
        or "Explain the main structural causes of the French Revolution and "
        "distinguish them from its immediate triggers.",
        "observable_capability": "Explain and distinguish causes from triggers.",
        "learning_object": "Causes of the French Revolution (1750-1789)",
        "assumed_level_and_knowledge": "Basic; no prior knowledge of the period.",
        "scope": ["fiscal crisis", "social structure", "Enlightenment ideas"],
        "exclusions": ["Napoleonic era"],
        "achievement_criteria": ["Can articulate three structural causes."],
        "medium_limitations": [],
    }


REQUEST_BODY = {
    "initial_intent": "I want to understand why the French Revolution happened",
    "experience_level": "Basic",
    "prior_knowledge": "I read a popular history book once.",
    "expected_outcome": "Explain the causes to a friend.",
}


def proposal(index: int, *, title: str | None = None) -> dict[str, Any]:
    return {
        "title": title or f"Proposal {index}",
        "description": f"Description {index}",
        "central_question": f"Question {index}?",
        "intellectual_outcome": f"Outcome {index}",
        "distinctive_trajectory": f"Trajectory {index}",
        "organizing_principle": f"Principle {index}",
        "scope": ["a", "b"],
        "exclusions": ["c"],
        "level_fit": "Suitable for Basic level.",
        "guiding_authors_or_traditions": ["Tocqueville"],
        "estimated_modules": 4,
        "estimated_duration": "6 hours",
        "main_advantage": "Clear.",
        "trade_off": "Less breadth.",
    }


def planned_module(index: int, lessons: int = 3) -> dict[str, Any]:
    return {
        "title": f"Module {index}",
        "function": f"Function of module {index}",
        "guiding_questions": [f"Question {index}?"],
        "outcome": f"Outcome {index}",
        "lessons": [
            {"title": f"Lesson {index}.{j}", "purpose": f"Purpose {index}.{j}"}
            for j in range(1, lessons + 1)
        ],
    }


def blueprint(
    modules: int = 4, lessons: int = 3, *, deviation_reason: str | None = None
) -> dict[str, Any]:
    mods = [planned_module(i, lessons) for i in range(1, modules + 1)]
    return {
        "visible": {
            "title": "Why the French Revolution Happened",
            "subtitle": "Structures, triggers and interpretations",
            "objective_statement": "Explain the structural causes of the Revolution.",
            "expected_outcome": "Distinguish causes from triggers.",
            "central_problem": "Why did the monarchy collapse in 1789?",
            "level_and_assumed_knowledge": "Basic; no prior knowledge assumed.",
            "scope": ["fiscal crisis", "social order"],
            "exclusions": ["Napoleonic era"],
            "organizing_principle": "From structures to events",
            "intellectual_arc": "We move from long-term structures to triggers.",
            "modules": mods,
            "order_justification": "Structures must precede events.",
            "length_justification": "Minimum sufficient path.",
            "estimates": {
                "modules": modules,
                "lessons": modules * lessons,
                "words": modules * lessons * 1700,
                "study_hours": "8-10",
            },
            "guiding_sources_or_traditions": ["Tocqueville", "Lefebvre"],
            "relevant_controversies": ["Marxist vs revisionist accounts"],
            "risks_and_limitations": ["No maps can be shown."],
        },
        "internal": {
            "conceptual_dependencies": ["estates before privilege"],
            "prerequisites": [],
            "foreseeable_confusions": ["cause vs trigger"],
            "claims_requiring_research": ["state debt figures"],
            "evidence_risks": ["contested figures"],
            "materialist_classification": "Central",
            "materialist_justification": "Material conditions organize the account.",
            "qa_criteria_per_module": [
                {"module_title": m["title"], "criteria": ["Explains its function."]}
                for m in mods
            ],
            "structure_deviation_reasons": deviation_reason,
        },
    }


def evidence_item(ref: str, url: str, **overrides: Any) -> dict[str, Any]:
    item = {
        "ref": ref,
        "url": url,
        "title": f"Source {ref}",
        "author_or_institution": "Institution",
        "date": "2001",
        "source_type": "academic",
        "relevant_excerpt": "Relevant excerpt from the source.",
        "supports_claims": ["Claim A"],
        "support_level": "strong",
        "limits": None,
        "role": "primary_support",
    }
    item.update(overrides)
    return item


def research(urls: list[str] | None = None) -> dict[str, Any]:
    urls = urls or [
        "https://example.org/a",
        "https://example.org/b",
        "https://example.org/c",
    ]
    return {
        "research_questions": ["What caused the fiscal crisis?"],
        "planned_claims": [
            {"claim": "Claim A", "evidence_type": "primary", "needs_contrast": False}
        ],
        "search_queries": ["french revolution fiscal crisis"],
        "evidence": [evidence_item(f"S{i + 1}", url) for i, url in enumerate(urls)],
        "unresolved_claims": [],
        "blocking_conditions": [],
    }


def section(kind: str, words: int = 300) -> dict[str, Any]:
    return {
        "kind": kind,
        "heading": kind.replace("_", " ").title(),
        "body": " ".join(["word"] * words),
    }


def lesson_write(refs: list[str] | None = None, words: int = 300) -> dict[str, Any]:
    refs = refs or ["S1", "S2"]
    return {
        "spec": {
            "lesson_objective": "Explain the fiscal crisis.",
            "intellectual_gain": "Understand why debt mattered.",
            "entry_knowledge": "None",
            "core_concepts": ["debt", "privilege"],
            "main_claims": ["Claim A"],
            "assigned_evidence_refs": refs,
            "argument_path": "From debt to political crisis.",
            "verbal_examples": ["The 1786 deficit."],
            "limit_or_controversy": "Figures are contested.",
            "link_to_previous": "None",
            "bridge_to_next": "Toward the Estates-General.",
            "target_words": 1600,
            "acceptance_criteria": ["Explains the deficit."],
        },
        "draft": {
            "title": "The Fiscal Crisis",
            "sections": [
                section("problem", words),
                section("argument", words),
                section("example", words),
                section("synthesis", words),
                section("bridge", words),
            ],
            "sources_used_refs": refs,
        },
    }


CHECKS = [
    "structure",
    "objective_fidelity",
    "level_fit",
    "progression",
    "source_traceability",
    "claim_accuracy",
    "specificity_depth",
    "coherence",
    "audio_fitness",
    "safety",
]


def review(result: str = "Pass", *, claim_status: str = "Supported") -> dict[str, Any]:
    passed = result == "Pass"
    return {
        "claims": [
            {
                "text": "Claim A",
                "type": "factual",
                "importance": "central",
                "evidence_refs": ["S1"],
                "support_level": "strong" if claim_status == "Supported" else "none",
                "needs_contrast": False,
                "status": claim_status,
                "recommended_fix": None if claim_status == "Supported" else "Qualify",
            }
        ],
        "checks": [
            {"check": c, "passed": passed or c != "claim_accuracy", "note": "ok"}
            for c in CHECKS
        ],
        "result": result,
        "issues": [] if passed else ["Claim A is not supported."],
        "corrective_actions": [] if passed else ["Qualify claim A."],
    }


def synthesis(words: int = 200) -> dict[str, Any]:
    return {"body": " ".join(["synthesis"] * words)}


def knowledge_check(
    questions: int = 5,
    options: int = 4,
    correct: int = 1,
    lesson_title: str = "Lesson 1.1",
) -> dict[str, Any]:
    return {
        "questions": [
            {
                "question": f"Question {q}?",
                "options": [
                    {
                        "text": f"Option {q}.{o}",
                        "is_correct": o < correct,
                        "explanation": "Because.",
                    }
                    for o in range(options)
                ],
                "assessed_concepts": ["debt"],
                "related_lesson_titles": [lesson_title],
            }
            for q in range(questions)
        ]
    }


def audit(result: str = "Pass") -> dict[str, Any]:
    return {
        "result": result,
        "issues": [] if result == "Pass" else ["Something is off."],
        "notes": "Audited.",
    }


def course_synthesis(words: int = 250) -> dict[str, Any]:
    return {"body": " ".join(["final"] * words), "new_questions": ["What next?"]}


def proposal_set(count: int = 3, *, dims: int = 3) -> dict[str, Any]:
    all_dims = [
        "central_question",
        "perspective",
        "organizing_principle",
        "scale_or_scope",
        "authors_or_traditions",
    ]
    pairs = []
    for a in range(count):
        for b in range(a + 1, count):
            pairs.append(
                {
                    "proposal_a_index": a,
                    "proposal_b_index": b,
                    "differing_dimensions": all_dims[:dims],
                    "explanation": "They differ substantively.",
                }
            )
    return {
        "proposals": [proposal(i) for i in range(count)],
        "pairwise_differences": pairs,
        "recommended_proposal_index": 0 if count > 1 else None,
        "recommendation_reason": "Best fit for a Basic learner." if count > 1 else None,
    }
