# P2：运行中心——图执行的前端呈现 + R1 每日 Brief + P2 台账清偿

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图执行对五种角色可见可介入：服务端清偿 P1 终审遗留台账（调度/超时/judge 结构/kanban persistence），前端交付运行中心（运行列表双轴 + 执行图画布 + 时间轴回放 + 节点检查器 + 介入收件箱 + 三级分辨率），并交付 R1 每日聊天 Brief（结构化汇总版）。

**Architecture:** 服务端 4 个任务（A1-A4）全部落在 `custom/server/loop/graph/` 既有模块的收口与补全，不动内核语义；前端 4 个任务（B5-B8）新建 `custom/client/loop/runcenter/`（视图/store/api/adapter），复用既有 loop 前端注册模式（`registerRoute`）与 vue-flow 依赖（RunTraceGraph 已在用），新路由挂 `/hermes/loop/runs` 与 `/hermes/loop/runs/:runId`。R1 Brief 实现为系统内置的每日 cron run（RunSpawner 直接触发，非 LLM 依赖——结构化汇总从事件日志聚合）。

**Tech Stack:** TypeScript / Koa / Socket.IO / Vue 3 + Pinia / vue-flow / Vitest（node + jsdom 按需）。

## Global Constraints

- 上游零污染：只改 `overlay/custom/`、`overlay/patches/`、`overlay/docs/`；patch 修改走 series 体系。
- 门禁：`npm test` 全绿（基线 745 过 / 6 skip）；涉及 patch 时 `npm run clean && npm run inject` 验证。
- 内核语义勿翻案（P1 已定）：run=一 tick、handoff/stop-check joinMode 'any'、审批 interrupt 自路由 + attempts 后缀 + 前缀匹配、stage/repairNeeded 布尔通道谓词、shadow 对比词汇表。
- 前端视觉遵循 Pure Ink（黑白灰 + error/warning/success 三色）；新 UI 文案走 i18n（默认中文，en 同步补）。
- 前端组件测试放 `runcenter/__tests__/`，jsdom 指令按需（参照 cockpit/loop 既有测试模式）。
- 所有 run 可见状态来自事件日志投影或 REST，不引入第二状态源。
- spec 依据：§7B.1（三级分辨率/peek-attach/收件箱/合法操作集/绑定协作物）、§7B.3（双轴/熔断）、§7A R1（每日 Brief 三段式：进展/等你决策/今日计划）。

---

### Task A1: 调度收尾三连（P2 台账 ①②④）

**Files:**
- Modify: `custom/server/loop/graph/graph-assembly.ts`（scheduleLoop）、`run-spawner.ts`（熔断）、`graph-socket.ts` 或装配侧（tryBindSocket）
- Test: `custom/client/loop/graph/__tests__/` 追加

**行为规格（逐条）：**
1. **on 模式新建 cron loop 自启**（台账①）：`loopTickTarget.scheduleLoop` 对 `nextTickAt == null` 的 loop 调 `computeNextTick(loop)`（复用 scheduler.ts 既有 cron 计算逻辑，提取共享或导入）算出首次时间、经 store 写回 loop.nextTickAt，再走既有到期判断。测试：创建带 cron schedule 的 loop（未手动 tick 过）→ scheduleLoop → 断言 nextTickAt 落库且 poll 周期内触发首 run。
2. **熔断盲区**（台账④）：`maxConsecutiveFailures` 只计 `graph.failed`，"正常完成但不收敛"的 run（stopMet 永假且无新产物——判定：run completed 但 `contracts`/`verifications` 通道无新增，连续 N 次）重置计数导致无限重排。修：spawner 维护 per-loop `stagnantCount`，run 完成时若产出通道无增量则 ++，达阈值（复用 maxConsecutiveFailures）触发 `loop.stuck` 告警 + paused（与失败熔断同路径）。
3. **C4 补试承诺兑现**（台账②）：`bridgeLoopEvent` 在 socket 未绑定时调 `tryBindSocket()`（每事件至多触发一次尝试，节流），或修正 warn 文案与注释——二选一，实现者选补试（更符合原承诺），节流用时间戳（≥2s 间隔）。

**Interfaces:** `RunSpawner` 新增可选 opts `stagnationLimit?: number`（默认= maxConsecutiveFailures）；`computeNextTick` 从 scheduler.ts 导出（若已是模块函数则直接导入）。

