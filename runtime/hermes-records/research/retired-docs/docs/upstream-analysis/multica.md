# Multica 源码调研：分布式 agent + 人机协作的 issue 总线范式

调研对象：`upstream/multica`（multica-ai/multica，main，534 个迁移）。一句话定位：**把 agent 当同事的异步工作流平台**——人把 issue 指派给 agent（26 种 CLI：claude/codex/hermes/kimi/dsh…），agent 在用户的机器（daemon）上领取任务、跑 CLI、把进度与结果以**评论**写回 issue，活儿落在 in_review 由人验收。与 SwarmStudio 的同步会话驱动（chatStore 为中心）不同，multica 是 **issue/评论驱动的异步协作**：issue + comment + @mention 就是 agent 间总线。

方法：对 `server/internal`（Go 服务 47 包）、`server/pkg/db/queries`（sqlc SQL）、`server/pkg/protocol`、`packages/{core,views,ui}`（前端）、`apps/{web,desktop}` 做源码级穷举式抽读。所有论断带 file:line。未覆盖面如实列在文末。

## 一、仓库概览与技术栈

pnpm + turbo monorepo，Go 后端 + Next.js 前端 + Electron 桌面 + iOS：

```
server/                 Go 1.x 单体服务（chi 路由 + pgx + sqlc 生成 + Redis 可选）
  cmd/multica/          CLI（人agent共用同一 CLI：issue/comment/squad/chat/daemon/setup…70+ 文件）
  cmd/server/           服务入口
  internal/handler/     HTTP 层（~110 文件：issue/comment/squad/inbox/daemon_ws/runtime…）
  internal/service/     领域服务（task.go 7958 行是任务队列核心；agent_invocation/autopilot/squad_no_action…）
  internal/daemon/      跑在用户机器上的执行器（daemon.go 10583 行：轮询/领取/执行/回报）
  internal/daemonws/    daemon↔server WebSocket 控制面（hub.go 1154 行）
  internal/realtime/    web 端 WS 扇出 + Redis 跨实例 relay
  internal/scheduler/   DB 支持的分布式 cron（autopilot/wakeup/rollup）
  internal/issuestatus/ 每 workspace 状态目录（7 内置状态 × 4 生命周期类）
  internal/events/      进程内同步事件总线（100 行）
  migrations/           534 个迁移（001_init → 534）
apps/web/               Next.js 15 工作台（路由壳）→ 实际 UI 在 packages/views
apps/desktop/           Electron 壳（electron-vite），自动把本机注册为 runtime
apps/mobile/            iOS
packages/core/          前端领域层（react-query queries/mutations + ws-updaters，33 域）
packages/views/         页面级视图（issues/inbox/chat/squads/agents/runtimes…40 域）
packages/ui/            Radix 基建组件
docs/engineering/       仅 2 篇（issue-wakeups、状态迁移）——设计知识在代码注释里
```

关键风格：Go 文件头部大段 MODEL 注释把每个不变量写明（含 MUL-xxxx 追踪号与事故教训），SQL 即事实源，状态机全部显式。

## 二、多 agent 协作模型

### 2.1 组织：名册 + squad（层级=leader 路由）

- **Agent 是一等实体**：`agent` 表带 name/avatar/runtime_mode(local|cloud)/visibility(workspace|private)/status(idle|working|blocked|error|offline)/max_concurrent_tasks（默认 1）/owner_id（migrations/001_init.up.sql 的 CREATE TABLE agent）。agent 有 owner（创建它的人），权限跟着 owner 的连接走。
- **Squad = 人+agent 混编小队，带一个 leader agent**：`squad` 表有 leader_id；成员表 member_type 区分 agent/user（handler/squad.go:26-60 SquadResponse/SquadMemberResponse）。issue 的 assignee 可以是 squad——此时**实际领取任务的是 leader**（service/task.go:1407 EnqueueTaskForSquadLeader）。
- **没有 agent 目录层级/树**：组织面就是 workspace → squad → agent 两级，靠 name/avatar/skills 在名册上呈现。

### 2.2 通信：评论即总线，@mention 即 RPC

