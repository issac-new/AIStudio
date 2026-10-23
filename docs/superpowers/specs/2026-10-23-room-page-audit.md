# 房间页全面排查与修复（五轮 F）

- 日期：2026-10-23
- 版本：v1（分支 fix/room-page-audit）
- 需求：用户报「此页（#/app/s/room/!VftwuUpowKwtayvCxd:matrix.test）的功能实现的有问题，全面排查下」。

## 排查结论（活体逐面取证）

| 面 | 结果 |
|---|---|
| 控制台错误 | 零 |
| 时间线渲染（日期分组/系统事件折叠 9 条展开/未读标记「新消息」） | 正常 |
| 自发消息无头像/发送者 | 设计如此（data-self 布局） |
| 消息发送（Enter 投房+清空） | 正常 |
| @补全（成员+本机身份「身份」标签） | 正常 |
| @身份 relay（@worker-coder → [worker-coder] 回复回房） | 正常（实测「房间链路通」） |
| 「时间线 ↗」 | 有真实响应（开运行轨迹弹窗） |
| **「＋邀请」** | **缺陷：假按钮**——一律跳历史会话页（2026-10-21 收口权宜），房间语境名不副实 |
| **消息 data-event-id** | **缺陷：绑成 "[object Object]"**（模板绑未解包 ComputedRef；脚本已解 eventId 未用于模板）——影响按事件 id 的定位/高亮选择器 |

## 修复

1. `onCanvasInvite` 分流：room 类型弹 `MatrixInviteDialog`（自取 activeRoomId）；chat/group 维持跳历史页（会话详情归属不变）。
2. `MatrixMessageItem` 模板 `:data-event-id` 改绑已解包的 `eventId`。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | room 邀请弹 MatrixInviteDialog 而非跳页 | 「＋邀请」在房间语境=邀请进房；跳历史页是收口期权宜（假按钮，用户实报） | 全类型弹邀请（否决：chat/group 无房间语义） | 是 |
| 2 | data-event-id 绑解包后的 eventId | 原 tileState.eventId 是 ComputedRef，模板字符串化 [object Object]；脚本已有解包值 | 留 [object Object]（否决：按 id 选择器/高亮定位失效） | 是 |

## 验证

- workbench-flow 新增邀请分流用例（room 弹框+路由不动）= 29/29 绿；ia2 目录全量回归绿后合入。
- 浏览器复验：邀请弹层打开、data-event-id 为真实事件 id。

## 五轮 G 补录（同日，main 待推）

用户三连问：▾ 下拉为何还在（不需要了）／「智能体」区块指什么（看起来像 channel 和工具）／排序三图标与「循环」过滤的含义。

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 3 | ▾ 特殊形态菜单与建房内联输入整体退役——「＋新建聊天」为唯一入口（直达统一聊天窗口） | 用户裁定：聊天已统一（@ 即路由），旧三分型（agent 单聊/群聊/建房）是统一前的范式残留；群聊/房间仍可经各自列表与对话内操作触达 | 保留 ▾（否决：用户明示不需要） | 是 |
| 4 | 「智能体」区块更名「通道」（词条走 patch 473 groupAgents，zh/en 双语同步；树上已注入态手工同步——ensure-injected 对同 patch 内容变化盲） | 用户识破：zcode/api_server/feishu/matrix/webhook/weixin 是网关平台通道（channel）与引擎，非智能体——R7-C agent 名册命名名不副实 | 保留「智能体」（否决：误导） | 是 |
| 5 | 排序档 🕐🔴🔤 图标改文字「活跃/未读/名称」 | 用户实报看不懂三图标（title 补偿通道无效——纯图标不可读） | 图标+文字并列（否决：栏宽紧张，文字自明） | 是 |
| 6 | 过滤器挂 title 说明：循环=看板自动化循环任务（loop）观测行（非聊天）；会话=聊天会话与房间 | 用户问「循环筛选哪些协作流」——概念不透明，hover 说明最小成本 | 删循环过滤器（否决：循环观测是 V5 M6 交付面，保留入口） | 是 |

- 组件死状态清理（createOpen/newMenuOpen/createName/submitCreateRoom/三 emit）；workbench-flow 两用例改 G 语义（29/29）；ia2 目录 748/748。
