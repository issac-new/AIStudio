# P1：生产切换——图内核接管 Loop 执行（编译器 + 装配切换 + 断链修复 + 双跑）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 P0 交付的图内核接入生产：LoopInstance 经编译器变为 GraphSpec 由 GraphService 执行（feature flag 双跑），修复四大断链（stopCondition 评估、persistence 真实副作用、成本记账、审批装配），落地 R2（workspace 上下文注入）与 R3（质量门禁 gate 节点内建），调度器收敛，旧数据迁移。

**Architecture:** 以 P0 内核（`custom/server/loop/graph/`：GraphService / GraphRuntime / GraphSpec / EventLogStore）为执行主干。新增 `graph-compiler.ts`（LoopInstance→GraphSpec，节点绑定真实阶段函数）与 `run-spawner.ts`（CentralizedScheduler 升级为按 cron/webhook 对 GraphSpec 发起 run）；新增 B 类 patch 改造服务端装配（134 重接 + graph REST/Socket 真实化）。双跑护栏：`GRAPH_ENGINE=legacy|shadow|on`（默认 legacy，P1 验收后切 on）。

**Tech Stack:** TypeScript / Koa（patch 注入上游 server）/ Socket.IO / node:sqlite / Vitest。

## Global Constraints

- 上游零污染：只改 `overlay/custom/`、`overlay/patches/`（新增 patch 走 series 追加）、`overlay/scripts/`、`overlay/docs/`；禁止直接改 `upstream/`。
- 双跑纪律：`LoopEngine.tick` 路径在 P1 全程保留可回退；`GRAPH_ENGINE` 默认 `legacy`；shadow 模式下新引擎执行但**不写任何对外副作用**（persistence 的 kanban/commit/PR 在 shadow 下 dry-run 记日志）。
- 既有行为兼容：`loop.*` Socket.IO 事件序列在编译产物上保持（前端无感）；既有 loop REST 端点（`controllers/loop.ts`）全部保留。
- 每期门禁：`npm test` 全绿（P0 基线 615 过 / 6 skipped）+ `npm run build:full` 通过（含 inject）。
- P0 内核笔记（`docs/superpowers/specs/2026-09-09-loop-graph-p0-kernel-notes.md`）§7 台账 a-n 中标注"开工前必办"的条目并入对应任务验收。
- GraphService 装配时 checkpointManager 与 eventLog 同实例（P0 Task 5/7 约束）。
- R2/R3（spec §7A）为本期正式需求，验收见 Task 5/6。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `custom/server/loop/graph/graph-compiler.ts` | LoopInstance → GraphSpec 编译器（五阶段节点 + 守卫 repair 回边 + gate 节点 + stopCondition 条件节点） | 新建（P1 核心） |
| `custom/server/loop/graph/phase-nodes.ts` | 五阶段节点工厂（绑定 connectors/worktree+dispatcher/verifier/persistence 真实实现） | 新建 |
| `custom/server/loop/graph/workspace-context.ts` | R2：GRAPH-CONTEXT.md 物化 + CLAUDE.md/AGENTS.md 引用注入 | 新建 |
| `custom/server/loop/graph/run-spawner.ts` | CentralizedScheduler 升级：到期 LoopInstance → GraphService.startRun | 新建（替代 scheduler 装配） |
| `custom/server/loop/graph/shadow-runner.ts` | 双跑：同输入跑新引擎、事件序列对比、dry-run 副作用 | 新建 |
| `custom/server/loop/graph/graph-rest.ts` | graph REST 真实化（run CRUD/resume/fork/replay/stream） | 新建（替换 controllers/graph.ts 的 stub） |
| `custom/server/loop/engine/budget-guard.ts` | estimateTickCost bug 修复（台账 g） | 修改 |
| `custom/server/loop/graph/graph-service.ts` | 台账 a/b/c：fork 语义固定、registry 从 eventLog 重建、三处收紧 | 修改 |
| `custom/server/loop/graph/predicate.ts` / `graph-spec.ts` | 台账 f：Object.hasOwn / getPath 原型链 / PredicateError.name / 结构校验 | 修改 |
| `patches/19x-loop-graph-assembly.patch` | 服务端装配：GraphService + run-spawner + REST/Socket 挂载 + GRAPH_ENGINE 开关 | 新建（B 类） |
| `scripts/graph-migrate.mjs` | 旧 LoopInstance 数据迁移为 GraphSpec + 首个 run | 新建 |
| `custom/server/loop/graph/graph-service.ts` 等 | 台账 d/e/h-n 顺手项 | 修改 |

