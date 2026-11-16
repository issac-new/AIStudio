# Always-on Agents 吸收（Anthropic《Building always-on agents》五组件对账）

日期：2026-11-16
状态：in-progress
触发：用户「深入调研 https://mp.weixin.qq.com/s/C8CTefmyZFiTS-lUEJgMXg 完善AIStudio」＋范围裁决「C：最全（含延迟工具调用）」。
同源轮登记（2026-11-16 立，防重复吸收）：调研对象为 Anthropic 技术指南《Building always-on agents》的中文拆解（模智空间，参考链接 `https://claude.com/resources/articles/building-always-on-agents`）；本仓 `grep -rl -i "always-on|常驻智能体|building-always-on" docs/superpowers/specs/` 仅命中两篇无关 harness 笔记，**无同源轮**。再次收到同一链接时的处置：先读本节与「存量对账」表，不新开吸收轮；剩余挂账只能从「不做的事」节选取且需用户裁决。

## 存量对账（2026-11-16 四路源码普查，只读）

文章五组件在本仓的存量不是空白，本轮价值在**协议与接线**而非新建子系统：

| 组件 | 已有（锚点） | 缺口 |
|---|---|---|
| 事件收件箱 | `session_admissions` 事实统一准入表：六源汇入、`UNIQUE(principal,target,request)` 去重、按会话单活跃 claim（`vendor/hermes-agent/hermes_state_common.py:597`；`gateway/session_authority.py:576`；`hermes_state_runtime.py:206-238`）；crash 恢复 queued 行（`hermes_state_runtime.py:453-464`） | 无 `occurred_at`/事件类型列；无通用 HTTP 入口；custom automations 不写此表；内存前置队列硬杀丢 |
| 定时器 | cron 成熟（`cron/jobs.py:1809`；`gateway/session_cron.py:194`；`cron/scheduler_provider.py:438`）；`/loop`、`/heartbeat` 同会话自唤醒（`hermes_cli/loops.py:440`；`gateway/run_goals.py:531`） | **无 agent 自设 follow-up 一等公民**：cron 一次性任务新开 cron 会话（`session_cron.py:104-150`），不恢复原会话 |
| 持久记忆 | Hindsight 唯一 provider（`docs/superpowers/specs/2026-11-10-memory-unification-hindsight.md`）；`session_checkpoint.py` 五节进度文档形态完整（`:1-20`） | 进度文件只在 kanban 预算触顶写（`turn_finalizer.py:193-206`）；无空闲 dreaming；`recall_method` 死键（provider 读 `recall_prefetch_method`，`__init__.py:1042`） |
| 权限 | 审批账本＋收件箱＋风险三档＋双签（`custom/server/approval-ledger/ledger-store.ts:17-32`；`approval-inbox/pending-controller.ts:385`）；图 HITL 完整暂停-落盘-恢复（`loop/graph/graph-runtime.ts:619`） | 四挡判定器 `evaluateFourMode` 无生产调用方（`custom/server/executioncontract/mode-policy.ts:21`，全仓仅测试引用）；agent 工具层审批为线程原地阻塞、状态进程内（`tools/approval_gateway_wait.py`），重启即丢 |
| 发件箱 | 四套分散 pending（cron `deliveries`、`async_delegations`、`delivery_obligations`、orchestrator `digest`）；orchestrator digest 有合并/重试（`custom/server/orchestrator/delivery.ts:102`）；proactivity 治理有预算/冷却/安静时段（`intervention-governor.ts:64-88`） | **无统一 Outbox**；proactivity `deliver` 决策无发送消费方（`grep` 实证域内零 `matrixSend`）；无显式沉默记录；kanban notifier 逐条直发无限流 |

## 变更

### P1 Run 收口三态协议＋沉默审计（custom/server/notify 扩展）

文章核心循环：每次 Run 结束只有三种结局——写发件箱／判定无需通知／发起延迟调用。本仓无统一落点，沉默不可审计。

