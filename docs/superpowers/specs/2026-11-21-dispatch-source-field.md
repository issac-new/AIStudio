# 派单链来源字段（Agnes 批二遗留清偿）

> 状态：随码同批实施（2026-11-21）。范围=已批准的 Agnes 批二 spec §3.4 遗留项（原文「派单链来源字段留待批二在途合并后接入」），本 spec 只是 L2 流程承载，不扩批准范围。

## 变更

- `custom/server/zcode/mention-dispatch.ts`：
  - `DispatchPlan` 增必填 `source: 'rule'`（wrap 助手与未知 squad 直返两处落值）。
  - `MentionOutcome` 增可选 `source?: 'rule'`（信封透传 plan.source）与 `decisionRef?: string`（queued/coalesced/command_rejected 两态带 commandId；reject 无引擎 id 缺席；engine_unreachable 不强造——createSession 失败时 sessionId 可能未赋值，TS2454 实证）。
- 只补来源不改判定：planDispatch 判定序、槽锁、pending 语义零变化。

验收（可验证）：
- GIVEN @mention 派单成功 WHEN 读 MentionOutcome THEN source='rule' 且 decisionRef=commandId。
- GIVEN coalesced/ rejected-by-command WHEN 读 outcome THEN decisionRef=commandId。
- GIVEN 未知 squad 或未知 agent reject THEN 无 decisionRef（无引擎 id）且 source='rule'。

## 决策记录

1. **必填 vs 可选**：DispatchPlan.source 必填——它由 planDispatch 独家构造（零外部字面量），必填让「将来接入席位快路径」时漏标 source 成为编译错误；MentionOutcome 可选——测试面存在手构造字面量，可选避免破坏存量断言。
2. **decisionRef 取 commandId 不取 sessionId**：与 dispatch-ledger 归因优先级同口径（commandId 跨 kind 唯一、column 条目归因更细）；engine_unreachable 处 createSession 抛错时 sessionId 未赋值（TS2454），不强造无意义键。
3. **不触 decision-recorder**：DecisionGraph 落账面（recordDispatchDecision）已有 provenance（metadata.reason/commandId），本批只补 outcome/plan 的字段面；两面合一（统一决策 ID 贯穿 dispatch/cost/outcome）属批 1b 后续，不在本批。

## 验证

- `npx vitest run custom/server/zcode custom/server/kanban custom/server/decisiongraph custom/server/governance`：387 passed。
- `npm run typecheck:harness` 绿（初版 engine_unreachable 带 sessionId 被抓 TS2454，已撤）。

## 设计文档影响

DESIGN_SYNC: none

纯字段添加（来源留痕，无行为变化）；DESIGN.md 派单章无来源字段级口径，判定席位段的「来源固定四态」已覆盖 rule 态语义。机制预算 delta=+0（纯字段，无新机制/账本/开关）。