> 注：本计划按惯例只列任务级 TDD 步骤；各任务的完整测试/实现代码在 task brief 提取时由实现者按本计划"行为规格"小节落实。与 P0 计划同等粒度——关键测试与实现代码直接内联。

---

### Task 1: GraphService 加固（台账 a/b/c 一次性收口）

**Files:**
- Modify: `custom/server/loop/graph/graph-service.ts`
- Modify: `custom/server/loop/graph/event-log-store.ts`（run 元信息查询支撑 registry 重建）
- Test: `custom/client/loop/graph/__tests__/graph-service-hardening.test.ts`

**Interfaces:**
- Produces:
  - `GraphService.rebuildRegistryFromLog(): Promise<number>`——扫描 eventLog 全部 run（按 `run.started` 事件聚 graphId/runId），为每个 run 重建注册表条目：状态推导规则=有 `run.completed/run.failed` → 对应终态；有未应答 `interrupt.raised` → `awaiting-input`；有 checkpoint → `paused`；返回重建条数。**注意**：运行中的 run（running）重启后不可能仍在跑——重建为 `paused`，由人工或调度器决定续跑。
  - `GraphService.resumeRun` 增加校验：`interruptId` 必须 ∈ 最新 checkpoint 的 `pendingInterrupts`，否则抛 `Unknown interrupt: <id>`（台账 c-2）。
  - `GraphService.startRun(graphId, initialState?, runId?)` fork 分支增加校验：传入 runId 的 graphId 必须与参数 graphId 一致，否则抛错（台账 c-1）。
  - `GraphService.getRun` 返回浅拷贝 `{ ...rec, instance: { ...rec.instance } }`（台账 c-3）。
  - **fork 续跑语义固定（台账 a，裁决）**：fork 产物恢复执行时**不自动应答** interrupt——`startRun` 第三参消费 forkBase 时，若基底 checkpoint 有 pendingInterrupts，run 直接进入 `awaiting-input` 等待真人 resume（interrupt payload 原样保留）；无 pendingInterrupts 则从基底 checkpoint 的 nextNodes 继续执行。删除"以元数据自动应答首条 interrupt"的隐式行为，改为显式语义。

- [ ] **Step 1: 写失败测试** `graph-service-hardening.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/graph-service-hardening.test.ts
import { describe, it, expect } from 'vitest'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode, humanNode } from '../../../../server/loop/graph/graph-definition'
import { reducers, type StateValues } from '../../../../server/loop/graph/types'

function approvalGraph(id = 'approval-flow') {
  return new GraphBuilder(id, 'Approval')
    .addChannel('steps', { reducer: reducers.append(), default: [] as string[] })
    .addNode(fnNode('work', async () => ({ update: { steps: ['work'] } })))
    .addNode(humanNode('gate', 'approve?'))
    .addNode(fnNode('finish', async (s: StateValues) => {
      const key = Object.keys(s).find(k => k.startsWith('__resume:'))
      return { update: { steps: [`finish:${String(key ? s[key] : 'no-resume')}`] } }
    }))
    .setEntry('work').addEdge('work', 'gate').addEdge('gate', 'finish')
    .build()
}

describe('registry rebuild from event log', () => {
  it('rebuilds run list with derived statuses after restart', async () => {
    const log = new InMemoryEventLogStore()
    const svc1 = new GraphService({ eventLog: log })
    svc1.registerGraph(approvalGraph())
    const { runId: doneRun } = await svc1.startRun('approval-flow')
    // 再跑一个并完成它（走无 interrupt 的图）
    svc1.registerGraph(new GraphBuilder('plain', 'P')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({}))).setEntry('a').build())
    const { runId: plainRun, instance } = await svc1.startRun('plain')
    expect(instance.status).toBe('completed')

    // 模拟进程重启：新 service、同一 eventLog
    const svc2 = new GraphService({ eventLog: log })
    svc2.registerGraph(approvalGraph())
    svc2.registerGraph(new GraphBuilder('plain', 'P')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({}))).setEntry('a').build())
    const rebuilt = await svc2.rebuildRegistryFromLog()
    expect(rebuilt).toBe(2)
    expect(svc2.getRun(doneRun)?.status).toBe('awaiting-input')
    expect(svc2.getRun(plainRun)?.status).toBe('completed')
  })
})

describe('resume/input validation', () => {
  it('rejects unknown interruptId', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    await expect(svc.resumeRun(runId, 'bogus-id', 'yes')).rejects.toThrow(/interrupt/i)
  })

  it('getRun returns a defensive copy', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const rec = svc.getRun(runId)!
    rec.instance.status = 'failed' // 外部污染
    expect(svc.getRun(runId)?.status).toBe('awaiting-input')
  })
})

describe('fork resume semantics (fixed)', () => {
  it('fork of an interrupted run resumes as awaiting-input, never auto-answers', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forked } = await svc.forkRun(runId, 1)
    // fork 产物进入 awaiting-input（继承基底的 pendingInterrupt），不自动应答
    const started = await svc.startRun('approval-flow', undefined, forked)
    expect(started.instance.status).toBe('awaiting-input')
    // 真人 resume 后正常走完
    const cp = await svc['eventLog'].getLatestCheckpoint(forked)
    const done = await svc.resumeRun(forked, cp!.pendingInterrupts[0].id, 'human-yes')
    expect(done.status).toBe('completed')
    const steps = done.state.steps as string[]
    expect(steps.some(s => s.includes('human-yes'))).toBe(true)
  })

  it('startRun with mismatched graphId for fork runId throws', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forked } = await svc.forkRun(runId, 1)
    await expect(svc.startRun('plain', undefined, forked)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/graph-service-hardening.test.ts`
