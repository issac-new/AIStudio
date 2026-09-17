# Task 8 报告：dispatch-kv + task-dispatch store

日期：2026-09-17。分支 `feat/matrix-teams-p3-dispatch`（自 main @ ffc0928）。Commit：`9fdd32f`。

## 交付物

| 文件 | 说明 |
|---|---|
| `custom/client/matrix-teams/store/dispatch-kv.ts` | 外派防重索引（localStorage），`DISPATCH_INDEX_KEY = 'matrix-teams.dispatchIndex'`，load/safeSet 模式同 cockpit-kv |
| `custom/client/matrix-teams/stores/task-dispatch.ts` | pinia store `matrix-task-dispatch`：`dispatches` 视图（assign 按 taskId 去重，receipt 以 reportedAt 最新幂等合并）、`sendAssignment`（uuid taskId + issuedBy/issuedAt）、`handleTimelineEvent`、`receiveAssign` 空实现占位（Task 9 填充）、`ensureListening`（幂等自挂 Timeline，pinia scope watcher） |
| `custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts` | 简报测试原文照抄（4 用例） |
| `custom/client/matrix-teams/__tests__/dispatch-target-no-registry.test.ts` | 新增独立文件级 mock 测试（1 用例） |

## 偏差记录（断言意图不变，均写进实现注释）

1. **"未配置注册房间不发送"用例从 doMock 分支改为独立测试文件**。简报原写法（`vi.doMock + vi.resetModules` 与文件级 `vi.mock` 混用）在 vitest 3.2.4 下，`doMock` 对已被 `vi.mock` 注册且已被静态 import 的模块不生效，fresh import 拿到旧 mock，`registryRoomId` 仍是 `'!reg:sv'`，断言必假失败。按开工前裁决改为独立文件 `dispatch-target-no-registry.test.ts`，文件级 mock 把 `registryRoomId` 定为 `{ value: null }`，断言意图（返回 false、零发送）逐字保留。
2. **ref 解包修正 `raw?.value ?? raw` → `'value' in raw` 判定**。简报实现直接读 `registry.registryRoomId` / `matrixClientStore.client`，但简报测试 mock 是 setup 原始返回的 ref 形态 `{ value }`（pinia 代理才解包），直接读会拿到包装对象：房间比较恒不等（视图恒空）、`sendEvent` 不存在（恒 false）。按 team-registry.ts 既有惯例加解包。且 `??` 写法对 `{ value: null }` 会回退成包装对象（真值）丢 null 语义——这正是"未配置房间"用例的场景，`??` 写法下简报参考实现自身也过不了其测试 #2。故用 `'value' in raw` 精确判定 ref 形态，null 语义正确传递。
3. 其余实现与简报参考稿一致（含 ensureListening 顶层 watcher 结构）。

## 验证

- `npx vitest run custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts`：4/4 通过。
- 全模块 `npx vitest run custom/client/matrix-teams`：8 文件 49 测试通过（提交时点）。
- 事件类型字符串守门扫描：task-dispatch.ts 只引用 `TASK_EVENT_TYPES` 常量，无字面量泄漏。

## Concerns

- `mapKanbanStatusToReceipt` 本任务未引入；Task 9 简报参考稿与自身测试在未知状态兜底上矛盾（见 Task 9 报告），本任务不涉及。
- `ensureListening` 的幂等位 `listening` 是模块级闭包变量，跨测试文件/多 pinia 实例共享同一 store 定义时不会重复挂监听（符合意图）；若未来同进程内需要对多个 client 实例分别重挂，需再评估。
