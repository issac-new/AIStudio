# routa 源码测绘：分布式多 agent 协作与人机协作机制

2026-09-21，基于 `upstream/routa`（phodal/routa）@ e48861a（2026-08-14，v0.19.0，MIT）。定位语：「Workspace-first multi-agent coordination platform for software delivery」（`upstream/routa/README.md:23`）——目标、任务、会话、trace、证据、评审状态全部落在看板上，而不是埋进单条聊天线程。本文所有锚点为 `upstream/routa/` 仓库相对路径 file:line。

与 SwarmStudio 的相关性判定：routa 是本次调研中与「驾驶舱 = 分布式 agent + 人机协作」命题**重合度最高**的上游——它本身就是「会话 ↔ 任务看板 ↔ workspace ↔ 多 agent」四元组的完整实现，且比我们多走了一步：看板即协调总线、执行可跨实例分布。

## 一、仓库概览与技术栈（目录地图）

技术栈：TypeScript 5.9 + Next.js 16（Web/自托管）+ Tauri 桌面壳 + Rust Axum 双后端，双后端语义对齐由单一契约 `api-contract.yaml`（7416 行，paths 自 :1008 起）约束（`README.md:47-52`、`docs/ARCHITECTURE.md` Runtime Topology 节）。集成面六个：REST、SSE、MCP、ACP、A2A、AG-UI（`README.md:52`）。

| 目录 | 职责 |
|---|---|
| `src/app/` | Next.js 页面 + API 路由；`api/` 下 40+ 资源域（agents/tasks/kanban/sessions/shared-sessions/a2a/acp/mcp/workflows…） |
| `src/core/` | TS 域服务：`orchestration/`（委派引擎）、`kanban/`（36 文件，看板自动化全家桶）、`tools/`（agent/kanban/note 工具集）、`acp/`（45 文件，进程/适配器/runner 路由）、`a2a/`、`shared-session/`、`worker/`、`events/`、`review/`、`scheduling/` |
| `src/client/` | React 组件（约 150 个 .tsx，含 chat-panel、desktop-* 壳族、notification-center、collaborative-task-editor） |
| `crates/routa-core/` | Rust 域基座：`store/` 12 个 store（agent/task/kanban/conversation/acp_session…）、`orchestration/mod.rs`（TS 编排器的 Rust 移植，`mod.rs:1-9` 明示对应关系） |
| `crates/routa-server/` | Axum HTTP API，`src/api/` 下 57 个路由文件，与 Next.js 路由一一对应 |
| `resources/specialists/` | 全部专家提示词资产：`core/`（routa/crafter/gate/developer 4 角色）、`workflows/kanban/`（11 个泳道专家）、`team/`（9 个团队角色）、`review/`（8 个评审专家） |
| `crates/entrix` `crates/harness-monitor` | 交付门禁双层：fitness 硬门 + 运行观测（`README.md:54-61` Review Gate 三段式） |

## 二、多 agent 协作模型

**角色与名册。** AgentRole 枚举 ROUTA/CRAFTER/GATE/DEVELOPER（`src/core/tools/agent-tools.ts:26-31` 引用 models/agent）；核心角色提示词在 `resources/specialists/core/routa.yaml:1-8`（协调者 role_reminder 明示「永不直接改文件」）、`gate.yaml`、`crafter.yaml`。另有团队名册：`resources/specialists/team/` 9 个角色（researcher/frontend/backend/qa/ux/code-reviewer/operations/general-engineer + agent-lead 领队）。运行时给 team 系 agent 分配人类名（Alex/Sam/Lee…）做 displayLabel，且同角色内去重（`src/core/orchestration/orchestrator.ts:129-139` TEAM_RUNTIME_LABELS、`:181-220` buildTeamRuntimeMetadata）；task 文本关键词可推断名册角色（`:141-179` inferRosterRoleId）。