- [ ] Step 1-5: TDD 三项各自先红后绿 → `npm test` → Commit `fix(graph): P2 台账①②④——cron 自启/停滞熔断/socket 补试`

---

### Task A2: interrupt 超时策略（P0 台账 h 项）

**Files:**
- Create: `custom/server/loop/graph/interrupt-timeout.ts`
- Modify: `run-spawner.ts`（poll 循环内扫描）或 `graph-assembly.ts`（挂载扫描器）
- Test: `custom/client/loop/graph/__tests__/interrupt-timeout.test.ts`

**行为规格（spec §4）：**
- `class InterruptTimeoutScanner { constructor(opts: { graphService: GraphService; eventLog: EventLogStore; defaultTimeoutMs?: number /* 默认 72h */; intervalMs?: number; clock?: () => number }) ; start()/stop() }`
- 扫描逻辑（挂在 spawner poll 同周期或独立 interval）：遍历注册表中 `awaiting-input` 的 run → 取最新 checkpoint 的 `pendingInterrupts[].raisedAtMs`（**需扩展 StoredCheckpoint**：pendingInterrupts 元素加可选 `raisedAtMs?: number`；runtime 记录 interrupt 时写入；旧 checkpoint 无此字段则回退 checkpoint.createdAt 时间戳）→ 超时执行 `onTimeout` 策略：
  - `escalate`（默认）：发 `loop.escalated` 兼容事件（matrix-bot 通道可消费）+ run 保持 awaiting-input（不自动决策）+ 每 24h 重发一次告警（节流）
  - `auto-approve-with-log`：自动 resume 值 `{ auto: true, decision: 'approved', reason: 'timeout' }`（审批通道消费时能识别 auto）+ interrupt.resumed 事件 payload 带 `autoApproved: true`
  - `fail`：run 置 failed（发 graph.failed，error 含 'interrupt timeout'）
- 策略来源：human/gate 节点 config 的 `timeout: { ms?: number; onTimeout?: 'escalate'|'auto-approve-with-log'|'fail' }`（phase-nodes 的 approval config 扩展，缺省 escalate + 72h）；run 级兜底默认 72h + escalate。
- 判定数据源是 checkpoint（持久），服务重启后扫描自然恢复——不引入内存态。

- [ ] Step 1-5: TDD（fake clock；三策略各 1 例 + 旧 checkpoint 回退 + 24h 重发节流）→ Commit `feat(graph): interrupt 超时策略——escalate/auto-approve/fail + 72h 默认`

---

### Task A3: graph_specs 表化 + judge pending 结构（P2 台账 ③⑥）

**Files:**
- Modify: `custom/server/loop/graph/event-log-store.ts`（specs 表 CRUD）、`types.ts`（VerificationRecord 扩展）或 verifier 相关类型
- Modify: `graph-assembly.ts` / `graph-rest.ts`（specs 端点切表）
- Test: 追加

**行为规格：**
1. **specs 表**（台账⑥，替换 `.loop/graph-specs.json` 文件）：SqliteEventLogStore 增加 `graph_specs(id TEXT PRIMARY KEY, version INTEGER, spec_json TEXT, updated_at TEXT)`；`EventLogStore` 接口增加 `saveSpec(spec: { id, version, spec: unknown }): Promise<void>` / `getSpec(id): Promise<{id, version, spec} | null>` / `listSpecs(): Promise<Array<{id, version, updatedAt}>>`；InMemory 同步实现。装配层写 specs 处（当前 JSON 文件）切到表；文件读取保留为迁移兜底（表空时读一次文件灌入）。测试：表 CRUD + 文件迁移兜底 + REST GET /api/graph/specs 不变。
2. **judge pending 结构**（台账③前置）：`VerificationRecord`（verifier.ts 的记录类型）judge 结果项扩展 `status: 'passed' | 'failed' | 'pending' | 'skipped'`（默认 skipped，兼容既有数据）；`callJudge` dep 类型扩展为可选返回 `pending`（`{ status: 'pending', reason: string } | { score: number, reasoning: string }` 联合）；verifier 对 pending 的处理=与无 judge 相同（跳过该项，overall 由其余项决定）但**记录 pending 状态**——为 P3 接真实 LLM judge 留好结构。**本任务不接真实模型调用**。测试：pending judge 不影响 overall、记录里能看到 status。
3. **loop-to-graph 委托编译器**（P1 已声明偏差）：`loopToGraphDef` 内部改为调 `compileLoopToSpec` 再投影（REST 形状不变，删 deprecated 标注）。回归：loop-to-graph.test.ts 全绿（若投影形状差异需逐字段核对并适配）。

