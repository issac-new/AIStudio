# 团队注册房间同步后发现的时序修复（spec）

日期：2026-10-18
分支：`fix/team-registry-sync-detection`
来源：用 Matrix 账号 `@swarm:matrix.test` 实测「建立团队与协调关系」页发现：创建注册房间后当次会话正常；重新加载页面后回到「尚未配置团队注册房间」，只能再次点候选房间。Matrix account_data 中 `com.swarmstudio.registry` 已正确持久化，问题在客户端首次同步前就执行了发现。

## 根因

`TeamsManagePanel` 在 `onMounted` 立即调用 `registry.detectRegistry()`。此时 `matrix-js-sdk` 的首次 sync 可能尚未完成，`client.getAccountData(REGISTRY_ACCOUNT_DATA_TYPE)` 返回空，函数提前返回；后续 sync 完成没有再次发现，页面因此停留在未配置态。房间本身已在客户端房间列表里，所以候选兜底能看到它——这也证明数据没有丢，只是发现时机不对。

## 变更

1. `TeamsManagePanel.vue`：监听 `matrixClientStore.syncState`，进入 `PREPARED` 或 `SYNCING` 时再次调用 `registry.detectRegistry()`；保留 `onMounted` 一次，覆盖客户端已同步后再进页面的情况。
2. `teams-panel.test.ts`：mock 增加 `syncState` ref；新增用例——挂载时发现一次，`syncState` 变为 `SYNCING` 后再次发现；每个用例重置 `syncState`。

## 决策记录

1. **等同步事件，不轮询**：Matrix SDK 已有 `ClientEvent.Sync` 状态机，监听状态变化比定时轮询准确且无额外请求。
2. **保留 onMounted 发现**：客户端在进页面前已同步时，`syncState` 不会再变化；挂载时的一次发现是必要兜底。两处都调用是幂等的，不会写数据。
3. **不改 store 的持久化逻辑**：account_data 写入已正确；只修读取时机，避免扩大改动面。

## 验证

- `npx vitest run custom/client/matrix-teams/__tests__/teams-panel.test.ts custom/client/matrix-teams/__tests__/team-registry-store.test.ts`：21/21 通过。
- 合并后用 Matrix 账号实测：重载 `/app/teams` 直接进入「Teams 管理」并显示注册房间，不再要求重新选择。
