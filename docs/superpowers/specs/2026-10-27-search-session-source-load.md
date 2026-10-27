# 检索弹窗会话源装载缺陷修复规格

- 日期：2026-10-27
- 状态：实施中
- 分支：`fix/search-session-source-load`
- 关联：`2026-10-27-search-dialog-truthiness.md`

用户追问「会话怎么没匹配上数据」后活体测定出真缺陷：检索弹窗打开时不主动装载 agent 单聊与群聊两路会话源。`useSessionRows` 读 `chatStore.sessions` 与 `groupChat.rooms`，这两个 store 只在对应聊天页访问后才装载数据——首次打开弹窗时两路恒空，访问过聊天页才出现。房间源无此问题（matrix 客户端在壳挂载时已连接拉取）。

## 变更

- 弹窗打开（`workspace.searchOpen` 置真）且两源未装载时，调用 `chatStore.loadSessions(chatStore.sessionProfileFilter)` 与 `groupChat.loadRooms()` 各一次。两者均幂等；并发防抖以「本次打开周期只触发一次」为界（重复打开弹窗允许刷新，长会话重复装载由 store 既有请求序号守卫兜底）。
- 装载失败静默（fail-soft）：会话组如实少一路数据，不弹错误——检索是读面，失败不阻断其余组。
- 群聊 `connect` 不在此处触发：它是长连接副作用（WS），由群聊页自有生命周期管理；检索只读 `loadRooms` 一次性列表。

## 决策记录

| 编号 | 决策 | 类型 | 用户裁定 | 理由与边界 |
|---|---|---|---|---|
| D1 | 弹窗打开时装载两源，不搬进 useSessionRows | Mechanical | approved | useSessionRows 是纯读装配，装载属弹窗生命周期副作用；壳层 armed 数据面已有先例（useSharedArm） |
| D2 | 群聊只 loadRooms 不 connect | Mechanical | approved | connect 建长连接是页面级副作用；检索只需一次性列表快照 |

决策留痕写入本任务 worktree 的 `.swarm-yuan/decisions.jsonl`。

## 验证

- 失败测试先红：弹窗打开断言 `loadSessions` 与 `loadRooms` 被调用且只调一次；已装载（`sessionsLoaded=true`）时不重复调。
- 目标测试 → ia2 全目录 → 全量 `npm test` → `npm run build` → 活体走查（新开无聊天页历史的会话上弹窗出会话源）。

## 设计文档影响

DESIGN_SYNC: none——纯前端装载时序修复，不触及整合正本与数字总账记载面；由节点⑦审查背书。

## 风险与回滚

- 重复装载风暴风险：store 请求序号守卫兜底；回滚=还原本批提交。