- [ ] Step 1-5: TDD → Commit `feat(graph): specs 表化 + judge pending 结构 + loop-to-graph 委托编译器`

---

### Task A4: persistence 真实 kanban 写入（P2 台账 ④/⑤中之 persistence DI）

**Files:**
- Create: `custom/server/loop/graph/kanban-persistence.ts`
- Modify: `graph-assembly.ts`（engineDeps.persistence 换真实现；dryRun 语义不变）
- Test: `custom/client/loop/graph/__tests__/kanban-persistence.test.ts`

**行为规格：**
- `class KanbanPersistenceAdapter implements PersistenceAdapter { constructor(deps: { kanban: typeof import('../../../../services/kanban/kanban-service'); boardResolver: (loop: LoopInstance) => string | null }) }`
- `persist(contract, verification, loop, dryRun)`：dryRun=true 保持现状（事件+日志，无写入）；否则：
  - `kanbanCli.createTask({ board, title: `[${loop.name}] ${contract.id}`, body: 产物摘要（verification 结果 + artifact），assignee: loop 的 owner/tenant 映射，author: 'graph-engine' })`
  - 幂等：按 `contract.id` 查重（listTasks 按 title 前缀或 custom field——取 kanban-service 支持的最简方式；重复 persist 跳过并 warn）
  - 失败不炸 run：捕获错误 → emit `loop.persist-failed` 事件（loopId/contractId/error）+ 返回 `{ ok: false, error }`；persistence 节点将该契约标记 persist-failed 进 repairQueue（走既有守卫回边）
- `boardResolver` 默认实现：loop.tenant 六段解析出 board（复用 cockpit/tenant-parser 的服务端等价逻辑；解析不出 → 返回 null → persist 跳过 + warn）
- 装配：patch 202 的 engineDeps.persistence 从 stub 换 `new KanbanPersistenceAdapter(...)`；README caveat 更新（P1 交付机制 → P2 真实写入）
- 测试：mock kanbanCli；断言 createTask 参数、幂等跳过、失败→repairQueue、dryRun 零调用

- [ ] Step 1-5: TDD → patch 202 修改后 `npm run clean && npm run inject` 验证 → Commit `feat(graph): persistence 真实 kanban 写入（幂等+失败走 repair）`

---

### Task B5: 运行列表（socket 客户端 + store + 视图骨架）

**Files:**
- Create: `custom/client/loop/runcenter/api.ts`、`store/runs.ts`、`views/RunCenterView.vue`、`components/RunListTable.vue`、`components/RunStageBadge.vue`
- Modify: `custom/client/loop/index.ts`（注册 `/hermes/loop/runs` 路由 + LoopSpineView 顶栏入口按钮）、i18n patch（zh/en）
- Test: `custom/client/loop/runcenter/__tests__/`

**行为规格：**
- `api.ts`：REST 封装（GET /api/graph/runs、GET /api/graph/runs/:id、POST resume/fork、GET replay；复用 `@/api/client` 的 token/baseUrl 模式，参照 `custom/client/loop/api/loop-rest.ts`）
- `store/runs.ts`（Pinia）：runs 列表、selectedRun、socket 订阅（`/graph` namespace，事件增量更新对应 run 的 status/currentStep/最后活动时间）；断线重连 + resubscribe（参照 loop store 的去重修复模式）
- **RunListTable（Summary 档）**：
  - 列：状态徽标（running 绿点呼吸/awaiting-input warning/completed/failed）、**业务阶段列**（双轴：从事件日志的 stage-transition 推导 discovery/handoff/validation/persistence/gate/stop 阶段名——纯前端投影函数 `deriveStage(events)`）、迭代数、最后活动（相对时间）、成本、操作
  - 排序：awaiting-input 优先（"待我处理"置顶）→ 最后活动倒序
  - **合法操作集**（转换是按钮）：awaiting-input→[查看审批]；running→[peek]；completed/failed→[回放][fork]；全部→[详情]。按钮显隐由 status 驱动（RunListTable 内映射表），不存在任意跳转
  - 空态引导（R4）：无 run 时三步引导文案（选模板→设节奏→跑起来）
