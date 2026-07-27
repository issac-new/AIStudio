---
name: ai-code-review-checklist
description: "Review checklist for AI-generated (ACP/LLM-written) code: hallucinated deps (slopsquatting), hallucinated API signatures, plausible-but-wrong logic, default-value-only tests, and convention drift — layered on top of the standard severity-graded review method. Use when reviewing worker-coder output, when a diff looks suspiciously clean, or when verifying claimed test results."
version: 1.0.0
author: Hermes Agent (Graphite/Google eng-practices distilled)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [code-review, ai-generated, security, worker-reviewer]
    related_skills: [ai-code-testing, kanban-handoff-contract]
---

# AI-generated code review

worker-coder's output is written by an ACP agent. AI code has failure modes
human code rarely does — check these ON TOP of the standard review.

## AI-specific failure modes (the value-add)

1. **Hallucinated dependencies (slopsquatting)** — verify every NEW dependency
   exists on the official registry (npm/PyPI/crates) and isn't a freshly
   squatted lookalike package.
2. **Hallucinated APIs** — verify each import/call's signature actually exists;
   AI invents plausible method names and parameter lists.
3. **Plausible-but-wrong** — defaults that pass by coincidence, off-by-one
   boundaries, swallowed exceptions, outdated-API usage. Looks right, is
   semantically wrong.
4. **Tests that prove nothing** — AI tests often assert only defaults/empty
   cases and go "all green". Confirm each test FAILS when the implementation
   is broken (see ai-code-testing's red-evidence rule).
5. **Convention drift** — AI tends to introduce patterns/libraries the repo
   doesn't use. Flag unjustified deviation from existing conventions.

## Standard method (do these first)

1. `git log -p` / `git diff` for the full change; read the upstream handoff
   (changed_files, test results, decisions).
2. Read each changed file + its context (callees, callers); `search_files` for
   sibling implementations to gauge blast radius.
3. Run the tests / linter / type check yourself — objectively verify the
   upstream "tests pass" claim. Never APPROVE off the handoff alone.
4. Review the diff, not whole files; only flag untouched code for CRITICAL.

## Severity & signal discipline

CRITICAL (security/data-loss/prod crash) blocks approval; MAJOR (logic
defects, missing error handling/tests) → NEEDS_REVISION; MINOR/NIT don't
block. Every comment carries location (`file:line`) + problem + why + how to
fix. Value lives in CRITICAL/MAJOR; cap NITs at 2-3 — more is disrespecting
the coder's time. Explain why and give direction rather than rewriting the
code yourself.