**核心范式：agent 之间不直接 send_message，一切经 issue 评论 + mention 触发新 run**。daemon 给 agent CLI 注入的 runtime brief 明确规定交付通道（execenv/runtime_config_sections.go:780：「Final results MUST be delivered via `multica issue comment add`…用户看不到你的终端输出，只有评论」）。

mention 语法即副作用声明（runtime_config_sections.go:901-912 `## Mentions`）：
- `[@Name](mention://agent/<uuid>)` → **为该 agent enqueue 一个新 run**（A2A 调用）
- `[@Name](mention://member/<uuid>)` → **通知一个人**（进 inbox）
- `[@squad](mention://squad/<uuid>)` → 触发该 squad 的 leader
- issue/project mention → 纯链接无副作用

服务端路由在 handler/comment.go:3100-3290：逐 mention 解析目标类型、鉴权（canInvokeAgent）、查 runtime 就绪（service.AgentReadiness）、pending 去重、**为每个 mention 产出一条 dispatch outcome（target 级，带 reason code）**。自触发抑制：leader @自己 squad 时若自己刚跑过 leader 任务则不再触发（comment.go:3173 shouldSuppressSquadLeaderSelfTrigger + handler/squad.go:1147）。

**反面印证**：execenv/codex_multi_agent.go:11-30 默认**禁用** Codex 原生 multi_agent（spawn_agent 等工具）——multica 刻意把 A2A 收敛到 issue 总线，不让 CLI 内 spawn 逃逸出审计面（子线程完成时序不可控是公开理由）。

### 2.3 分派与回收：leader 协调协议

squad leader 不靠硬编码路由，靠**注入的操作协议**（handler/squad_briefing.go:14 squadOperatingProtocolHeader，每次 leader run 前置）：
1. 读 issue → 按 roster 里每员的 skills/role 选人；
2. **委托=发一条 @mention 评论**（必须完整 mention markdown，否则不触发——"non-negotiable"）；
3. 每轮必录评估：`multica squad activity <issue> action|no_action|failed --reason …`（handler/squad.go:976 RecordSquadLeaderEvaluation）——no_action 也必录，且禁止为 no_action 再发评论（防噪音）；
4. **dispatch 完即停**：member 回报/完成/再被 @ 时自动重新唤醒；
5. 父 issue 状态所有权分两种组合：issue 属于本 squad 时 leader 负责把状态推进到 in_review，**done 留给人类 reviewer 或 PR 合并**（squad_briefing.go:107-124 squadParentStatusOwned）；被拉进别人 issue 时禁止动状态（:128 squadParentStatusNotOwned）。

**结果回收链**：委托出去的 run 失败且重试耗尽时，服务端沿 delegated_from_task_id 链回溯，给链顶的人类发 action_required 级 inbox + 系统评论（service/task.go:6166 recoverDelegatedTaskFailure、:6380-6420 建 inbox 行，上限 3 次 delegatedFailureRecoveryMaxTaskAttempts :6060）。attribution 包贯穿全程：每个 run 记录 accountable human + 来源 + 委托谱系（service/task.go:504 attributionForIssueTask；重试原样继承 :500 注释「系统重试不是新归因事件」）。

### 2.4 并发护栏（这套值得整套搬）

- **认领 SQL 单语句原子完成**（pkg/db/queries/agent.sql:743 ClaimAgentTask）：`UPDATE … WHERE id=(SELECT … FOR UPDATE SKIP LOCKED)`，内含四道围栏：
  1. 每 (issue,agent) 串行——同 issue 同 agent 已有 dispatched/running/waiting 任务则不可领（不同 agent 可并行同 issue）；chat 任务按 chat_session_id 串行；
  2. runtime 归属与新鲜度——`a.runtime_id = atq.runtime_id AND r.status='online' AND last_seen_at >= now()-stale`；
  3. wakeup 修订号失效即跳过；
  4. 优先级排序 priority DESC, created_at ASC。