- 视图骨架：顶部工具条（筛选 status/搜索）+ 表格 + 底部分页（虚拟滚动可后置 P3）
- i18n：新 key 经 `scripts/add-i18n-keys.mjs` 体系注入（zh 主文案 + en 同步）

- [ ] Step 1-5: TDD（store 投影函数与操作映射表单测优先；组件 jsdom 冒烟）→ Commit `feat(loop): 运行中心列表——双轴/合法操作集/待我处理排序`

---

### Task B6: 运行详情——执行图画布 + 时间轴回放 + 三级分辨率

**Files:**
- Create: `custom/client/loop/runcenter/views/RunDetailView.vue`、`components/RunGraphCanvas.vue`（vue-flow）、`components/RunTimeline.vue`、`composables/useRunReplay.ts`、`adapters/run-graph.ts`（事件日志→图布局数据）
- Modify: `custom/client/loop/index.ts`（`/hermes/loop/runs/:runId` 路由）
- Test: `runcenter/__tests__/`（adapter 投影函数 + composable）

**行为规格：**
- **run-graph adapter**（纯函数，重点测试）：`buildRunGraph(specOrTopology, events) → { nodes: [{ id, label, type, status: idle|running|done|failed|awaiting-input|skipped, iteration, durationMs }], edges: [{ id, from, to, taken, guard? }] }`——拓扑来源：GET /api/graph/specs/:id（编译产物 GraphSpec 的 nodes/edges）；事件投影：node.started→running、node.completed→done、node.failed→failed、interrupt.raised→awaiting-input、同节点多次完成取 iteration 最大值显示迭代徽标
- **RunGraphCanvas**：vue-flow 只读画布（无编辑）；节点状态着色（Pure Ink：done=灰实、running=描边动画、failed=error 色、awaiting-input=warning 色）；回边画为虚线弧（guard 徽标显示 maxIterations）；点击节点→emit 选中（B7 检查器消费）
- **RunTimeline（回放）**：横向 scrubber（复用 RunTraceScrubber 交互模式但不直接依赖 RunTrace 组件）+ 播放/暂停/倍速；拖动游标 → 按事件 ts 过滤 → 图状态重投影（time-travel 即"重放至第 N 事件"）；`useRunReplay(events)` composable 管理 `cursorIndex/playback` 状态
- **三级分辨率**（§7B.1）：详情页右上三档切换——Summary（只显示节点级结果行）/ Normal（节点 started/completed + 路由事实）/ Verbose（全事件含 payload JSON 可展开）；同一事件数组三种渲染投影函数 `projectEvents(events, mode)`
- REST 数据：`GET /api/graph/runs/:id/replay` 一次拉全量事件（P2 规模内不分页）

- [ ] Step 1-5: TDD（adapter/投影函数/composable 单测为主；canvas 组件 jsdom 冒烟）→ Commit `feat(loop): 运行详情——执行图+时间轴回放+三级分辨率`

---

### Task B7: 节点检查器 + 介入收件箱（peek/attach）

**Files:**
- Create: `runcenter/components/NodeInspector.vue`、`runcenter/components/ApprovalPanel.vue`、`runcenter/components/InboxPanel.vue`
- Modify: `RunDetailView.vue`（右侧检查器槽）、`RunCenterView.vue`（收件箱 tab）、`store/runs.ts`（inbox 状态）
- Test: 追加

