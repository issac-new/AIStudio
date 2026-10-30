# 群聊时间线面板间歇性不挂载根治（activeRoom null 竞态）

日期：2026-10-30 ｜ 类型：fix（产品缺陷）｜ 触发：run23 用户实报「报告里没看到聊天会话窗口和内容」

## 变更

`custom/client/matrix-chat/components/MatrixRoomCanvas.vue`——两条自愈兜底：①syncState 兜底从 PREPARED-only 扩到 PREPARED+SYNCING；②新增房间列表变化 watcher，activeRoomId 已设但 activeRoom 仍空时重选。

## 决策记录

根因：selectRoom 在 client 房间列表未含目标房间时调用 → activeRoom 缓存 null → 房间列表后续刷新无响应式依赖触发翻案 → `v-if="activeRoom"` 永假 → MatrixTimelinePanel 永不挂载（点房间后中栏空态，run23 多次实录）。原 PREPARED-only 兜底漏了「sync 完成后新房间才入列」的窗口。不加 glob 重试（会掩盖真正不可达的房）；用 room list length watcher 做精确自愈。

## 验证

修复后实测（Playwright 登录态）：点「支付收银台需求分析讨论群」→ timeline 面板稳定挂载（35 条消息、5 条可见文本含 G5 收尾真实对话）；修复前同操作间歇性面板 0 挂载。报告步 11 帧重拍可见群消息。

## 设计文档影响

DESIGN_SYNC: none——组件内部响应性修复，不改任何契约或界面结构。
