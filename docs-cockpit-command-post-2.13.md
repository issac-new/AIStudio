# SwarmStudio 2.13 指挥中心升级 —— 调研、差距分析与实施设计

日期：2026-09-05 ｜ 基线：SwarmStudio 2.12（hermes-studio v0.7.16 + hermes-agent v0.21.0 + element-web v1.12.27，overlay 167 patches）

## 一、调研结论（本机实际情况）

### 1. hermes-agent 并没有一等 "team" 实体

本机 `~/.hermes/profiles/aiteam-*`（orchestrator/scout/multimodal/embodied/training/architecture）形态上是"团队"，代码层面是三个原语组合出来的涌现结构：

- **Profiles**：每个 profile 一个独立 HERMES_HOME（config/SOUL.md/skills/state.db），`hermes_cli/profiles.py` 提供 create/list/use/describe；profile.yaml 的 role/description 是 decomposer 路由依据。
- **Kanban**：真正的任务队列引擎。网关内 dispatcher（`gateway/kanban_watchers.py`）对每张卡按 assignee profile 拉起 headless worker（`hermes -p <assignee> --cli chat -q "work kanban task <id>"`）；`kanban decompose` 用辅助 LLM 把根任务拆成任务图按 roster 分派；`kanban swarm` 提供规划者→并行专家→校验→综合的固定拓扑，黑板为根卡上的 `[swarm:blackboard]` 结构化评论。Board 即隔离队列（独立 DB/workspaces/dispatcher）。
- **Hosted rooms（Bot Mode 群聊）**：`gateway/hosted_rooms.py` + `tui_gateway/methods_groups.py`，多 bot 成员房间、跨网关 peer（`groups.peer.invite` 等），是原生的跨 agent/跨组织会话面。
- v0.21.0 相关新特性：profile 墓碑、新 profile 继承 model 块、看板 board 导出/导入、skills 目录瘦身（15 个转 optional，`session_platforms` 门控）等。

### 2. Skills 是原生体系，且 cockpit 完全没有暴露它

`~/.hermes/skills/<分类>/<名>/SKILL.md`（frontmatter + 条件门控），索引注入系统提示 + `skills_list/skill_view/skill_manage` 渐进加载，hub（install/browse/publish）、外部目录/项目级目录、per-profile 技能集。SwarmStudio 侧只有上游的 skills 开关页，cockpit 没有"给这个任务/团队配 skill"的操作面。

### 3. "AI协作中心" = overlay Cockpit，十处差距（E1–E10）

| # | 差距 | 证据 |
|---|---|---|
| E1 | 团队/任务态刷新 = 轮询 + 每 30s 每 board 一次 CLI 子进程（N+1） | cockpit.ts:545-569,1367；kanban-service.ts listTasks=execFile 30s |
| E2 | 无团队实体：tenant 字符串约定 + board + profile 拼凑，无团队 API/UI/RBAC | tenant-parser.ts；cockpit.ts taskGroups 仅 computed 分组 |
| E3 | 聊天单活跃会话，无多会话实时面；chat-run socket 单 profile 绑定 | chat.ts:1296-1310 activeSessionId；connectChatRun profile 切换即重连 |
| E4 | group-chat/workflow 路由被 071 删除但引用仍在 → 死链；40+ 端点的多 agent 群聊服务端无 UI 入口 | patch 071；PageSidebarNav.vue:52-59；GlobalPendingActions.vue:316-322 |
| E5 | 注意力分散四套机制（kanban 状态条/Matrix 未读/会话未读/审批 toast），无统一"需要我"收件箱 | attention-adapter、notifyItems"仅 Matrix 未读"注释 |
| E6 | Loop 引擎不能真执行（dispatch 吞错、persistence 占位符、审批端点回显） | subagent-dispatcher.ts:33-40；loop-engine.ts:192-203 |
| E7 | 终端非指挥面：100 PTY 全局上限、super_admin 限定、不包 hermes --tui | terminal.ts:22-24,102-107 |
| E8 | CollabBar"添加协作方/频道"是 console.log 占位 | CockpitCollabBar.vue:28-32 |
| E9 | 跨 board 聚合纯客户端；无全任务服务端聚合端点 | cockpit.ts:520-569 |
| E10 | cockpit 用户态全在 localStorage（草稿/模板/待办/布局），跨设备不可见 | cockpit-kv.ts |

**结论**：单会话视角 + 轮询拼装 + 无团队抽象 + 无统一待办，正是"当不了主指挥岗位、TUI/Claude Code 更主流"的根因。TUI 的优势恰是"多窗口同看 N 个 agent 实时输出、随手切换"；Claude Code 的优势是"命令就在手边"。

## 二、2.13 目标与非目标

**目标：让 cockpit 成为多团队 × 多任务并行的指挥岗位**

1. **A 舰队网格（Fleet Grid）**：一屏同看 N 个会话实时状态（跨 profile），点击秒切全量聊天，待审批可就地一键批/拒。（治 E3，部分 E5）
2. **B 看板服务端聚合**：`GET /api/hermes/kanban/overview` 一次拿全 board 任务（去重/缓存/共享 watcher 推送），客户端放弃 N+1 轮询。（治 E1/E9）
3. **C 团队注册表**：Team = {profiles, boards, pinnedSessions} 的具名集合 + CRUD + cockpit 团队切换器，切换即过滤看板/舰队/收件箱。（治 E2）
4. **D 统一注意力收件箱**：审批/澄清 > 阻塞 > 待审 > 待分类 > 会话未读 > Matrix 未读 > 提醒，统一排序、统一入口、深链跳转。（治 E5）
5. **E 群聊/工作流回航**：恢复 071 删除的路由，修复死链，跨团队 agent 群聊重新可用。（治 E4）

