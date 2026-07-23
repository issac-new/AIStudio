// overlay/custom/server/loop/graph/checkpoint-manager.ts
// CheckpointManager — per-super-step 检查点持久化（LangGraph 模式）
// 支持 resume（恢复同一线程）和 fork（分叉新线程，保留原史）

import type { Checkpoint, StateValues } from './types'
import type { LoopStateStore } from '../store/state-store'
import type { GraphEvent } from './types'

export class CheckpointManager {
  constructor(private store: LoopStateStore) {}

  /** 保存检查点 */
  async save(checkpoint: Checkpoint): Promise<void> {
    const event: GraphEvent = {
      type: 'graph.checkpoint',
      graphId: checkpoint.graphId,
      threadId: checkpoint.threadId,
      checkpointId: checkpoint.id,
      step: checkpoint.superStep,
      ts: checkpoint.timestamp,
    }
    // 用 store 的 appendEvent 持久化检查点事件
    await this.store.appendEvent(event as any)
  }

  /** 获取线程的最新检查点 */
  async getLatest(graphId: string, threadId: string): Promise<Checkpoint | null> {
    const events = await this.store.queryEvents(threadId, undefined, 100)
    // 反向查找最近的 checkpoint 事件
    for (let i = events.length - 1; i >= 0; i--) {
      const evt = events[i] as any
      if (evt.type === 'graph.checkpoint' && evt.graphId === graphId) {
        // 在实际实现中，检查点的完整状态应该存储在专门的表中
        // 这里简化：从事件中重建
        return {
          id: evt.checkpointId,
          graphId: evt.graphId,
          threadId: evt.threadId,
          superStep: evt.step,
          state: {},  // 实际从持久化存储读取
          nextNodes: [],
          pendingInterrupts: [],
          timestamp: evt.ts,
          totalCost: 0,
        }
      }
    }
    return null
  }

  /** fork — 从检查点创建新线程（CrewAI 模式） */
  async fork(
    graphId: string,
    parentThreadId: string,
    checkpoint: Checkpoint,
  ): Promise<{ threadId: string; state: StateValues }> {
    const newThreadId = `${parentThreadId}-fork-${Date.now()}`
    const event: GraphEvent = {
      type: 'graph.forked',
      graphId,
      threadId: newThreadId,
      parentThreadId,
      ts: new Date().toISOString(),
    }
    await this.store.appendEvent(event as any)
    return { threadId: newThreadId, state: checkpoint.state }
  }

  /** resume — 恢复线程到检查点状态 */
  async resume(
    graphId: string,
    threadId: string,
    interruptId: string,
    resumeValue: unknown,
  ): Promise<void> {
    const event: GraphEvent = {
      type: 'graph.resume',
      graphId,
      threadId,
      interruptId,
      resumeValue,
      ts: new Date().toISOString(),
    }
    await this.store.appendEvent(event as any)
  }
}
