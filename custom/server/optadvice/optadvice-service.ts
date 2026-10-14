// overlay[optadvice] 建议报告服务（A+F 项）：聚合既有面出报告，不新增采集面。
// 三源（全部 fail-soft，缺席标 available:false）：
//   sessions   hermes-web-ui.db sessions 表（token/成本列，last_active 秒窗）→ 烧钱会话 Top-N
//   kanban     各板 kanban.db task_events（column_transition → 周期瀑布；gate_blocked/warning → 拦截 Top-N）
//   traces     ~/.hermes/traces JSONL——宿主实测仅 header/trailer（span 落 profile 侧），如实缺席
import { DatabaseSync } from 'node:sqlite'
import { resolveStudioDb } from '../harness/cost-accounts.ts'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics.ts'
import { normalizeEvents } from '../expcandidates/exp-store.ts'
import {
  topSessions, gateErrorRowsFromEvents, topGateErrors,
  type AdviceReport, type SessionUsageRow, type SourceStatus,
} from './advice.ts'
import { topStages, waterfallFromEvents, type TransitionLite } from './leadtime.ts'

function sessionRows(db: DatabaseSync, days: number): SessionUsageRow[] {
  const cols = (db.prepare('PRAGMA table_info(sessions)').all() as unknown as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes('input_tokens')) throw new Error('sessions 表无 token 列')
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const where = cols.includes('last_active') ? 'WHERE last_active >= ?' : ''
  const sql = [
    'SELECT id, title, model, last_active,',
    'COALESCE(input_tokens,0)+COALESCE(output_tokens,0)+COALESCE(cache_read_tokens,0)+COALESCE(cache_write_tokens,0)+COALESCE(reasoning_tokens,0) AS total,',
    'COALESCE(input_tokens,0) AS i, COALESCE(output_tokens,0) AS o, estimated_cost_usd',
    `FROM sessions ${where} ORDER BY total DESC LIMIT 200`,
  ].join(' ')
  const stmt = db.prepare(sql)
  const rows = (where ? stmt.all(since) : stmt.all()) as unknown as Array<{
    id: string; title: string | null; model: string; last_active: number | null
    total: number; i: number; o: number; estimated_cost_usd: number | null
  }>
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title ?? null,
    model: r.model ?? '',
    lastActive: r.last_active ?? null,
    inputTokens: r.i,
    outputTokens: r.o,
    totalTokens: r.total,
    estimatedCostUsd: r.estimated_cost_usd ?? null,
  }))
}

interface EventRow { task_id: string; kind: string; payload: unknown; created_at: number; id: number }

function boardEvents(db: DatabaseSync, days: number): EventRow[] {
  const since = Math.floor(Date.now() / 1000) - days * 86400
  return db
    .prepare('SELECT id, task_id, kind, payload, created_at FROM task_events WHERE created_at >= ? ORDER BY id')
    .all(since) as unknown as EventRow[]
}

/** 报告主体（多板合并口径：全部板库 task_events 汇入同一瀑布与拦截榜）。 */
export async function buildAdviceReport(opts: { days?: number; limit?: number } = {}): Promise<AdviceReport> {
  const days = Math.max(1, Math.min(90, opts.days ?? 7))
  const limit = Math.max(1, Math.min(20, opts.limit ?? 5))
  const sources: SourceStatus[] = []

  // ── sessions（token Top-N）──
  let tokenTop: SessionUsageRow[] = []
  const dbFile = resolveStudioDb()
  if (dbFile) {
    try {
      const db = await openReadonly(dbFile)
      try {
        tokenTop = topSessions(sessionRows(db, days), limit)
        sources.push({ id: 'hermes-web-ui.db sessions', available: true, note: dbFile })
      } finally {
        db.close()
      }
    } catch (e) {
      sources.push({ id: 'hermes-web-ui.db sessions', available: false, note: String((e as Error).message || e) })
    }
  } else {
    sources.push({ id: 'hermes-web-ui.db sessions', available: false, note: '库缺席（候选路径均未命中）' })
  }

  // ── kanban（瀑布 + 拦截 Top-N）──
  // 归一走 expcandidates.normalizeEvents 单点（闸词汇+舰队生命周期词汇双兼容，
  // run19 实测舰队 task_events 无 column_transition/gate_blocked，全走生命周期词汇）。
  let waterfall: AdviceReport['waterfall'] = null
  let gateErrorTop: AdviceReport['gateErrorTop'] = []
  const boards = kanbanDbFiles()
  if (boards.length) {
    const transitions: TransitionLite[] = []
    const normalized: Array<{ taskId: string; kind: string; to?: string; failures?: Array<{ gate: string; reason: string; detail?: string }>; at: number }> = []
    let boardsOk = 0
    let lastErr = ''
    for (const f of boards) {
      try {
        const db = await openReadonly(f)
        try {
          for (const r of normalizeEvents(boardEvents(db, days))) {
            normalized.push(r)
            if (r.to) transitions.push({ taskId: r.taskId, to: r.to, at: r.at, seq: r.seq })
          }
          boardsOk += 1
        } finally {
          db.close()
        }
      } catch (e) {
        lastErr = String((e as Error).message || e)
      }
    }
    if (boardsOk > 0) {
      waterfall = waterfallFromEvents(transitions)
      gateErrorTop = topGateErrors(gateErrorRowsFromEvents(normalized), limit)
      sources.push({ id: `kanban task_events（${boardsOk}/${boards.length} 板可读）`, available: true })
    } else {
      sources.push({ id: 'kanban task_events', available: false, note: lastErr || '板库不可读' })
    }
  } else {
    sources.push({ id: 'kanban task_events', available: false, note: '无板库（kanban/boards 目录缺席=单库未建）' })
  }

  // ── traces（工具 span 面：宿主侧仅 header/trailer，如实缺席不造数）──
  sources.push({
    id: 'traces 工具 span',
    available: false,
    note: '宿主 traces 目录实测仅 header/trailer（span 落 profile 侧隔离区）；工具级报错并入看板拦截面',
  })

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    sources,
    tokenTop,
    slowStages: waterfall ? topStages(waterfall, limit) : [],
    gateErrorTop,
    waterfall,
  }
}