- **容量门**：claim 事务内先 CountRunningTasks ≥ max_concurrent_tasks 则空手而归（service/task.go:3513-3523）。
- **单 pending 槽**：(issue,agent) 上的 partial unique index 保证最多一条 queued/dispatched；重复 enqueue 走 ON CONFLICT DO NOTHING → 409/coalesced（agent.sql:460-468 CreateRetryTask 注释、service/task.go:1351）。
- **评论合并（coalescing）**：pending 任务存续期间新评论不另起 run，合并进 coalesced_comment_ids，触发摘要重盖到最新（service/task.go:1298、:281-315）。
- **daemon 侧 slot-before-claim**：先抢到本地执行槽位才向 server 批量认领，认领到的任务绝不会没有本地容量而晾在 dispatched 态（daemon/daemon.go:5387-5435 runBatchPoller）。
- **机器级批量认领**：一次请求跨全部 runtime 领 N 个任务，5s 短超时，超时由 reclaim 兜底（daemon/client.go:261-312；服务侧 service/task.go:3892 ClaimTasksForRuntimes）。
- **回收器簇**：dispatched 超时（prepare lease）、runtime 离线失败、stale 任务窃取、queued 过期逐一出清（service/task.go:5872-5900 FailTasksForOfflineRuntimes 等 + trackTaskForReclaim :198）。
- **取消传导**：人取消 → server 置 cancelled → daemon 轮询任务状态发现终态即杀进程（daemon/daemon.go:5627 shouldInterruptAgent、:5906）。
- **本地目录互斥**：pinned local_directory 的任务先拿路径锁再 StartTask，状态机 dispatched→waiting_local_directory→running 不倒退（daemon/daemon.go:5771-5788）；chat 轮可豁免锁但要带「共享工作目录」警告块（daemon/prompt.go:84-99 WithSharedLocalDirectory）。

## 三、人机协作面

### 3.1 介入方式：评论续话 + 状态门禁 + 取消，无流中 steer

- **介入=评论**：人对运行中的 issue 发评论 → 合并进 pending 任务或触发新 run；新 run **恢复同一 provider 会话**（session_id+work_dir 存在 task 行上，migrations/020_task_session.up.sql；重试子任务继承会话，resume-unsafe 失败黑名单强制新会话，service/task.go:5210-5268 resumeUnsafeFailureReason/ResumeUnsafeFailure）。**没有运行中注入（steer）**——纠偏语义由「新评论 + 会话续接」承担。
- **审批/验收=状态机**：agent 只能把 issue 推到 in_review；done 是人类的动作（或带 close intent 的 PR 合并）（squad_briefing.go:120-124「Leave `done` to a human reviewer」）。交付走 `gh pr create --base`（runtime_config_sections.go:449-460）。
- **澄清**：agent 提问的方式就是评论里 @member（进 inbox 等人答）。快速创建失败会把草稿回填给 composer。
- **暂停/终止**：TerminateTaskConfirmDialog（packages/views/issues/components/terminate-task-confirm-dialog.tsx）→ CancelTaskWithResult（service/task.go:2857）→ daemon 杀进程；支持按 issue/agent/trigger comment 批量取消（:2597-2681）。
- **分派前预演**：`WillEnqueueRun` 是「这次指派/状态变更会不会起跑、为谁跑」的单一事实源，写路径与 **preview 端点共用**（service/issue_trigger.go:76-97；handler/issue_trigger.go:119 IssueTriggerPreviewRequest，上限 500 issue）——UI 能在用户点确定前告诉他「这个操作会/不会触发 run，原因是什么」。

### 3.2 角色共存与可见性

- assignee/creator 都是 polymorphic（member|agent）（migrations/001_init.up.sql issue 表 CHECK）；inbox 收件人也分 member|agent（同文件 :110 inbox_item，severity 三档 action_required|attention|info）。
- **invoke 权限与可见分离**（handler/agent_access.go:12-50）：private agent 只有 owner 能触发，**admin 无旁路**；A2A 按**链顶人类 originator** 判定——U 触发 A、A @B，仅当 U 在 B 白名单才可触发（杜绝 agent 组团绕过 owner 白名单）。失败原因全部枚举化且**防枚举**（私有 agent 对无权者只回 invocation_not_allowed，不泄露存在性）。
- attribution 给每个 run 钉住 accountable human（service/task.go:504-630；trigger/规则/评论证据入列），配额、审计、失败通知都落到人。
- 会话内共存：chat 域是人↔agent 直聊（同一任务队列，issue_id 为 NULL，service/task.go:1886-2131 EnqueueChatTask 族 + 会话锁 lockChatSessionForTaskWrite :3048）；还有跨 Slack/Lark/DingTalk/WeCom/Telegram 的 channel 会话（channelmedia 包），同一套 task/chat 状态机承载。