- 新增 `custom/server/notify/run-outcome.ts`：
  - `RunOutcomeRecord = { id; runId; runKind: 'automation'|'kanban'|'loop'|'followup'|'chat'|'manual'; audience: 'human'|'agent'|'none'; outcome: 'outbox'|'silence'|'deferred'; reasonCode: RunOutcomeReason; refs: string[]; sessionId?; at }`。
  - `RunOutcomeReason` 闭集：`delivered`／`nothing-new`／`below-threshold`／`cooldown`／`quiet-hours`／`budget-capped`／`duplicate`／`deferred-approval`／`deferred-followup`／`error`。
  - JSONL append-only 落盘（先例 `dispatch-ledger.ts`），环形上限 2000 行；坏行隔离不阻断。
  - 纯函数 `classifyGovernanceRound(decisions: Array<{decision:string; reasonCode?:string}>)`：任一 deliver/escalate → `outbox`；任一 defer/hold/clarify → `deferred`（取首个 reasonCode）；全 suppress → `silence`（取多数 reasonCode，缺省 `below-threshold`）。
- 新增 `custom/server/notify/run-outcome-controller.ts`：`POST /api/hermes/run-outcome`（记录）／`GET /api/hermes/run-outcome`（按 outcome/reasonCode/runKind 过滤＋limit）／`GET /api/hermes/run-outcome/stats`（按 reasonCode 计数）。
- 接线（本轮三处，其余域可后续 POST）：
  - `custom/server/proactivity/interventions-service.ts` syncInterventions：每轮治理后落一条 run outcome（runKind='kanban'，runId=sync 批次号）。
  - `custom/server/automations/automation-engine.ts` dispatchBucket：派发成功 → `outbox/delivered`；空桶/去重吞掉 → `silence/duplicate`。
  - `custom/server/outbox/outbox-dispatcher.ts`：每条消息终态各落一条（P2）。
- 机制预算：复用既有 `notify` 域（不新增域）；账本类目复用 `ledgers` 口径，登记 sunset。

### P2 注意力治理接真实发送（custom/server/outbox 新域）

把 proactivity 的 `deliver/defer/batch/suppress` 从「只记账」升级为「真发送」，并补 defer 到期重投、batch 合并、按收件人限流与失败重试。

- 新增 `custom/server/outbox/outbox-store.ts`：
  - `OutboxMessage = { id; recipient: { kind:'member'|'agent'; name:string }; channel: 'inbox'|'matrix'; body; priority:'critical'|'high'|'normal'; source:string; runId?; dedupeKey?; notBefore?:number; status:'pending'|'delivering'|'delivered'|'failed'|'suppressed'; attempts:number; lastError?; createdAt:number; deliveredAt?:number }`。
  - 单文件原子写 `outbox.json`（先例 `inbox-store` atomicWriteJson＋坏文件隔离），上限 500 条；`enqueue` 按 `dedupeKey` 幂等（pending 窗口内重复→ suppressed/duplicate）。
- 新增 `custom/server/outbox/outbox-dispatcher.ts`：
  - `dispatchDue(now)`：取 `pending ∧ notBefore<=now`；critical 跳过预算门；其余按 `intervention-governor` 同源 `AttentionPrefs`（安静时段/日 8/时 3）复检——被挡则 `notBefore` 推到下一窗口并落 run outcome（`quiet-hours`/`budget-capped`）。
  - 发送通道：`inbox` 恒可用（`inbox-store.deliver`，幂等 itemId）；`matrix` 仅在 `OUTBOX_MATRIX_ROOM` 配置时启用（`matrixSend`，fail-soft）。
  - 合并：同 `mergeKey`（默认 source+recipient）窗口内 normal 消息合成一条 digest（≤10 条），一条发送。
  - 重试：失败 attempts+1，30s/120s 退避，3 次后 `failed`（死信留档，不无限重试）。
  - 开关：`OUTBOX_DISPATCH=off` 关闭；`OUTBOX_TICK_INTERVAL_MS` 默认 60000（0=不自动 tick）。
