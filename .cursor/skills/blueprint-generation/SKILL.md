---

name: blueprint-generation
description: Build and revise a coherent learning Blueprint from an approved learning objective and selected learning direction. Use before course generation and whenever the learner reviews or revises the planned learning trajectory.
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Blueprint Generation

## Purpose

Create a coherent, revisable learning Blueprint that defines the intellectual trajectory of the future course.

The Blueprint is a plan for learning, not the final course content.

## Authoritative sources

Follow:

1. `MVP.md`
2. `BUSINESS_RULES.md`
3. `AI_GENERATION.md`
4. `USER_FLOWS.md`
5. `PRODUCT.md`

Respect all applicable Business Rule IDs.

Do not reproduce historical Blueprint schemas unless they are explicitly supported by current approved documentation.

## Inputs

Use:

* approved learning objective;
* learner context;
* selected or refined learning direction;
* relevant level and prior knowledge;
* constraints;
* applicable business rules.

## Workflow

### 1. Confirm the foundation

Before generating the Blueprint, verify that:

* the objective is sufficiently precise;
* the selected direction is coherent;
* the direction is compatible with the objective;
* the intended trajectory is feasible within the product scope.

If the foundation is insufficient, do not compensate by inventing curriculum details.

### 2. Define the intellectual trajectory

Determine how understanding should develop over the course.

The trajectory should have a meaningful progression rather than being a list of unrelated topics.

Consider:

* prerequisites;
* conceptual dependencies;
* increasing complexity;
* relationships between ideas;
* progression toward the stated objective;
* synthesis.

### 3. Define course structure

Create only the structural information required by the approved product specification.

Do not invent:

* fixed module counts;
* fixed lesson counts;
* mandatory sections;
* extensions;
* glossaries;
* pronunciation guides;
* final exams;
* artifacts;
* technical generation states.

Unless an approved document requires them.

### 4. Check coherence

Validate:

* every major structural element contributes to the objective;
* concepts appear in an appropriate order;
* later ideas do not depend on unexplained earlier concepts;
* the trajectory is neither unnecessarily broad nor artificially fragmented;
* the selected direction remains visible throughout the structure.

### 5. Preserve revisability

The Blueprint must remain understandable enough that the learner can review and modify the intended trajectory before course generation.

When revisions occur:

* preserve approved learner intent unless explicitly changed;
* update dependent structure;
* remove elements made obsolete by the revision;
* do not silently preserve contradictory previous decisions.

### 6. Prepare for generation

The final Blueprint should contain enough information for course generation to proceed without reconstructing the learner's intention from scratch.

## Blueprint integrity checks

Before accepting a Blueprint, verify:

* objective alignment;
* directional alignment;
* logical progression;
* appropriate scope;
* learner-level alignment;
* feasibility through text/audio;
* absence of unsupported requirements;
* no contradictions with approved rules.

## Guardrails

Never:

* generate lesson prose as part of the Blueprint unless explicitly required;
* research sources as part of Blueprint creation unless approved workflow requires it;
* invent technical generation mechanisms;
* create permanent database structures;
* add future product features;
* impose historical generator conventions;
* treat AI generation stages as separate technical services.

The Blueprint describes learning. It does not prescribe architecture.

## Output quality

The Blueprint should answer:

> "What intellectual journey are we going to take, and why is this structure appropriate for this learner and objective?"

It should not merely answer:

> "What topics can we put into a course?"