## 四、任务/看板模型

- **生命周期**：7 内置状态 backlog/todo/in_progress/in_review/done/blocked/cancelled，归 4 存储类 unstarted/started/done/closed（issuestatus/issuestatus.go:27-56）；workspace 可自定义状态但**只继承生命周期类，不继承内建行为**（停驻/review/恢复语义不外溢 :209-218）；`Effective()` 是把自定义终态投影回 done/cancelled 的唯一入口，未知 key 失败方向=不动（:374-397）。`Ensure` 幂等播种可并发安全（:366-372）。
- **触发规则**：assign 与 status 两源（service/issue_trigger.go:14-22 RunSourceAssign/RunSourceStatus）；**backlog 停驻**——指派给 agent 但状态在 backlog 不起跑，提升出 backlog 才起跑；评论在任何状态都触发。失败自动重置：无活跃任务且无重试时 in_progress→todo，但 in_review/blocked/自定义态**永不自动动**（service/task.go:5996-6038，注释明写「in_review 和 blocked 由人或外部依赖拥有」）。
- **task↔agent↔session 绑定**：agent_task_queue 行持有 agent_id+issue_id+runtime_id+session_id+work_dir+trigger_comment_id+coalesced_comment_ids+squad_id+delegated_from_task_id+originator_user_id——一行就是一次完整协作上下文；同一 (issue,agent) 的后续 run 凭 session_id/work_dir 续接 provider 会话，force_fresh_session 可强制新会话。
- **重试**：按 failure_reason 分档（平台错可重试、resume-unsafe 新会话、agent_error 指数退避），attempt 上限与 retryDelayForAttempt（service/task.go:5210-5300）；MaybeRetryFailedTask（:5362）+ 人工 RerunIssue（:5584）分离记录 retry_of_task_id。
- **看板组织**：前端四视图——board/list/table/gantt/swimlane（packages/views/issues/components/board-view.tsx、gantt-view.tsx、table-view.tsx、swimlane-view.tsx），虚拟化层级表 + 项目分组 + 自定义视图保存（manage-views-dialog）；issue 支持父子（parent_issue_id）、优先级五档、acceptance_criteria JSONB、due_date、position 浮点排序。后端 issueposition 包管排序。
- **执行日志（run canvas 对应物）**：issue 详情右栏 execution-log-section.tsx——每个 run 一行（agent 头像/触发描述/状态/时长/token/费用），活跃在上、历史折叠；daemon 经 ReportTaskMessages 把 provider 消息流式上报（daemon/client.go:530，5s 超时批量），TranscriptButton 回放全程。issue-agent-activity-indicator / issue-agent-header-chip 在卡片与头部给实时「正在工作」信号。

## 五、分布式形态

