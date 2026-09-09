// overlay/custom/server/loop/graph/graph-runtime.ts
// GraphRuntime — super-step BSP 执行器（LangGraph 模式）
//
// 执行流程：
// 1. 从入口节点开始，按 super-step 批次执行
// 2. 每个 super-step 内，所有就绪节点并行执行（流式完成处理：
//    节点完成即合并状态，多前驱 joinMode:'any' 节点即时调度，不等整批结束）
// 3. 收集所有节点的部分更新，经 reducer 合并到 ChannelStore
// 4. 根据边条件 + 回边守卫 + join 屏障确定下一 super-step 的就绪节点
// 5. 重复直到到达终止条件或 maxSteps
//
// 支持：
// - interrupt：节点返回 interrupt 时暂停，等待 resume / resumeFromCheckpoint 真恢复
// - fork：从检查点分叉新线程
// - 检查点：每 super-step 结束自动保存（CheckpointManager + EventLogStore 双写）
// - 回边守卫：maxIterations / breakCondition（有限终止）
// - 四层终止：L3 maxSteps（节点可读 __remainingSteps）+ L4 预算/时长
// - join 屏障：多前驱节点默认等全部前驱完成过且自上次激活后有新前驱完成
// - 错误处理：节点失败触发 retry、fail-branch（onError goto/retry-goto）或 fail
// - Send API：map-reduce 子任务同一 super-step 内 Promise.all 真并行
// - 事件日志：装配 eventLog 时每个 GraphEvent 同步 append（同一调用点）

