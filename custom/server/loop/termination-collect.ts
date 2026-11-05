// overlay/loop 域：终止码分布采集（2026-11-05 AI Native 吸收批 T2）。
// 数据面 fail-soft：qgate 态账本缺席/看板库缺席=该面 available:false，不猜数。
// 面清单：qgate（.qgate/state.json 门判定）+ kanban（各板 task_runs.outcome）。
// graph run 面未接线（finishReason 的持久化面在 loop store，接线属后续批）。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boardDbPaths } from '../delivery/boards-reader'
import { fromGateVerdict, fromKanbanOutcome, type LoopTerminationCode } from './termination'

export interface TerminationFaceCount {
  code: LoopTerminationCode
  count: number
}

export interface TerminationSubsystemFace {
  subsystem: 'qgate' | 'kanban'
  available: boolean
  error?: string
  samples: number
  byCode: TerminationFaceCount[]
}

export interface TerminationsReport {
  days: number
  byCode: TerminationFaceCount[]
  bySubsystem: TerminationSubsystemFace[]
  notes: string[]
}

interface QgateStateEntry {
  verdict?: string
  startedAt?: number
}

function repoRoot(): string {
  const env = process.env.OVERLAY_REPO_ROOT?.trim()
  if (env) return env
  let dir = process.cwd()
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      try {
        if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === 'aistudio') return dir
      } catch { /* 坏 package.json 继续上溯 */ }
    }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function hermesHome(): string {
  const env = process.env.HERMES_HOME?.trim()
  return env || join(process.env.HOME ?? '~', '.hermes')
}

function tally(codes: LoopTerminationCode[]): TerminationFaceCount[] {
  const m = new Map<LoopTerminationCode, number>()
  for (const c of codes) m.set(c, (m.get(c) ?? 0) + 1)
  return [...m.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
}

export function collectTerminations(days: number): TerminationsReport {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000
  const notes: string[] = []
  const bySubsystem: TerminationSubsystemFace[] = []

  // ── qgate 面：.qgate/state.json 门判定（最近一次 verdict / startedAt 过滤）──
  let qgateCodes: LoopTerminationCode[] = []
  try {
    const p = join(repoRoot(), '.qgate/state.json')
    if (!existsSync(p)) {
      bySubsystem.push({ subsystem: 'qgate', available: false, error: 'state.json 缺席（qgate 未跑过）', samples: 0, byCode: [] })
    } else {
      const state = JSON.parse(readFileSync(p, 'utf8')) as Record<string, QgateStateEntry>
      for (const [gate, e] of Object.entries(state)) {
        if (gate.startsWith('$')) continue
        const at = typeof e.startedAt === 'number' ? e.startedAt : 0
        if (at && at < sinceMs) continue
        qgateCodes.push(fromGateVerdict(e.verdict))
      }
      bySubsystem.push({ subsystem: 'qgate', available: true, samples: qgateCodes.length, byCode: tally(qgateCodes) })
    }
  } catch (e) {
    bySubsystem.push({ subsystem: 'qgate', available: false, error: String((e as Error).message).slice(0, 120), samples: 0, byCode: [] })
  }

  // ── kanban 面：各板 task_runs.outcome（ended_at 窗口过滤；逐板 fail-soft）──
  let kanbanCodes: LoopTerminationCode[] = []
  let kanbanBoards = 0
  let kanbanError: string | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
    for (const { dbPath } of boardDbPaths(hermesHome())) {
      let db: { close: () => void } | null = null
      try {
        db = new DatabaseSync(dbPath, { readOnly: true })
        const rows = (db as unknown as { prepare: (sql: string) => { all: () => unknown[] } }).prepare(
          'select outcome, ended_at from task_runs where ended_at is not null',
        ).all() as Array<{ outcome: string | null; ended_at: number | null }>
        for (const r of rows) {
          const ended = Number(r.ended_at)
          // ended_at 秒级（<1e12）与毫秒级双兼容
          const endedMs = Number.isFinite(ended) && ended > 0 ? (ended < 1e12 ? ended * 1000 : ended) : 0
          if (endedMs && endedMs < sinceMs) continue
          kanbanCodes.push(fromKanbanOutcome(r.outcome))
        }
        kanbanBoards += 1
      } catch (e) {
        kanbanError = kanbanError ?? String((e as Error).message).slice(0, 120)
      } finally {
        try { db?.close() } catch { /* 已关 */ }
      }
    }
    bySubsystem.push({
      subsystem: 'kanban',
      available: kanbanBoards > 0,
      error: kanbanBoards > 0 ? undefined : (kanbanError ?? '看板库缺席'),
      samples: kanbanCodes.length,
      byCode: tally(kanbanCodes),
    })
  } catch (e) {
    bySubsystem.push({ subsystem: 'kanban', available: false, error: String((e as Error).message).slice(0, 120), samples: 0, byCode: [] })
  }

  notes.push('graph run 面（finishReason）未接线——映射函数 fromGraphFinishReason 已备，接线属后续批')
  notes.push('口径：qgate=窗口内最近门判定；kanban=窗口内已结束 run 的 outcome；UNKNOWN 计入分布不剔除')

  const all = [...qgateCodes, ...kanbanCodes]
  return { days, byCode: tally(all), bySubsystem, notes }
}
