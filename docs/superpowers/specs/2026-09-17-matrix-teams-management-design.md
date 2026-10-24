# Matrix Teams 与 Hermes Agent Teams 分布式管理设计

日期：2026-09-17
状态：设计经用户确认（5 项裁决 + 整体设计通过），待实施
受众：在 overlay/ 实现本功能的开发者；阅读前应熟悉 overlay README 的 A/B 类改造分类

## 0. 三句话主旨

Teams 管理数据（账号层级、值守关系、leader 名单、任务指派）全部以 Matrix 房间自定义事件为单一事实源，经 homeserver 天然同步到全部成员节点。leader 在 SwarmStudio Loop Graph「管理」场景维护以 Matrix 账号为单位的成员树（账号下挂其 hermes agent teams，即本机 profile 编组），对群聊做值守责任指派、对任务做执行指派。指派的任务经 Matrix 投递到成员节点后落在成员本机 kanban，由现有 dispatcher 执行并回执，实现分布式集群的真实分工。

## 1. 目标与非目标

目标：
1. Team Registry Room（团队注册房间）：创建、邀请、加入、发现，全部管理数据存房间事件。
2. 账号树管理：Matrix 账号 → agent teams（profile 编组）层级，成员自声明、leader 可调整。
3. 群聊值守指派：房间 → 账号或 agent team 的责任划分，成员侧 UI 有值守标记。
4. 任务指派：leader 发投递单 → 成员节点本机 kanban 建卡执行 → 状态回执 → leader 侧外派视图聚合。
5. 权限：leader（房间 moderator）才能写 leaders/duty/发投递单，靠 Matrix power level 硬约束。

非目标：
- agent 对值守群聊的自动应答（P4 演进，可复用 loop engine 的服务端 matrix-bot 常驻通道）。
- 多 Matrix 账号同时登录（成员侧单账号登录自己账号即可满足）。
- E2EE、联邦、跨 homeserver（事件协议不依赖这些，但不在验证范围）。
- 改动 custom/server（MVP 纯 A 类 + i18n B 类 patch）。

## 2. 现状锚点（调研结论）

| 事实 | 锚点 |
|---|---|
| Matrix 群聊 UI 完整（房间列表/建房/加入/退出），单账号体系 | `overlay/custom/client/matrix-chat/`（6 store + 49 组件）；单例 client 见 `stores/matrix-client.ts:22-168` |
| 渲染进程 MatrixClient 已监听 Sync/SessionLoggedOut/Timeline/MyMembership | `overlay/custom/client/matrix-chat/stores/matrix-client.ts:135-140`（invite 自动 joinRoom 先例） |
| kanban assignee 取值 = hermes profile 名（小写规范化） | `upstream/hermes-agent/hermes_cli/kanban_db.py:1086-1092`；`packages/client/src/api/hermes/kanban.ts:472`（assignTask） |
| profile = `~/.hermes[/profiles/<name>]` 目录，client 侧有 profiles store 与列表 | `upstream/hermes-studio/packages/server/src/modules/hermes/services/profiles/profile.ts:8-35`；`packages/client/src/stores/hermes/profiles.ts:8` |
| Loop Graph 管理场景已有 SwarmKanban 内嵌 + 人员聚合条 | `overlay/custom/client/ia2/views/scenes/ManageScene.vue:22,83-85` |
| cockpit-kv 本地 KV 先例（防重存储可复用其模式） | `overlay/custom/client/cockpit/store/cockpit-kv.ts` |
| i18n 新键 = zh/en 成对 B 类 patch 进上游 locale | 先例 patch 247/248、283/284；`overlay/README.md:151` |
| 验证环境可用：本机 Synapse（matrix.test）+ 3 成员账号 + 各自独立 HERMES_HOME 集群 | `docs/superpowers/specs/2026-09-17-multiuser-matrix-collab-sim-design.md` §2 |

## 3. 关键决策记录（用户裁决）