import type {
  GraphDef, GraphInstance, NodeDef, NodeResult, StateValues, StateUpdate,
  GraphEvent, GraphDeps, Checkpoint, NodeContext,
} from './types'
import { ChannelStore } from './channel-store'
import { CheckpointManager } from './checkpoint-manager'
import { evaluatePredicate } from './predicate'
import type { EventLogStore, StoredCheckpoint, GraphLogEvent } from './event-log-store'

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
   * 从 checkpoint.superStep + 1 继续；被应答的 interrupt 从 pendingInterrupts 移除。
   */
  async resumeFromCheckpoint(
    graphDef: GraphDef,
    checkpoint: StoredCheckpoint,
    resumeValue: unknown,
    interruptId: string,
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
    store.apply({ [`__resume:${interruptId}`]: resumeValue })

    const pendingInterrupts = checkpoint.pendingInterrupts.filter(i => i.id !== interruptId)

    this.emitEvent({
      type: 'graph.resume',
      graphId: graphDef.id,
      threadId,
      interruptId,
      resumeValue,
      ts: new Date().toISOString(),
    })

    return this.runLoop(
      graphDef, instance, store,
      checkpoint.superStep + 1,
      [...checkpoint.nextNodes],
      pendingInterrupts,
      { ...checkpoint.iterCounters },
      checkpoint.startedAtMs,
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
  ): Promise<GraphInstance> {
    const graphId = graphDef.id
    const threadId = instance.threadId
    let nextNodes = initialNextNodes

    // ---- run 级簿记 ----
    // join 屏障：completedThisRun（本 run 全部完成过的节点）+
    // completedAtStep / lastRunStep（"自上次 N 完成后有新前驱完成"的判定依据）
    const completedThisRun = new Set<string>()
    const completedAtStep = new Map<string, number>()
    const lastRunStep = new Map<string, number>()
    const completionCounts = new Map<string, number>()
    const errorRouteCounts = new Map<string, number>()

    // 静态前驱表（条件边 target 运行时才知道，不参与静态屏障）
    const predMap = new Map<string, Set<string>>()
    for (const e of graphDef.edges) {
      if (!e.target) continue
      let s = predMap.get(e.target)
      if (!s) {
        s = new Set()
        predMap.set(e.target, s)
      }
      s.add(e.source)
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

    // join 屏障过滤：多 source 入边（≥2）且非 any 模式的候选 N，
    // 要求其全部前驱本 run 完成过、自上次 N 运行后有前驱新完成、且 N 未在本 super-step 执行过
    const filterByJoinBarrier = (candidates: string[], scheduledThisStep: Set<string>): string[] => {
      const out: string[] = []
      for (const n of candidates) {
        const preds = predMap.get(n)
        const node = graphDef.nodes.get(n)
        if (node && preds && preds.size >= 2 && node.joinMode !== 'any') {
          const allCompleted = [...preds].every(p => completedThisRun.has(p))
          const lastRun = lastRunStep.get(n) ?? -1
          const hasFreshPred = [...preds].some(p => (completedAtStep.get(p) ?? -1) > lastRun)
          if (!allCompleted || !hasFreshPred || scheduledThisStep.has(n)) continue
        }
        out.push(n)
      }
      return out
    }

    // ---- 主循环 ----
    for (let step = startStep; step < graphDef.maxSteps; step++) {
      instance.currentStep = step

      if (nextNodes.length === 0) {
        if (pendingInterrupts.length === 0) {
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

      // ---- super-step 内流式并行执行 ----
      const scheduled = new Set<string>()
      const pending = new Set<Promise<void>>()
      const succeeded: string[] = []
      const failedNodes: Array<{ nodeId: string; error: Error }> = []
      const gotoTargets: string[] = []
      const sendTasks: Array<{ node: string; state: StateUpdate }> = []
      let hasInterrupt = false
      let hasEnd = false
      let endResult: unknown

      const handleResult = (nodeId: string, result: NodeResult | Error): void => {
        try {
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
            return
          }

          const r = result
          succeeded.push(nodeId)
          completedThisRun.add(nodeId)
          completedAtStep.set(nodeId, step)
          completionCounts.set(nodeId, (completionCounts.get(nodeId) ?? 0) + 1)

          // 状态流式合并：同 super-step 后续即时调度的节点可读到
          if (r.update) store.apply(r.update)

          if (r.interrupt) {
            hasInterrupt = true
            pendingInterrupts.push({ nodeId, value: r.interrupt.value, id: r.interrupt.id })
            this.emitEvent({
              type: 'graph.interrupt',
              graphId,
              threadId,
              nodeId,
              value: r.interrupt.value,
              interruptId: r.interrupt.id,
              ts: new Date().toISOString(),
            })
          }

          if (r.end !== undefined) {
            hasEnd = true
            endResult = r.end
          }

          if (r.goto && r.goto.length > 0) gotoTargets.push(...r.goto)
          if (r.send && r.send.length > 0) sendTasks.push(...r.send)

          this.emitEvent({
            type: 'graph.node-complete',
            graphId,
            threadId,
            nodeId,
            step,
            result: r,
            ts: new Date().toISOString(),
          })

          // joinMode:'any' 的多前驱节点即时调度：首个前驱完成即激活，不等整批
          // （仅静态无守卫边参与即时调度；条件边/守卫边仍走 super-step 末统一计算）
          if (hasEnd || hasInterrupt) return
          for (const edge of graphDef.edges) {
            if (edge.source !== nodeId || edge.condition || edge.guard || !edge.target) continue
            const targetNode = graphDef.nodes.get(edge.target)
            const preds = predMap.get(edge.target)
            if (!targetNode || !preds || preds.size < 2 || targetNode.joinMode !== 'any') continue
            if (scheduled.has(edge.target)) continue
            launch(edge.target)
          }
        } catch {
          // 结果处理永不抛出，保证执行泵可排空
        }
      }

      const launch = (nodeId: string): void => {
        scheduled.add(nodeId)
        lastRunStep.set(nodeId, step)
        const node = graphDef.nodes.get(nodeId)
        const run = async (): Promise<void> => {
          if (!node) {
            handleResult(nodeId, new Error(`Node not found: ${nodeId}`))
            return
          }
          // 节点可见 state = 当前通道值 + __remainingSteps（L3 倒计时）+ __iteration（该节点已完成次数）
          const nodeState: StateValues = {
            ...store.getValues(),
            __remainingSteps: graphDef.maxSteps - step - 1,
            __iteration: completionCounts.get(nodeId) ?? 0,
          }
          const result = await this.executeNode(
            graphDef, node, nodeState,
            { graphId, threadId, superStep: step },
            wrappedDeps,
          ).catch(err => (err instanceof Error ? err : new Error(String(err))))
          handleResult(nodeId, result)
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

      // 检查终止条件
      if (hasEnd || (graphDef.endCondition && graphDef.endCondition(store.getValues()))) {
        return await this.complete(instance, graphDef, store)
      }

      // ---- L4 终止：成本预算 / 时长（每 super-step 末检查） ----
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

      // 计算下一批候选（显式 goto 优先；否则走边 + 守卫 + join 屏障；fail-branch 路由并入）
      const computeCandidates = (): string[] => {
        const base = gotoTargets.length > 0
          ? gotoTargets
          : filterByJoinBarrier(
              this.computeNextNodes(graphDef, succeeded, store.getValues(), iterCounters, { graphId, threadId, step }),
              scheduled,
            )
        return [...new Set([...base, ...errorRoutedTargets])]
      }

      // interrupt：保存检查点（含 nextNodes / pendingInterrupts / iterCounters 现场）并等待 resume
      if (hasInterrupt) {
        instance.status = 'awaiting-input'
        instance.state = store.snapshot()
        await this.saveCheckpoint(
          graphDef, instance, store, step,
          computeCandidates(),
          pendingInterrupts, iterCounters, startedAtMs,
        )
        return instance
      }

      // Send API — map-reduce 子任务同一 super-step 内 Promise.all 真并行，
      // 各子任务用独立 ChannelStore 派生，完成后统一 apply 回主 store
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
          const taskResult = await this.executeNode(
            graphDef, targetNode, taskState,
            { graphId, threadId: `${threadId}-send-${step}`, superStep: step },
            wrappedDeps,
          ).catch(err => (err instanceof Error ? err : new Error(String(err))))
          if (taskResult instanceof Error) return undefined
          return taskResult.update
        }))
        for (const update of sendUpdates) {
          if (update) store.apply(update)
        }
      }

      nextNodes = computeCandidates()

      // 保存检查点（CheckpointManager + EventLogStore 双写）并发 graph.checkpoint
      await this.saveCheckpoint(
        graphDef, instance, store, step,
        nextNodes, pendingInterrupts, iterCounters, startedAtMs,
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
   */
  private computeNextNodes(
    graphDef: GraphDef,
    currentNodes: string[],
    state: StateValues,
    iterCounters: Record<string, number>,
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

  /** 检查点双写：CheckpointManager（旧通道）+ EventLogStore（事实源），并发 graph.checkpoint */
  private async saveCheckpoint(
    graphDef: GraphDef,
    instance: GraphInstance,
    store: ChannelStore,
    step: number,
    nextNodes: string[],
    pendingInterrupts: PendingInterrupt[],
    iterCounters: Record<string, number>,
    startedAtMs: number,
  ): Promise<void> {
    const checkpointId = `cp-${graphDef.id}-${instance.threadId}-${step}`
    const ts = new Date().toISOString()

    if (this.checkpointManager) {
      const checkpoint: Checkpoint = {
        id: checkpointId,
        graphId: graphDef.id,
        threadId: instance.threadId,
        superStep: step,
        state: store.snapshot(),
        nextNodes,
        pendingInterrupts: [...pendingInterrupts],
        timestamp: ts,
        totalCost: instance.totalCost,
      }
      await this.checkpointManager.save(checkpoint)
    }

    if (this.eventLog) {
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
      }
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
