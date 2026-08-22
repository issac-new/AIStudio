# 共享规则引用入口（Shared Rules Reference — v2）

> 所有跨 worker profile 共享的强制规则、协议、契约都在 `_shared/` 下。本文件是引用入口。

## 行为契约（每次 run 都生效）

- [`exit-protocol.md`](./exit-protocol.md) — run 结束必须是 `kanban_complete` 或 `kanban_block`，文本面板非汇报
- [`output-contract.md`](./output-contract.md) — `kanban_complete` 前必先 `kanban_comment` 含四段（变更/验证/实现/决策）
- [`verification-checklist.md`](./verification-checklist.md) — ACP 产出后过 7 项（文件存在/语法/类型/测试/linter/构建/session_id）
- [`anti-patterns.md`](./anti-patterns.md) — 不重复失败调用 / 文本面板非汇报 / 完成靠工具不靠感觉

## 流程契约

- [`forward-deployed-protocol.md`](./forward-deployed-protocol.md) — 前线侦察 4 步（kanban_show/read_file/session_search/hindsight_recall）
- [`revertibility-grading.md`](./revertibility-grading.md) + [`revertible-effects.md`](./revertible-effects.md) — 可逆性三级（低/中/高）
- [`kanban-advanced.md`](./kanban-advanced.md) — `kanban_create` 派生子任务约束

## 数据契约

- [`ontology.md`](./ontology.md) — 跨团队对象模型（Task/Artifact/Report 等 6 个对象 + 22 actions + 8 markings）
- [`marking-rules.md`](./marking-rules.md) — 安全标记传播（合取 AND，沿数据依赖）
- [`task-contract-guard.md`](./task-contract-guard.md) — 任务契约守卫（completed_cards/artifacts/metadata 校验）

## 强制红线

- [`mandatory-acp.md`](./mandatory-acp.md) — 编码开发必须通过 ACP（Claude Code 或 Codex）
- [`mandatory-privacy.md`](./mandatory-privacy.md) — 隐私保护规则（env_probe=false + redact + cwd 锁）
- [`chart-rules.md`](./chart-rules.md) — 绘图规则（ECharts/AntV 优先）

## 循环工程

- [`loop-engineering-gates.md`](./loop-engineering-gates.md) — Loop Engineering 验证门
- [`defensive-patterns.md`](./defensive-patterns.md) — 防御性编程模式

---

## SOUL.md 标准尾部（所有 worker 都引用本入口）

```markdown
## 共享规则

详见 [`_shared/shared-rules-reference.md`](./shared-rules-reference.md)（v2 索引所有强制规则）。
本 SOUL 不重复定义，外置引用 — 改一处全员生效。
```

## 版本

- v2 (2026-08-18)：新增 6 块（exit-protocol/output-contract/verification-checklist/anti-patterns/kanban-advanced/revertibility-grading）
- v1 (2026-08 早期)：ontology/marking-rules/forward-deployed-protocol/mandatory-acp/mandatory-privacy 等 5 块
- `matrix-collaboration-termination.md` — Matrix 协作七层防线/终止阈值（N=8/上限30/超时30min），SOUL §Matrix 强制引用
- `banned-command-prefixes.md` — 高危命令前缀黑名单+match/not_match 单测，Guardian 协议触发源（rules §0.9 引用）
- `worker-appeal-protocol.md` — Worker 申诉协议（request_changes 打回后的复核路径+反模式），ops-eval 第七维联动（2026-08-21，融合自麦肯锡绩效透明框架）

## 统一治理框架新增（2026-08-21，融合自 5 套 Harness）

- [`diamond-quality-gates.md`](./diamond-quality-gates.md) — Diamond 7 道质量门（Eligibility/Consistency/Privacy/Asset/Candidate-promotion/Repair-prompt/Blind-analysis），门 1/3/4/7 为硬门（融合自 Better Harness + HarnessEval）
- [`dod-checklist.md`](./dod-checklist.md) — 完成定义清单（通用 4 项 + 领域特定 + 交接质量 + 证据强度自评，≤74 分不 complete）（融合自 Better Harness）
- [`intervention-ledger.md`](./intervention-ledger.md) — Intervention Ledger 最小子集（4 字段挂 kanban_comment，5 态结果追踪，regressing 禁止聚合声明）（融合自 Better Harness）
- [`acp-permission-grading.md`](./acp-permission-grading.md) — ACP 权限分级（orchestrator/researcher/[已移除]/product=dontAsk，coder/tester/ops/[已移除]/platform=acceptEdits，hack=bypassPermissions+Guardian 强制二审）（融合自 DSH RC8）
- [`reportdelivery-protocol.md`](./reportdelivery-protocol.md) — reportDelivery 唤醒协议（子代理阶段性发现必须 kanban_comment 中途上报，父任务评估后 steer/stop/继续/升级，1 小时 3 次唤醒上限）（融合自 DSH RC8）

### 新增 skill（_shared/skills/）

- [`skills/codex-guardian-review/SKILL.md`](./skills/codex-guardian-review/SKILL.md) — Codex Guardian 二审协议（高危命令执行前 delegate_task 独立子代理裁决，fail-closed，DENY 后换路径重试=绕审违规）（融合自 Codex）

### 新增工具（~/.hermes/bin/）

- `audit-soul-rules.sh` — SOUL 引用机械审计脚本（27 profile × 25 规则对照表）
- `shadow-verification-audit.sh` — kanban verification 字段覆盖率审计（shadow 模式）
- `skill-health-audit.sh` — Skill 库健康度审计（零引用/stale/重复检测）