| # | 分叉 | 裁决 |
|---|---|---|
| 1 | 分布式形态 | Matrix 账号为骨干，复用 homeserver 做同步通道 |
| 2 | 指派落地 | Kanban 任务 + Matrix 通知 |
| 3 | 群聊指派语义 | 值守责任划分（归属标记 + 通知路由，不做可见性 ACL） |
| 4 | 界面位置 | Loop Graph「管理」场景扩展 |
| 5 | 存储与同步 | **Matrix 房间 state 同步**（真分布式单一事实源，放弃本地 JSON / SQLite 方案） |
| 6 | 整体设计 | 通过（含 MVP 纯 A 类 + 三阶段交付） |

## 4. 概念模型与事件协议（单一事实源）

### 4.1 实体

- **成员（MatrixAccount）**：一个 Matrix user id，如 `@alice:matrix.test`。
- **AgentTeam**：某账号名下的 hermes agent 编组 = 本机 profile 名集合 + 默认 profile。全局唯一 id = `<ownerUserId>/<teamSlug>`（ownerUserId 为完整 matrix id，teamSlug 小写 slug）。
- **leader**：记录于 leaders 事件的账号，同时必须是注册房间 moderator（PL≥50）。
- **值守（duty）**：某 Matrix 房间 → 账号或 AgentTeam 的响应责任。
- **外派任务（dispatch）**：leader 发起、成员节点本机 kanban 执行的任务，以全局 taskId 贯穿投递与回执。

### 4.2 事件定义（Team Registry Room 内）

全部事件类型常量、content schema、解析器收敛在 `overlay/custom/client/matrix-teams/protocol.ts` 一个文件，读写两端只准引用该文件常量（守门测试 grep 断言，见 §8）。

| 事件类型 | kind | state_key | content schema |
|---|---|---|---|
| `com.swarmstudio.team.account` | state | 成员 user id | `{ displayName: string; agentTeams: Array<{ slug: string; name: string; profiles: string[]; defaultProfile?: string }>; updatedAt: number }` |
| `com.swarmstudio.team.leaders` | state | `""` | `{ leaders: string[] }` |
| `com.swarmstudio.team.duty` | state | 被值守房间 id | `{ assigneeKind: "account" \| "agentTeam"; assigneeId: string; roomName?: string; updatedBy: string; updatedAt: number }` |
| `com.swarmstudio.task.assign` | message | — | `{ taskId: string(uuid); title: string; body?: string; priority?: string; dueAt?: number; target: { account: string; agentTeam?: string(slug); profile?: string }; issuedBy: string; issuedAt: number }` |
| `com.swarmstudio.task.receipt` | message | — | `{ taskId: string; status: "created" \| "running" \| "done" \| "failed"; localTaskId?: string; reason?: string; reportedBy: string; reportedAt: number }` |

约束：
- account 事件语义上只能写自己的 state_key；PL 只能限制「谁能写这个 type」，按 key 归属的校验在应用层做（读端忽略 `sender !== state_key` 的 account 事件，写端 UI 禁止编辑他人条目）。这一限制是 Matrix 权限模型的边界，如实记录。
- receipt 的 PL 为 0（成员发），assign/leaders/duty 的 PL 为 50（leader 发），account 的 PL 为 0（成员自声明）。
- 同 taskId 的 receipt 以最新 reportedAt 为准（幂等覆盖）。

### 4.3 注册房间的发现

- account data `com.swarmstudio.registry`，content `{ roomId: string }`。创建房间或首次将已有房间设定为注册房间时写入。
- 收到加入邀请的房间若已含任一 `com.swarmstudio.team.*` state 事件，Teams 面板提示「设为团队注册房间」，确认后写 account data。
- 兜底：若 account data 丢失，Teams 面板列出含 team.* 事件的已加入房间供重新选定。

## 5. 架构与组件

新增 overlay 纯 A 类模块 `overlay/custom/client/matrix-teams/`：