**委派引擎（核心）。** `RoutaOrchestrator.delegateTaskWithSpawn`（`src/core/orchestration/orchestrator.ts:494-810`）一次委派做十件事：深度检查 → 解析 specialist → 建子 agent 记录（含 delegationDepth 元数据）→ 注入父会话 trace digest（`:590-612`）与历史学习 playbook（`:614-630`）→ 组装委派提示词 → 任务绑定 assignedTo+IN_PROGRESS（`:654-659`）→ spawn 真实 ACP 进程（`:815-1039`，按 provider 分派 claude/claude-code-sdk/opencode/docker/workspace-agent 五种）→ 子会话注册进 UI 侧栏（`:701-716`）→ after_all 分组登记 → 发 TASK_ASSIGNED 事件 → 双侧写 agent memory 文件。

**护栏（并发与递归）。** 委派深度硬上限 MAX_DELEGATION_DEPTH=2，存于 agent.metadata.delegationDepth，超限直接拒绝并提示「自己完成」（`src/core/orchestration/delegation-depth.ts:21`、`:74-93`）。看板侧每 board 会话并发闸默认 1，存 workspace metadata 键 `kanbanSessionConcurrencyLimit:<boardId>`（`src/core/kanban/board-session-limits.ts:1-30`）；超限进 `KanbanSessionQueue` 排队，agent 生命周期事件（COMPLETED/REPORT_SUBMITTED/FAILED/TIMEOUT）触发 drain，且入队/运行双侧均按 taskStore 实情 reconcile 防僵尸（`src/core/kanban/kanban-session-queue.ts:54-69`、`:78-111`、`:251-294`）。非 dev 泳道自动化重复上限 3 次防死循环（`workflow-orchestrator.ts:96-131`）。

**互通信三通道。** ① 直接消息 `messageAgent`（向目标 agent 会话追加 user 消息 + MESSAGE_SENT 事件，`agent-tools.ts:461-495`）；② 任务寻址消息 `sendMessageToTaskAgent`（`:637-658`）；③ 事件总线订阅 `subscribeToEvents`，支持 oneShot / priority / waitGroupId / excludeSelf 四选项（`agent-tools.ts:727-776`；总线实现 `src/core/events/event-bus.ts:82-306`，事件类型 20 种枚举于 `:11-45`，含 PERMISSION_REQUESTED/SHUTDOWN_REQUESTED 等人机/agent 间事件）。产物协作走 artifact 协议：`requestArtifact`/`provideArtifact`（截图/测试结果/代码 diff，`:1050-1177`）。

**结果回收与唤醒。** 子 agent 调 `reportToParent`（`agent-tools.ts:499-555`：任务置 COMPLETED/NEEDS_FIX、报告作为消息投递父会话、发 REPORT_SUBMITTED）。编排器兜底三条退路：ACP 流结束 2 秒后未报告则 auto-report（`orchestrator.ts:1045-1080`）；Claude Code 写 `.report_to_parent_*.json` 文件的文件 watcher 兜底（`:1110-1191`）；session end 信号兜底（`:1208-1227`、`:421-431` 延迟 500ms 收口）。完成后 `wakeParent` 把完成报告作为新 prompt 发给父会话续跑（`:1330-1409`）；after_all 模式等整组完成一次性唤醒并附全员战报（`:1298-1325`）。错误路径：子 agent 失败 → 任务 NEEDS_FIX + AGENT_ERROR 事件 + 唤醒父（`:1490-1520`）。

**优雅停机协议。** coordinator 可 `requestShutdown` 广播全体活跃子 agent（`agent-tools.ts:1563-1592`），子 agent `acknowledgeShutdown` 带摘要收口（`:1596-1627`）。

## 三、人机协作面

**计划审批内建于角色契约。** ROUTA 协调者硬规则第 5 条：先出 spec、STOP、等用户批准才允许委派（`resources/specialists/core/routa.yaml:18-24`，wave 制：委派一波→结束回合→等完成→再派 GATE 验证）。

