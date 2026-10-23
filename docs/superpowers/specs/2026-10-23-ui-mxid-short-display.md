# 全 UI 账号显示去 homeserver 统一后缀

> 2026-10-23 用户裁定：所有 UI 的账号显示不要带 matrix.test 这种系统的统一后缀。

## 改动

- 新单一事实源 `custom/client/ui/mxid-display.ts`：`stripHomeserver`（id 槽位：
  `@alice:matrix.test` → `@alice`，agent 复合 id 保 `/slug` 尾段，域名校验为
  DNS 形态防误伤 URL）与 `shortMxName`（名字槽位：再去 `@`）。收编既有 4 处
  各自为政的短显实现（assignee-display.accountLocalpart / task-flow.shortName /
  SitDetailPanel.matrixShort / DeliveryCasesView.shortMatrixId 改为委托）。
- 显示层清扫（可见文本短形，悬停 title 保留全形）：
  - matrix-teams：TeamsManagePanel（账号树/agent team 行/未声明成员/leader
    chips）、DutyAssignPanel（值守人/操作人）、DispatchList（下拉/目标/签发人）。
  - matrix-chat 十一处名字兜底：SenderProfile（含 showMxid 槽位）、MemberList
    ×4 分支、MemberInfo（含复制按钮——显示短形、复制仍得全形）、StateEvent、
    ThreadPreview、ReplyChain、RoomSearch、PollHistory、TypingNotification、
    InviteDialog、MessageInput mention 补全。
  - ia2：AccountAdminView 建号/邀请结果、SearchView 人员行、OrchestrationView
    审批人、useSitCounts 在线树兜底。
  - IDE 简报：briefing-types `toMembers` 统一短化（RACI 四行显示）。
  - linkify mention 高亮：正文 `@wei:matrix.test` 显示 `@wei`（判定仍按全形
    归一比对，`mentionsMe` 语义不变）。
- 服务端仅改两处纯展示文本：raci-dispatch `buildDispatchText` 成员短化
  （邀请路由 raciInviteeIds 仍全形）；capability-catalog roster 行 name 列
  短化（id 保持全形机读）。

## 不改

- roster/org/invites 注册表 markdown 存量形态不动（roster 首列被
  capability-catalog 当记录 id 机读；org 表 admin 行守卫按原文比对，改存量
  会误触 409 会签拦截）。AccountAdminView 绑定表可编辑单元格显示随之不动。
- mention 路由目标、比对归一化逻辑、matrix 协议载荷一律保持全形。
- AccountAdminView「复制邀请文本」（登录凭据交付物）保留全形 userId——
  这是交付凭据非界面显示。
- MatrixReadReceiptGroup 头像 tooltip 保留全形（悬停见全形是既有设计）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | 短显做在显示层，不改存量数据形态 | 注册表是机器读写数据（capability-catalog id/org 守卫比对）；改存量有 409 会签误伤与 id 断链风险 | 改 roster 存量为短形（否决：机读面连锁风险） | 是 |
| 2 | 新建 ui/mxid-display 收编 4 处既有短显 | 单一事实源防口径漂移；ui/ 已是共享原语目录 | 各处继续内联（否决：又是 6+ 处重复实现） | 是 |
| 3 | 域名剥除须过 DNS 形态校验 | linkify/时间串等含冒号文本会被裸 split(':') 误伤 | 裸 split（否决：URL 显示被截） | 是 |
| 4 | 悬停 title 保留全形 | 排查反查需要完整 mxid；tooltip 不属「显示」噪音 | 彻底不显示全形（否决：反查断路） | 是 |
| 5 | linkify mention 显示短形、判定全形 | 正文给人看；mentionsMe 高亮语义必须仍认全形书写 | 判定也改短形（否决：历史消息全形书写漏判） | 是 |
| 6 | raci-dispatch 正文短化、路由全形 | 正文进聊天 UI 是最大单一后缀生产源；路由目标动全形即断 | 全不动（否决：聊天面治标不治本） | 是 |