- **形态=中心 server + 任意多台 daemon（每台机器一个）**：daemon 持久身份是机器级 UUID（~/.multica/daemon.id，daemon/identity.go:24-39——profile/主机名漂移不换身份，一机一 runtime 行）；首次配对见 migrations/005_daemon_pairing。
- **控制面=WS 优先、HTTP 兜底**：daemonws/hub.go:412 HandleWebSocket 升级时按 runtime 批量授权（ClientIdentity :24-46，连接期租约 RuntimeLease 节流心跳写库）；能力协商经 X-Client-Capabilities（protocol/messages.go:6-63：rpc-v1/claim-poll-hints-v1/local-worktree-v1/skill-bundles-v1…逐个版本化）；server→daemon 推送 task:available/pending-work/runtime-gone（hub.go:446-478），daemon→server 心跳带 pending 动作应答（messages.go:380-414：挂起更新/模型清单/技能导入），双向 RPC 走 EventDaemonRPCRequest/Response 信封（messages.go:83-104，requestID 关联）。
- **任务投递**：server 端 enqueue 即同步失效 empty-claim 缓存并 NotifyTaskAvailable（daemonws hub :446）；daemon 端批量认领（§2.4）；**会话不迁移**——task 行持久 runtime_id，runtime 离线→任务等它回来或判失败重试；agent 换绑 runtime 时旧候选被 claim 内 fence 拒绝（service/task.go:3505-3511 runtime_mismatch）。
- **web 端状态同步**：realtime.Hub 按 scope 房间（workspace/user/task/chat_session…）扇出（realtime/hub.go:213-232、:331 自动订阅 workspace+user）；多实例部署用 **Redis Streams relay**（redis_relay.go:21-35 ws:scope:*:stream + 节点心跳 90s TTL + 每 scope 消费循环随本地订阅数启停）；事件总线是进程内同步 pub/sub（events/bus.go:29-59），Event 带 TaskID/ChatSessionID 作路由提示。
- **分布式 cron**：scheduler 把 sys_cron_executions 表当分布式锁+审计日志——（job,scope,plan_time）唯一键，多实例同 tick 只有一个赢租约，stale 窃取与 catch-up 策略按 JobSpec（scheduler/spec.go:1-20、manager.go）；承载 autopilot（定时 standup/审计/报告，jobs_autopilot.go）、issue wakeup（周期唤醒 agent 复查 issue，docs/engineering/issue-wakeups.md）、用量 rollup。
- **账号体系是自有账号**（email+验证码 migrations/009、PAT :011、workspace member 三角色 owner/admin/member），**没有 matrix**；外部身份在 channel 集成（slack/lark/dingtalk/wecom/telegram 各一个 handler 文件）。

## 六、协作 UI 形态（人+agent+任务+会话同屏）

路由一层扁平（apps/web/app/[workspaceSlug]/(dashboard)）：**issues / my-issues / inbox / chat / agents / squads / projects / runtimes / autopilots / skills / members / usage / settings**。信息架构的三个同屏手法：

1. **agent 与人同一套在场语言**：agents/presence.ts 把 availability（online/unstable/offline 圆点）与 workload（working/queued/idle 芯片）拆成两个独立维度——「在线但闲着」与「离线但队里有活」一眼可分；board 卡片上 agent 与人一样出头像，活跃任务卡上有 working 环（progress-ring、sub-issues-agent-working-chip）。
2. **issue 详情=协作主页**：描述 + 线程化评论（thread-minimap、resolved-thread-bar、评论可选区引用 comment-selection-bubble）+ 右栏 execution log（每 run 一行带费用）+ mention 触发结果 chip（comment-trigger-chips：每个 @mention 的分派结果直接画在评论旁，reason code 本地化）+ attribution-badge（这活儿谁发起、经谁委托）。
3. **inbox 即注意力队列**：new_comment/mentioned/task_failed/quick_create_failed 等类型 × 三档 severity，列表项评论正文截 200 码点（handler/inbox.go:73-111），已读/归档双轴 + 批量操作；事件经 inbox:new WS 直推。my-issues 是「与我有关」的过滤视图。chat 页是人↔agent 直聊，quick actions 由 agent 完成后生成建议按钮（service/chat_quick_actions*.go）。

## 七、差距对照（≈已具备 / →可搬(落点) / ×不适用）

我方基线：ia2 工作台（/app：flow 导航+权威快照+注意力跳转+run canvas）+ IDE 工作台（/ide）+ Koa/SQLite + hermes 运行时 + loop 引擎（worktree-manager/subagent-dispatcher）+ matrix 账号。