**三层审批机制。**
1. **ACP 协议级工具审批**：agent 进程的 `session/request_permission` 请求被包装成会话内 `request-permissions` 消息（`src/core/acp/acp-process.ts:457`、`:703-761`），前端 `PermissionRequestBubble` 让人按选项裁决（`src/client/components/message-bubble.tsx:33-51`、`:135-139`）。
2. **agent→coordinator 权限升级协议**：`requestPermission`/`respondToPermission`/`listPendingPermissions`（`agent-tools.ts:1421-1559`），内存 `PermissionStore`（`src/core/tools/permission-store.ts:34-78`）带 urgency 三档；批准可附带沙箱约束并实时改写 sandbox 策略（`agent-tools.ts:1497-1507` applySandboxPermissionConstraints）。
3. **看板流转人审门**：列自动化可声明 `requiredHumanApproval`（任务文本中须出现 APPROVED 裁决才放行）、`requiredChecklist`（勾选清单核验）、`validatorCommand`（验证证据须含指定命令），门模式 blocking|warning（`src/core/models/kanban.ts:109-127`；判定逻辑 `src/core/kanban/transition-gates.ts`，issue 类型枚举见 :5-7）。

**会话级人工介入。** 人可随时向运行中会话发 prompt 续话/纠正（session-page-client 复用 `acpPrompt`，`src/app/workspace/[workspaceId]/sessions/[sessionId]/session-page-client.tsx:206`）；`session/cancel` 中断（`src/client/acp-client.ts:590-592`）；会话断线重连后待发 prompt 自动重投（`session-page-client.tsx:1167`）。看板卡详情页给人完整的介入动作面：改任务字段、重试触发、跑 PR、换 provider、换仓库、把 JIT 上下文装回会话（`src/app/workspace/[workspaceId]/kanban/kanban-card-detail.tsx:58-68` 一组 on* 回调）。

**多人共享会话（分布式人机协作的最直接形态）。** `shared-session` 域：host 把自己的 agent 会话以邀请 token 分享出去，角色 host|collaborator|viewer × 模式 view_only|comment_only|prompt_with_approval|prompt_direct 四档（`src/core/shared-session/types.ts:1-11`）；协作者 prompt 在 approval 模式下先生成 SharedPromptApproval，host 批准后由 dispatcher 注入宿主会话（`types.ts:48-58`；API 全套 `/api/shared-sessions/*` 含 join/leave/participants/messages/prompts/approvals/stream，`api-contract.yaml:2507-3085`）。

**人与 agent 同权共写。** 笔记层用 Yjs CRDT，人和多个 agent 并发编辑同一 note 自动合并（`src/core/notes/crdt-document-manager.ts:1-13` 设计注释）；任务卡有 comments 日志（`src/core/models/task.ts:170-177` TaskCommentEntry 带 agentId/sessionId 来源）。

## 四、任务/看板模型

**任务即证据累积对象。** Task 字段面（`src/core/models/task.ts:835-899`）：除常规 title/objective/scope/acceptanceCriteria 外，协作相关字段是——`assignedTo`（agentId）+ `assignedProvider/Role/SpecialistId`（分派三元组）+ `fallbackAgentChain`（失败自动换替补 agent，`:857-862`）+ `triggerSessionId` 与 `sessionIds[]`（会话桥接）+ `laneSessions[]`（每泳道会话履历，`:122-152`，含 provider/role/specialist/transport/恢复原因）+ `laneHandoffs[]`（相邻泳道交接请求，`:154-168`）+ `worktreeId`（进 dev 列自动建 worktree）+ `deliverySnapshot`（进 review/done 前冻结 base..HEAD 证据，`:189-201`）+ `jitContextSnapshot`（JIT 检索上下文）+ `completionSummary`/`verificationVerdict`/`verificationReport`（结果与裁决）。状态机七态：PENDING/IN_PROGRESS/REVIEW_REQUIRED/COMPLETED/NEEDS_FIX/BLOCKED/CANCELLED（`:11-19`）。