Expected: FAIL（rebuildRegistryFromLog 不存在 / 校验未加 / fork 语义旧）

- [ ] **Step 3: 实现**

`graph-service.ts` 按接口规格修改；`event-log-store.ts` 增加 `listRuns(): Promise<Array<{ runId: string; graphId: string }>>`（`SELECT DISTINCT run_id, graph_id FROM graph_events`，内存版同样实现）。fork 语义改动的落点：`startRun(graphId, initialState?, runId?)` 中 forkBase 分支——有 pendingInterrupts 时实例置 `awaiting-input` 并原样保留 interrupts（把基底 checkpoint 存为新 run 的起点 checkpoint），无则 `resumeFromCheckpoint` 语义续跑（不发 interrupt.resumed）。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/ && npm test`
Expected: 新测试 6 例过；全量绿（Task 7 旧 fork 测试若不兼容新语义，更新它并说明）

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/graph/graph-service.ts custom/server/loop/graph/event-log-store.ts custom/client/loop/graph/__tests__/
git commit -m "feat(graph): GraphService 加固——registry 重建/fork 显式语义/三处收紧"
```

---

### Task 2: 谓词/Spec 收紧（台账 f + d/e/k/l/m/n 顺手项）

**Files:**
- Modify: `custom/server/loop/graph/predicate.ts`（Object.hasOwn 不适用这里——f 项归属 graph-spec；本文件改 getPath 原型链 + PredicateError.name + and/or/not 结构校验）
- Modify: `custom/server/loop/graph/graph-spec.ts`（reducers 判定改 Object.hasOwn；onError target 校验；addConditionalEdge guard 参数经 graph-definition.ts）
- Modify: `custom/server/loop/graph/graph-definition.ts`（addConditionalEdge 加 guard 参数，台账 l）
- Modify: `custom/server/loop/graph/graph-runtime.ts`（node.starved 补发 endCondition/hasEnd 路径，台账 n）
- Test: 各文件对应测试追加用例（不新建文件）

**Interfaces:**
- Consumes/Produces：均为既有模块内聚修改，对外签名变化仅 `GraphBuilder.addConditionalEdge(source, condition, label?, guard?)`。