**行为规格：**
- **NodeInspector（attach 档）**：选中节点显示——类型/状态/迭代数/耗时、最近一次 update 的 channel 键值（来自 node.completed payload）、错误信息（failed 时人类可读原因 + 建议动作：重试=手动 re-run 该节点后续 P3，本期提供"重跑整个 run"）、关联事件列表（Verbose 档）
- **Peek（列表行内）**：行展开显示该 run 最新 3 条事件摘要 + awaiting-input 时内联审批按钮（approve/reject），不用进详情页
- **ApprovalPanel**：显示 interrupt payload（prompt/契约摘要/policy/approvers）+ approve/reject 输入（reject 必填原因）→ POST resume → store 乐观更新；识别 `auto: true` 的 resume 值显示"超时自动通过"标记（A2 联动）
- **InboxPanel（收件箱两态，§7B.1/Codex）**：awaiting-input runs 分"待处理/已归档"两 tab；待处理=全部 awaiting-input；用户点"归档"仅本地 kv 标记（不改 run 状态）；空态文案
- 节点级 restart：本期只提供 run 级"从失败重跑"（POST resume 不适用——用 fork + startRun 语义；如无现成端点，按钮置灰 tooltip"随 P3 交付"）

- [ ] Step 1-5: TDD（审批提交/两态切换/peek 投影）→ Commit `feat(loop): 节点检查器+介入收件箱——peek/attach/审批/两态归档`

---

### Task B8: R1 每日 Brief（结构化汇总版）

**Files:**
- Create: `custom/server/loop/graph/daily-brief.ts`
- Modify: `graph-assembly.ts`（注册内置 cron 图模板）或 run-spawner（特殊调度）
- Test: `custom/client/loop/graph/__tests__/daily-brief.test.ts`

**行为规格（spec §7A R1）：**
- **实现形态**：**不是**通用图模板（避免为一个功能造 LLM 节点）——`DailyBriefJob` 挂 RunSpawner 的 poll（每日固定时刻，默认 09:00，可配 `LOOP_BRIEF_CRON`）：
  1. 从主事件日志聚合过去 24h：完成的 run（含 loop 名/迭代数）、失败的 run（错误摘要）、awaiting-input（等谁/多久）、stagnant/熔断告警
  2. 生成三段式文本（克制成三段：**进展 / 等你决策 / 今日计划**——今日计划=到期未触发的 loop 清单）
  3. 投递：matrix-bot 通道（复用 emitLoopEvent 桥 + m.loop.notification 格式）到配置的房间（`LOOP_BRIEF_ROOM`，未配置则只落事件日志）
  4. Brief 自身作为一条 run 记录入事件日志（graphId='daily-brief'，可回放可审计）
- 零数据日不发送（避免刷屏）；聚合文本生成是纯函数 `renderBrief(aggregate) → string`（重点测试）
- 后续 LLM 增强（人话化摘要）标注为 P3+，本期结构化足够

- [ ] Step 1-5: TDD（聚合/渲染/零数据跳过/投递 mock）→ Commit `feat(graph): R1 每日 Brief——三段式结构化汇总 + Matrix 投递`

---

### Task A5（收口）: P2 验收 + 文档

- 全量门禁：`npm test` + `npm run clean && npm run inject && npm run build:full`（前端任务后必跑）
- README：运行中心章节（入口/能力/三级分辨率说明）替换 Loop Engineering 章节相应段落
- kernel-notes 台账核销（interrupt 超时/specs 表/persistence/judge 结构状态更新）
- E2E 冒烟测试：装配 on 模式 → 创建 loop → spawner 触发 → REST 列表/详情/replay → resume 审批 → Brief job 手动触发一次 → 断言事件链完整（扩展 graph-e2e.test.ts）
- Commit `docs(loop): P2 收口——运行中心文档 + 台账核销`

---

## Self-Review 记录

- **Spec 覆盖**：§10 P2 行（运行中心五件套 + R1 Brief）→ B5-B8；§7B.1 P2 项 → B5（合法操作集/Summary 档/收件箱）、B6（三级分辨率）、B7（peek/attach/两态）；§7B.3 双轴 → B5 阶段列；P2 台账八条 → A1（①②④）、A2（h 项）、A3（③⑥）、A4（persistence DI）；§7A R1 → B8。
- **裁剪声明**：节点级单点 restart 本期置灰（依赖 fork+startRun 语义完善，P3）；虚拟滚动 P3；LLM 增强摘要 P3+；绑定 PR（§7B.1）依赖 kanban/PR 关联基建，P3 与工作项关联一起做。
- **依赖序**：A1-A4 相互独立可并行；B5 依赖服务端既有 REST（P1 已交付）；B6/B7 依赖 B5 的 store/api；B8 独立于 B 系列。建议执行序：A1→A2→A3→A4→B5→B6→B7→B8→A5。
