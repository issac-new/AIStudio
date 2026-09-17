# Task 9 报告：成员侧接收落地

日期：2026-09-17。分支 `feat/matrix-teams-p3-dispatch`（含 Task 8 commit `9fdd32f`）。Commit：`ae280a5`。

## 交付物

| 文件 | 说明 |
|---|---|
| `custom/client/matrix-teams/adapters/dispatch-target.ts` | `resolveTargetProfile`（显式 profile > team.defaultProfile > team.profiles[0]；账号/team 找不到 → null；无 team 取账号首个 team）、`mapKanbanStatusToReceipt`（四桶映射） |
| `custom/client/matrix-teams/stores/task-dispatch.ts` | `receiveAssign` 完整实现（kv 防重 → resolve → `createTask`（标题前缀 `[外派-<taskId 前 6 位>] `）→ kv 记录 → created 回执；解析失败 → failed 回执带 `no-such-profile`；建卡异常 → failed 回执带 reason，不抛）；新增 `sendReceipt` 并加入导出 |
| `custom/client/matrix-teams/__tests__/dispatch-receive.test.ts` | 简报测试原文照抄（8 用例） |

## 偏差记录（断言意图不变）

1. **`mapKanbanStatusToReceipt` 未知状态兜底按测试与接口契约改为 `'running'`**。简报接口节明文"未知 → 'running' 兜底"，测试也断言 `weird → 'running'`；但简报参考代码以 `return 'created'` 兜底（created 桶靠落入 default 实现）。两者矛盾，按"断言意图为准"修正：created 桶显式枚举（triage|todo|scheduled|ready），`running|review` 及未知统一走 `'running'` 兜底。功能覆盖无缺口。
2. `receiveAssign`/`sendReceipt` 沿用 Task 8 的 `'value' in raw` 解包（同报告偏差 2），mock 形态与真实 pinia 形态均正确。
3. 其余实现与简报参考稿一致（kv 防重返回即不建卡不回执、reason 截断 200 字符等）。

## 验证

- `npx vitest run custom/client/matrix-teams/__tests__/dispatch-receive.test.ts`：8/8 通过。
- 全模块 `npx vitest run custom/client/matrix-teams`：9 文件 57 测试通过（含 Task 8 无回归）。
- 全量 `npm test`：168 文件 1706 测试全部通过。
- 事件类型字符串守门扫描：新文件无字面量泄漏。

## Concerns

- 建卡成功后、发 created 回执前若进程中断，会出现"本地已建卡但 leader 未收到回执"窗口；kv 已记录使重投递不会重复建卡，但 leader 侧 receipt 依赖后续 receipt 合并或人工重发。属 spec §6.2 设计取舍，未额外加补偿。
- `receiveAssign` 在 `handleTimelineEvent` 内 await，成员侧建卡失败（网络/服务异常）会吞掉异常并发 failed 回执，Timeline 监听链不受阻；但频繁失败时回执事件刷屏注册房间，上游暂无节流，后续任务可关注。