| # | multica 机制 | 锚点 | 判定 | 落点 | 优先级 |
|---|---|---|---|---|---|
| 1 | 认领 SQL 四围栏：每(issue,agent)串行+SKIP LOCKED+runtime 新鲜度+优先级 | agent.sql:743 | → 我们的 kanban 分派缺 (task,agent) 串行与原子认领 | ide/loop dispatcher（subagent-dispatcher） | **P0** |
| 2 | dispatch reason code 统一词汇表 + 评论旁 outcome chip | dispatch/reason.go:25-78；comment-trigger-chips.tsx | → 「为什么没跑」无处可查是我方盲区 | ia2 任务卡/会话内 @ 分派反馈 | **P0** |
| 3 | squad leader 协调协议（mention 委托+每轮必录评估+dispatch 即停） | squad_briefing.go:14-160 | → 我方 dispatcher 是硬编码路由，无 leader 自省与评估留痕 | ia2 群组/loop 编排提示词资产 | **P0** |
| 4 | @mention 即 A2A 总线（agent→enqueue / member→inbox / squad→leader），总线=评论 | runtime_config_sections.go:901；comment.go:3100 | → 我方会话内 @ 只能给人；agent 互调缺审计面 | ia2 会话 + chatStore 桥 | **P0** |
| 5 | invoke 权限：private 无 admin 旁路；A2A 按链顶人类 originator 判定 | agent_access.go:12-50 | → 我方 agent 无 owner/白名单概念 | server 侧（overlay server 层） | P1 |
| 6 | inbox 三档 severity + recipient member\|agent + 类型化（task_failed 带 delegated 链） | migrations/001:110；task.go:6404 | → 我方注意力跳转无 severity/归档双轴 | ia2 flow 导航/注意力条 | P1 |
| 7 | WillEnqueueRun 分派预演（写路径与 preview 共用一谓词） | issue_trigger.go:97；issue_trigger.go(handler):119 | → 分派前提示「这会起跑吗」 | ia2 任务分派 UI | P1 |
| 8 | (issue,agent) 会话续接：session_id+work_dir 上 task 行 + resume-unsafe 黑名单 | migrations/020；task.go:5210 | ≈ 我方 session_id 桥已有，但无 resume-unsafe 分档与 work_dir 续接 | ide chatStore/loop | P1 |
| 9 | agent 在场两维模型（availability × workload 分离渲染） | agents/presence.ts | → 我方在线徽标单维 | ia2 flow nav + 权威快照 | P1 |
| 10 | 每 run 一行的 execution log + 费用/token + transcript 回放 | execution-log-section.tsx；client.go:530 | ≈ RunTrace/结果卡已覆盖大半；缺 per-run 成本列 | ia2 run canvas | P1 |
| 11 | daemon 批量认领+slot-before-claim+5s 超时+reclaim 兜底 | daemon.go:5387；client.go:261 | × 现阶段（单实例本地 loop）；规模化时再抄 | — | P2 |
| 12 | sys_cron_executions 分布式锁 cron（autopilot/wakeup） | scheduler/spec.go:1-20 | → 语义可搬（ SQLite 版锁表）：定时 standup/复查 | loop 引擎定时任务 | P2 |
| 13 | runtime brief 分层：缓存前缀稳定 + per-turn 追加块；服务端算 diff 免重读 | runtime_config_sections.go MUL-5377 注释；issue_state_instructions.go:42；reply_instructions.go:50 | → 提示词工程直接可抄（省 token + 防陈旧） | hermes-agent 提示词 | P2 |
| 14 | 共享目录并发警告块（无锁 chat 轮被告知「隔壁在写」） | prompt.go:112-127 | → 我方 worktree 共享场景同类问题 | loop worktree-manager 提示词 | P2 |
| 15 | 多机器 daemon 控制面（WS 能力协商+心跳租约+配对） | daemonws/hub.go；identity.go:24 | × 我方无多机 runtime 形态 | — | × |
| 16 | 26 CLI 驱动/execenv 隔离（codex sandbox、home 链接、技能剥离） | execenv/ 40+ 文件 | × 部分：我方只跑 hermes；sandbox 策略可后参 | — | ×/P2 |
| 17 | 自有账号+member 三角色+channel 集成五件套 | migrations/009-011；handler/{slack,lark,dingtalk,wecom,telegram}.go | × 我方走 matrix 账号与房间 | — | × |
| 18 | Redis Streams 跨实例 relay + scope 房间 | redis_relay.go:21 | × 单实例；但 scope 房间模型（task/chat 级订阅）可参 | ia2 WS 扇出 | P2 |
| 19 | PR 交付链（gh pr create --base + 分支语义提示） | runtime_config_sections.go:449-479 | ≈ 我方 worktree 编排已有建/收；缺「交付目标分支」提示词规约 | loop/hermes | P2 |
| 20 | issue wakeup（周期唤醒 agent 复查，修订号失效防陈旧触发） | scheduler/jobs_issue_wakeup.go；agent.sql:766 wakeup fence | → 「定时复查任务」是我方 loop 可加的轻量能力 | loop 引擎 | P2 |