**看板即协调总线。** Board→Columns→每列 `KanbanColumnAutomation`（`src/core/models/kanban.ts:92-127`）：有序 steps（每步可独立 transport acp|a2a、providerId、role、specialistId，`:39-54`）、触发时机 entry|exit|both、契约门（contractRules/交付门 deliveryRules/产物门 requiredArtifacts/字段门 requiredTaskFields）、`autoAdvanceOnSuccess`。默认五列各配专职 specialist：backlog→Backlog Refiner、todo→Todo Orchestrator、dev→Dev Crafter、review→QA Frontend + Review Guard 双步、done→Done Reporter，且内置 legacy specialist 迁移逻辑（`src/core/kanban/boards.ts:16-107`）。卡移动即发 COLUMN_TRANSITION 事件（`src/core/kanban/column-transition.ts:26-38`），`KanbanWorkflowOrchestrator` 监听并触发列 agent，dev 列有 watchdog（30 秒扫描，`workflow-orchestrator.ts:28`）+ 监督模式 watchdog_retry|ralph_loop + 有界恢复（maxRecoveryAttempts）。

**流转即校验。** PATCH `/api/tasks/[taskId]` 在服务端强制执行：columnId 与 status 必须描述同一工作流状态（`src/app/api/tasks/[taskId]/route.ts:345-352`）、契约门（`:291-312`，失败计数进 note 且触发 loopBreaker）、review 列收敛（`src/core/kanban/review-lane-convergence.ts`）。卡 drift 校正：review 列被外部改动自动回落 dev（`route.ts:243-248`、`:389`）。

## 五、分布式形态

**双后端 parity（不是多机分布式，是双运行时）。** Next.js（web/自托管，Postgres/SQLite 经 drizzle）与 Rust Axum（Tauri 桌面内嵌，SQLite 本地优先）共享 `api-contract.yaml`；Rust 侧把编排器、event bus、store 全套移植（`crates/routa-core/src/orchestration/mod.rs:1-9`、`store/` 12 个 store）。

**执行与控制的分离（真正的分布式核心）。** ACP 会话有 executionMode `embedded|runner` 与所有权三元组 `ownerInstanceId + leaseExpiresAt`（`src/core/acp/execution-backend.ts:1-9`、`:54-61` buildExecutionBinding，租约默认 300 秒、环境变量可调 `:21-29`）。配置 `ROUTA_ACP_RUNNER_URL` 后 CLI 系 provider 全部跑在独立 runner 进程/机器上（`:46-48` shouldUseRunnerForProvider）；Next 主实例对 runner 拥有的会话做**透明反向代理**，用 `x-routa-acp-forwarded` 头防转发环（`src/core/acp/runner-routing.ts:6-9`、`:17-38`）。重启恢复时只接管本实例持租约的会话，别实例的会话不抢（`src/core/kanban/restart-recovery.ts:44-60`）。会话连续性四态 active|interrupted|restorable|stale 供 UI 展示（`src/app/api/sessions/route.ts:17-46`）。

**Worker 抽象层。** Worker 接口统一 local|docker|remote 三种执行环境，capabilities 标签做约束路由，健康状态机 REGISTERED→HEALTHY→SUSPECT→UNHEALTHY→DEAD 按心跳推进（`src/core/worker/types.ts:17-38`、`:63-90`；实现 local-worker.ts / docker-worker.ts / registry.ts）。

**跨系统协议。** A2A v0.3：出站客户端按 Agent Card 发现远端 agent、JSON-RPC SendMessage + 轮询 GetTask（`src/core/a2a/a2a-outbound-client.ts:1-11`、`:50-56` 终态集）；入站把本会话暴露为 A2A 端点（`a2a-session-registry.ts:1-9`）。A2A 任务的 externalTaskId/contextId 直接落进 TaskLaneSession（`task.ts:136-141`），泳道自动化 step 可配 agentCardUrl/skillId/authConfigId 指向远端 agent（`kanban.ts:48-53`）。AG-UI 适配器把 ACP sessionUpdate 转 AG-UI SSE 事件（`src/core/ag-ui/event-adapter.ts:1-8`）。子 agent 与主系统的工具通道是 MCP：spawn 时注入带 `?wsId&sid` 作用域的 MCP URL（`orchestrator.ts:893-901`）。

**身份模型。** 无多用户账号系统：workspace 是顶级边界，shared-session 用 inviteToken + participant accessToken 做轻量准入（`types.ts:13-35`）；agent 身份 = agentStore 记录 + metadata（delegationDepth/createdByAgentId/specialist/rosterRoleId/displayLabel）。

