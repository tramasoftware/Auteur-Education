---

name: course-generation
description: Generate a complete learning course from an approved Blueprint, including structured lessons, verifiable sources, formative learning checks, synthesis, and applicable editorial and pedagogical controls. Use only after Blueprint approval.
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Course Generation

## Purpose

Generate a coherent educational course from an approved Auteur Blueprint.

The course should represent a complete intellectual trajectory rather than a collection of summaries.

## Authoritative sources

Follow:

1. `MVP.md`
2. `BUSINESS_RULES.md`
3. `AI_GENERATION.md`
4. `USER_FLOWS.md`
5. `PRODUCT.md`

Preserve applicable Business Rule IDs when reasoning about implementation or validation.

Historical documents are references only.

## Preconditions

Course generation must only begin when the required preceding state has been approved according to the current product workflow.

The generation input should include:

* approved learning objective;
* approved learning direction;
* approved Blueprint;
* learner context relevant to content;
* applicable constraints.

Do not reconstruct or replace the Blueprint unless the approved workflow explicitly requires revision.

## Core principle

The generated course must express a coherent intellectual trajectory.

Do not optimize for:

* maximum length;
* maximum number of lessons;
* maximum amount of information;
* decorative structure;
* superficial comprehensiveness.

Optimize for:

* coherence;
* progression;
* relevance;
* intellectual depth appropriate to the learner;
* verifiability;
* pedagogical usefulness.

## Workflow

### 1. Validate the Blueprint

Before generation, verify:

* objective alignment;
* structural coherence;
* progression;
* scope;
* learner-level compatibility;
* feasibility through text and audio;
* absence of unresolved contradictions.

If the Blueprint is invalid, do not blindly generate content.

### 2. Plan the course

Translate the Blueprint into a concrete content plan.

Each module and lesson should have a clear role in the overall trajectory.

Avoid introducing topics simply because they are related to the subject.

A topic belongs in the course when it materially contributes to the approved objective or is required to understand another necessary concept.

### 3. Research and select sources

Use reliable and verifiable sources appropriate to the subject.

Sources should support meaningful claims rather than being decorative citations.

Prefer sources according to the requirements established in the approved AI-generation and product documentation.

Do not fabricate:

* authors;
* publications;
* URLs;
* dates;
* quotations;
* research findings.

If a source cannot be verified, do not present it as verified.

### 4. Generate lesson content

Each lesson should:

* serve a defined purpose in the trajectory;
* introduce concepts in an appropriate order;
* explain rather than merely list information;
* connect to previous and subsequent learning;
* maintain appropriate depth;
* avoid unnecessary repetition;
* use sources where claims require support.

Do not write isolated summaries that could be rearranged without affecting the learning progression.

### 5. Apply the materialist criterion when applicable

When the approved pedagogical/editorial rules require a materialist criterion, apply it consistently.

Do not reduce complex subjects to abstract ideas detached from their material, historical, social, technological, institutional, or economic conditions when those dimensions are relevant to the subject.

Do not force the criterion into subjects where it is not applicable.

### 6. Generate formative assessment

Where the approved specification requires Knowledge Checks or equivalent formative assessment:

* test understanding of the lesson;
* prioritize meaningful reasoning over superficial recall;
* align questions with the lesson's actual content;
* avoid trick questions;
* avoid assessing material that was not taught.

Do not impose a fixed number of questions unless explicitly required.

### 7. Generate synthesis

Synthesis should help the learner integrate the ideas developed across the relevant learning sequence.

It should not simply repeat previous paragraphs.

A useful synthesis should make relationships, implications, contrasts, or higher-level understanding clearer.

### 8. Validate generated content

Perform structural and pedagogical validation.

Check:

#### Objective alignment

Does the course contribute directly to the approved objective?

#### Blueprint alignment

Does the generated course faithfully implement the approved trajectory?

#### Progression

Does each stage prepare the learner for what follows?

#### Coherence

Do modules and lessons form one intellectual journey?

#### Source validity

Are important externally verifiable claims appropriately supported?

#### Internal consistency

Are terminology, claims, chronology, examples, and conclusions consistent?

#### Assessment alignment

Do Knowledge Checks test material that was actually taught?

#### Scope

Has the course avoided unsupported content or features?

#### Accessibility of medium

Can the learning genuinely be achieved through the supported text/audio format?

### 9. Identify uncertainty

When evidence is incomplete or conflicting:

* distinguish established information from interpretation;
* preserve uncertainty where appropriate;
* do not fabricate confidence;
* do not fabricate citations.

## Recovery behavior

If generation produces a problem:

1. Identify the smallest failing stage.
2. Determine whether the problem is content, source, structure, pedagogical alignment, or input quality.
3. Correct the relevant stage.
4. Revalidate affected downstream content.
5. Avoid regenerating unrelated material unnecessarily.

Do not hide generation failures by silently changing the Blueprint.

## Guardrails

Never:

* generate before Blueprint approval;
* invent sources;
* invent citations;
* fabricate factual claims;
* impose historical generator requirements;
* force fixed lesson/module counts unless approved;
* add unsupported assessments;
* create technical architecture as part of content generation;
* treat AI-generation stages as mandatory independent services;
* expand MVP scope.

## Definition of a successful generation

A successful course is one where:

* the learner's approved objective remains visible;
* the Blueprint is faithfully represented;
* the learning progression is coherent;
* content is substantive rather than decorative;
* important claims are verifiable;
* formative assessment reflects taught material;
* synthesis integrates the trajectory;
* editorial and pedagogical controls are respected;
* no unsupported product behavior has been introduced.
