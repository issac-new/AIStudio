---
id: KB-CANDIDATE-PI-PREPARE-NEXT-TURN-001
type: knowledge-candidate
domain: hermes-cluster
status: CANDIDATE          # 仍是观察项（deferred），保持 CANDIDATE 状态
sourceType: ai-assisted
owner: orchestrator
version: 1
updatedAt: 2026-08-25
confidence: medium         # 机制存在但无消费方
stability: evolving
evidence:
  - doc: pi harness 源码 packages/agent/src/agent-loop.ts:232-245
  - human: 蓝军评审（2026-08-24）
tags:
  - pi-harness
  - per-turn-hook
  - observation
anchors:
  - OBSERVATION:prepare-next-turn
  - DECISION:deferred
---

# ADR: pi prepareNextTurn 机制——观察项（待 Hermes 有 per-turn hook 时回评）

> **状态迁移**：2026-08-25 从 `_shared/decisions/` 升级到 `_shared/knowledge/candidate/`（保持 CANDIDATE 状态——仍是观察项，非决策）
> **原始日期**：2026-08-24

## Context

pi 的 `config.prepareNextTurn?.()` 允许在每个 turn 结束后动态替换 context/model/thinkingLevel——即 per-turn 动态推理降级。这与 Hermes 派生子代理默认廉模型评估（dsh rc.8 D14 识别未落地）是同一问题域。

## Decision

当前**不实现**：Hermes 的 conversation_loop 内部已有 turn 管理，无 per-turn hook 暴露；写语义文档无消费方。仅记录机制存在，待以下任一条件出现回评：
1. Hermes 上游提供 turn 边界 hook（如 prepareNextTurn 等价物）
2. 派生子代理成本分级评估进入实施阶段（此时此机制是落地路径之一）

## Consequences

- 第八波融合方案 v2 中此项从"P1-2 文档化"降级为本观察项（蓝军评审发现无落点）
- 回评时参考：pi agent-loop.ts:232-245 的实现 + Hermes auxiliary.<task>.reasoning_effort 分级现状

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-24 | 初版观察项 ADR | orchestrator |
| 2 | 2026-08-25 | 升级为 KB candidate（保持 CANDIDATE 状态） | orchestrator |