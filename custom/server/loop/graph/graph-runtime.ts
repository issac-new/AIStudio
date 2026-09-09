// overlay/custom/server/loop/graph/graph-runtime.ts
// GraphRuntime — super-step BSP 执行器（LangGraph 模式）
//
// 执行流程：
// 1. 从入口节点开始，按 super-step 批次执行
// 2. 每个 super-step 内，所有就绪节点并行执行；节点完成即入簿记，
//    但状态更新按 launch 序（currentNodes 数组序 + 即时调度追加序）缓冲，
//    待 step 内全部节点完成后统一 applyAll —— 恢复 BSP 确定性合并语义，
//    并行节点写同一 channel 的结果不依赖完成先后（F3）
// 3. 例外：joinMode:'any' 的多前驱节点在首个前驱完成时即时调度，
//    其输入状态 = store 当前值 + 已完成节点的缓冲更新（launch 序 reducer 合并），
//    这是 any 语义"首前驱完成即激活"的要求（F1/F3）
// 4. 根据边条件 + 回边守卫 + join 屏障确定下一 super-step 的就绪节点
// 5. 重复直到到达终止条件或 maxSteps
//
// 支持：
// - interrupt：节点返回 interrupt 时暂停，等待 resume / resumeFromCheckpoint 真恢复
// - 检查点：每 super-step 结束自动保存（CheckpointManager/EventLogStore，StoredCheckpoint 真快照）；
//   join 簿记（JoinLedger）随 checkpoint 进出，resume 后不丢前驱完成事实（F2）
// - 回边守卫：maxIterations / breakCondition（有限终止）
// - 四层终止：L3 maxSteps（节点可读 __remainingSteps）+ L4 预算/时长（先于一切完成路径判定，F5）
// - join 屏障：多前驱节点（静态入边 ∪ 已解析的条件入边，F4）默认等全部前驱完成过
//   且自上次激活后有新前驱完成；any 模式同代不重复激活（F1）
// - 错误处理：节点失败触发 retry、fail-branch（onError goto/retry-goto）或 fail
// - Send API：map-reduce 子任务同一 super-step 内 Promise.all 真并行，补发 node.completed（F5）
// - join 饿死可观测：run 即将结束时仍有部分前驱完成的阻塞节点发 node.starved（F5）
// - 事件日志：装配 eventLog 时每个 GraphEvent 同步 append（同一调用点）

import type {
  GraphDef, GraphInstance, NodeDef, NodeResult, StateValues, StateUpdate,
  GraphEvent, GraphDeps, NodeContext,
} from './types'
import { ChannelStore } from './channel-store'
import { CheckpointManager } from './checkpoint-manager'
import { evaluatePredicate } from './predicate'
import type { EventLogStore, StoredCheckpoint, GraphLogEvent, JoinLedger } from './event-log-store'
import { emptyJoinLedger } from './event-log-store'

export interface GraphRuntimeOptions {
  checkpointManager?: CheckpointManager
  eventLog?: EventLogStore
  runId?: string
}

type PendingInterrupt = { nodeId: string; value: unknown; id: string }

/** GraphEvent.type → 事件日志 kind（未列出者 kind = type 原样落盘） */
const EVENT_KIND_MAP: Record<GraphEvent['type'], string> = {
  'graph.started': 'run.started',
  'graph.completed': 'run.completed',
  'graph.failed': 'run.failed',
  'graph.node-start': 'node.started',
  'graph.node-complete': 'node.completed',
  'graph.node-error': 'node.failed',
  'graph.interrupt': 'interrupt.raised',
  'graph.resume': 'interrupt.resumed',
  'graph.checkpoint': 'checkpoint.saved',
  'graph.step-start': 'graph.step-start',
  'graph.step-complete': 'graph.step-complete',
  'graph.forked': 'graph.forked',
  'edge.guard-exceeded': 'edge.guard-exceeded',
  'edge.break': 'edge.break',
  'node.error-routed': 'node.error-routed',
  'cost.recorded': 'cost.recorded',
  'node.starved': 'node.starved',
}

/** 保证写入日志的 payload 可 JSON 序列化（循环引用降级为字符串） */
function jsonSafe(value: unknown): unknown {
  try {
    JSON.stringify(value)
    return value
  } catch {
    return String(value)
  }
}