**行为规格（逐条落实台账）：**
- f1 `graph-spec.ts` 校验 reducer：`'constructor' in reducers` → `Object.hasOwn(reducers, ch.reducer)`
- f2 `predicate.ts` getPath：只读自有属性（`Object.hasOwn`/hasOwnProperty），原型链不再命中
- f3 `PredicateError` 设 `this.name = 'PredicateError'`；and/or/not 缺 exprs/expr 抛 PredicateError（结构校验）
- f4 `graph-spec.ts` 校验 onError.goto/retry-goto 的 target 必须是已知节点
- k 台账：join-with-loop 与 guard-across-resume 已在终审固化（本任务无新增）；本任务补 **maxDurationMs 熔断**与 **retry-goto 计数**两条测试
- l 台账：`addConditionalEdge(source, condition, label?, guard?)`——guard 存在时条件命中的 target 构成回边也必须过环检测；build() 校验扩展：条件边 target 在求值前未知，因此**凡条件边带 guard 时记录，凡条件边不带 guard 且图内存在路径回到 source 时 build() 抛错**（保守近似：条件边把 source 可达集并入环检测）
- n 台账：`emitStarvedJoins` 在 hasEnd/endCondition 完成路径也调用（run 结束前统一扫一次）
- d 台账：types.ts 旧 Checkpoint 已删（终审顺手完成），本任务验证无残留
- e 台账：checkpoint-manager.test.ts 追加 joinLedger fork 隔离用例
- m 台账：event-log-store.ts 头注释修正（顶层静态 import 的真实降级边界）

- [ ] **Step 1: 追加失败测试**（每小项 1-2 例：Object.hasOwn 拒绝 'constructor'、getPath('__proto__') undefined、PredicateError.name、and 缺 exprs 抛 PredicateError、onError target 校验、maxDurationMs 熔断、retry-goto 计数、addConditionalEdge guard、endCondition 路径 node.starved、fork joinLedger 隔离）
- [ ] **Step 2: 确认失败** → `npx vitest run custom/client/loop/graph/__tests__/`
- [ ] **Step 3: 逐项实现**（每实现一项跑对应测试）
- [ ] **Step 4: 全量回归** `npm test`
- [ ] **Step 5: Commit** `refactor(graph): 台账收口——谓词/spec/构建器收紧与测试补强`

---

### Task 3: 五阶段节点工厂（phase-nodes.ts）——真实阶段函数绑定

**Files:**
- Create: `custom/server/loop/graph/phase-nodes.ts`
- Test: `custom/client/loop/graph/__tests__/phase-nodes.test.ts`

**Interfaces:**
- Consumes：`custom/server/loop/engine/` 的既有模块（connectors ×3、worktree-manager、subagent-dispatcher、verifier）、`store/state-store.ts` 的 LoopStateStore、graph/types 的 NodeDef/NodeResult
- Produces:
  - `interface PhaseNodeDeps { store: LoopStateStore; connectors: Connector[]; worktreeManager: WorktreeManager; dispatcher: SubagentDispatcher; verifier: Verifier; persistence: PersistenceAdapter; dryRun: boolean }`
  - `createPhaseNode(phase: 'discovery'|'handoff'|'validation'|'persistence', loop: LoopInstance, deps: PhaseNodeDeps): NodeDef`——每节点 execute 读 channel 状态、调真实模块、返回 update（含 `contracts`、`verifications`、`stage` 等 channel 键）；**dryRun=true 时 persistence/handoff 的对外副作用只记日志不执行**（双跑护栏）
  - `createGateNode(loop: LoopInstance, deps: { commands: GateCommand[] }): NodeDef`（R3 质量门禁：`GateCommand = { name: string; cmd: string; cwd?: string; timeoutMs?: number }`；逐条 execFile 执行，非零退出即失败；产出 `gateResults: Array<{name, passed, exitCode, durationMs}>` channel）
  - `createStopConditionNode(loop: LoopInstance, deps: { evaluateStop: (stopCondition: string, state: StateValues) => Promise<boolean> }): NodeDef`——真实评估 `loop.stopCondition`（LLM judge 经 deps 注入；默认实现=谓词求值 + 契约状态启发式兜底），产出 `stopMet: boolean` channel
  - channel 键约定（编译器与节点共用，导出常量）：`CH = { contracts: 'contracts', verifications: 'verifications', stage: 'stage', stopMet: 'stopMet', gateResults: 'gateResults', repairQueue: 'repairQueue' }`

**行为规格：**
- discovery 节点：调 connectors[].discover() 聚合产出 TaskContract[] → `update: { contracts: [...] }`（append reducer）+ 无产出时 update `stage:'scheduling'` 供条件边跳过 handoff/validation/persistence
- handoff 节点：每契约 worktreeManager.create + dispatcher.dispatch('maker')；R2 上下文注入在此发生（Task 5 的 workspace-context）；契约状态 in-progress 写回 store
- validation 节点：verifier.verify 逐契约；verifier 生产装配**必须注入** callJudge 与 requestHumanApproval（后者经 `ctx.deps.interrupt` 桥接为 graph interrupt——修复审批断链）
- persistence 节点（真实副作用，台账断链 2）：产物写 kanban 任务（PersistenceAdapter 接口：`persist(contract, verification, loop, dryRun)`）；dryRun 记日志
- gate 节点（R3）：在 persistence 之后、scheduling 之前；失败 → update `repairQueue`（触发守卫回边回 handoff）
- 全部节点发与旧引擎语义对齐的 loop.* 兼容事件（经 ctx.deps.emitEvent 桥接，事件类型保持 `loop.task-discovered / task-handed-off / verification-complete / persisted / stage-transition`）

