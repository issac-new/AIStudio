# 抽屉关闭即卸载后的测试断言同步（spec）

日期：2026-10-18
分支：`fix/drawer-test-sync`
来源：并行批次 `35598bba` 将 `SimAnchorDrawer` 改为关闭即卸载（`v-if="props.open"`，用于消除三签关闭态 0×0 dialog 的无障碍噪音），但三处旧测试仍在断言 `sim-anchor-drawer--open` 类。全量测试因此出现 3 项失败。

## 变更

- `sim-b2-panels.test.ts` 两处、`sim-overview-panel.test.ts` 一处：断言从 `classes()` 包含 `--open` 改为抽屉元素 `exists() === true`。
- 产品代码零改动。

## 决策记录

1. **产品行为以 `35598bba` 为准**：关闭即卸载是既定的无障碍修复；组件不再维护 `--open` 类，测试应断言元素存在/不存在。
2. **只改测试**：失败原因是断言过期，不是功能回退；不为了旧断言恢复常驻抽屉。
3. **保留证据字段断言**：标题、锚号、证据原文断言不变，确保抽屉内容仍被验证。

## 验证

- `npx vitest run custom/client/ia2/__tests__/sim-b2-panels.test.ts custom/client/ia2/__tests__/sim-overview-panel.test.ts`：28/28 通过。
- 合并后全量测试复跑。