```
matrix-teams/
  protocol.ts                  # 事件类型常量 + content schema + 解析器（含容错：非法 content 返回 null）
  stores/team-registry.ts      # 注册房间发现；state 全量投影（accounts/leaders/duties 三表）+ Sync 增量维护
  stores/task-dispatch.ts      # 指派发送；外派视图（assign∪receipt 聚合）；成员侧接收落地 + 防重 + 回执上报
  views/TeamsManagePanel.vue   # 账号树 + 上下文面板（agent teams 编辑 / 值守列表 / 外派列表）
  components/...               # AccountTreeNode / AgentTeamEditor / DutyAssignPanel / DispatchList 等
  __tests__/                   # 见 §8
```

复用：
- `matrix-chat/stores/matrix-client.ts` 的 MatrixClient 单例与 Sync 事件总线（team-registry store 自己对 `client` 挂 `RoomEvent.Timeline` 监听，多监听者与现有 `:124-133` 共存，互不覆盖——注意 `matrixEventBus` 是单槽 ref，不可占用）。`matrix-client.ts` 零改动：invite 自动 joinRoom（`:135-140`）保持既有行为。技术约束：Matrix 邀请态房间只有 stripped state（m.room.member 等少数类型），自定义 `team.*` 事件在加入前不可见，故「邀请白名单」不可实现；注册房间的发现依赖加入后的房间检测（§4.3 兜底：列出含 team.* 事件的已加入房间）。
- `matrix-chat/stores/matrix-room.ts` 的 createRoom/joinRoom 与房间列表（建房时传 preset 与 power_level_content_override）。
- kanban API `api/hermes/kanban.ts`（建卡 assignTask；成员侧落地即调它）。
- `stores/hermes/profiles.ts`（agent teams 编辑器的 profile 候选来源）。
- cockpit-kv 存储模式（taskId → localTaskId 防重映射）。

改动点：
- `overlay/custom/client/ia2/views/scenes/ManageScene.vue`：顶部加二级 tab「任务与值守」（现有内容）|「Teams 管理」（TeamsManagePanel）。现有布局与人员聚合条不动。
- B 类 patch 仅 i18n：zh/en 成对（编号开工时查重顺延），新增键约 40 个，命名空间 `teams.*`。
- `custom/server/` 零改动。

## 6. 关键数据流

### 6.1 建立

leader 在 Teams 面板一键创建注册房间（`preset: private_chat`，`power_level_content_override.events` 按 §4.2 配置各事件类型 PL）→ 房间 id 写 account data → 邀请成员 → 成员经既有 invite 自动 joinRoom 行为加入 → 各成员在 Teams 面板声明自己的 agent teams（从本机 profiles 多选）→ 写 account state → 全员账号树实时更新。

### 6.2 指派任务

leader 选目标（账号 → 可细化 agent team → 可精确 profile）→ task-dispatch store 生成 uuid taskId，发 `task.assign` 消息到注册房间 → 成员节点 Sync 收到且 `target.account === 本机登录账号` → 解析落地 profile（显式 profile > team.defaultProfile > team.profiles[0]）→ 查 kv 防重 → 调 kanban API 本机建卡（assignee=该 profile，title 前缀 `[外派-<taskId 前 6 位>]`）→ kv 记 taskId→localTaskId → 发 `created` 回执。落地失败（profile 在本机不存在 / kanban 报错）发 `failed` 回执带 reason，不静默丢弃。此后成员侧轮询（30s 节流，复用 workspace 聚合的轮询模式）比对外派任务状态变化，发送 `running/done/failed` 回执。leader 侧外派列表 = assign 消息 ∪ 最新 receipt 状态，纯聚合渲染，**不做本地 kanban 镜像**（单一事实源在 Matrix）。

### 6.3 值守群聊

leader 在值守面板选房间（来自自己已加入房间列表）→ 指派给账号或 AgentTeam → 写 `team.duty` state（state_key=房间 id）→ 全员同步 → 成员侧 matrix-chat 房间列表对「本账号 / 本账号某 AgentTeam」值守的房间显示值守徽标；cockpit 值班台聚合值守清单。调整 = 覆盖写同一 state_key（last-write-wins，homeserver 定序），UI 显示 updatedBy 供追溯。