- [ ] **Step 1: 写失败测试**（每节点 2-3 例：正常路径/空路径/失败路径；mock 全部 deps；重点断言 channel update 键值与 dryRun 无副作用）
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现**
- [ ] **Step 4: 回归** `npm test`
- [ ] **Step 5: Commit** `feat(graph): 五阶段节点工厂——真实阶段函数绑定 + gate/stopCondition 节点`

---

### Task 4: 编译器（graph-compiler.ts）——LoopInstance → GraphSpec

**Files:**
- Create: `custom/server/loop/graph/graph-compiler.ts`
- Modify: `custom/server/loop/graph/loop-to-graph.ts`（只读投影保留但标注 deprecated，委托编译器产出再投影）
- Test: `custom/client/loop/graph/__tests__/graph-compiler.test.ts`

**Interfaces:**
- Consumes：phase-nodes（Task 3）、GraphSpec/hydrate（P0）
- Produces:
  - `compileLoopToSpec(loop: LoopInstance, deps: PhaseNodeDeps & { gateCommands: GateCommand[]; evaluateStop: ... }): GraphSpec`
  - 生成的图结构（节点 id 固定，供事件桥接与 UI 锚定）：

```
discovery →(有契约)→ handoff → validation → persistence → gate ─┐
   │无契约                                                     │gate 通过
   ▼                                                           ▼
 stop-check ◀──────────────────────────────────────────── stop-check
 （repair 回边：gate 失败/validation 失败 → handoff，guard.maxIterations = maxAttempts）
```

  - GraphSpec channels：`contracts`(append) / `verifications`(append) / `stage`(overwrite) / `stopMet`(overwrite) / `gateResults`(overwrite) / `repairQueue`(append) / `costTotal`(max→累计用 merge 自定)
  - 回边 guard.maxIterations 取 `loop` 的 TaskContract maxAttempts 默认 3
  - spec.id = `loop-<loopId>`，version 从 1 起；limits.maxSteps 默认 100

**行为规格：**
- 编译产物必须过 `validateGraphSpec`（含环检测——repair 回边带 guard 所以合法）
- 兼容性：编译产物的 run 事件流必须包含旧前端消费的全部 `loop.*` 事件（经节点内桥接）
- `loopToGraphDef/loopToGraphInstance`（旧只读投影）改为内部调编译器再投影，保持 REST 输出形状不变（controllers/graph.ts 的 GET 端点不炸）

- [ ] **Step 1: 写失败测试**（编译产物结构断言 5 节点+回边 guard；validate 通过；hydrate 后可跑通一个 mock 全流程；stopMet=true 时 run completed）
- [ ] **Step 2-5**: 常规 TDD 循环 → Commit `feat(graph): LoopInstance→GraphSpec 编译器`

---

### Task 5: R2 Workspace 上下文注入（workspace-context.ts）

**Files:**
- Create: `custom/server/loop/graph/workspace-context.ts`
- Modify: `custom/server/loop/graph/phase-nodes.ts`（handoff 节点接入）
- Test: `custom/client/loop/graph/__tests__/workspace-context.test.ts`

**Interfaces:**
- Produces:
  - `writeGraphContext(workspacePath: string, ctx: GraphContextInput): Promise<void>`——幂等写 `GRAPH-CONTEXT.md`（覆写式，标注"自动生成勿手改"）
  - `ensureAgentReference(workspacePath: string): Promise<void>`——CLAUDE.md/AGENTS.md 追加 `@GRAPH-CONTEXT.md` 引用行（已有则跳过；文件不存在则创建单行文件）
  - `interface GraphContextInput { goal: string; nodeId: string; nodeLabel: string; iteration: number; upstreamSummary: string; completionCriteria: string; budgetLeft: { steps: number; cost?: number }; runUrl: string }`
  - `summarizeUpstream(eventLog: EventLogStore, runId: string, beforeNodeId: string): Promise<string>`——从事件日志汇聚前驱节点 update 摘要（取每节点最近一次 node.completed 的 updateKeys + state 关键字段，截断 500 字符）

