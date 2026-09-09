// overlay/custom/server/loop/graph/checkpoint-manager.ts
// CheckpointManager — EventLogStore 之上的检查点薄封装（真快照读写）
// 破坏性变更（已批准）：旧构造签名 constructor(store: LoopStateStore) 与
// getLatest(graphId, threadId) 废弃；统一使用 StoredCheckpoint（Task 3 定义，含 joinLedger 透传）
// fork = time-travel 最小可用形态：复制指定 superStep 的检查点到新 run，并记 run.forked 事件

import type { EventLogStore, StoredCheckpoint } from './event-log-store'

export class CheckpointManager {
  constructor(private log: EventLogStore) {}

  /** 保存检查点（委托 EventLogStore.saveCheckpoint，joinLedger 等字段原样透传） */
  async save(c: StoredCheckpoint): Promise<void> {
    await this.log.saveCheckpoint(c)
  }

  /** 该 run 的最新检查点（superStep 最大者） */
  async getLatest(runId: string): Promise<StoredCheckpoint | null> {
    return this.log.getLatestCheckpoint(runId)
  }

  /** 该 run 的全部检查点（按 superStep 升序） */
  async list(runId: string): Promise<StoredCheckpoint[]> {
    return this.log.listCheckpoints(runId)
  }

  /** 取指定 superStep 的检查点；无则 null */
  async getAt(runId: string, superStep: number): Promise<StoredCheckpoint | null> {
    const all = await this.log.listCheckpoints(runId)
    return all.find(c => c.superStep === superStep) ?? null
  }

  /**
   * fork — 复制指定 superStep 的检查点到 newRunId（新 id、runId 替换、其余字段不变，含 joinLedger），
   * 并向 newRunId 日志追加 run.forked（payload: fromRunId / fromSuperStep）。
   * 源检查点不存在时抛错。
   */
  async fork(runId: string, superStep: number, newRunId: string): Promise<StoredCheckpoint> {
    const src = await this.getAt(runId, superStep)
    if (!src) {
      throw new Error(`CheckpointManager.fork: checkpoint not found (runId=${runId}, superStep=${superStep})`)
    }
    // 深拷贝隔离源对象，避免 fork 后共享 state/joinLedger 引用
    const forked: StoredCheckpoint = JSON.parse(JSON.stringify({
      ...src,
      id: `${src.id}-fork-${newRunId}`,
      runId: newRunId,
    }))
    await this.log.saveCheckpoint(forked)
    await this.log.append({
      runId: newRunId,
      graphId: src.graphId,
      ts: Date.now(),
      kind: 'run.forked',
      superStep,
      payload: { fromRunId: runId, fromSuperStep: superStep },
    })
    return forked
  }
}
