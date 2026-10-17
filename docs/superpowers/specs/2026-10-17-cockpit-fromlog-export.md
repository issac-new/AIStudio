# cockpit worker log 事件导出修复（spec）

日期：2026-10-17
分支：`fix/cockpit-fromlog-export`
来源：`npm run build` 报 `IMPORT_IS_UNDEFINED`——`custom/client/cockpit/store/cockpit.ts:901` 调用 `eventAdapter.fromLog(...)`，但 `custom/client/cockpit/adapters/event-adapter.ts` 中的 `fromLog` 未导出。运行到「打开任务详情并取 worker log」路径会抛 `eventAdapter.fromLog is not a function`。

## 变更

- `event-adapter.ts` 的 `fromLog` 增加 `export`。
- `event-adapter.test.ts` 新增 1 例：断言 `fromLog` 可直接导入，且返回事件的 id/taskId/source/fullText/字节数与截断标注正确。

## 决策记录

1. **导出而非复制实现**：调用方已按适配器命名空间调用，缺的只是导出；复制一份会造成两套日志事件口径。
2. **加守门测试而非只改代码**：构建警告只提示静态未定义，测试直接覆盖运行时形状，防再次漏导出。
3. **不改调用方**：`eventAdapter.fromLog` 的调用语义正确，改调用方会扩大改动面且无收益。

## 验证

- `npx vitest run custom/client/cockpit/__tests__/event-adapter.test.ts` 通过。
- `npm run build` 不再出现 `IMPORT_IS_UNDEFINED`。
