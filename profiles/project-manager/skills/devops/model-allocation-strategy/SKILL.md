---
name: model-allocation-strategy
title: Model Allocation Strategy for Multi-Agent Hermes Teams
description: >-
  Decide WHICH model each agent role should run given cost structure
  (subscription vs quota vs pay-per-token), intelligence scores, refusal
  behavior, and load shape — then verify the target endpoint can actually
  serve auxiliary tasks before switching. Companion to team-model-routing
  (which covers the mechanics of executing the switch).
triggers:
  - "模型分配"
  - "如何选择模型"
  - "which model for each agent"
  - "model allocation"
  - "成本 智能 模型选择"
  - "auxiliary 404"
  - "k3 glm deepseek 分配"
---

# Model Allocation Strategy for Multi-Agent Hermes Teams

## When to Use

- Deciding which model each profile/role should run (new subscription added,
  pricing changed, new model released)
- A model switch is planned — check endpoint compatibility FIRST
- Cost pressure or quota exhaustion forces re-balancing across providers

For the MECHANICS of executing a switch (profiles.yaml override, regenerate,
diff-verify), use **team-model-routing**. This skill is the DECISION layer
that runs before it.

## The Four-Axis Decision Framework

Evaluate every candidate model on four axes, in this order:

1. **Hard constraints (binding)**: refusal behavior for the role's content
   class (security execution needs low-refusal), wire-format compatibility
   (see endpoint matrix below), context length.
2. **Load shape ↔ billing shape match**: bursty/occasional load fits quota
   subscriptions (5h/weekly/monthly caps); sustained/always-on load needs
   unlimited subscriptions or cheap pay-per-token. NEVER burn limited quota
   on sustained load.
3. **Intelligence per role**: match score to cognitive demand — but a higher
   score NEVER justifies violating axis 2 (a 6-point gap doesn't justify
   spending scarce quota on an always-on worker when an unlimited model
   exists).
4. **Marginal cost**: after 1-3, prefer zero-marginal-cost (unlimited
   subscription) over pay-per-token.

**Double-domination rule**: a model that loses to another on BOTH
intelligence AND marginal cost gets NO primary role. Keep it as
fallback/insurance only (e.g. `fallback_providers`).

## Worked Example (2026-07-24, user-supplied data)

| Model | Intelligence | Cost structure | Verdict |
|-------|-------------|----------------|---------|
| k3 | 57 | most expensive; 5h/weekly/monthly quota | hack team only (low refusal = binding; bursty load fits quota) |
| glm-5.2 | 51 | unlimited monthly subscription | ALL sustained roles: swarm ×9, auxiliary, Hindsight |
| deepseek-v4-pro | 43 | pay-per-token | double-dominated by glm-5.2 (lower score AND paid) → no primary role, fallback only |
| deepseek-v4-flash | 40 | pay-per-token, cheap | micro-tasks (approval) or overflow |

Result: `swarm 9 = glm-5.2`, `hack 6 = k3`, `aux = damoxing glm-5.2 /
glm-4-flash` — and the analysis conclusion was "current deployment is
already optimal; change nothing".

## Pre-Switch Gate: Endpoint Auxiliary Compatibility

Before pinning ANY profile to a new provider, verify the endpoint serves
**auxiliary tasks**, not just main chat:

- `api.kimi.com/coding` (Kimi Coding Plan) speaks **Anthropic Messages wire
  format ONLY**. Hermes auxiliary tasks (title_generation, compression,
  session_search, web_extract, vision, approval) default to OpenAI
  `chat.completions` against the main provider → **HTTP 404**. Long kanban
  runs then die at the context limit when compression 404s, and session
  titles stay NULL.
- **Symptom check**: run `hermes -p <profile> chat -q "回复 OK" -Q 2>&1 |
  grep -iE "404|auxiliary|failed"` — empty = OK; a `⚠ Auxiliary title
  generation failed: HTTP 404` line = broken.
- **Durable fix** (do NOT use `hermes config set auxiliary.*` — `auxiliary`
  is NOT in generate-configs.py `PRESERVE_KEYS`, so the next regeneration
  silently wipes it):
  1. Generator: `generate_config_yaml()` reads
     `auxiliary_cfg = shared.get("auxiliary", {})` and emits
     `if auxiliary_cfg: cfg["auxiliary"] = auxiliary_cfg`.
  2. profiles.yaml `shared_config` declares the pin once for all profiles:

     ```yaml
     auxiliary:
       title_generation: {provider: damoxing, model: glm-5.2}
       compression:      {provider: damoxing, model: glm-5.2}
       session_search:   {provider: damoxing, model: glm-5.2}
       web_extract:      {provider: damoxing, model: glm-5.2}
       vision:           {provider: damoxing, model: glm-5.2}
       approval:         {provider: damoxing, model: glm-4-flash}
     ```
  3. Regenerate + diff (per team-model-routing's backup→regenerate→diff).
- Pin aux to the **unlimited subscription** provider — aux calls are
  high-volume; per-token providers waste money and premium quota is reserved
  for main chat. Approval gets the small cheap model.

> ⚠ **Known stale claim to fix**: `team-model-routing` §2 currently says
> "`api_mode: anthropic_messages` endpoints (Kimi coding, damoxing) work for
> both main and auxiliary calls" — disproven 2026-07-24 (Kimi /coding 404s
> all OpenAI-format aux calls). That line should read: works for MAIN chat;
> aux tasks need an explicit pin per this skill. (Skill lives in default
> profile; edit via file tools on ~/.hermes/skills/devops/team-model-routing/
> SKILL.md when file tools are available.)

## Optional Hardening Patterns

- **Quota fuse**: `fallback_providers: [damoxing]` on k3 profiles — quota
  exhaustion degrades to GLM-5.2 instead of halting hack work at month-end.
- **Turbo button**: orchestrator passes `model="k3"` on individual
  `kanban_create` calls for one-off hard tasks (complex exploit chains,
  novel reversing) — premium intelligence spent per-task, not always-on.
- **Provider tri-pillaring**: keep main-chat providers of the two boards on
  different vendors (damoxing vs kimi) so one outage leaves the system
  half-up, not down.

## Pitfalls

- **Analysis-paralysis on re-allocation**: if the current assignment already
  matches the framework's output, SAY SO and change nothing. Churning
  configs to look busy risks breaking working deployments.
- **Intelligence scores are not additive justification**: "X is 6 points
  smarter" is irrelevant if X's billing shape can't carry the load.
- **Refusal constraints outrank cost**: hack team's k3 assignment is driven
  by GLM-5.2's false-refusal rate on security content, not by k3's score.
  Re-evaluate only if GLM's refusal behavior changes (the three-layer
  authorization framework in `llm-refusal-mitigation` already reduced it).

## Related Skills

- **team-model-routing** (default profile) — the execution mechanics this
  skill's decisions feed into: per-profile `model:` override, custom
  provider declaration, backup→regenerate→diff, dangling-symlink pitfall.
- **llm-refusal-mitigation** — the authorization-framing layers that make
  GLM-5.2 viable as k3's fallback on security content.
- **hermes-profile-config** — config-editing write-guard rules.