## 六、协作 UI 形态

workspace 是唯一的顶级导航单元，根路径直接 redirect 到 kanban（`src/app/workspace/[workspaceId]/page.tsx:24-26`）——**看板即首页**。workspace 内 tab：kanban / sessions / team / notes / bg-tasks / overview / codebases / spec / feature-explorer（目录见 `src/app/workspace/[workspaceId]/`）。

- **看板页**：`kanban-page-client.tsx`（513 行，聚合 boards/tasks/sessions/specialists/repo 变更五路数据）+ `kanban-tab.tsx`（2200+ 行）+ 卡详情 `kanban-card-detail.tsx`（1554 行：会话 pane 内嵌、lane 履历、artifacts、delivery 证据、git 变更/diff 面板）。卡上直接显示队列位置与运行中状态（queue snapshot 见 §二并发闸）。
- **会话页**：`sessions/[sessionId]/session-page-client.tsx`（1206 行）+ left-sidebar（子会话树）+ canvas artifacts 钩子；会话列表带连续性徽标。
- **团队页**：`team/team-page-client.tsx`（406 行）按 team-agent-lead 聚合 TeamRun，展示 directDelegates/descendants 计数——多 agent 族的树形名册视角。
- **全局件**：notification-center.tsx（通知中心）、collaborative-task-editor.tsx（协作编辑）、message-bubble 的权限气泡。

## 七、与 SwarmStudio 的差距对照

判定：≈ 已具备 / → 可搬（落点） / × 不适用。我方基线：ia2 工作台（flow 导航+权威快照+run canvas）、/ide、kanban task（session_id 桥接+assignee）、loop 引擎（worktree-manager/subagent-dispatcher）、Koa+SQLite、matrix 账号。

| # | routa 机制 | 锚点 | 判定与落点 | 优先级 |
|---|---|---|---|---|
| 1 | 看板即协调总线：列级 automation steps + 触发时机 + autoAdvance | models/kanban.ts:92-127；boards.ts:16-96 | → ia2 board 数据模型 + server kanban 路由；我方列只是状态桶 | **P0** |
| 2 | COLUMN_TRANSITION 事件驱动列 agent + KanbanSessionQueue 每 board 并发闸（默认 1，可配） | column-transition.ts:26-38；kanban-session-queue.ts:78-111；board-session-limits.ts:1 | → loop 引擎 dispatcher 前置闸；我方 dispatcher 无看板级并发上限 | **P0** |
| 3 | 任务=证据累积对象：laneSessions/laneHandoffs/deliverySnapshot/verificationVerdict | models/task.ts:835-899 | → server task schema 扩展 + ia2 卡详情；我方 task 只有 session_id+assignee | **P0** |
| 4 | 流转门禁四件套：requiredHumanApproval/requiredChecklist/validatorCommand/gateMode | kanban.ts:109-127；transition-gates.ts | → server PATCH 任务端点照搬校验顺序（route.ts:291-352） | **P0** |
| 5 | 委派深度上限 2 + roster 人名池去重 | delegation-depth.ts:21；orchestrator.ts:129-220 | → loop subagent-dispatcher 护栏 + ia2 agent 名册显示名 | P1 |
| 6 | 结果回收三兜底：auto-report（2s）+ report 文件 watcher + session-end 信号 + wakeParent 续话 | orchestrator.ts:1045-1080/1110-1191/1330-1409 | → loop dispatcher 完成检测；我方依赖显式上报，缺兜底 | P1 |
| 7 | agent→coordinator 权限升级协议（urgency 三档 + 批准即改沙箱策略） | agent-tools.ts:1421-1559；permission-store.ts | → server 新 permission 域 + ia2 审批收件箱；我方审批门只有人↔agent 单向往返 | P1 |
| 8 | dev 列 watchdog + 监督模式（watchdog_retry/ralph_loop）+ 有界恢复 | workflow-orchestrator.ts:28-29/56-74 | → loop 引擎会话监督；30s 扫描口径可直接搬 | P1 |
| 9 | 执行租约：ownerInstanceId+leaseExpiresAt+runner 反代+重启按租约接管 | execution-backend.ts:54-61；runner-routing.ts:17-38；restart-recovery.ts:44-60 | → server 多实例形态的最小事实源；我方单机 Koa 暂无 | P1（分布式前置） |
| 10 | 共享会话：invite token + 四档模式 + prompt 审批流 | shared-session/types.ts:1-58 | → ia2 会话分享；可叠加在 matrix 账号绑定之上做准入 | P1 |
| 11 | 会话连续性四态徽标（active/interrupted/restorable/stale，7 天阈值） | api/sessions/route.ts:17-46 | → ia2 flow 导航会话桶；纯前端推导即可 | P1 |
| 12 | Worker 抽象（local/docker/remote + 健康状态机 + capability 路由） | worker/types.ts:17-90 | → loop 执行槽位层；多机器执行时再做 | P2 |
| 13 | A2A 出站/入站 + externalTaskId 落 laneSessions | a2a-outbound-client.ts:1-11；task.ts:136-141 | → 跨系统 agent 调用；依赖 #9 先行 | P2 |
| 14 | Yjs CRDT 共享笔记（人+agent 同权共写） | notes/crdt-document-manager.ts:1-13 | → ia2 协作文档；需引 Yjs 依赖 | P2 |
| 15 | 团队名册视图（team-agent-lead 聚合 + delegates/descendants 计数） | team-page-client.tsx:20-30 | → ia2 权威快照的 agent 分桶视角 | P2 |
| 16 | 泳道专家提示词资产 11 份（backlog-refiner→done-reporter） | resources/specialists/workflows/kanban/ | → 直接可读移植为 loop 各阶段提示词；文本资产非代码 | P1（低成本） |
| 17 | 双后端 parity / entrix fitness / harness-monitor | docs/ARCHITECTURE.md；crates/entrix | × 我方单后端 Koa；harness 是重型 repo 治理，超出驾驶舱范围 | × |

