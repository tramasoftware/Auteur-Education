---

name: intention-analysis
description: Interpret and structure a learner's initial learning intention and context. Use when Auteur receives a new learning request or needs to clarify what the learner actually wants to achieve before defining an objective.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Intention Analysis

## Purpose

Interpret the learner's initial request and surrounding context so Auteur can understand what the learner actually wants to learn.

The output of this skill is an internal, structured understanding of the learner's intention. It is not yet the final learning objective, proposal, Blueprint, or course.

## Authoritative sources

When performing this workflow:

1. Follow `MVP.md` for mandatory product scope.
2. Follow `BUSINESS_RULES.md` for mandatory behavioral rules.
3. Follow `AI_GENERATION.md` for AI generation behavior.
4. Use `USER_FLOWS.md` for the expected user interaction.
5. Use `PRODUCT.md` for product intent and pedagogical/editorial principles.

Do not use historical documents as authoritative requirements.

If authoritative documents conflict, stop and identify the conflict instead of silently choosing one interpretation.

## Inputs

Consider only information actually available to the system, such as:

* learner's stated learning intention;
* learner-provided context;
* declared level;
* prior knowledge;
* desired outcome;
* relevant constraints explicitly provided by the learner.

Do not invent missing learner information.

## Workflow

### 1. Read the learner's request

Identify:

* explicit subject or domain;
* what the learner appears to want to accomplish;
* stated motivation or desired outcome;
* constraints;
* known level or prior knowledge;
* ambiguities.

### 2. Separate explicit information from interpretation

Classify information as:

* explicitly stated;
* reasonably inferred from the request;
* unknown.

Do not present an inference as a fact.

### 3. Determine the learning direction

Identify the most plausible learning direction supported by the request.

The direction should remain broad enough to allow the subsequent objective-definition step to refine it.

Do not prematurely define:

* a fixed curriculum;
* modules;
* lessons;
* sources;
* assessments;
* a Blueprint;
* technical implementation details.

### 4. Detect ambiguity

Identify ambiguities that materially affect what should be learned.

Examples:

* the subject is too broad;
* the desired outcome is unclear;
* multiple interpretations would lead to substantially different learning paths;
* the learner's prior knowledge materially changes the appropriate starting point.

Do not ask unnecessary questions when the intention can be reasonably interpreted from available information.

### 5. Check compatibility

Determine whether the request is compatible with Auteur's product scope.

In particular, respect the MVP limitation that the first version focuses on learning that can honestly be achieved through text and audio.

Do not expand the product scope to accommodate an incompatible request.

### 6. Produce a structured interpretation

The result should contain, conceptually:

* interpreted intention;
* learning domain/topic;
* desired outcome;
* relevant learner context;
* known prior knowledge or level;
* important constraints;
* ambiguities;
* missing information that materially matters;
* compatibility considerations.

Keep the interpretation concise and useful for the next stage.

## Guardrails

Never:

* invent learner goals;
* invent prior knowledge;
* invent constraints;
* turn assumptions into facts;
* generate a course at this stage;
* generate a Blueprint at this stage;
* select sources at this stage;
* add product functionality to compensate for ambiguity;
* silently resolve a conflict in approved documentation.

The purpose of this skill is understanding, not curriculum generation.

## Output quality

A good result should make it possible for the next workflow to define a precise learning objective without having to reinterpret the original request from scratch.

Prefer clarity and traceability over verbosity.
