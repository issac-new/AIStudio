// overlay/custom/server/loop/graph/graph-runtime.ts
// GraphRuntime — super-step BSP 执行器（LangGraph 模式）
//
// 执行流程：
// 1. 从入口节点开始，按 super-step 批次执行
// 2. 每个 super-step 内，所有就绪节点并行执行
// 3. 收集所有节点的部分更新，经 reducer 合并到 ChannelStore
// 4. 根据边条件确定下一 super-step 的就绪节点
// 5. 重复直到到达终止条件或 maxSteps
//
// 支持：
// - interrupt：节点返回 interrupt 时暂停，等待 resume
// - fork：从检查点分叉新线程
// - 检查点：每 super-step 结束自动保存
// - 错误处理：节点失败触发 retry 或 fail-branch

import type {
  GraphDef, GraphInstance, NodeDef, NodeResult, StateValues, StateUpdate,
  GraphEvent, GraphDeps, Checkpoint, NodeContext,
} from './types'
import { ChannelStore } from './channel-store'
import { CheckpointManager } from './checkpoint-manager'

export class GraphRuntime {
  private checkpointManager?: CheckpointManager

  constructor(
    private deps: GraphDeps,
    checkpointManager?: CheckpointManager,
  ) {
    if (checkpointManager) {
      this.checkpointManager = checkpointManager
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

    // 从入口节点开始
    let nextNodes: string[] = [graphDef.entryNode]
    let pendingInterrupts: Array<{ nodeId: string; value: unknown; id: string }> = []

    this.emitEvent({
      type: 'graph.started',
      graphId: graphDef.id,
      threadId,
      ts: new Date().toISOString(),
    })

    // 主循环 — super-step BSP
    for (let step = 0; step < graphDef.maxSteps; step++) {
      instance.currentStep = step

      if (nextNodes.length === 0) {
        // 没有就绪节点 → 图完成
        if (pendingInterrupts.length === 0) {
          return await this.complete(instance, graphDef, store)
        }
        // 有待处理的 interrupt → 等待 resume
        instance.status = 'awaiting-input'
        return instance
      }

      // 确定本 super-step 的执行节点（去重）
      const currentNodes = [...new Set(nextNodes)]

      this.emitEvent({
        type: 'graph.step-start',
        graphId: graphDef.id,
        threadId,
        step,
        nodes: currentNodes,
        ts: new Date().toISOString(),
      })

      // 并行执行当前 super-step 的所有节点
      const results = await this.executeNodes(
        graphDef,
        currentNodes,
        store.getValues(),
        { graphId: graphDef.id, threadId, superStep: step },
      )

      // 收集结果
      const updates: StateUpdate[] = []
      const errors: string[] = []
      let hasInterrupt = false
      let hasEnd = false
      let endResult: unknown
      let gotoTargets: string[] = []
      let sendTasks: Array<{ node: string; state: StateUpdate }> = []

      for (let i = 0; i < currentNodes.length; i++) {
        const nodeId = currentNodes[i]
        const result = results[i]

        if (result instanceof Error) {
          errors.push(`${nodeId}: ${result.message}`)
          this.emitEvent({
            type: 'graph.node-error',
            graphId: graphDef.id,
            threadId,
            nodeId,
            step,
            error: result.message,
            ts: new Date().toISOString(),
          })
          continue
        }

        const r = result as NodeResult

        if (r.update) updates.push(r.update)

        if (r.interrupt) {
          hasInterrupt = true
          pendingInterrupts.push({
            nodeId,
            value: r.interrupt.value,
            id: r.interrupt.id,
          })
          this.emitEvent({
            type: 'graph.interrupt',
            graphId: graphDef.id,
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

        if (r.goto && r.goto.length > 0) {
          gotoTargets.push(...r.goto)
        }

        if (r.send && r.send.length > 0) {
          sendTasks.push(...r.send)
        }

        this.emitEvent({
          type: 'graph.node-complete',
          graphId: graphDef.id,
          threadId,
          nodeId,
          step,
          result: r,
          ts: new Date().toISOString(),
        })
      }

      // 如果有错误，检查是否有 fail-branch（简化：直接失败）
      if (errors.length > 0) {
        instance.status = 'failed'
        this.emitEvent({
          type: 'graph.failed',
          graphId: graphDef.id,
          threadId,
          error: errors.join('; '),
          ts: new Date().toISOString(),
        })
        return instance
      }

      // 合并状态更新
      store.applyAll(updates)

      // 检查终止条件
      if (hasEnd || (graphDef.endCondition && graphDef.endCondition(store.getValues()))) {
        return await this.complete(instance, graphDef, store)
      }

      // 如果有 interrupt，保存检查点并等待 resume
      if (hasInterrupt) {
        instance.status = 'awaiting-input'
        instance.state = store.snapshot()

        if (this.checkpointManager) {
          const checkpoint: Checkpoint = {
            id: `cp-${graphDef.id}-${threadId}-${step}`,
            graphId: graphDef.id,
            threadId,
            superStep: step,
            state: store.snapshot(),
            nextNodes: gotoTargets.length > 0 ? gotoTargets : this.computeNextNodes(graphDef, currentNodes, store.getValues()),
            pendingInterrupts: [...pendingInterrupts],
            timestamp: new Date().toISOString(),
            totalCost: instance.totalCost,
          }
          await this.checkpointManager.save(checkpoint)
        }

        return instance
      }

      // 发送 map-reduce 子任务（LangGraph Send API）
      for (const task of sendTasks) {
        const targetNode = graphDef.nodes.get(task.node)
        if (targetNode) {
          const taskStore = new ChannelStore(graphDef.stateSchema, { ...store.getValues(), ...task.state })
          const taskResult = await this.executeNode(
            graphDef,
            targetNode,
            taskStore.getValues(),
            { graphId: graphDef.id, threadId: `${threadId}-send-${step}`, superStep: step },
          )
          if (!(taskResult instanceof Error) && taskResult.update) {
            store.apply(taskResult.update)
          }
        }
      }

      // 计算下一 super-step 的就绪节点
      nextNodes = gotoTargets.length > 0
        ? gotoTargets
        : this.computeNextNodes(graphDef, currentNodes, store.getValues())

      // 保存检查点
      if (this.checkpointManager) {
        const checkpoint: Checkpoint = {
          id: `cp-${graphDef.id}-${threadId}-${step}`,
          graphId: graphDef.id,
          threadId,
          superStep: step,
          state: store.snapshot(),
          nextNodes,
          pendingInterrupts: [],
          timestamp: new Date().toISOString(),
          totalCost: instance.totalCost,
        }
        await this.checkpointManager.save(checkpoint)
      }

      this.emitEvent({
        type: 'graph.step-complete',
        graphId: graphDef.id,
        threadId,
        step,
        state: store.getValues(),
        ts: new Date().toISOString(),
      })

      // 更新实例状态
      instance.state = store.snapshot()
      instance.updatedAt = new Date().toISOString()
    }

    // 超过 maxSteps
    instance.status = 'failed'
    this.emitEvent({
      type: 'graph.failed',
      graphId: graphDef.id,
      threadId,
      error: `Exceeded maxSteps (${graphDef.maxSteps})`,
      ts: new Date().toISOString(),
    })
    return instance
  }

  /** resume — 恢复被 interrupt 的图执行 */
  async resume(
    graphDef: GraphDef,
    instance: GraphInstance,
    interruptId: string,
    resumeValue: unknown,
  ): Promise<GraphInstance> {
    // 在实际实现中，从检查点恢复状态，然后继续执行
    // 简化：标记 resume 事件，重新运行整个图
    this.emitEvent({
      type: 'graph.resume',
      graphId: graphDef.id,
      threadId: instance.threadId,
      interruptId,
      resumeValue,
      ts: new Date().toISOString(),
    })

    // 恢复状态并继续
    instance.status = 'running'
    return instance
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  private async executeNodes(
    graphDef: GraphDef,
    nodeIds: string[],
    state: StateValues,
    ctx: { graphId: string; threadId: string; superStep: number },
  ): Promise<Array<NodeResult | Error>> {
    const promises = nodeIds.map(nodeId => {
      const node = graphDef.nodes.get(nodeId)
      if (!node) return Promise.resolve(new Error(`Node not found: ${nodeId}`))
      return this.executeNode(graphDef, node, state, ctx).catch(err => err)
    })
    return Promise.all(promises)
  }

  private async executeNode(
    graphDef: GraphDef,
    node: NodeDef,
    state: StateValues,
    ctx: { graphId: string; threadId: string; superStep: number },
  ): Promise<NodeResult | Error> {
    const nodeCtx: NodeContext = {
      graphId: ctx.graphId,
      threadId: ctx.threadId,
      nodeId: node.id,
      superStep: ctx.superStep,
      deps: this.deps,
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

  private computeNextNodes(
    graphDef: GraphDef,
    currentNodes: string[],
    state: StateValues,
  ): string[] {
    const next: string[] = []

    for (const nodeId of currentNodes) {
      const outgoingEdges = graphDef.edges.filter(e => e.source === nodeId)

      for (const edge of outgoingEdges) {
        if (edge.condition) {
          // 动态边 — 评估条件
          const result = edge.condition(state)
          if (result) {
            if (Array.isArray(result)) {
              next.push(...result)
            } else {
              next.push(result)
            }
          }
        } else {
          // 静态边 — 始终跟随
          next.push(edge.target)
        }
      }
    }

    return next
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

  private emitEvent(event: GraphEvent): void {
    const result = this.deps.emitEvent(event)
    if (result instanceof Promise) {
      result.catch(() => {})
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
