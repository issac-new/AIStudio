# matrix-teams 终审修复报告（Important-1 / Important-2）

日期：2026-09-17 ｜ 分支：`feat/matrix-teams-final-fix`（自 main @ 4aa9892，未合 main、未 push）｜ Commit：`4c8f7dc`

## 结论

两项 Important 修复均已完成并通过全部验证：`npx vitest run custom/client/matrix-teams/` 70/70 绿；`npm test` 全量 169 文件 / 1719 用例全绿。TDD 执行：先写测试（5 个新用例全红）→ 实现 → 全绿。

## Important-1：监听绑组件作用域缺陷

**根因**：`task-dispatch.ts` 的 `ensureListening()` 只由 `DispatchList.vue` onMounted 调用，watcher 绑组件 effect scope；组件卸载后 watcher 死亡但 `listening` 旗标仍 true，重挂永不发生，成员侧 assign 落地静默失效。与 team-registry（`team-registry.ts:260` 已在 setup 顶层修复）为同类缺陷。

**修法**（`stores/task-dispatch.ts`）：

- `ensureListening()` 的调用移到 store setup 体内顶层（watcher 落 pinia effect scope，同 team-registry 模式），注释说明迁移理由。
- `DispatchList.vue` onMounted 删除 `dispatch.ensureListening()`，仅保留 30s 轮询 setInterval（组件级定时器，卸载清理，归属合理）；组件注释同步更新。
- `teams-panel.test.ts:62` 的过期注释一并修正。

**守门测试**（`task-dispatch-store.test.ts`「监听生命周期」）：实例化 store 即挂且只挂 1 个 `Room.timeline` 监听、无需任何组件挂载；`ensureListening()` 重复调用幂等。结构对齐 team-registry-store.test.ts:164 对应断言。

## Important-2：离线/重启迟到消息的历史回填

**根因**：spec §10 承诺「Sync 全量补拉天然恢复」，但实现只消费监听挂载后到达的 timeline 增量；成员重启或首次打开 tab 前到达的 assign 丢失、不建卡。

**修法**（`stores/task-dispatch.ts` 新增 `backfillHistory`，约 45 行）：

- SDK v41.9.0 签名已实测确认：`client.scrollback(room, limit): Promise<Room>`（client.d.ts:1903）、`room.getLiveTimeline(): EventTimeline`（room.d.ts:424）、`EventTimeline.getEvents(): MatrixEvent[]`（event-timeline.d.ts:138）。
- 触发：`watch([clientRef, registryRoomIdRef], () => void backfillHistory(), { immediate: true })`——覆盖「实例化时已就绪」与「detectRegistry 后房间才知」两种时序。
- 流程：房间定位成功即置 `backfilledForRoom` 防重（scrollback 失败不反复重试）→ `scrollback(room, 100)` 尽力扩大历史窗口（失败/不存在时以已同步 live timeline 窗口为准，均 try/catch 静默降级）→ `getLiveTimeline().getEvents()` 逐条走与增量监听完全相同的 `handleTimelineEvent`（assign → `upsertAssign` + 目标为本账号 → `receiveAssign`；receipt → `mergeReceipt`）。单条回放失败跳过，不阻断其余历史。
- 幂等依据：kv 防重（`receiveAssign` 已记录即 return，不建卡不回执）+ `upsertAssign` 视图去重 + `mergeReceipt` 最新 reportedAt 胜——重复回放历史不重复建卡，与增量路径交错也安全。
- 事件类型字符串零新增，过滤复用 protocol.ts 常量；`backfillHistory` 导出供测试直接调用。

**守门测试**（6 个新用例）：

- `task-dispatch-store.test.ts`「历史回填」：历史窗口 assign/receipt 回填进 leader 视图（含无关 `m.room.message` 过滤、非本账号不触发建卡）；`backfillHistory` 重复调用幂等。
- `dispatch-receive.test.ts`「历史回填恢复」：监听挂载前历史里的 assign → 走 `receiveAssign` 建卡 + kv 记录 + created 回执；kv 已记录 → 跳过不建卡不回执；回填后同一 assign 经增量监听重放仍只有一张卡。

## 顺手修复

`dispatch-target-no-registry.test.ts` 的 mock client 缺 `on`/`off`：终审修复后 store 实例化即挂监听，mock 保真补齐（真实 MatrixClient 恒有 EventEmitter 监听面，同 teams-panel.test.ts 既有理由）。仅 mock 改动，无既有断言弱化。

## 验证

- `npx vitest run custom/client/matrix-teams/`：10 文件 70 用例全绿。
- `npm test`：169 文件 1719 用例全绿。
- 提交 `4c8f7dc` 仅含 6 个相关文件（+158/-7）；误纳入的 `.swarm-yuan/` 工具目录已 amend 剔除，仍保持 untracked。

## Concerns（留待协调者/用户）

1. **⚠️ 真实双端行为未经实测**：scrollback 分页与 getLiveTimeline 窗口大小、以及「store 实例化时初始 sync 尚未完成、getRoom 返回空」的时序竞争，均只经 mock 契约对齐测试；需用户真机双端验证（成员重启后历史 assign 自动建卡）。
2. **回填窗口上限 100**：scrollback limit 硬编 100；超出该窗口的更老历史仍不可恢复。如需更大窗口可调常量或后续接分页循环。
3. **回填静默降级**：scrollback/单条回放失败均静默跳过（与仓库「单条失败静默、下轮重试」的既有容错口径一致），失败无用户可见信号，仅增量监听兜底。
4. 仓库无 typecheck 门禁（无 tsconfig，仅 vitest 转换不校验类型）；本改动全部经显式 cast 收窄，但未过 vue-tsc。

---

## 补修（追加提交）：回填旗标按 client 实例维度判定

**缺陷**：`backfilledForRoom` 粘性旗标在登出重登（不刷新页面）后跳过重回填。登出不清 `registryRoomId`，重登后 watch 再触发但 `backfilledForRoom === roomId` 直接 return，两次会话间隙到达的 assign 静默丢失——正是 Important-2 回填要堵的丢失类。

**修法**（`custom/client/matrix-teams/stores/task-dispatch.ts`）：已回填状态从 sticky「房间→布尔」改为记录 `{ client, roomId }` 对；client 变化（含登出为 null 再重登的新实例）后同房间必须再次回填。同 client 同房间的重复触发仍幂等（kv 防重 + 视图幂等不变）。

**守门测试**（`__tests__/task-dispatch-store.test.ts`）：mock client 改真实 vue ref 以支持响应式切换——首次就绪回填 → client→null（登出）→ 新 client 实例就绪 → 断言 `dispatches` 增至 2 且新实例 `scrollback` 被再次调用。TDD 验证：仅回退 store 修复后该测试红（超时，dispatches 恒为 1），其余 7 个测试不受影响；修复后 matrix-teams 71/71、全量 1720/1720 全绿。

**未变**：零新增依赖、事件类型字符串零新增、既有断言未弱化。