## 八、搬运建议排序

1. **P0 先看板域（#1-#4 一批做）**：routa 的核心论点是「看板不是可视化而是协调总线+门禁栈」。落点：server 侧 task/board schema 扩展（laneSessions/verification 字段）+ 列 automation 配置 + PATCH 门禁链；ia2 侧卡详情证据面与队列徽标。这一批做完，我方看板从「任务分派板」升级为「交付流水线」。
2. **P1 委派健壮性（#5-#8）**：深度护栏、人名名册、完成三兜底、watchdog——全部是 loop 引擎 dispatcher 的加固件，改动集中在 server，UI 只需名册显示。
3. **P1 分布式地基（#9）**：执行租约 + ownerInstanceId 是多实例/多机器协同的最小充分机制，先于 worker 池与 A2A 做；session 表加两列即可起步。
4. **P1 人机面（#7、#10、#11）**：权限升级协议补 agent 间审批通道；共享会话补多人共驾；连续性徽标是纯前端速赢。
5. **P2 暂缓**：worker 池、A2A、CRDT 笔记、team 视图——依赖前面轮次落地后再评。

## 九、未覆盖面（如实标注）

- `crates/entrix` 与 `crates/harness-monitor` 内部未逐文件读（Review Gate 双层仅依据 README.md:54-61 与目录结构）；与我方无直接对应域，判 × 后未深入。
- `src/core/workflows/`（workflow 编排，独立于看板自动化）、`src/core/canvas/`（A2UI canvas）、`repowiki`/`reposlide` 未读；与协作主线无关。
- Rust 侧只确认了 orchestration/mod.rs 与 store 目录结构，未逐文件比对与 TS 侧的行为差（parity 断言依据 docs/ARCHITECTURE.md 自述，未独立验证）。
- UI 组件只读了页面级入口与 props 签名，kanban-tab.tsx 2200 行内部交互细节（拖拽、实时刷新策略）未逐段核。
- e2e/ 与 drizzle schema 未读；任务字段的 DB 落库形态以 TS model 为准。
