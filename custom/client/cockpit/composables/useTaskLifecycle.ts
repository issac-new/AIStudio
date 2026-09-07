// overlay/custom/client/cockpit/composables/useTaskLifecycle.ts
// 任务全生命周期聚合（观测治理层补齐组件 2 数据源）
//
// 从全量 kanban 任务聚合：
//   - 状态流转分布（status → count，供 Sankey/漏斗图）
//   - 状态停留时长（各状态平均停留 ms，识别瓶颈状态）
//   - 优先级 × 状态交叉分布（热力图数据）
//   - 租户/板维度分组统计
//
// 数据源：cockpit store 的 cockpitTasks（跨 board 聚合，已含时间戳）
// 纯前端聚合，无新增后端 API。
import { computed, type Ref } from 'vue'
import type { CockpitTask } from '../adapters/task-adapter'

export type LifecycleStatus =
  | 'triage' | 'todo' | 'scheduled' | 'ready' | 'running'
  | 'blocked' | 'review' | 'done' | 'archived'

/** 状态流转主链（漏斗顺序） */
export const STATUS_FLOW: LifecycleStatus[] = [
  'triage', 'todo', 'scheduled', 'ready', 'running', 'review', 'done', 'archived',
]

export interface StatusCount { status: LifecycleStatus; count: number }
export interface StatusDwell { status: LifecycleStatus; avgMs: number; maxMs: number; count: number }
export interface PriorityStatusCell { priority: 'P0' | 'P1' | 'P2' | 'P3'; status: LifecycleStatus; count: number }

export interface LifecycleAgg {
  statusCounts: StatusCount[]
  /** 当前活跃（非 done/archived）在各状态的分布 */
  activeCounts: StatusCount[]
  dwell: StatusDwell[]
  priorityMatrix: PriorityStatusCell[]
  /** 全生命周期中位时长：创建→完成（仅 done 任务） */
  medianDoneMs: number
  /** 瓶颈状态：活跃任务中平均停留最长的前 1 个（排除 done/archived） */
  bottleneck: { status: LifecycleStatus; avgMs: number; count: number } | null
}

export function useTaskLifecycle(tasks: Ref<CockpitTask[]>, details: Ref<Record<string, any>>) {
  /** 状态分布（全量） */
  const statusCounts = computed<StatusCount[]>(() => {
    const map = new Map<LifecycleStatus, number>()
    for (const t of tasks.value) {
      const s = t.status as LifecycleStatus
      map.set(s, (map.get(s) ?? 0) + 1)
    }
    return STATUS_FLOW
      .filter(s => map.has(s))
      .map(s => ({ status: s, count: map.get(s)! }))
  })

  /** 活跃任务状态分布（排除 done/archived） */
  const activeCounts = computed<StatusCount[]>(() => {
    const map = new Map<LifecycleStatus, number>()
    for (const t of tasks.value) {
      if (t.status === 'done' || t.status === 'archived') continue
      const s = t.status as LifecycleStatus
      map.set(s, (map.get(s) ?? 0) + 1)
    }
    return STATUS_FLOW
      .filter(s => map.has(s))
      .map(s => ({ status: s, count: map.get(s)! }))
  })

  /**
   * 状态停留时长估算。
   * 单任务进入状态的时刻没有直接数据；用 task.events 聚合 status_changed 序列。
   * detail 不可用时，用 (now - createdAt) 近似为「至今停留」。
   */
  const dwell = computed<StatusDwell[]>(() => {
    const sums = new Map<LifecycleStatus, { total: number; max: number; count: number }>()
    for (const t of tasks.value) {
      const s = t.status as LifecycleStatus
      if (s === 'done' || s === 'archived') continue
      const d = details.value[t.id]
      let stayMs: number
      const statusEvents = (d?.events ?? [])
        .filter((e: any) => e.kind === 'status_changed')
        .sort((a: any, b: any) => (a.created_at ?? 0) - (b.created_at ?? 0))
      if (statusEvents.length > 0) {
        // 进入当前状态的时刻 = 最后一次 status_changed 的时间
        const lastTs = statusEvents[statusEvents.length - 1].created_at
        const enteredMs = (lastTs < 1e12 ? lastTs * 1000 : lastTs)
        stayMs = Math.max(0, Date.now() - enteredMs)
      } else {
        stayMs = Math.max(0, Date.now() - t.createdAt)
      }
      const cur = sums.get(s) ?? { total: 0, max: 0, count: 0 }
      cur.total += stayMs
      cur.max = Math.max(cur.max, stayMs)
      cur.count += 1
      sums.set(s, cur)
    }
    return [...sums.entries()].map(([status, { total, max, count }]) => ({
      status, avgMs: Math.round(total / count), maxMs: max, count,
    }))
  })

  /** 优先级 × 状态交叉矩阵 */
  const priorityMatrix = computed<PriorityStatusCell[]>(() => {
    const map = new Map<string, number>()
    for (const t of tasks.value) {
      const key = `${t.priority}|${t.status}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    const out: PriorityStatusCell[] = []
    for (const [key, count] of map) {
      const [priority, status] = key.split('|')
      out.push({ priority: priority as any, status: status as LifecycleStatus, count })
    }
    return out
  })

  /** 完成任务的中位时长（创建→完成） */
  const medianDoneMs = computed<number>(() => {
    const durs: number[] = []
    for (const t of tasks.value) {
      if (t.status !== 'done' && t.status !== 'archived') continue
      const d = details.value[t.id]
      const completedRaw = d?.task?.completed_at
      if (!completedRaw) continue
      const completedMs = completedRaw < 1e12 ? completedRaw * 1000 : completedRaw
      if (completedMs > t.createdAt) durs.push(completedMs - t.createdAt)
    }
    if (durs.length === 0) return 0
    durs.sort((a, b) => a - b)
    const mid = Math.floor(durs.length / 2)
    return durs.length % 2 ? durs[mid] : Math.round((durs[mid - 1] + durs[mid]) / 2)
  })

  /** 瓶颈状态：活跃任务中平均停留最长（样本 ≥2 才算） */
  const bottleneck = computed<LifecycleAgg['bottleneck']>(() => {
    const candidates = dwell.value.filter(d => d.count >= 2 && d.status !== 'done' && d.status !== 'archived')
    if (candidates.length === 0) return null
    const worst = candidates.reduce((a, b) => (a.avgMs >= b.avgMs ? a : b))
    return { status: worst.status, avgMs: worst.avgMs, count: worst.count }
  })

  return { statusCounts, activeCounts, dwell, priorityMatrix, medianDoneMs, bottleneck }
}

/** 格式化停留时长 */
export function fmtDwell(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`
  return `${(ms / 86_400_000).toFixed(1)}d`
}
