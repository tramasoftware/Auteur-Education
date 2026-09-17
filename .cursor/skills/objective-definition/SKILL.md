---

name: objective-definition
description: Transform an interpreted learner intention into a precise and achievable learning objective. Use after intention analysis and before generating learning directions or a Blueprint.
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Objective Definition

## Purpose

Transform the learner's interpreted intention into a clear, specific, achievable learning objective.

The objective should define what meaningful learning outcome the learner is pursuing without prematurely designing the course.

## Authoritative sources

Follow this precedence:

1. `MVP.md`
2. `BUSINESS_RULES.md`
3. `AI_GENERATION.md`
4. `USER_FLOWS.md`
5. `PRODUCT.md`

Use `AI_GENERATION.md` for the logical objective-definition behavior.

Do not treat historical generator specifications as mandatory.

## Inputs

Use:

* the structured intention analysis;
* learner context;
* declared level;
* prior knowledge;
* desired outcome;
* explicit constraints;
* any approved product rules affecting objective definition.

Do not invent missing information.

## Workflow

### 1. Start from the learner's actual intention

Preserve the learner's underlying purpose.

Do not replace the learner's goal with a generic academic interpretation merely because it is easier to structure.

### 2. Identify the intended transformation

Determine what should change as a result of learning.

Prefer outcomes such as:

* understanding a concept;
* being able to explain something;
* analyzing a subject;
* applying knowledge;
* comparing ideas;
* reasoning about a domain;
* developing a coherent conceptual understanding.

Do not assume practical or physical skills are supported unless the product scope explicitly permits them.

### 3. Establish appropriate precision

The objective should be:

* specific enough to guide course generation;
* broad enough to support a coherent learning trajectory;
* understandable to the learner;
* compatible with the available learning medium.

Avoid objectives that are:

* excessively broad;
* artificially narrow;
* purely descriptive;
* impossible to evaluate;
* dependent on unsupported modalities.

### 4. Check feasibility

Verify that the objective can honestly be pursued within Auteur's approved scope.

If the objective requires capabilities outside the MVP, identify the incompatibility rather than silently changing the objective.

### 5. Account for learner level

Adapt the objective to available information about:

* prior knowledge;
* experience;
* declared level;
* desired depth.

Do not infer expertise that the learner has not indicated.

### 6. Produce the objective

The resulting objective should clearly communicate:

* what the learner will learn;
* what intellectual capability or understanding they should develop;
* the relevant scope;
* the intended outcome.

The objective is not yet a syllabus.

## Relationship to later stages

Do not include:

* module structure;
* lesson titles;
* fixed lesson counts;
* source lists;
* Knowledge Checks;
* audio implementation;
* technical architecture.

Those belong to later stages.

## Guardrails

Never:

* invent learner background;
* manufacture specificity unsupported by the request;
* optimize for a predetermined course structure;
* impose historical generator conventions;
* create multiple proposals;
* generate a Blueprint;
* research sources.

If important information is genuinely missing, identify it explicitly.

## Output quality

A strong objective should act as a stable bridge between the learner's intention and the possible learning directions that Auteur will present next.

It should be precise enough that two independent generation attempts would likely produce compatible learning directions, without forcing an identical curriculum.
