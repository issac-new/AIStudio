# Agnes 吸收批一 b：经验试用期与注入效果归因（实施级 spec，待 ai-native-batch2 合并后开工）

> 状态：立项待开工（2026-11-21）。前置：`feat/ai-native-cognition-batch2` 已提交 T5（dbccea0d7：`recordInjection`＋`injectionLog` 留痕账＋`listInjectionLog`）与 T6（4e2dccaec：`outcome/learning.ts` 结算→候选＋`outcome/comparison.ts` 同口径对照投影），该分支合并 main 后本批从新 main 起 worktree。
> 批一拆分：a 段（晋级门收紧）已合并 8911d0a7d。本 spec 覆盖 b 段剩余缺口——**以 T5/T6 落地契约为基础**，不重复造已存在的面。

## 1. 背景与真实缺口（对账 2026-11-21 batch2 分支实测）

| 批一原计划 | T5/T6 已落 | 本批剩余缺口 |
|---|---|---|
| 注入回执（expcandidates 路） | `recordInjection(ids, runLabel, snapshotId?)`＋`injectionLog`（cap 200，追加制） | 回执缺任务终态键：`runLabel` 是标签不是 taskId，join 不到 outcome/终态 |
| 统一注入路由器 | 无（exp-dual/fewshot 两路仍无留痕） | dual/fewshot 两路适配进留痕账＋统一预算（计划原义：保留双轨存储为兼容别名） |
| 效果归因（recordId 级成功率对照） | `comparison.ts` 是 **outcome 维度**同口径对照（结算↔结算） | **record 维度**归因缺：按 recordId 聚合注入→任务终态→与同 scope 未注入基线对照 |
| 试用期（probation）与自动退役 | 无：`approved` 永久生效 | 生命周期 `approved→probation→active/retired`＋惰性结算＋z 检验退役 |
| 指标触发回滚 | 无 | 试用期退役联动 workbench `rollbackProposal`（`HARNESS2_AUTO_ROLLBACK=1` 显式门） |

## 变更

按依赖序三件（全部 custom 层，+0 patch）：

1. **回执补键**（`exp-store.ts` 小改）：`recordInjection` 增可选 `taskId`；`injectionLog` 条目增 `taskId?`（缺省仍 runLabel，向后兼容）。派单链 `column-dispatch.ts` 注入调用点透传 `params.taskId`（该文件 batch2 已改过 5 行，合并后在其之上小改，不碰快照逻辑）。
2. **record 维度效果归因**（新增 `expcandidates/effect-report.ts` 纯投影＋只读端点）：按 `recordId` 聚合 injectionLog（有 taskId 的条目）→ join 任务终态（复用 `extract.ts` 的 task_events 读）→ 输出 `injections/success/failure/unknown/successRate/baselineSuccessRate(effect: improved|degraded|neutral|unknown)/coverage`。基线=同 scope（column+specialist）未注入任务成功率；样本 <5 或终态缺失一律 `unknown` 不猜数。`GET /api/expcandidates/effects` 只读暴露。
3. **试用期生命周期**（`exp-types.ts`/`exp-store.ts`＋新增 `probation.ts`）：
   - `ExpCandidate.status` 扩 `probation`；新增 `probation?: { startedAt; windowTasks: 20; minSamples: 5; settledAt?; verdict?; stats? }`。
   - `curate` 批准进 `probation`（不再直进 `approved` 生效；存量 `approved` 兼容不迁移）。
   - **惰性结算**：`dispatchColumnTransition` 入口结算到期条目（幂等有界，不新增 watcher）；判据=注入对照 z 检验（α=0.05）且成功率降超阈值→`retired`（原因 `probation_regression`）；样本不足→`probation_extended` 一次，再不足记 `effect_unknown` 挂人工；否则 `approved`（转正）。
   - **注入闸**：`probation` 态可注入（试用期就是要观察）但简报行带「（试用期）」标记；`retired` 不注入。
   - **workbench 联动**（可选开关）：退役时若该候选有 `sourceProposalId` 且 `HARNESS2_AUTO_ROLLBACK=1`，调 `rollbackProposal`（数据自动、文件显式——默认关，防自动改宿主文件）。
4. dual/fewshot 适配：`dual-inject.ts`/`fewshot.ts` 的选择器增「返回记录＋正文」接口，`stepBrief` 注入时对两路也调 `recordInjection`（kind 字段区分）；旧渲染函数保留为薄包装（计划原义：不合并存储）。
5. 配套：机制预算登记（sunset 绑「连续两轮零 probation 条目即降级为纯观测」）；DESIGN.md 学习闭环段随批修订；测试见下。

验收（可验证）：
- GIVEN injectionLog 含 taskId 条目 WHEN 请求 effects THEN successRate=成功注入数/总注入数且 baseline 同口径对照输出。
- GIVEN 试用期条目到期且 z 检验显著劣化 WHEN 下一次派单触发结算 THEN status=retired 且 reason=probation_regression 且历史保留。
- GIVEN 样本 <5 WHEN 结算 THEN verdict=probation_extended（首次）/effect_unknown（二次）不猜数。
- GIVEN retired 候选 WHEN 派单注入选择 THEN 该候选不被选中。
- GIVEN HARNESS2_AUTO_ROLLBACK 未设 WHEN 退役 THEN 不调 rollbackProposal（文件不动）。

## 决策记录

1. 惰性结算而非 watcher：试用期到期由下一次派单触发，避免新增常驻进程面（机制预算纪律）；代价是低频板到期检测滞后，可接受。
2. probation 仍可注入：试用期语义=「带观察的生产」，不注入就没有效果数据；标记行让 agent 知道经验未转正。
3. record 维度归因与 outcome 维度对照（comparison.ts）并存：前者回答「这条经验有没有用」，后者回答「这个结果有没有改善」；两问不同，不合并。
4. z 检验而非纯比例差：20 窗口小样本下比例差噪声大；α=0.05 单侧（只测劣化——改善自动转正不设统计门，保守方向）。
5. 自动回滚默认关：数据面（退役/不注入）自动，文件面（回滚写盘）显式——与仓内「不自动改宿主」先例一致。

## 验证

- 新增 `expcandidates/__tests__/effect-report.test.ts`（join/样本不足 unknown/基线对照）、`probation.test.ts`（结算三分支/幂等/注入闸/存量 approved 兼容）、`column-dispatch` 注入回执透传用例。
- 域测试：`npx vitest run custom/server/expcandidates custom/server/kanban custom/server/outcome`（outcome=batch2 契约回归）；`npm run typecheck:harness`；合并前 `npm test` 全量。
- 独立审查（非实现者）重点：试用期误杀面（小样本退役）、join 键正确性、与 T5/T6 契约的一致性。

## 设计文档影响

DESIGN_SYNC: none

纯立项 spec（未实施）。设计正本（DESIGN.md 学习闭环段、机制预算）随实施批同批修订——届时本 spec 收据绑定与 DESIGN_SYNC: touched 一并落；此刻无代码与文档变更面。
