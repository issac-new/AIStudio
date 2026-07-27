---
name: ai-code-testing
description: "Testing discipline for AI-generated code: no default-value assertions, red evidence (watch the test fail), mutation spot-checks, flaky-test triage (84% are false alarms), and coverage that proves behavior. Use when writing or auditing tests for ACP/LLM-written code, when a suite passes suspiciously easily, or when triaging flaky tests."
version: 1.0.0
author: Hermes Agent (Google Testing Blog distilled)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [testing, ai-generated, mutation-testing, flaky, worker-tester]
    related_skills: [ai-code-review-checklist, test-driven-development]
---

# Testing AI-generated code

AI writes tests that assert what the code DOES, not what it SHOULD do — often
just the defaults. Your job is tests that expose wrong behavior.

## No default-value assertions (默认值禁令)

Never assert only the default/initial/empty value and call it coverage. Use
distinct, non-default inputs for every parameter so a hardcoded or
pass-through implementation fails. If the test passes with the implementation
replaced by a constant, it tests nothing.

## Red evidence (红证据)

A test you haven't seen FAIL is a test you haven't verified. Before trusting a
new test: run it against the broken/missing implementation (or temporarily
break the code) and watch it fail for the RIGHT reason. Green-on-first-run
with no red phase means you don't know what it actually checks.

## Mutation spot-checks (变异抽查)

For critical logic, flip a condition (`==`→`!=`, `<`→`<=`, drop a negation)
and re-run: at least one test MUST fail. If all stay green, the suite can't
kill that mutant — the tests are too weak. Spot-check 2-3 mutants on the
riskiest function rather than a full mutation run.

## Flaky triage (flaky 治理)

~84% of "flaky" failures are false alarms (timing, ordering, shared state),
not real bugs. Before re-running blindly: check for time/randomness/order
dependence, shared fixtures, and external I/O. Quarantine a genuinely flaky
test (mark + track) instead of letting it erode trust in the suite; never
delete or skip a failing test just to go green.

## Coverage that proves behavior

Line coverage ≠ behavior coverage. Require: normal path, boundary values,
empty/null/overflow, and the error path (exception raised/caught correctly).
Name tests `test_<scenario>_<expected>`; one behavior per test; parametrize
to cut boilerplate.