- 新增 `custom/server/outbox/outbox-controller.ts`：`POST /api/hermes/outbox`（enqueue，供各域调用）／`GET /api/hermes/outbox`（列表/过滤）／`GET /api/hermes/outbox/stats`／`POST /api/hermes/outbox/dispatch`（手动 tick）。
- 接线 `interventions-service`：`deliver`→enqueue(priority=high)；`batch`→enqueue 带 mergeKey；`defer`→enqueue notBefore=nextWindowAtMs；`suppress`/`hold` 不入队（只落 run outcome 沉默）。
- 机制预算：新域登记 sunset；配对降级=proactivity 的 `SUGGESTION_PROFILE` 静态表维持 fallback（既有降级项，不重复计）。

### P3 follow-up 定时器一等公民（vendor 补丁 780）

- 新增 `vendor/hermes-agent/hermes_cli/followups.py`：
  - `FollowupState = { id; prompt; status:'active'|'fired'|'cancelled'; created_at; due_at; fired_at?; route: dict }`；
  - 存 `state_meta` 键 `followup:<session_id>`（JSON 列表），复用 `SessionDB.list_meta_prefix` 扫描；
  - `create_followup(session_id, prompt, delay_seconds, route)`／`list_due_followups(now)`／`mark_fired(session_id,id)`／`cancel_followup`。
- 新增 `vendor/hermes-agent/tools/followup_tool.py`：`followup_create(prompt, delay)`／`followup_list`／`followup_cancel(id)`；route 从 `HERMES_SESSION_PLATFORM/CHAT_ID/CHAT_TYPE/THREAD_ID/USER_ID` 捕获（复用 `cronjob_job_args._origin_from_env` 同源键）；无路由（CLI/TUI）时拒绝并说明。
- 新增 `vendor/hermes-agent/gateway/run_followups.py`：`_followup_watcher(interval=15s)`，镜像 `_loop_wakeup_watcher`（`run_goals.py:531-580`）：到期→`admit_route_wake(..., producer='followup')`，authority 缺席时 fallback `adapter.handle_message`；进程内 `_firing` 集防重入；`_running_agents` 忙则顺延。
- 注册：`gateway/run.py` 启动 watcher；`toolsets.py` 新增 `followup` toolset 并并入 core（coding 姿态也保留——跟进提醒是所有 agent 的通用能力）；工具 schema 说明「恢复原会话，不是新开会话」。
- 事件收件箱分离：watcher 不直接跑 agent，只提交 admission（对齐文章「定时器不直接启动 agent」）。

### P4 任务进度文件全量覆盖（vendor 补丁 781）

- `agent/turn_finalizer.py`：kanban worker 的 checkpoint 写触发从「仅预算触顶」扩为「预算触顶 ∪ 回合中断 ∪ 轮终（节流 10 分钟/task）」；轮终写入 reason 新增 `turn_end`／`interrupted`；env `HERMES_SESSION_CHECKPOINT_TURN_END=off` 关闭轮终写；仍只做状态面（不改任务状态/不派发 next）。
- `hermes_cli/kanban_db.py`：`build_worker_context` 读 checkpoint 从「重派时」扩为「每次 worker 启动」（首次启动无文件则 no-op，已有逻辑天然兼容）。
- 目标：每个进行中 kanban 任务在任何时刻都有一份 ≤800 字符的进度文档，新 Run 读它接续而非全量重推理（文章第四类记忆）。

### P5 空闲 dreaming 接 Hindsight（vendor 补丁 782）

- `team/profiles/*/plugins/hindsight/__init__.py`：配置键别名——读 `recall_prefetch_method` 失败时回退 `recall_method`（修死键；30/30 profile 现值 `recall`，行为不变）。
- 新增 `vendor/hermes-agent/agent/memory_dreaming.py`：
  - `run_dreaming(provider, session_db, now, cap)`：选最近 24h 有活动的会话（≥4 回合），拼「跨会话模式提炼」prompt，调 provider `reflect`；产出以 tag `dream` retain 回 bank；若 client 有 `aconsolidate` 则顺带调用（缺能力跳过）。
  - 预算：每 profile 24h 至多 1 次、空闲 ≥30 分钟、只读会话摘要（不重放全量 transcript）。
