// overlay/taskledger 域：统一任务生命周期投影（2026-10-21 三号调研落地）。
//
// 来源：《Agent 架构设计 13（DDD）》——Instruction 是 Agent 领域核心实体，
// 「没有指令实体，你就没法做任务超时提醒、取消、重派、委派失败回滚；这是
// 生产 Agent 与 Demo Agent 最核心分界线」。现状盘点：任务状态散在 5 套局部
// 状态机（kanban 列 / A2A 六态 / pipeline 六阶段 / matrix 任务协议 phase /
// mention 派单），没有统一口径回答「这条指令现在处于生命周期哪一段」。
//
// 本域是只读投影层（不接管各系统写入）：把各源状态映射到统一生命周期枚举，
// 外加统一回执账本（TaskLedger）登记委派事实。各源状态机保持自有语义，
// 映射是纯函数——对不上号的源值返回 null（不猜，如实缺口）。
export type InstructionLifecycle =
  | 'pending'    // 已受理未开工（kanban ③段 triage/todo/scheduled/ready 等）
  | 'planning'   // 生成执行计划中（指令实体的 PLANNING）
  | 'executing'  // 执行中（kanban ④段 in_progress/running/blocked 等）
  | 'verifying'  // 待验证/评审（review、A2A input-required）
  | 'done'
  | 'rejected'   // 失败/打回（failed、G5 打回）
  | 'cancelled'

export const LIFECYCLE_ORDER: readonly InstructionLifecycle[] = [
  'pending', 'planning', 'executing', 'verifying', 'done', 'rejected', 'cancelled',
]

export type LedgerSource = 'kanban' | 'a2a' | 'pipeline' | 'matrix' | 'mention' | 'eval'

/** kanban 列名 → 生命周期（列名口径=2026-10-19 阶段映射：③triage/todo/scheduled/ready、④in_progress/running/blocked/review）。 */
export function mapKanbanColumn(column: string): InstructionLifecycle | null {
  const c = column.trim().toLowerCase()
  if (['triage', 'todo', 'scheduled', 'ready', 'backlog'].includes(c)) return 'pending'
  if (['in_progress', 'inprogress', 'running', 'blocked', 'wip'].includes(c)) return 'executing'
  if (['review', 'verify', 'verifying', 'uat'].includes(c)) return 'verifying'
  if (['done', 'closed', 'complete', 'completed'].includes(c)) return 'done'
  if (['rejected', 'failed', 'blocked-fail', 'redo'].includes(c)) return 'rejected'
  if (['cancelled', 'canceled', 'abandoned'].includes(c)) return 'cancelled'
  return null
}

/** A2A 六态（a2a-protocol.ts）→ 生命周期。 */
export function mapA2aState(state: string): InstructionLifecycle | null {
  const s = state.trim().toLowerCase()
  if (s === 'submitted') return 'pending'
  if (s === 'working') return 'executing'
  if (s === 'input-required' || s === 'input_required' || s === 'inputrequired') return 'verifying'
  if (s === 'completed') return 'done'
  if (s === 'failed') return 'rejected'
  if (s === 'canceled' || s === 'cancelled') return 'cancelled'
  return null
}

/** pipeline 六阶段（分支交付态）→ 生命周期（分支=任务载体口径）。 */
export function mapPipelineStage(stage: string): InstructionLifecycle | null {
  const s = stage.trim().toLowerCase()
  if (s === 'dev') return 'executing' // 开发中（分支即开工单元）
  if (s === 'pushed') return 'executing'
  if (s === 'tested' || s === 'merged' || s === 'staged') return 'verifying'
  if (s === 'released') return 'done'
  return null
}

/** matrix 任务协议 phase（v2）→ 生命周期；未登记值返回 null（不猜）。 */
export function mapMatrixPhase(phase: string): InstructionLifecycle | null {
  const p = phase.trim().toLowerCase()
  if (['todo', 'assigned', 'pending'].includes(p)) return 'pending'
  if (['in_progress', 'inprogress', 'running', 'working'].includes(p)) return 'executing'
  if (['review', 'verify', 'blocked-review'].includes(p)) return 'verifying'
  if (['done', 'completed'].includes(p)) return 'done'
  if (['failed', 'rejected'].includes(p)) return 'rejected'
  if (['cancelled', 'canceled'].includes(p)) return 'cancelled'
  return null
}

/** 各源统一入口。 */
export function mapExternalStatus(source: LedgerSource, externalStatus: string): InstructionLifecycle | null {
  switch (source) {
    case 'kanban': return mapKanbanColumn(externalStatus)
    case 'a2a': return mapA2aState(externalStatus)
    case 'pipeline': return mapPipelineStage(externalStatus)
    case 'matrix': return mapMatrixPhase(externalStatus)
    default: return null
  }
}

/** 生命周期是否为终态（终态后不允许再跃迁——DDD 聚合不变性）。 */
export function isTerminal(lifecycle: InstructionLifecycle): boolean {
  return lifecycle === 'done' || lifecycle === 'rejected' || lifecycle === 'cancelled'
}

export interface LedgerEntry {
  /** 统一指令键（跨源去重用；缺省 = source:sourceKey）。 */
  instructionId: string
  source: LedgerSource
  /** 源系统内键（kanban 卡 id / A2A taskId / pipeline 分支名 / matrix 事件 id）。 */
  sourceKey: string
  externalStatus: string
  lifecycle: InstructionLifecycle
  title?: string
  /** 执行者（A2A 委派的 assignee）。 */
  assignee?: string
  parentInstructionId?: string
  /** 本源最近更新时刻（epoch ms）。 */
  updatedAt: number
}

export interface LedgerSummary {
  entries: number
  byLifecycle: Record<InstructionLifecycle, number>
  /** 各源映射不上（null）的计数——口径缺口如实披露。 */
  unmappedSamples: Array<{ source: LedgerSource; externalStatus: string }>
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  const byLifecycle = Object.fromEntries(LIFECYCLE_ORDER.map((k) => [k, 0])) as Record<InstructionLifecycle, number>
  for (const e of entries) byLifecycle[e.lifecycle] += 1
  return { entries: entries.length, byLifecycle, unmappedSamples: [] }
}
