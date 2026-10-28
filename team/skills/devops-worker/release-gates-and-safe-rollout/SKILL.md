---
name: release-gates-and-safe-rollout
description: "Release decision gates and safe-rollout defaults for the deployer: error-budget gates, canary metric traps (period mismatches, aggregate masking), and fail-closed defaults on irreversible actions. Use when judging whether to deploy, when designing a canary/rollback plan, or when a release metric looks healthy but the change is risky."
version: 1.0.0
author: Hermes Agent (Google SRE Workbook / DORA distilled)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [deployment, sre, canary, error-budget, fail-closed, worker-deployer]
    related_skills: [kanban-handoff-contract]
---

# Release gates & safe rollout

## Error-budget gate

A release proceeds only if the service has error budget left. Burned-out
budget → freeze risky releases, prioritize reliability work. State the budget
position in the deploy handoff; "deploy because it's ready" is not a gate.

## Error Budget Release Gate（4 档门）

Error budget 余量 = SLO 允许失败的那部分请求或时间。它是客观门，不拿来做发布
讨价还价（上游：agent-skills shipping-and-launch/SKILL.md:244-255，2026-10-18
融合 t_d6129454）：

| 预算余量 | 动作 |
|---|---|
| > 20% | 正常发布，密切监控 |
| 0–20% | 只慢发布（slow rollouts），禁高风险变更 |
| 耗尽 | 冻结功能发布，全力投入可靠性工作 |
| 重置 | 恢复正常节奏，把找回预算的修复固化进流程 |

Canary 燃耗超基线 = hold：金丝雀期消耗预算速度快于基线水平时，与错误率升高
同档处理，暂停推进（对应上游 rollout thresholds 表的 hold 档）。

适用面（必读）：本门只对真有 SLO 的服务生效——data-stack 实时数仓、weixin
网关这类有指标、有真实用户的服务。agent 工作流（调研、写卡、融合、报告）没有
SLO 与错误预算概念，不套用本门，按 fail-closed 默认与评审门走。

## Canary metric traps

1. **Period mismatch** — a canary evaluated over a shorter window than the
   metric's natural period (daily/weekly cycles) reads noise as signal.
   Match the evaluation window to the metric's period.
2. **Aggregate masking** — a healthy global average can hide a dying
   region/segment. Check per-segment canary metrics, not just the aggregate.
3. **No baseline** — compare the canary against a control/baseline, not
   against "looks okay". A canary without a comparison is a vibe.

## Fail-closed defaults

When a check's result is unavailable or ambiguous, default to NOT proceeding
(fail closed), never to "probably fine". Any irreversible or production-bound
action (push --force, prod config change, external message, deleting data)
requires explicit confirmation — in headless/kanban context that means
`kanban_block` with intent + impact, never proceeding unilaterally.

## Rollback before rollout

Every deploy plan names its rollback: how to revert, how fast, and what
metric triggers it. If rollback is "figure it out later", the deploy isn't
ready. AI is an amplifier (DORA): it speeds up both good and bad delivery —
the gate is what keeps speed from becoming instability.