- 新增 `vendor/hermes-agent/gateway/run_dreaming.py`：`_dreaming_watcher(interval=1800s)`，idle gate 复用 `run_idle_gates`（无运行中 agent）；env `HERMES_MEMORY_DREAMING=off` 关闭；失败 fail-soft 只记日志。
- 注册 `gateway/run.py`。机制预算：新 watcher 登记 sunset（连续两轮推演零 dream 产出即退役）。

### P6 延迟工具调用闭环（vendor 补丁 783＋custom 收件箱扩展）

把 agent 工具层审批从「线程原地阻塞、超时即 deny、重启即丢」升级为文章语义：结束本轮→持久化挂起→用户回复作为新事件唤醒→恢复执行。

- `vendor/hermes-agent/tools/approval_gateway_wait.py`：
  - 新增 `approvals.defer_on_timeout`（缺省 `unattended`：仅 cron/kanban/automation 等无人在场的 principal 生效；`always|never` 可显式配置）。
  - 超时且满足条件：不 drop 队列项，写 `deferred` 记录并向调用方返回 `{resolved:false, deferred:true, deferred_id, request_id}`；队列项带 `deferred_at`，TTL 延长到 24h。
- 新增 `vendor/hermes-agent/tools/deferred_calls.py`：`~/.hermes/approvals/deferred.jsonl` append-only（`{id, session_key, session_id, request_id, tool, preview, risk, created_at, expires_at, status:'pending'|'approved'|'denied'|'expired'}）；`list_pending`／`settle`／`expire_old`。
- 回合收口：`agent/conversation_loop.py` 或工具批次收口处——某工具返回 `deferred` 时置 `agent._deferred_tool_call`，本轮结束并注入终态说明「已挂起等待用户批准，勿重试；用户回复后继续」。
- 新增 `vendor/hermes-agent/gateway/run_deferred.py`：`_deferred_watcher(interval=10s)`——扫 `responses/<request_id>.json`（studio-file-approval 同款协议）；有答案→`deferred_calls.settle()`→`admit_route_wake(session, '用户已批准/拒绝你此前的 <tool> 请求：<decision>。请继续……')`；到期→标 expired 并唤醒一次告知用户未批准。
- custom 侧：`custom/server/approval-inbox/pending-controller.ts` 增 `deferredfile:` 源（读 `deferred.jsonl` 的 pending 行，镜像 `fleetfile:` 分支），decide 写 `responses/<request_id>.json`；收件箱因此跨重启可见、可裁决。
- 机制预算：新 watcher＋新账本登记 sunset；配对退役=审批收件箱 tmpdir 票据路径（`enforce-approvals.ts:48-52` 的进程内等待在本批后仅保留短时缓存语义，注明）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | P1 落 `custom/server/notify` 既有域而非新建 runoutcome 域 | 机制预算「只加不减」；notify 域已有 turn-end 判定面，语义同族 | 新建 runoutcome 域（否决：一个账本换一个域，治理通胀） | 是 |
| D2 | 收口协议只覆盖 custom 可见的后台 Run（automation/kanban/loop/outbox），不伪造 chat turn 收口 | 文章语境是后台常驻 Run；chat 由用户发起、回复即交付，硬套三态是假数据 | 给所有 chat turn 记收口（否决：无「不通知」语义可记，纯噪音） | 是 |
| D3 | P2 新 `outbox` 域统一管队列，不复用 orchestrator digest | digest 只服务看板摘要且有「最新 N 条饥饿」缺陷（`delivery.ts:116`）；复用会把缺陷扩散 | 扩展 orchestrator digest（否决：域语义不符且需重写） | 是 |
| D4 | Outbox 限流在派发时复检 AttentionPrefs，而非入队时 | defer 到期重投必须用「当刻」预算/安静时段；入队时判定会过期 | 入队即定（否决：defer 语义失效） | 是 |
| D5 | P3 follow-up 用 state_meta＋gateway watcher，不复用 cron 一次性任务 | cron 一次性任务新开 cron 会话（`session_cron.py:104-150`），恢复原会话需改 cron 执行语义；loop/heartbeat 已证明 watcher 范式可行 | 扩展 cron `_create` 分支（否决：`execute` 只认 cron 冻结 policy，改面更大） | 是 |
| D6 | P3 follow-up 进 core toolset | 跟进提醒是通用能力；cronjob toolset 在 coding 姿态被移除（`toolsets.py:63`） | 并入 cronjob toolset（否决：coding agent 不可用） | 是 |
| D7 | P4 轮终写 checkpoint 用 10 分钟/task 节流 | 每轮都调辅助 LLM 写 checkpoint=成本失控；10 分钟覆盖「长任务」语义 | 每轮必写（否决：成本）；仅预算触顶（否决：中断场景无进度） | 是 |
| D8 | P5 dreaming 默认开启但硬预算（1 次/24h/30min 空闲） | 文章建议「空闲复盘」；预算保证不失控；失败 fail-soft | 默认关闭（否决：能力永远不生效）；无预算（否决：静默烧钱） | 是 |
| D9 | P6 延迟调用采用「结束本轮＋回复唤醒」而非「后台线程守候」 | 文章明确要求 worker 不阻塞；崩溃可恢复的唯一形态是持久化＋新事件 | 延长线程阻塞（否决：重启即丢，且占用线程） | 是 |
| D10 | P6 只对无人值守 principal 默认 defer | 有人在场的交互会话里阻塞等待是更好体验；无人值守才需要跨小时等待 | 全量默认 defer（否决：交互体感倒退） | 是 |
| D11 | 补丁起号 780（在途 `ekko-ui-surface` 已占 777-779） | 避免撞号连锁改号（2026-11-14 教训）；`patches/series` 收口时按序合并 | 复用 777（否决：与在途批冲突） | 是 |

## 验证

- P1/P2：`npx vitest run custom/server/notify custom/server/outbox custom/server/proactivity custom/server/automations`——纯函数矩阵（收口分类/去重/限流/合并/重试/沉默 reasonCode）＋真 HTTP REST 契约（400/404 负例）。
- P3/P4/P5/P6：vendor Python 侧测试落 `simharness` 或 `runtime` 对应测试目录（按仓内既有 pytest 布局）；补丁重放：`npm run inject` 后目标测试全绿；`npm run typecheck:harness`。
- 全量：`npm test`＋`npx vitest run` 目标域＋`node scripts/governance-lint.mjs --budget`＋`node scripts/merge-invariants.mjs --check`＋`gen-doc-indexes --check`。
- 实测记录随批回填（含未验证项）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md`：主动性治理段补「Run 收口三态＋outbox 派发链」；记忆段补「进度文件全量覆盖＋空闲 dreaming」；权限段补「延迟工具调用」。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md` §A 稳定参数：outbox 限流/重试阈值、follow-up watcher 节拍、dreaming 预算、deferred TTL。
- `config/mechanism-budget.json`：+4 补丁（780-783）、+1 域（outbox）、+2 watcher（followup/dreaming）、+1 账本（deferred_calls）登记 sunset 与配对退役。
- `docs/manuals/aistudio-design-document-index.md`：`gen-doc-indexes --write` 机械登记。
- `.swarm-yuan/decisions.jsonl`：D3/D5/D9 三条架构级落账。

## 不做的事

- 不给 `session_admissions` 加 `occurred_at`/事件类型列（vendor schema 迁移，收益可用投影面替代，独立轮评估）。
- 不接凭证代理（vendor `hermes proxy`/iron-proxy 有件未接；部署安全面独立轮）。
- 不接四挡 `evaluateFourMode` 到执行链（既有合同债，与七档矩阵合流未完成，独立轮）。
- 不改 `busy_input_mode` 默认值（连续消息合并默认不生效是既有配置事实，非本批缺口）。
- 不做用户已读/消费三级状态（outbox 只到投递终态；「已读」属客户端并读面，独立轮）。
- 不新建统一事件表或第五本事件账（多本账的查询投影独立轮）。
