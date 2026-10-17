# 团队注册房间同步后发现的时序修复（spec）

日期：2026-10-18
分支：`fix/team-registry-sync-detection`
来源：用 Matrix 账号 `@swarm:matrix.test` 实测「建立团队与协调关系」页发现：创建注册房间后当次会话正常；重新加载页面后回到「尚未配置团队注册房间」，只能再次点候选房间。Matrix account_data 中 `com.swarmstudio.registry` 已正确持久化，问题在客户端首次同步前就执行了发现。

## 根因

两个问题叠加：

1. **真实 SDK 形状读错（主因）**：`matrix-js-sdk` 的 `client.getAccountData(type)` 返回 `MatrixEvent`，内容只能经 `getContent()` 取；`detectRegistry` 按 `{ content: ... }` 读取，拿到 `undefined` 后提前返回。account_data 实际已在 SDK store 的 `accountData` Map 里（实测 `com.swarmstudio.registry → { roomId }` 存在），服务端 GET 也返回 200，但页面永远发现不到。测试 mock 同样按 `{ content }` 形状返回，因此单测全绿而生产失败。
2. **首次同步时序（次因）**：`TeamsManagePanel` 在 `onMounted` 立即发现；若 account data 在首次 sync 之后才到达，没有后续重试。

## 变更

1. `team-registry.ts > detectRegistry`：兼容 MatrixEvent 的 `getContent()` 与旧 `{ content }` 形状；读取真实内容后再判断 roomId。
2. `TeamsManagePanel.vue`：监听 `matrixClientStore.syncState`，进入 `PREPARED` 或 `SYNCING` 时再次发现；保留 `onMounted` 一次，覆盖客户端已同步后再进页面的情况。
3. `team-registry-store.test.ts`：mock 改为真实 SDK 形状（`getContent()`），防止同类漏测；`teams-panel.test.ts` 增加同步状态变化后再发现的用例。

## 决策记录

1. **修内容提取而不是改 SDK**：`getAccountData` 的 MatrixEvent 返回是 SDK 契约；适配契约，不改上游。
2. **两种形状都兼容**：测试/旧 mock 用 `{ content }`，真实 SDK 用 `getContent()`；同时支持可让存量测试与运行时都过，且不制造第二套读取器。
3. **等同步事件，不轮询**：Matrix SDK 已有 `ClientEvent.Sync` 状态机，监听状态变化比定时轮询准确且无额外请求；`onMounted` 保留作为已同步场景的即时发现。
4. **测试 mock 对齐真实形状**：这次漏测的根因是 mock 比生产更宽松；把 mock 改成真实形状，后续同类缺陷会在单测暴露。

## 验证

- `npx vitest run custom/client/matrix-teams/__tests__/teams-panel.test.ts custom/client/matrix-teams/__tests__/team-registry-store.test.ts`：21/21 通过。
- 合并后用 Matrix 账号实测：重载 `/app/teams` 直接进入「Teams 管理」并显示注册房间，不再要求重新选择。
