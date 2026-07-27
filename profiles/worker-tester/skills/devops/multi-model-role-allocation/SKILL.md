---
name: multi-model-role-allocation
title: Multi-Model Role Allocation (Capability × Cost Decision Layer)
description: >-
  Decide WHICH model each Hermes role/profile should run given a fleet of
  models with different intelligence, cost structure, modality, speed, and
  concurrency. Holds the user-verified model facts table, the async-vs-
  human-waiting allocation principles, the auxiliary-vision fallback
  pattern (text main model → k3 → continue), and provider inventory
  checks. For the MECHANICS of pinning a team to a model
  (profiles.yaml override, regenerate, diff), use team-model-routing.
triggers:
  - "模型分配"
  - "哪个模型更好"
  - "choose model for role"
  - "model allocation"
  - "视觉走k3"
  - "vision fallback"
  - "auxiliary vision"
  - "为agent选择合适的模型"
---

# Multi-Model Role Allocation

Decide which model each role runs. For HOW to execute the switch
(profiles.yaml per-profile `model:` override, generate-configs.py,
backup→diff→smoke-test), load **team-model-routing** — that skill is the
mechanics; this one is the decision layer.

## Verified model facts (user-provided + curl-verified 2026-07-24)

| Model | 智能分 | 成本结构 | 模态 | 速度/并发 | 端点 |
|-------|--------|----------|------|-----------|------|
| k3 (custom:kimicode) | 57 | 套餐, 最贵, 5h/周/月限量 | **唯一多模态** | 较快 | api.kimi.com/coding |
| glm-5.2 (damoxing) | 51 | 月套餐 **不限量** | **纯文本** | 中 | damoxing 网关 (New API) |
| deepseek-v4-pro | 43 | 按量计费 | 纯文本 | **最快, 并发最高** | api.deepseek.com |
| deepseek-v4-flash | 40 | 按量, 最便宜 | 纯文本 | 最快 | api.deepseek.com |

Corrections the user issued — do not regress on these:
- **GLM-5.2 is TEXT-ONLY.** I claimed it was multimodal; user corrected.
  damoxing gateway serves no vision variants at all.
- DeepSeek (official API) has no vision models either. **k3 is the only
  multimodal model in the fleet.**
- DeepSeek is the fastest and highest-concurrency provider (user fact).

## Allocation principles (established 2026-07-23/24)

1. **Kanban workers are asynchronous.** Nobody watches a dispatched worker
   live, so raw speed is nearly worthless for them — intelligence × cost
   rules the decision. Speed only matters where **a human is waiting**:
   approval review (user blocked on a command gate), the orchestrator
   front door (Matrix/TUI replies).
2. **Domination check first.** v4-pro (43) loses to glm-5.2 (51) on
   intelligence AND on marginal cost (unlimited subscription = 0) → v4-pro
   gets NO primary role; it is fallback-only. Always run this 2×2 before
   assigning a pay-per-token model over an unlimited one.
3. **Quota is a budget, spend it on irreplaceable capability.** k3's
   limited quota buys the two things no other model offers: low-refusal
   security execution (hack team) and multimodality. Nothing else should
   burn it.
4. **Provider independence = resilience.** swarm on damoxing + hack on
   kimicode means one provider outage never kills the whole system. Keep
   the two big teams on different providers; use deepseek as the third
   leg for fallback.

## Resulting allocation (current production state)

- **hack 6 profiles → k3**: refusal rate is the hard constraint; bursty
  load fits the quota window; multimodality free (forensics/recon images).
- **swarm 9 profiles (incl. orchestrator) → glm-5.2**: unlimited plan
  absorbs sustained heavy load; aux ecosystem + Hindsight already there.
- **aux (title/compression/session_search/web_extract) → damoxing/glm-5.2**;
  **approval → glm-4-flash** (cheap; a human waits on it — see inventory
  pitfall below about this exact pin).
- **aux vision → custom:kimicode/k3** (see next section).
- **deepseek → fallback layer only** (v4-pro for failover, v4-flash
  candidate for approval if glm-4-flash proves unavailable on damoxing).

## Vision fallback pattern (text main model → k3 → back)

Hermes `auxiliary.vision` is exactly the "低频多模态统一走 k3，分析完继续
走原文本模型" mechanism the user asked for: a non-vision main model hits an
image → `vision_analyze` side-calls the aux vision model → gets a text
description → main session continues unchanged. Configuration lives in
`shared_config.auxiliary.vision` (profiles.yaml):

```yaml
    vision:
      provider: custom:kimicode
      model: k3
```

Regenerate and verify END-TO-END with a text-model profile (a main-model
k3 profile would use native vision and prove nothing):

```bash
hermes -p worker-researcher chat -q \
  "请使用 vision_analyze 工具分析图片 /tmp/test-red.png，告诉我主要颜色。" -Q
# PASS = correct color AND the reply continues in glm-5.2's session
```

## Pitfall: pin only models the gateway actually serves

Aggregator gateways (damoxing is New API) serve a FIXED list. I pinned
`approval → glm-4-flash`; `/v1/models` showed only glm-5/5.1/5.2 variants —
glm-4-flash absent, pin silently dangling. **Before pinning any model
(main or aux), inventory the provider:**

```bash
curl -sS "$BASE/v1/models" -H "Authorization: Bearer $KEY" \
  | python3 -c "import json,sys; print('\n'.join(sorted(m['id'] for m in json.load(sys.stdin)['data'])))"
```

damoxing inventory 2026-07-24: GLM-5.2-C, glm-5, glm-5.1(+dated),
glm-5.2(+dated) — all text-only. New API gateways return an HTML frontend
on `/models`; the API path is `/v1/models`.

## Pitfall: k3 /coding 404 is ALIAS-specific, not endpoint-wide

The bundled hermes-agent doc (`references/kimi-coding-auxiliary-404.md`)
says aux tasks 404 on api.kimi.com/coding. Empirically (curl 2026-07-24)
the **`k3` alias accepts OpenAI-format `/v1/chat/completions` for both text
and image_url payloads (HTTP 200)**; the 404 applies to Anthropic-only
aliases like `kimi-for-coding`. Before assuming the 404 applies, curl-test
the exact alias you intend to pin. The aux pins to damoxing remain correct
(cost: unlimited vs k3's scarce quota) — the point is vision CAN use k3.

## Related

- **team-model-routing** — mechanics: profiles.yaml `model:` override,
  custom_providers list-form rule, backup→regenerate→diff, smoke test,
  dangling-skills-symlink pitfall. Overlap note: this skill adds the
  decision layer + aux/vision facts; a future merge is reasonable.
- **llm-refusal-mitigation** — the three-layer authorization framing that
  makes GLM-5.2 viable as k3 fallback for security tasks.
- references/model-fleet-facts.md — curl verification transcripts.