## 八、搬运建议排序

**P0（协作语义层，直接补我方盲区）**
1. **dispatch reason code + 分派结果反馈**（表 #2）：12 个稳定枚举（queued/coalesced/deferred/invocation_not_allowed/target_unavailable/runtime_offline/runtime_unusable/runtime_access_denied/runtime_profile_missing/agent_runtime_required/attribution_blocked/already_active/self_trigger_suppressed…）在决策分支处产生、原样透传到 UI。我方 kanban 分派与会话内 @ 现在都是「发了就发了」。
2. **(task,agent) 串行 + 原子认领 + 单 pending 槽**（表 #1）：一句 SQL 干掉「同任务同人双跑」，SKIP LOCKED 让多 dispatcher 安全共存。SQLite 可同构（UPDATE…WHERE id=(SELECT…) + 唯一部分索引）。
3. **@mention A2A 总线**（表 #4）：mention 语法即副作用声明，服务端逐目标路由+鉴权+outcome。把我方会话内 @ 从「仅通知人」扩成「可触发 agent」，天然带审计（评论即记录）。
4. **leader 协调协议**（表 #3）：给 dispatcher/群组长 agent 注入「选人→mention 委托→录评估→dispatch 即停」协议 + roster 块；每轮必录 outcome 使人能区分「没醒」与「醒了判断无需动作」。

**P1（人机协作面硬化）**
5. inbox severity×归档双轴 + member|agent 双收件人（表 #6）；6. 分派预演 preview（表 #7）；7. 会话续接的 resume-unsafe 分档 + work_dir 继承（表 #8）；8. agent 在场两维（表 #9）；9. run 行级成本/token 列（表 #10）。

**P2（规模化与提示词工程）**
10. 分布式 cron 锁表 + wakeup 复查（#12/#20）；11. runtime brief 缓存分层与服务端 diff 提示（#13）；12. 共享目录警告块（#14）；13. WS scope 房间细化到 task/chat 级（#18）。

**明确不搬**：多机 daemon 体系（#15）、26 CLI 驱动（#16 主体）、自有账号/channel 集成（#17）、Electron/移动端壳。

## 九、未覆盖面（如实标注）

- **插件系统**（service/plugin_*.go 14 文件 + packages/plugin-sdk + examples/plugins）：未读；从文件名看有 plugin hook/schedule/MCP transport/skill/存储/事件桥，可能是第三方扩展面。
- **Composio 集成**（handler/integrations_composio.go、agent_composio_allowlist）：外部 SaaS 工具连接，未细读。
- **attribution 包内部**（internal/attribution + 回溯命令 cmd/backfill_*）：只经 task.go 调用面确认语义，规则引擎细节未读。
- **云端商业化面**：entitlement/seatcapacity/cloudruntime/billing/cloud_billing 未读（self-host 无关）。
- **channel 五件套**（slack/lark/dingtalk/wecom/telegram + channelmedia）：只确认存在与挂载点，协议细节未读。
- **apps/mobile（iOS）与 apps/desktop 渲染层**：未读；desktop 只确认 Electron + 自动注册本机 runtime。
- **e2e/perf 测试与 deploy/helm**：未读。
- **执行细节类**：issueposition 浮点排序实现、workspace MCP overlay、skillbundle 打包、mika onboarding agent——均只见挂载点。
- 评论触发窗口 2000 条截断（X-Comments-Truncated）在 reply_instructions.go:45 注释提及，handler 实现未定位行号。
