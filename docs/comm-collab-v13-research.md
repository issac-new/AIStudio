# 沟通协作 v13 · 协作感知轮 —— 调研落地设计（2026-09-21）

> 主旨：把 multica 与 routa 两个开源项目的源码级调研结论,落成 SwarmStudio 驾驶舱
> 「沟通协作」页(/app 三栏工作台)的一轮功能完善。本文是本轮的唯一设计正本:
> 先给调研锚点,再给功能映射与实现边界,末列本轮未做但已论证的后台依赖项。

## 1. 调研结论摘要(源码锚点)

调研对象:`multica-ai/multica`(Go+React,"把 AI agent 当同事派活")与
`phodal/routa`(Next.js+Tauri+Axum,"workspace-first 多 agent 协同平台")。
两仓源码级调研报告(逐条 file:line 锚点)见会话交付;与本页直接相关的核心机制:

| 机制 | 来源与锚点 | 对本页的含义 |
|---|---|---|
| agent 活动指示器 | multica `packages/views/issues/components/issue-agent-activity-indicator.tsx:93-269`(头像堆叠+Working/Queued,hover 展开各 run 时长) | 左栏行应回答"谁在干活" |
| 收件箱 severity 三档 | multica `server/migrations/001_init.up.sql:110-124`(action_required/attention/info)+ 订阅降噪 `notification_listeners.go:121-170`(handoff 判定) | 右栏只收 action_required;attention 档缺失 |
| 执行日志计时器 | multica `execution-log-section.tsx:322-334`(运行中每秒跳动时长) | 运行画布应有"跑了多久" |
| 语义块时间线 | routa `src/client/components/event-bridge-trace-panel.tsx:24-64`(12 类语义块着色,按轮次分组;工具分类在后端完成,前端零推断) | 历史回放按语义类着色/过滤,比原始日志流可读性高一档 |
| handoff/受阻可视化 | routa `models/task.ts:154-168`(clarification/rerun 等 5 类交接单)+ multica blocked+评论语义 | 受阻要进人的视野,不是静默卡住 |
| [STEER] 中途插话 | multica `daemon.go:9314-9328` | 需后台执行器支持,本轮不做(见 §4) |
| 评论五级路由+触发回执 | multica `comment.go:2798-2887` + trigger_outcomes | 需服务端路由,本轮不做(见 §4) |

## 2. 本轮落地(四件套,全部 A 类纯前端)

数据与分类的单一事实源:`custom/client/ia2/adapters/activity.ts`(纯函数,测试直连)。

### 2.1 活动存在感(左栏循环行)

- `loopRunActivity(runs)` → `Map<loopId, {running, awaiting, failed}>`(graphId `loop-<id>` 约定)。
- `FlowNavPanel` 新增可选 prop `loopActivity`:running>0 渲染 `●N` 呼吸脉冲(title=运行数)。
- awaiting 档不重复投影——`loopRow.awaitingYou` 已表达(v12 既有)。

### 2.2 需关注分诊(右栏 attention 节)

- `buildAttention(tasks, runs, now)` 三源:kanban `blocked` 任务(task-blocked)、
  `failed` 运行(run-failed)、事件含 `loop.stuck` 的运行(loop-stuck;同 run 与
  failed 去重取 stuck——原因更可行动)。
- 与 buildWaiting 的边界(纪律):awaiting-input 是「等我」(action_required 档),
  此处只收不需点击但需人过目的异常态——两档分诊对齐 multica severity 模型。
- `AttentionList.vue` 纯展示;行点击分派在 WorkbenchView:任务→看板预选,
  运行→所属循环画布,兜底全局时间线。

### 2.3 语义块回放(运行画布历史)

- `classifyRunEvent(name)`:七类(node/step/stage/interrupt/lifecycle/cost/other),
  双词汇通吃(socket `graph.*`/`interrupt.*`/`cost.*`/`loop.*` ∪ 日志 `completed`/
  `error-routed`/`interrupted`/`resumed`)。
- 历史视图:语义分布条(占比分段)+ 过滤 chips(全部/单类开关)+ 编年行按类
  着色(行图标+左侧色条,interrupt 暖色提醒人为介入点)。
  对照 routa 的教训只做分类投影、不做前端推断语义。

### 2.4 运行耗时徽章(运行画布实时)

- running 态渲染 `⏱ <elapsed>`,数据 = WorkbenchView 投影的 run 首事件时刻;
  复用共享 30s 时钟 `useNowTick`(不新增 interval)与 `formatWaitAge` 单一格式源。

### 2.5 i18n

新键走 patch `350-client-i18n-comm-v13.patch`(zh/en 各+:act.running / att.* /
rc.elapsed / rc.semAll / rc.sem.{七类});`ia2-i18n-coverage` 守门测试覆盖。

## 3. 验证

- 新增 `__tests__/activity.test.ts`(32 例:三组纯函数+双词汇分类表+边界);
  扩 `run-canvas.test.ts`(+4 例:分布条/过滤/行类名/耗时徽章);
  新增 `comm-v13-panels.test.ts`(4 例:attention 节交互+脉冲投影+向后兼容)。
- 门禁:overlay 全量 vitest(含 i18n 覆盖守门)。构建门禁(vite build)按惯例在
  发布切版时于共享 checkout 执行——本轮开发在独立 worktree,不动共享上游状态。

## 4. 未做但已论证(后台依赖,后续轮次)

1. **[STEER] 运行中插话**:需执行器把人类评论包装注入活跃 turn(multica daemon.go:9314)。
2. **@提及五级路由+触发回执 chips**:需服务端评论路由与 trigger_outcomes 字段。
3. **证据包门禁+verdict 自动归位**(routa transition-gates/review-lane-convergence):
   需任务工件模型;「等我」队列是天然挂点。
4. **run 行内联 retry/逐 run 成本**:需 runs 台账补成本与重跑端点(multica execution-log §4.2)。
5. **收件箱偏好分组**(assignments/comments/mentions/agent_activity):通知中心已有底座
   (NotifyDropdownPanel/notify-read),缺偏好层。