**行为规格：**
- handoff 节点在 dispatcher.dispatch 前调用 `writeGraphContext` + `ensureAgentReference`（workspace = worktreeManager 创建的 worktree 路径）
- 文件内容遵循 spec §7A R2 的模板（目标/当前节点/上游产出/完成判定/剩余预算/图回放深链）
- 失败不阻断派发（写上下文失败只记 warn——R5 工程化：上下文是增强不是依赖）

- [ ] **Step 1-5**: TDD（临时目录 fixture；断言文件内容含六要素、幂等、引用不重复追加）→ Commit `feat(graph): R2 workspace 上下文注入（GRAPH-CONTEXT.md + agent 引用）`

---

### Task 6: Run Spawner + 调度器收敛 + budget-guard 修复

**Files:**
- Create: `custom/server/loop/graph/run-spawner.ts`
- Modify: `custom/server/loop/engine/budget-guard.ts`（台账 g：estimateTickCost 用 pattern 索引成本表恒返回 1 的 bug）
- Test: `custom/client/loop/graph/__tests__/run-spawner.test.ts`

**Interfaces:**
- Produces:
  - `class RunSpawner { constructor(opts: { graphService: GraphService; store: LoopStateStore; compile: (loop) => GraphSpec; registry: NodeRegistry; intervalMs?: number }) }`
  - `start(): void` / `stop(): void`——30s 轮询（沿用 CentralizedScheduler 语义）：查 `nextTickAt <= now` 且 idle 的 loop → compile → hydrate → startRun → 写回 `nextTickAt`（cron 计算复用 scheduler.ts 的 cron-parser 逻辑，提取为共享函数）
  - webhook 触发：5s 去抖（沿用现有语义）
  - 手动 tick（REST `POST /api/loop/loops/:id/tick`）在 GRAPH_ENGINE=on 时改走 spawner.tickNow(loopId)
  - budget-guard 修复：`estimateTickCost` 改读 `PatternTemplate.costEstimate`（PATTERN_TEMPLATES 查表），loop.pattern 无匹配模板时回落 medium 档并 warn 一次

**行为规格：**
- run 完成后 stopMet=false → 计算并写回 nextTickAt（图重入）；stopMet=true → loop 标 completed
- stuck-detector 信号在 GRAPH_ENGINE=on 时改读事件日志（近 20 条 run 事件 ≥3 次 node.failed 即 stuck）——旧契约状态轮询保留给 legacy 模式

- [ ] **Step 1-5**: TDD（mock 时钟/interval；断言到期触发、stopMet 分支、cron 写回、webhook 去抖；budget-guard 修复独立用例）→ Commit `feat(graph): RunSpawner 调度收敛 + budget-guard costEstimate 修复`

---

### Task 7: 装配 patch + REST/Socket 真实化 + 双跑

**Files:**
- Create: `patches/195-loop-graph-assembly.patch`（或下一个可用编号；改上游 `server/src/routes.ts` 或 patch 134 同文件——**决策：新建独立 patch 而非改 134**，134 保留 legacy 装配，新 patch 在其后应用并按 GRAPH_ENGINE 分流）
- Modify: `patches/series`（追加新 patch 条目 + 注释）
- Create: `custom/server/loop/graph/graph-rest.ts`（真实 REST：`GET /api/graph/runs`、`GET /api/graph/runs/:id`、`POST /api/graph/runs/:id/resume`、`POST /api/graph/runs/:id/fork`、`GET /api/graph/runs/:id/replay`、`GET /api/graph/specs`、`POST /api/graph/specs`）
- Create: `custom/server/loop/graph/graph-socket.ts`（`/graph` namespace：订阅 runId → 转发 GraphService.onEvent；`updates` 粒度=node 级事件）
- Modify: `custom/server/loop/controllers/graph.ts`（tick/fork stub 删除，改调 graph-rest 的 service 层；GET 投影端点保留）
- Test: `custom/client/loop/graph/__tests__/assembly.test.ts`（装配级：patch 应用后路由注册、GRAPH_ENGINE 三态分流、socket 转发）

