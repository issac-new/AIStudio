// overlay[delivery]: 跨板交付日报纯函数（2026-10-23 天猫数字员工两文吸收轮）。
// 文章口径（实践篇 §3.3）：每天一份需求摘要——当前状态、下一步动作、待处理事项、
// 趋势变化、卡点负责人与停留时长；条目可追问展开（UI 侧展开详情行）。
// AIStudio 落法（spec D9）：24h 滚动窗，趋势=本窗 vs 上一窗；停留时长=now−最后事件时刻。

import type { TaskLite } from './matrix'

export interface EventLite {
  taskId: string
  kind: string
  /** epoch 秒 */
  at: number
  seq: number
  author?: string
}

export interface DigestItem {
  id: string
  board: string
  taskId: string
  title: string
  /** 责任人（assignee 缺席回退 created_by；再缺席 unassigned） */
  owner: string
  /** 停留/老化秒（now 起算） */
  dwellSec: number | null
  /** 展开行（追问式详情：事件轨迹摘要与建议依据） */
  details: string[]
}

export interface DigestSuggestion {
  kind: 'unblock-blocked' | 'review-aging' | 'nudge-stalled'
  target: string
  note: string
}

export interface DailyDigest {
  generatedAt: number
  windowHours: number
  /** 状态盘点（全板聚合） */
  statuses: Array<{ status: string; count: number }>
  trend: {
    completed24h: number
    completedPrev24h: number
    created24h: number
    createdPrev24h: number
  }
  /** 近窗完成（可展开） */
  completed: DigestItem[]
  /** 卡点（含负责人+停留时长） */
  blockers: DigestItem[]
  /** 评审排队（按老化降序） */
  reviewQueue: DigestItem[]
  /** 执行停滞候选（心跳超阈值） */
  stalled: DigestItem[]
  suggestions: DigestSuggestion[]
  boards: number
  boardsAvailable: number
}

export interface DigestBoardInput {
  slug: string
  available: boolean
  tasks: TaskLite[]
  events: EventLite[]
}

function fmtDuration(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} 小时`
  return `${(sec / 86400).toFixed(1)} 天`
}

/** 任务最后事件时刻（秒）：事件面优先，回落任务时间戳链 */
function lastTouchSec(task: TaskLite, events: EventLite[]): number | null {
  let best: number | null = null
  for (const e of events) {
    if (e.taskId !== task.id) continue
    if (best == null || e.at > best) best = e.at
  }
  if (best != null) return best
  return task.completedAt ?? task.lastHeartbeatAt ?? task.startedAt ?? task.createdAt ?? null
}

function ownerOf(task: TaskLite): string {
  return task.assignee || 'unassigned'
}

function itemOf(task: TaskLite, events: EventLite[], now: number, extra: string[]): DigestItem {
  const touch = lastTouchSec(task, events)
  const dwell = touch != null ? Math.max(0, now - touch) : null
  const evTail = events
    .filter(e => e.taskId === task.id)
    .sort((a, b) => a.at - b.at || a.seq - b.seq)
    .slice(-3)
    .map(e => `${new Date(e.at * 1000).toISOString().slice(5, 16)} ${e.kind}${e.author ? `(${e.author})` : ''}`)
  return {
    id: `${task.board}/${task.id}`,
    board: task.board,
    taskId: task.id,
    title: task.title,
    owner: ownerOf(task),
    dwellSec: dwell,
    details: [...extra, ...(evTail.length ? [`事件轨迹：${evTail.join(' → ')}`] : [])],
  }
}

export interface DigestOptions {
  nowSec: number
  /** 执行停滞阈值秒（默认 3600） */
  staleAfterSec?: number
  /** 评审老化阈值秒（默认 4 小时，超者进建议） */
  reviewAgingSec?: number
}

/** 跨板输入 → 日报（纯函数；时间戳一律秒） */
export function buildDigest(boards: DigestBoardInput[], opts: DigestOptions): DailyDigest {
  const now = opts.nowSec
  const staleAfter = opts.staleAfterSec ?? 3600
  const reviewAging = opts.reviewAgingSec ?? 4 * 3600
  const winSec = 24 * 3600

  const statusCount = new Map<string, number>()
  const completed: DigestItem[] = []
  const blockers: DigestItem[] = []
  const reviewQueue: DigestItem[] = []
  const stalled: DigestItem[] = []
  const suggestions: DigestSuggestion[] = []
  let completed24h = 0
  let completedPrev = 0
  let created24h = 0
  let createdPrev = 0

  for (const board of boards) {
    if (!board.available) continue
    for (const task of board.tasks) {
      statusCount.set(task.status, (statusCount.get(task.status) ?? 0) + 1)
      if (task.completedAt != null) {
        const age = now - task.completedAt
        if (age >= 0 && age < winSec) {
          completed24h += 1
          completed.push(itemOf(task, board.events, now, [`完成于 ${fmtDuration(age)} 前`]))
        } else if (age >= winSec && age < 2 * winSec) {
          completedPrev += 1
        }
      }
      if (task.createdAt != null) {
        const age = now - task.createdAt
        if (age >= 0 && age < winSec) created24h += 1
        else if (age >= winSec && age < 2 * winSec) createdPrev += 1
      }
      if (task.status === 'blocked') {
        const item = itemOf(task, board.events, now, ['卡点任务——建议 owner 确认阻塞原因'])
        blockers.push(item)
        suggestions.push({ kind: 'unblock-blocked', target: item.id, note: `${task.board} ${task.title} 停留 ${item.dwellSec != null ? fmtDuration(item.dwellSec) : '未知'}` })
      }
      if (task.status === 'review') {
        const item = itemOf(task, board.events, now, ['评审排队——老化越久越该先看'])
        reviewQueue.push(item)
        if (item.dwellSec != null && item.dwellSec > reviewAging) {
          suggestions.push({ kind: 'review-aging', target: item.id, note: `${task.board} ${task.title} 评审已等 ${fmtDuration(item.dwellSec)}` })
        }
      }
      if (task.status === 'running') {
        const item = itemOf(task, board.events, now, ['执行中但心跳老化——停滞候选'])
        if (item.dwellSec != null && item.dwellSec > staleAfter) {
          stalled.push(item)
          suggestions.push({ kind: 'nudge-stalled', target: item.id, note: `${task.board} ${task.title} 心跳停滞 ${fmtDuration(item.dwellSec)}，建议催办或回收` })
        }
      }
    }
  }

  reviewQueue.sort((a, b) => (b.dwellSec ?? -1) - (a.dwellSec ?? -1))
  blockers.sort((a, b) => (b.dwellSec ?? -1) - (a.dwellSec ?? -1))
  completed.sort((a, b) => (a.dwellSec ?? 0) - (b.dwellSec ?? 0))

  return {
    generatedAt: now * 1000,
    windowHours: 24,
    statuses: [...statusCount.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    trend: { completed24h, completedPrev24h: completedPrev, created24h, createdPrev24h: createdPrev },
    completed: completed.slice(0, 30),
    blockers: blockers.slice(0, 20),
    reviewQueue: reviewQueue.slice(0, 20),
    stalled: stalled.slice(0, 20),
    suggestions: suggestions.slice(0, 20),
    boards: boards.length,
    boardsAvailable: boards.filter(b => b.available).length,
  }
}
