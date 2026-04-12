# Narrative Engine Prompt Spec

## Objective
Generate exactly 3 sentences for a parent update from tutor quick tags.

## Input Contract
- Student name
- Lesson focus
- Tag list (`#phonics`, `#engaged`, etc.)
- Optional tutor notes

## Output Contract
- Exactly 3 complete sentences.
- Parent-friendly, constructive tone.
- Mention progress and next step.
- No diagnosis, medical claims, or certainty inflation.

## Safety and Guardrails
- Reject disallowed content categories (harm, abuse, diagnosis).
- Fallback to deterministic template when LLM call fails.
- Log prompt metadata only (no raw media, no secret keys).

## Example
Input:
- Student: Lina Park
- Focus: consonant blends
- Tags: `#phonics`, `#engaged`, `#struggled_with_blend`

Output:
Lina stayed focused during consonant blend practice and participated with great effort. We used guided examples and she improved her accuracy across repeated attempts. Next class we will reinforce this with short review drills to build confidence.
