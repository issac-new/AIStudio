# 主动性两轴面板加挂⑥治理页签（2026-10-26 微轮）

分支：`feat/proactivity-govern-tab`（worktree `proact-gov-tab`，自 origin/main 414b56660 起）。前批=2026-10-26-proactivity-two-axis.md / 2026-10-26-proactivity-followup.md。

## 变更

用户裁定（「要」）：ProactivitySection（两轴矩阵/执法策略/目标对齐/演算器）除既有「①搭建→环境与资产」挂载点外，同时出现在⑥治理页签下。纯挂载改动：

- `custom/client/ia2/stage-tabs.ts`：阶段 6 页签表尾追加 `{ key: 'proactivity', component: 'proactivity' }`（页签键与文案单一事实源不变）。
- `custom/client/ia2/views/stage/StageShell.vue`：`TAB_COMPONENTS` 增 `proactivity: ProactivitySection`（`@/custom/...` alias，KanbanTaskDrawer 同款）。
- 测试：`custom/client/ia2/__tests__/stage-tabs-proactivity.test.ts`（阶段 6 含该页签、component 键映射可解析、深链 `?tab=proactivity` 合法）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 直接复挂 ProactivitySection 单组件，而非整挂 GovRegistryRulesView 新页签 | 用户要的是两轴面板；整挂会连带能力台账/状态本体/规则闸等六个面板在⑥重复出现 | 新页签挂 GovRegistryRulesView（否决：六面板双挂，信息重复） | 是 |
| D2 | 页签放阶段 6 表尾（gateLog 之后），不动 DEFAULT_TAB | 治理页签序=既有治理功能序，新页签追加不打乱肌肉记忆；默认页签保持遗留项清算 | 插入中部/改默认页签（否决：改变既有落点） | 是 |

## 验证

- `npx vitest run custom/client/ia2/__tests__/stage-tabs-proactivity.test.ts` 绿。
- `npx vitest run custom/client/ia2 custom/client/governance` 无回归（页签表消费面 StageShell/深链迁移表不受影响）。
- 合并后 8649 活体走查 `/#/app/stage/govern?tab=proactivity`（HMR 直接生效）。

## 设计文档影响

DESIGN_SYNC: touched
- docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md — §4.3 治理呈现面句补「及⑥治理·主动性两轴页签」。
- docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md — 页签计数 33→34。

## 挂账（本轮不做）

无。