**Interfaces:**
- Produces:
  - `createGraphAssembly(opts: { io: SocketIOServer; eventLog: EventLogStore; store: LoopStateStore; engineDeps: PhaseNodeDeps & {...} }): { router: Router; graphService: GraphService; spawner: RunSpawner }`——patch 调用的唯一入口
  - `GRAPH_ENGINE` 三态：`legacy`（默认，patch 134 原装配）/ `shadow`（双跑：legacy 为主，新引擎异步同输入执行、事件序列对比写 shadow 报告、副作用 dryRun）/ `on`（新引擎接管，REST tick 走 spawner）
  - shadow 对比报告：`scripts/graph-shadow-report.mjs`（读 shadow 事件日志 diff 新旧序列，输出一致率）

**行为规格：**
- HITL REST 闭环：`POST /api/graph/runs/:id/resume { interruptId, value }` → GraphService.resumeRun；响应含最新 instance 状态
- 旧 `POST /api/loop/contracts/:id/approve` stub 删除，前端改调 resume 端点（前端适配在 P2，本期保留端点但内部桥接到 resume——契约 id → run/interrupt 映射经事件日志查询）
- socket `/graph` namespace 事件名沿用 GraphEvent type 原值（`graph.node-complete` 等），前端零翻译

- [ ] **Step 1-5**: TDD（Koa 路由用 supertest 或内存 ctx；patch 用 `npm run clean && npm run inject` 实证可应用）→ Commit `feat(graph): 生产装配——graph REST/Socket 真实化 + GRAPH_ENGINE 三态双跑`

---

### Task 8: 数据迁移 + 端到端验收 + 文档

**Files:**
- Create: `scripts/graph-migrate.mjs`（LocalStore/MatrixStore 的 LoopInstance → GraphSpec 表 + 可选首个 run；幂等、dry-run 默认）
- Modify: `docs/superpowers/specs/2026-09-09-loop-graph-p0-kernel-notes.md`（§7 台账 a-n 逐条核销状态）
- Modify: `overlay/README.md`（Loop Engineering 章节更新：图引擎接管 + GRAPH_ENGINE 说明——但 cockpit/新 IA 相关章节留到 P3）
- Test: 端到端集成测试

**Interfaces/行为规格：**
- 迁移脚本：`node scripts/graph-migrate.mjs --dry-run`（默认）打印将迁移的 loop 清单；`--apply` 落库。重复执行幂等（按 loopId 检测已迁移）。
- **端到端验收（本期门禁）**：
  1. `npm test` 全绿
  2. `npm run clean && npm run inject && npm run build:full` 通过
  3. 端到端用例（集成测试落 `__tests__/graph-e2e.test.ts`）：GRAPH_ENGINE=on 装配 → 创建 loop（local-git connector fixture）→ spawner 触发 run → 五阶段全过 + gate 节点执行 → stopCondition 评估 → persistence 真实写 kanban（mock adapter 断言）→ 事件日志完整 → resume 一个带 human 节点的 run → 回放 API 返回完整序列
  4. shadow 对比：同一 loop 在 legacy 与 on 下各跑一次（dryRun），事件序列 diff 一致率 100%（允许 ts 字段差异）

- [ ] **Step 1-5**: TDD + 验收 → Commit `feat(graph): P1 收口——数据迁移 + 端到端验收 + 文档核销`

---

## Self-Review 记录

- **Spec 覆盖**：§6.1 四大断链 → Task 3（persistence/stopCondition/审批注入）+ Task 6（成本预算接线经 budget-guard 修复）；§6.2 双跑 → Task 7；§5 调度收敛 → Task 6；R2 → Task 5；R3 → Task 3/4；台账 a-n → Task 1/2 全覆盖（h 项 interrupt 超时属服务层时钟——并入 Task 7 装配后由 graph-rest 层轮询兜底，验收时显式声明）。**已知裁剪**：`graph_specs` 持久化表（台账 i）在 Task 7 的 graph-rest 里落（`POST /api/graph/specs` 写表，表 schema 复用 event-log-store 的 sqlite 库）。
- **依赖序**：Task 1/2（内核加固）→ Task 3（节点）→ Task 4（编译器）→ Task 5（R2 注入进节点）→ Task 6（调度）→ Task 7（装配）→ Task 8（验收）。Task 1 与 2 可互换，3-8 严格依赖。
- **风险**：Task 7 的 patch 注入面（上游 routes.ts 漂移）——双 patch 并存策略已规避改 134 的回归风险；验收门禁含 clean+inject 实证。