export class GraphRuntime {
  private checkpointManager?: CheckpointManager
  private eventLog?: EventLogStore
  private runId?: string

  constructor(
    private deps: GraphDeps,
    optsOrCheckpointManager?: CheckpointManager | GraphRuntimeOptions,
  ) {
    // 向后兼容：旧第二参直接传 CheckpointManager 实例按旧义处理
    if (optsOrCheckpointManager instanceof CheckpointManager) {
      this.checkpointManager = optsOrCheckpointManager
    } else if (optsOrCheckpointManager) {
      this.checkpointManager = optsOrCheckpointManager.checkpointManager
      this.eventLog = optsOrCheckpointManager.eventLog
      this.runId = optsOrCheckpointManager.runId
    }
  }

  /** 启动一个图实例 */
  async start(graphDef: GraphDef, threadId: string, initialState?: StateValues): Promise<GraphInstance> {
    const instance: GraphInstance = {
      id: `${graphDef.id}-${threadId}`,
      graphDefId: graphDef.id,
      threadId,
      status: 'running',
      currentStep: 0,
      state: initialState ?? {},
      totalCost: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const store = new ChannelStore(graphDef.stateSchema, initialState)

    this.emitEvent({
      type: 'graph.started',
      graphId: graphDef.id,
      threadId,
      ts: new Date().toISOString(),
    })

    return this.runLoop(graphDef, instance, store, 0, [graphDef.entryNode], [], {}, Date.now())
  }

  /**
   * 真 resume — 从 StoredCheckpoint 恢复完整执行现场并继续主循环。
   * resumeValue 写入 channel `__resume:<interruptId>`（schema 无此 key 时 ChannelStore 直写），
   * 从 checkpoint.superStep + 1 继续；被应答的 interrupt 从 pendingInterrupts 移除；
   * join 簿记（JoinLedger）一并恢复，checkpoint 前完成的前驱在屏障判定中仍然有效（F2）。
   */
  async resumeFromCheckpoint(
    graphDef: GraphDef,
    checkpoint: StoredCheckpoint,
    resumeValue: unknown,
    interruptId: string,
  ): Promise<GraphInstance> {
    return this.restoreAndRun(graphDef, checkpoint, { interruptId, value: resumeValue })
  }

  /**
   * 从 checkpoint 继续执行（不应答任何 interrupt、不写 __resume 通道、不发 graph.resume）——
   * fork 基底无 pendingInterrupts 时的续跑路径（P1 台账 a 裁决：fork 无隐式应答）。
   * 从 checkpoint.superStep + 1 起按 nextNodes 续跑，join 簿记一并恢复（F2）。
   */
  async continueFromCheckpoint(
    graphDef: GraphDef,
    checkpoint: StoredCheckpoint,
  ): Promise<GraphInstance> {
    return this.restoreAndRun(graphDef, checkpoint)
  }

  /**
   * start/fork 消费之外的"非 start 路径"补发 graph.started ——
   * fork 产物被 startRun 消费时由 GraphService 调用：日志落 run.started
   * （rebuildRegistryFromLog 据此判别 fork 是否已起跑），onEvent 订阅方同步可见。
   */
  emitStarted(graphDef: GraphDef, threadId: string): void {
    this.emitEvent({
      type: 'graph.started',
      graphId: graphDef.id,
      threadId,
      ts: new Date().toISOString(),
    })
  }

  /** resumeFromCheckpoint / continueFromCheckpoint 共用恢复骨架；resume 缺省 = 不应答、不发 graph.resume */
  private async restoreAndRun(
    graphDef: GraphDef,
    checkpoint: StoredCheckpoint,
    resume?: { interruptId: string; value: unknown },
  ): Promise<GraphInstance> {
    const threadId = checkpoint.runId
    const instance: GraphInstance = {
      id: `${graphDef.id}-${threadId}`,
      graphDefId: graphDef.id,
      threadId,
      status: 'running',
      currentStep: checkpoint.superStep,
      state: { ...checkpoint.state },
      totalCost: checkpoint.totalCost,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const store = new ChannelStore(graphDef.stateSchema, checkpoint.state)
    let pendingInterrupts = checkpoint.pendingInterrupts.map(i => ({ ...i }))

    if (resume) {
      store.apply({ [`__resume:${resume.interruptId}`]: resume.value })
      pendingInterrupts = pendingInterrupts.filter(i => i.id !== resume!.interruptId)
      this.emitEvent({
        type: 'graph.resume',
        graphId: graphDef.id,
        threadId,
        interruptId: resume.interruptId,
        resumeValue: resume.value,
        ts: new Date().toISOString(),
      })
    }

    return this.runLoop(
      graphDef, instance, store,
      checkpoint.superStep + 1,
      [...checkpoint.nextNodes],
      pendingInterrupts,
      { ...checkpoint.iterCounters },
      checkpoint.startedAtMs,
      checkpoint.joinLedger ?? emptyJoinLedger(),
    )
  }

  /** resume — 恢复被 interrupt 的图执行（旧签名保留：仅标记，不重跑） */
  async resume(
    graphDef: GraphDef,
    instance: GraphInstance,
    interruptId: string,
    resumeValue: unknown,
  ): Promise<GraphInstance> {
    this.emitEvent({
      type: 'graph.resume',
      graphId: graphDef.id,
      threadId: instance.threadId,
      interruptId,
      resumeValue,
      ts: new Date().toISOString(),
    })

    instance.status = 'running'
    return instance
  }

  // ============================================================================
  // 主循环 — super-step BSP（start 与 resumeFromCheckpoint 共用）
  // ============================================================================

  private async runLoop(
    graphDef: GraphDef,
    instance: GraphInstance,
    store: ChannelStore,
    startStep: number,
    initialNextNodes: string[],
    pendingInterrupts: PendingInterrupt[],
    iterCounters: Record<string, number>,
    startedAtMs: number,
    ledgerSeed?: JoinLedger,
  ): Promise<GraphInstance> {
    const graphId = graphDef.id
    const threadId = instance.threadId
    let nextNodes = initialNextNodes

    // ---- run 级簿记（join 屏障三件套随 checkpoint 进出，F2） ----
    const completedThisRun = new Set<string>(ledgerSeed?.completed ?? [])
    const completedAtStep = new Map<string, number>(Object.entries(ledgerSeed?.completedAtStep ?? {}))
    const lastRunStep = new Map<string, number>(Object.entries(ledgerSeed?.lastRunStep ?? {}))
    const completionCounts = new Map<string, number>()
    const errorRouteCounts = new Map<string, number>()

    // 静态前驱表 + 动态前驱表（条件边 source 在求值解析到 target 时补录，F4）
    const staticPreds = new Map<string, Set<string>>()
    for (const e of graphDef.edges) {
      if (!e.target) continue
      let s = staticPreds.get(e.target)
      if (!s) {
        s = new Set()
        staticPreds.set(e.target, s)
      }
      s.add(e.source)
    }
    const dynamicPreds = new Map<string, Set<string>>()
    const getPreds = (nodeId: string): Set<string> => {
      const merged = new Set<string>(staticPreds.get(nodeId) ?? [])
      for (const s of dynamicPreds.get(nodeId) ?? []) merged.add(s)
      return merged
    }

    // recordCost 包装注入：节点调用 ctx.deps.recordCost 时 runtime 同步累加 totalCost
    const wrappedDeps: GraphDeps = {
      ...this.deps,
      emitEvent: (e) => this.emitEvent(e),
      recordCost: (amount: number) => {
        instance.totalCost += amount
        this.deps.recordCost?.(amount)
        this.emitEvent({
          type: 'cost.recorded',
          graphId,
          threadId,
          amount,
          totalCost: instance.totalCost,
          ts: new Date().toISOString(),
        })
      },
    }

    // join 屏障过滤（F1：代际判定与"本步未执行"去重对 any/all 两种模式都生效）：
    // 多前驱（≥2，静态 ∪ 动态）候选 N ——
    //   all（默认）：全部前驱本 run 完成过 ∧ 自上次 N 运行后有前驱新完成 ∧ N 本步未执行
    //   any       ：自上次 N 运行后有前驱新完成 ∧ N 本步未执行（首前驱即时调度后同代不重复）
    const filterByJoinBarrier = (candidates: string[], scheduledThisStep: Set<string>): string[] => {
      const out: string[] = []
      for (const n of candidates) {
        const node = graphDef.nodes.get(n)
        const preds = getPreds(n)
        if (node && preds.size >= 2) {
          const lastRun = lastRunStep.get(n) ?? -1
          const hasFreshPred = [...preds].some(p => (completedAtStep.get(p) ?? -1) > lastRun)
          if (node.joinMode !== 'any') {
            const allCompleted = [...preds].every(p => completedThisRun.has(p))
            if (!allCompleted || !hasFreshPred || scheduledThisStep.has(n)) continue
          } else {
            if (!hasFreshPred || scheduledThisStep.has(n)) continue
          }
        }
        out.push(n)
      }
      return out
    }

    const buildJoinLedger = (): JoinLedger => ({
      completed: [...completedThisRun],
      completedAtStep: Object.fromEntries(completedAtStep),
      lastRunStep: Object.fromEntries(lastRunStep),
    })

    // run 即将结束（nextNodes 排空）时，对"部分前驱完成、但永远等不到全部前驱"的
    // 多前驱节点发 node.starved —— fail-branch 与 join 组合导致的静默丢弃不再无声（F5）
    const emitStarvedJoins = (): void => {
      for (const [nodeId, node] of graphDef.nodes) {
        if (node.joinMode === 'any') continue
        const preds = getPreds(nodeId)
        if (preds.size < 2) continue
        const done = [...preds].filter(p => completedThisRun.has(p))
        if (done.length > 0 && done.length < preds.size) {
          this.emitEvent({
            type: 'node.starved',
            graphId,
            threadId,
            nodeId,
            missing: [...preds].filter(p => !completedThisRun.has(p)),
            ts: new Date().toISOString(),
          })
        }
      }
    }

    // ---- 主循环 ----
    for (let step = startStep; step < graphDef.maxSteps; step++) {
      instance.currentStep = step

      if (nextNodes.length === 0) {
        if (pendingInterrupts.length === 0) {
          emitStarvedJoins()
          return await this.complete(instance, graphDef, store)
        }
        instance.status = 'awaiting-input'
        instance.state = store.snapshot()
        return instance
      }

      const currentNodes = [...new Set(nextNodes)]

      this.emitEvent({
        type: 'graph.step-start',
        graphId,
        threadId,
        step,
        nodes: currentNodes,
        ts: new Date().toISOString(),
      })

      // ---- super-step 内并行执行：完成即入簿记，效果按 launch 序缓冲（F3） ----
      const scheduled = new Set<string>()
      const launchOrder: string[] = []
      const settled = new Map<string, NodeResult | Error>()
      const updatesByNode = new Map<string, StateUpdate>()
      const pending = new Set<Promise<void>>()
      let sawEnd = false
      let sawInterrupt = false

      // 即时调度节点的输入状态：store 当前值 + 已完成节点缓冲更新（launch 序 reducer 合并）
      const peekState = (): StateValues => {
        const view = new ChannelStore(graphDef.stateSchema, store.getValues())
        for (const id of launchOrder) {
          const u = updatesByNode.get(id)
          if (u) view.apply(u)
        }
        return view.getValues()
      }

      const onSettled = (nodeId: string, result: NodeResult | Error): void => {
        try {
          settled.set(nodeId, result)
          if (result instanceof Error) return
          completedThisRun.add(nodeId)
          completedAtStep.set(nodeId, step)
          completionCounts.set(nodeId, (completionCounts.get(nodeId) ?? 0) + 1)
          if (result.update) updatesByNode.set(nodeId, result.update)
          if (result.end !== undefined) sawEnd = true
          if (result.interrupt) sawInterrupt = true

          // joinMode:'any' 的多前驱节点即时调度：首个前驱完成即激活，不等整批
          // （仅静态无守卫边参与；条件边/守卫边仍走 super-step 末统一计算）
          if (sawEnd || sawInterrupt) return
          for (const edge of graphDef.edges) {
            if (edge.source !== nodeId || edge.condition || edge.guard || !edge.target) continue
            const targetNode = graphDef.nodes.get(edge.target)
            if (!targetNode || getPreds(edge.target).size < 2 || targetNode.joinMode !== 'any') continue
            if (scheduled.has(edge.target)) continue
            launch(edge.target)
          }
        } catch {
          // 结果入簿记永不抛出，保证执行泵可排空
        }
      }

      const launch = (nodeId: string): void => {
        scheduled.add(nodeId)
        launchOrder.push(nodeId)
        lastRunStep.set(nodeId, step)
        const node = graphDef.nodes.get(nodeId)
        const run = async (): Promise<void> => {
          if (!node) {
            onSettled(nodeId, new Error(`Node not found: ${nodeId}`))
            return
          }
          // 节点可见 state = 通道值（即时调度者含缓冲更新）+ __remainingSteps + __iteration
          const nodeState: StateValues = {
            ...peekState(),
            __remainingSteps: graphDef.maxSteps - step - 1,
            __iteration: completionCounts.get(nodeId) ?? 0,
          }
          const result = await this.executeNode(
            graphDef, node, nodeState,
            { graphId, threadId, superStep: step },
            wrappedDeps,
          ).catch(err => (err instanceof Error ? err : new Error(String(err))))
          onSettled(nodeId, result)
        }
        const p = run()
        pending.add(p)
        p.then(() => { pending.delete(p) }, () => { pending.delete(p) })
      }

      for (const nodeId of currentNodes) launch(nodeId)
      // 动态泵：any-join 即时调度会在排空过程中追加新任务
      while (pending.size > 0) {
        await Promise.race([...pending])
      }

      // ---- launch 序统一处理执行效果（BSP 确定性：合并序 = launch 序，与完成先后无关） ----
      const succeeded: string[] = []
      const failedNodes: Array<{ nodeId: string; error: Error }> = []
      const orderedUpdates: StateUpdate[] = []
      const gotoTargets: string[] = []
      const sendTasks: Array<{ node: string; state: StateUpdate }> = []
      let hasInterrupt = false
      let hasEnd = false
      let endResult: unknown

      for (const nodeId of launchOrder) {
        const result = settled.get(nodeId)
        if (result === undefined) continue
        if (result instanceof Error) {
          failedNodes.push({ nodeId, error: result })
          this.emitEvent({
            type: 'graph.node-error',
            graphId,
            threadId,
            nodeId,
            step,
            error: result.message,
            ts: new Date().toISOString(),
          })
          continue
        }
        succeeded.push(nodeId)
        this.emitEvent({
          type: 'graph.node-complete',
          graphId,
          threadId,
          nodeId,
          step,
          result,
          ts: new Date().toISOString(),
        })
        if (result.update) orderedUpdates.push(result.update)
        if (result.interrupt) {
          hasInterrupt = true
          pendingInterrupts.push({ nodeId, value: result.interrupt.value, id: result.interrupt.id })
          this.emitEvent({
            type: 'graph.interrupt',
            graphId,
            threadId,
            nodeId,
            value: result.interrupt.value,
            interruptId: result.interrupt.id,
            ts: new Date().toISOString(),
          })
        }
        if (result.end !== undefined) {
          hasEnd = true
          endResult = result.end
        }
        if (result.goto && result.goto.length > 0) gotoTargets.push(...result.goto)
        if (result.send && result.send.length > 0) sendTasks.push(...result.send)
      }

      // 统一合并状态更新（launch 序）
      store.applyAll(orderedUpdates)

      // ---- fail-branch：最终失败的节点按 onError 路由，不判 run failed ----
      const errorRoutedTargets: string[] = []
      const fatalErrors: string[] = []
      for (const { nodeId, error } of failedNodes) {
        const route = graphDef.nodes.get(nodeId)?.onError
        if (route?.type === 'goto') {
          errorRoutedTargets.push(route.target)
          this.emitEvent({
            type: 'node.error-routed',
            graphId, threadId, nodeId,
            target: route.target,
            error: error.message,
            ts: new Date().toISOString(),
          })
        } else if (route?.type === 'retry-goto') {
          const key = `${nodeId}->${route.target}`
          const attempts = (errorRouteCounts.get(key) ?? 0) + 1
          errorRouteCounts.set(key, attempts)
          if (attempts < route.maxAttempts) {
            errorRoutedTargets.push(route.target)
            this.emitEvent({
              type: 'node.error-routed',
              graphId, threadId, nodeId,
              target: route.target,
              error: error.message,
              ts: new Date().toISOString(),
            })
          } else {
            fatalErrors.push(`${nodeId}: ${error.message}`)
          }
        } else {
          fatalErrors.push(`${nodeId}: ${error.message}`)
        }
      }

      if (fatalErrors.length > 0) {
        instance.status = 'failed'
        this.emitEvent({
          type: 'graph.failed',
          graphId,
          threadId,
          error: fatalErrors.join('; '),
          ts: new Date().toISOString(),
        })
        return instance
      }

      // ---- L4 终止：成本预算 / 时长（每 super-step 末、先于一切完成路径判定，F5） ----
      if (graphDef.budget && graphDef.budget.maxCost > 0 && instance.totalCost > graphDef.budget.maxCost) {
        instance.status = 'failed'
        this.emitEvent({
          type: 'graph.failed',
          graphId,
          threadId,
          error: `budget exceeded: totalCost ${instance.totalCost} > maxCost ${graphDef.budget.maxCost}`,
          ts: new Date().toISOString(),
        })
        return instance
      }
      if (graphDef.maxDurationMs !== undefined && Date.now() - startedAtMs > graphDef.maxDurationMs) {
        instance.status = 'failed'
        this.emitEvent({
          type: 'graph.failed',
          graphId,
          threadId,
          error: `duration exceeded: ${Date.now() - startedAtMs}ms > maxDurationMs ${graphDef.maxDurationMs}`,
          ts: new Date().toISOString(),
        })
        return instance
      }

      // 检查终止条件
      if (hasEnd || (graphDef.endCondition && graphDef.endCondition(store.getValues()))) {
        return await this.complete(instance, graphDef, store)
      }

      // 计算下一批候选（显式 goto 优先；否则走边 + 守卫 + join 屏障；fail-branch 路由并入）
      const computeCandidates = (): string[] => {
        const base = gotoTargets.length > 0
          ? gotoTargets
          : filterByJoinBarrier(
              this.computeNextNodes(graphDef, succeeded, store.getValues(), iterCounters, dynamicPreds, { graphId, threadId, step }),
              scheduled,
            )
        return [...new Set([...base, ...errorRoutedTargets])]
      }

      // interrupt：保存检查点（含 nextNodes / pendingInterrupts / iterCounters / joinLedger 现场）并等待 resume
      if (hasInterrupt) {
        instance.status = 'awaiting-input'
        instance.state = store.snapshot()
        await this.saveCheckpoint(
          graphDef, instance, store, step,
          computeCandidates(),
          pendingInterrupts, iterCounters, startedAtMs, buildJoinLedger(),
        )
        return instance
      }

      // Send API — map-reduce 子任务同一 super-step 内 Promise.all 真并行，
      // 各子任务用独立 ChannelStore 派生，完成后统一 apply 回主 store；
      // 子任务补发 node-complete / node-error（F5）
      if (sendTasks.length > 0) {
        const sendUpdates = await Promise.all(sendTasks.map(async (task) => {
          const targetNode = graphDef.nodes.get(task.node)
          if (!targetNode) return undefined
          const taskStore = new ChannelStore(graphDef.stateSchema, { ...store.getValues(), ...task.state })
          const taskState: StateValues = {
            ...taskStore.getValues(),
            __remainingSteps: graphDef.maxSteps - step - 1,
            __iteration: completionCounts.get(task.node) ?? 0,
          }
          const taskThreadId = `${threadId}-send-${step}`
          const taskResult = await this.executeNode(
            graphDef, targetNode, taskState,
            { graphId, threadId: taskThreadId, superStep: step },
            wrappedDeps,
          ).catch(err => (err instanceof Error ? err : new Error(String(err))))
          if (taskResult instanceof Error) {
            this.emitEvent({
              type: 'graph.node-error',
              graphId, threadId: taskThreadId, nodeId: task.node, step,
              error: taskResult.message,
              ts: new Date().toISOString(),
            })
            return undefined
          }
          this.emitEvent({
            type: 'graph.node-complete',
            graphId, threadId: taskThreadId, nodeId: task.node, step,
            result: taskResult,
            ts: new Date().toISOString(),
          })
          return taskResult.update
        }))
        for (const update of sendUpdates) {
          if (update) store.apply(update)
        }
      }

      nextNodes = computeCandidates()

      // 保存检查点（CheckpointManager + EventLogStore 双写，含 joinLedger）并发 graph.checkpoint
      await this.saveCheckpoint(
        graphDef, instance, store, step,
        nextNodes, pendingInterrupts, iterCounters, startedAtMs, buildJoinLedger(),
      )

      this.emitEvent({
        type: 'graph.step-complete',
        graphId,
        threadId,
        step,
        state: store.getValues(),
        ts: new Date().toISOString(),
      })

      instance.state = store.snapshot()
      instance.updatedAt = new Date().toISOString()
    }

    // L3：超过 maxSteps
    instance.status = 'failed'
    this.emitEvent({
      type: 'graph.failed',
      graphId,
      threadId,
      error: `Exceeded maxSteps (${graphDef.maxSteps})`,
      ts: new Date().toISOString(),
    })
    return instance
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  private async executeNode(
    graphDef: GraphDef,
    node: NodeDef,
    state: StateValues,
    ctx: { graphId: string; threadId: string; superStep: number },
    deps: GraphDeps,
  ): Promise<NodeResult | Error> {
    const nodeCtx: NodeContext = {
      graphId: ctx.graphId,
      threadId: ctx.threadId,
      nodeId: node.id,
      superStep: ctx.superStep,
      deps,
    }

    this.emitEvent({
      type: 'graph.node-start',
      graphId: ctx.graphId,
      threadId: ctx.threadId,
      nodeId: node.id,
      step: ctx.superStep,
      ts: new Date().toISOString(),
    })

    try {
      // 超时包装
      const result = await this.withTimeout(
        node.execute(state, nodeCtx),
        node.timeout ?? 60000,
      )
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      // 重试逻辑
      if (node.retry && node.retry.maxAttempts > 0) {
        for (let attempt = 1; attempt <= node.retry.maxAttempts; attempt++) {
          await this.sleep(node.retry.backoffMs * attempt)
          try {
            return await this.withTimeout(
              node.execute(state, nodeCtx),
              node.timeout ?? 60000,
            )
          } catch (retryErr) {
            if (attempt === node.retry.maxAttempts) {
              return retryErr instanceof Error ? retryErr : new Error(String(retryErr))
            }
          }
        }
      }
      return error
    }
  }

  /**
   * 计算下一 super-step 候选节点（仅由成功完成的节点出边推导）。
   * 回边守卫：命中边带 guard 时计数 from->to，超 maxIterations 丢弃并发 edge.guard-exceeded；
   * breakCondition 命中丢弃并发 edge.break。
   * 条件边解析到 target 时把 source 补录进 dynamicPreds（F4：条件入边 source 参与 join 屏障）。
   */
  private computeNextNodes(
    graphDef: GraphDef,
    currentNodes: string[],
    state: StateValues,
    iterCounters: Record<string, number>,
    dynamicPreds: Map<string, Set<string>>,
    ctx: { graphId: string; threadId: string; step: number },
  ): string[] {
    const next: string[] = []

    for (const nodeId of currentNodes) {
      const outgoingEdges = graphDef.edges.filter(e => e.source === nodeId)

      for (const edge of outgoingEdges) {
        let targets: string[] = []
        if (edge.condition) {
          // 动态边 — 评估条件
          const result = edge.condition(state)
          if (result) {
            targets = Array.isArray(result) ? result : [result]
            for (const t of targets) {
              let s = dynamicPreds.get(t)
              if (!s) {
                s = new Set()
                dynamicPreds.set(t, s)
              }
              s.add(edge.source)
            }
          }
        } else {
          // 静态边 — 始终跟随
          targets = [edge.target]
        }

        for (const target of targets) {
          if (edge.guard) {
            const key = `${edge.source}->${target}`
            const count = (iterCounters[key] ?? 0) + 1
            iterCounters[key] = count
            if (count > edge.guard.maxIterations) {
              this.emitEvent({
                type: 'edge.guard-exceeded',
                graphId: ctx.graphId,
                threadId: ctx.threadId,
                edge: key,
                iterations: count,
                maxIterations: edge.guard.maxIterations,
                ts: new Date().toISOString(),
              })
              continue
            }
            if (edge.guard.breakCondition && evaluatePredicate(edge.guard.breakCondition, state)) {
              this.emitEvent({
                type: 'edge.break',
                graphId: ctx.graphId,
                threadId: ctx.threadId,
                edge: key,
                iterations: count,
                ts: new Date().toISOString(),
              })
              continue
            }
          }
          next.push(target)
        }
      }
    }

    return next
  }

  /** 检查点持久化：优先经 CheckpointManager（EventLogStore 薄封装，含 joinLedger）；未装配时直写 eventLog，并发 graph.checkpoint */
  private async saveCheckpoint(
    graphDef: GraphDef,
    instance: GraphInstance,
    store: ChannelStore,
    step: number,
    nextNodes: string[],
    pendingInterrupts: PendingInterrupt[],
    iterCounters: Record<string, number>,
    startedAtMs: number,
    joinLedger: JoinLedger,
  ): Promise<void> {
    const checkpointId = `cp-${graphDef.id}-${instance.threadId}-${step}`
    const ts = new Date().toISOString()

    const stored: StoredCheckpoint = {
      id: checkpointId,
      runId: this.runId ?? instance.threadId,
      graphId: graphDef.id,
      superStep: step,
      state: store.snapshot(),
      nextNodes: [...nextNodes],
      pendingInterrupts: pendingInterrupts.map(i => ({ ...i })),
      iterCounters: { ...iterCounters },
      totalCost: instance.totalCost,
      startedAtMs,
      createdAt: ts,
      joinLedger,
    }

    if (this.checkpointManager) {
      await this.checkpointManager.save(stored)
    } else if (this.eventLog) {
      await this.eventLog.saveCheckpoint(stored)
    }

    this.emitEvent({
      type: 'graph.checkpoint',
      graphId: graphDef.id,
      threadId: instance.threadId,
      checkpointId,
      step,
      ts,
    })
  }

  private async complete(
    instance: GraphInstance,
    graphDef: GraphDef,
    store: ChannelStore,
  ): Promise<GraphInstance> {
    instance.status = 'completed'
    instance.state = store.snapshot()
    instance.updatedAt = new Date().toISOString()

    this.emitEvent({
      type: 'graph.completed',
      graphId: graphDef.id,
      threadId: instance.threadId,
      finalState: store.getValues(),
      totalCost: instance.totalCost,
      ts: new Date().toISOString(),
    })

    return instance
  }

  /** 事件单调用点：deps.emitEvent + eventLog append（装配时） */
  private emitEvent(event: GraphEvent): void {
    const result = this.deps.emitEvent(event)
    if (result instanceof Promise) {
      result.catch(() => {})
    }
    this.appendToEventLog(event)
  }

  private appendToEventLog(event: GraphEvent): void {
    if (!this.eventLog) return
    const entry: Omit<GraphLogEvent, 'seq'> = {
      runId: this.runId ?? event.threadId,
      graphId: event.graphId,
      ts: Date.now(),
      kind: EVENT_KIND_MAP[event.type] ?? event.type,
      nodeId: 'nodeId' in event ? event.nodeId : undefined,
      superStep: 'step' in event ? event.step : undefined,
      iteration: event.type === 'edge.guard-exceeded' || event.type === 'edge.break' ? event.iterations : undefined,
      payload: this.logPayload(event),
    }
    try {
      const r = this.eventLog.append(entry)
      if (r instanceof Promise) r.catch(() => {})
    } catch {
      // 日志写入失败不阻断图执行
    }
  }

  /** 日志 payload：JSON 安全子集（delta 键名与路由事实；完整 state 由 checkpoint 承载，不进日志） */
  private logPayload(event: GraphEvent): Record<string, unknown> {
    switch (event.type) {
      case 'graph.node-complete': {
        const r = event.result
        return {
          updateKeys: Object.keys(r.update ?? {}),
          goto: r.goto ?? [],
          hasEnd: r.end !== undefined,
          hasInterrupt: r.interrupt !== undefined,
        }
      }
      case 'graph.node-error':
        return { error: event.error }
      case 'graph.node-start':
        return {}
      case 'graph.interrupt':
        return { interruptId: event.interruptId, value: jsonSafe(event.value) }
      case 'graph.resume':
        return { interruptId: event.interruptId, value: jsonSafe(event.resumeValue) }
      case 'graph.checkpoint':
        return { checkpointId: event.checkpointId }
      case 'graph.completed':
        return { totalCost: event.totalCost }
      case 'graph.failed':
        return { error: event.error }
      case 'graph.step-start':
        return { nodes: event.nodes }
      case 'edge.guard-exceeded':
        return { edge: event.edge, iterations: event.iterations, maxIterations: event.maxIterations }
      case 'edge.break':
        return { edge: event.edge, iterations: event.iterations }
      case 'node.error-routed':
        return { target: event.target, error: event.error }
      case 'cost.recorded':
        return { amount: event.amount, totalCost: event.totalCost }
      case 'node.starved':
        return { missing: event.missing }
      default:
        return {}
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
    ])
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