## 7. 权限与安全

- 硬约束（homeserver 强制）：`leaders`/`duty` state 与 `task.assign` 消息 PL=50；建房时写入 power_levels，后期调整走标准 Matrix PL 管理。
- 应用层校验：UI 操作入口按「当前账号 ∈ leaders 事件」显隐；读端忽略 `sender !== state_key` 的 account 事件。
- 凭据零新增：全部写操作经渲染进程已登录 MatrixClient（leader 或成员自己的账号），不引入服务端存储凭据。
- 注册房间是私密房间，成员由 leader 邀请加入；不使用公开房间。

## 8. 测试策略

| 层 | 文件 | 覆盖 |
|---|---|---|
| 协议 | `matrix-teams/__tests__/protocol.test.ts` | schema 合法/非法 content、解析容错返回 null、agentTeam id 构造 |
| 协议守门 | 同上 + grep 断言 | 全模块内不得内联事件类型字符串（必须引用 protocol.ts 常量），防读写两端漂移 |
| 注册 store | `__tests__/team-registry-store.test.ts` | mock MatrixClient：全量投影、增量更新、sender≠state_key 丢弃、发现/兜底逻辑 |
| 投递 store | `__tests__/task-dispatch-store.test.ts` | 指派发送、目标解析三级回退、kv 防重、receipt 幂等、failed 回执路径 |
| UI 守门 | `ia2/__tests__/manage-scene.test.ts` 扩展 + `__tests__/teams-panel.test.ts` | ManageScene 二级 tab 存在性、TeamsManagePanel 挂载、leader/成员视角显隐 |
| i18n | 上游 `tests/client/i18n-coverage.test.ts`（既有门禁） | 新键 zh/en 对称 |

收口门禁沿用仓库既有口径：`npm test` 全绿 + `npm run clean && npm run inject` 重放验证 + `npm run build:full`。

## 9. 阶段切分与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| P1 管理面 | protocol.ts + team-registry store + 注册房间建立/加入/发现 + 账号树 UI + account/leaders 事件 | 双浏览器（或 ncwk-sim 双成员）实测：leader 建房邀请、成员声明 agent teams、账号树两侧一致 |
| P2 值守 | duty 事件 + 值守面板 + 成员侧房间列表徽标 + 值班台聚合 | leader 指派 → 成员侧徽标出现；调整 → 徽标迁移 |
| P3 任务指派 | assign/receipt 消息 + 外派视图 + 成员侧落地 kanban + 回执上报 | leader 指派 → 成员本机 kanban 出卡（assignee 正确）→ dispatcher 执行 → leader 外派列表状态流转 done |
| P4（后续，不在本次范围） | agent 自动值守应答、集群在线状态 | — |

P1-P3 每阶段独立可交付，各自走 feat 分支 → 合 overlay main 流程。功能级验证优先用 ncwk-sim 环境（本机 Synapse 多成员），避免影响真实 homeserver。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| Synapse 对自定义事件 content 有大小/字段校验差异 | agent teams 数量与 profiles 数在 UI 限幅（每账号 ≤20 teams、每 team ≤20 profiles）；协议测试覆盖边界 |
| 成员侧 SwarmStudio 未在线时 assign 消息迟到 | Sync 全量补拉天然恢复；kv 防重保证幂等 |
| 外派任务在成员本机被手工改 assignee | receipt 仍按 taskId 上报实际状态，leader 侧如实展示，不做强一致 |
| state event 65KB 上限 | 单账号数据量级远低于上限；UI 限幅兜底 |
| 成员侧轮询回执延迟 | 30s 节流 + 状态变化即时触发（workspace 聚合回调），延迟可接受；P4 可演进事件推送 |
| 与 ncwk-sim harness 的端口/数据根冲突 | 功能验证只用 sim 的 Synapse 与账号，不起 sim 的 Studio 栈（本功能在开发者本机 dev 模式跑） |