**非目标（记录在案，后续版本）**：E6 loop 真执行（需重设计 dispatcher→bridge 会话化）；E7 终端扩容与 TUI 包装；E10 cockpit 用户态全量服务端化（本版仅团队选择持久化到服务端 teams 存储 + localStorage 记忆）；skills 配置面（任务级 --skill 已存在，UI 化另立项）。

## 三、架构设计

### 3.1 服务端（overlay/custom/server，全部走 factory-DI，patch 注入依赖）

```
fleet-tap.ts          registerChatRunSocket(inst, {getSession, listSessions})
                      getFleetLiveSessions() → 读 inst.sessionMap（isWorking/queue/events 尾巴）
                      respondFleetApproval/Clarify → inst.bridge.approvalRespond/clarifyRespond
fleet-snapshot.ts     纯函数：merge(live, dbSessions) → FleetSession[]
fleet-events.ts       setupFleetWebSocket(servers, deps) → WS /api/hermes/fleet/events
                      1.5s tick 全量快照（按用户 profile 权限过滤，内容变化才发）
kanban-overview.ts    createKanbanOverview({listBoards, listTasks, watchEvents, kill})
                      board 级 10s 缓存 + in-flight 去重 + 每 board 一个共享 watcher（引用计数，闲置 5min 回收）
teams-store.ts        createTeamsStore(path?) → JSON 原子写 ~/.hermes-web-ui/overlay/teams.json
controllers/hermes/fleet.ts   createFleetRouter(deps)：
                      GET  /api/hermes/fleet/sessions
                      POST /api/hermes/fleet/approval   {session_id, approval_id, choice}
                      POST /api/hermes/fleet/clarify    {session_id, clarify_id, response}
                      GET  /api/hermes/kanban/overview
                      GET/POST /api/hermes/teams  ·  PUT/DELETE /api/hermes/teams/:id
```

**FleetSession**：`{id, profile, title, status: working|idle, isAborting, queueLength, runStartedAt, source, agent, lastPreview, lastTs, approvals: [{approval_id, preview, choices}], clarifies: [{clarify_id, question}]}`。审批/澄清从 `state.events`（最近 200 条，working 期间累积）提取。

**为什么是 tap 而不是客户端多开 socket**：chat-run socket 单 profile 绑定（query.profile + requireSocketSessionAccess 强校验），跨团队必须服务端聚合；sessionMap/events 本来就常驻内存，读快照零额外进程。

### 3.2 patch 清单（series 追加 195–200）

| # | 文件 | 内容 |
|---|---|---|
| 195 | server chat-run.ts | import + init()/close() 注册/注销 fleet tap（带 try/catch 保护） |
| 196 | server bootstrap/routes.ts | import createFleetRouter + 组装 + app.use（挂在受保护段，与 trace/loop 同排） |
| 197 | server bootstrap/http.ts | import + setupFleetWebSocket(servers, deps) 与 kanban WS 并排 |
| 198 | client router/index.ts | 恢复 /hermes/workflow、/hermes/group-chat(+/room/:roomId/+2 redirect) 路由 |
| 199/200 | client i18n zh/en | cockpit.fleet*/team*/inbox* 键 |

### 3.3 客户端（overlay/custom/client/cockpit）

- `adapters/fleet-adapter.ts`：类型 + `normalizeSnapshot`（纯）+ `openFleetEventsSocket`（token WS，仿 kanban events 客户端）。
- `adapters/teams-adapter.ts`：REST CRUD。
- `adapters/inbox-adapter.ts`：纯函数 `buildInboxItems(sources, {teamProfiles, teamBoards})` —— 权重 approval=0 / blocked=1 / clarify=2 / review=3 / triage=4 / chat=5 / matrix=6 / reminder=7，同级按 ts 降序。
- `components/CockpitFleetGrid.vue`：右栏新模式 `fleet`（ModeBar 增加）；卡片 = 状态点 + profile 徽标 + 标题 + 时长 + 尾部预览（等宽滚动）+ 队列/审批徽标 + 一键批准/拒绝；点击 → `hermes.session`（带 profile query，ChatView 已支持自动切 profile）；顶部过滤（团队/只看运行中/搜索）。
- `components/CockpitTeamSwitcher.vue`：TopBar 下拉 + 管理弹窗（名称/颜色/profiles/boards）。
- store 接线：fleetSessions/fleetConnected + init 时连 WS；teams/activeTeamId（cockpit-kv 记忆 + 服务端持久）；filteredTasks 与 fleet 与 notifyItems 套团队过滤；`WorkspaceMode` 增加 `'fleet'`。
- NotifyModal 升级为统一收件箱：渲染 task/approval/chat/group/matrix/reminder 全类型（图标+计数+深链）。

### 3.4 权限与安全

- WS 与 REST 均复用全局鉴权（挂受保护段 / token query + authenticateUserToken）；非 super_admin 用 userCanAccessProfile 过滤 profile 可见性与审批操作目标。
- 审批/澄清操作校验 session 所属 profile 权限后才调 bridge。
- teams 为全局配置（super_admin 写，全员读）——与当前 dispatch super_admin 门禁一致。

## 四、回归与发版

1. `npm run inject` 全量 173 patches 通过；`packages/server` tsc --noEmit 0 错。
2. `npm run build:full`（vite 真实构建门禁）。
3. overlay vitest：基线（2.12 实测值）+ 新增 5 个测试文件全绿。
4. upstream patch 触碰文件相关测试（kanban/auth 套件）抽查。
5. 版本 `0.7.16-overlay-2.13`，分支 `feat/cockpit-command-post-2.13` → `--no-ff` 合入 main；构建 arm64.dmg + win x64.zip，gh release v2.13，本机 ditto 换装 + quarantine 清理。
