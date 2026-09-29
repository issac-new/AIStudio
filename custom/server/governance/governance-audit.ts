/**
 * 统一审计查看器数据面（spec 2026-09-29 §8 第二期 ⑥）——四源归一的只读审计查询。
 *
 * 四源各自有事实源，本模块只做归一化投影（NormalizedEvent），不写不合并存储：
 *   - approvals：审批决策日志 ~/.hermes-web-ui/approvals/history.json
 *     （复用 approval-log.ts 的 queryApprovalLog，单一读取面）
 *   - domain：六域体检台账 GOVERNANCE_REPO/docs/governance/domain-audit.jsonl
 *   - provider：provider_audit_events（hermes-web-ui.db，对齐 compaction-trace 路径候选）
 *   - kanban：task_events（HERMES_HOME 根解析 root+boards，对齐 mind-projection 先例）
 * 任一源缺席如实降级（sources 里标 available:false），不编造事件。
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { queryApprovalLog } from '../approvals/approval-log'

export interface NormalizedEvent {
  ts: number
  source: 'approvals' | 'domain' | 'provider' | 'kanban'
  actor: string
  action: string
  target: string
  result: string
  ref?: string
}

export interface AuditSourceInfo {
  id: 'approvals' | 'domain' | 'provider' | 'kanban'
  available: boolean
  note?: string
}

export interface AuditLogResult {
  ok: boolean
  sources: AuditSourceInfo[]
  total: number
  events: NormalizedEvent[]
}

const SOURCE_IDS = ['approvals', 'domain', 'provider', 'kanban'] as const

function governanceRepoRoot(): string {
  // GOVERNANCE_REPO 环境变量是配置面单一事实源；默认路径与 governance-controller.ts 对齐。
  return process.env.GOVERNANCE_REPO || '/Volumes/nvme2230/lab/ncwk-sim-mux/central/aipaydev'
}

async function openReadonly(dbPath: string) {
  const { DatabaseSync } = await import('node:sqlite')
  return new DatabaseSync(dbPath, { open: true, readOnly: true })
}

function approvalsEvents(limit: number): { events: NormalizedEvent[]; info: AuditSourceInfo } {
  try {
    const entries = queryApprovalLog(Math.min(limit, 500))
    return {
      events: entries.map((e) => ({
        ts: e.ts,
        source: 'approvals' as const,
        actor: e.actor || '(系统)',
        action: `${e.targetKind}:${e.decision}`,
        target: e.targetTitle || e.targetId || e.id,
        result: e.decision,
        ref: e.targetId || undefined,
      })),
      info: { id: 'approvals', available: true },
    }
  } catch (e) {
    return { events: [], info: { id: 'approvals', available: false, note: (e as Error).message } }
  }
}

function domainEvents(limit: number): { events: NormalizedEvent[]; info: AuditSourceInfo } {
  const file = join(governanceRepoRoot(), 'docs/governance/domain-audit.jsonl')
  if (!existsSync(file)) return { events: [], info: { id: 'domain', available: false, note: 'domain-audit.jsonl 缺席' } }
  try {
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-limit)
    const events: NormalizedEvent[] = []
    for (const line of lines) {
      try {
        const j = JSON.parse(line) as { run?: string; domain?: string; verdict?: string; checkedAt?: string; evidence?: string[] }
        events.push({
          ts: Date.parse(j.checkedAt ?? '') || 0,
          source: 'domain',
          actor: j.run ?? '(体检)',
          action: `domain-audit:${j.domain ?? '?'}`,
          target: (j.evidence ?? []).slice(0, 2).join(' · ') || (j.domain ?? ''),
          result: j.verdict ?? 'unknown',
        })
      } catch { /* 坏行跳过 */ }
    }
    return { events, info: { id: 'domain', available: true } }
  } catch (e) {
    return { events: [], info: { id: 'domain', available: false, note: (e as Error).message } }
  }
}

async function providerEvents(limit: number): Promise<{ events: NormalizedEvent[]; info: AuditSourceInfo }> {
  const candidates = [
    resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'),
    resolve(__dirname, '../../../data/hermes-web-ui.db'),
    resolve(__dirname, '../../../../data/hermes-web-ui.db'),
  ]
  const file = candidates.find((p) => existsSync(p))
  if (!file) return { events: [], info: { id: 'provider', available: false, note: 'hermes-web-ui.db 缺席' } }
  let db
  try {
    db = await openReadonly(file)
  } catch (e) {
    return { events: [], info: { id: 'provider', available: false, note: (e as Error).message } }
  }
  try {
    const rows = db.prepare(
      'SELECT created_at, actor_username, profile, provider_id, action, result FROM provider_audit_events ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as unknown as Array<{ created_at: number; actor_username: string; profile: string; provider_id: string; action: string; result: string }>
    return {
      events: rows.map((r) => ({
        ts: r.created_at > 1e12 ? r.created_at : r.created_at * 1000,
        source: 'provider' as const,
        actor: r.actor_username || '(系统)',
        action: `${r.action}@${r.provider_id}`,
        target: r.profile || 'default',
        result: r.result || 'success',
      })),
      info: { id: 'provider', available: true },
    }
  } catch (e) {
    return { events: [], info: { id: 'provider', available: false, note: (e as Error).message } }
  } finally {
    try { db.close() } catch { /* 已关 */ }
  }
}

async function kanbanEvents(limit: number): Promise<{ events: NormalizedEvent[]; info: AuditSourceInfo }> {
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
  const files: string[] = []
  const root = join(home, 'kanban.db')
  if (existsSync(root)) files.push(root)
  try {
    const { readdirSync } = await import('node:fs')
    for (const slug of readdirSync(join(home, 'kanban', 'boards'), { withFileTypes: true })) {
      if (!slug.isDirectory()) continue
      const f = join(home, 'kanban', 'boards', slug.name, 'kanban.db')
      if (existsSync(f)) files.push(f)
    }
  } catch { /* 单库形态 */ }
  if (files.length === 0) return { events: [], info: { id: 'kanban', available: false, note: 'kanban.db 缺席' } }
  const events: NormalizedEvent[] = []
  for (const file of files) {
    let db
    try {
      db = await openReadonly(file)
    } catch { continue }
    try {
      const rows = db.prepare(
        'SELECT task_id, kind, payload, created_at FROM task_events ORDER BY created_at DESC LIMIT ?',
      ).all(limit) as unknown as Array<{ task_id: string; kind: string; payload: string | null; created_at: number }>
      for (const r of rows) {
        let result = ''
        try {
          const p = r.payload ? JSON.parse(r.payload) as Record<string, unknown> : {}
          result = String(p.status ?? p.to ?? p.verdict ?? p.result ?? '')
        } catch { /* payload 非 JSON 即空 */ }
        events.push({
          ts: r.created_at * 1000,
          source: 'kanban',
          actor: '(kanban)',
          action: r.kind,
          target: r.task_id,
          result,
          ref: r.task_id,
        })
      }
    } catch { /* 单库失败跳其余 */ }
    finally { try { db.close() } catch { /* 已关 */ } }
  }
  return { events, info: { id: 'kanban', available: true } }
}

export async function auditLog(opts?: {
  sources?: string[]
  q?: string
  limit?: number
}): Promise<AuditLogResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500)
  const wanted = new Set((opts?.sources?.length ? opts.sources : SOURCE_IDS) as Array<typeof SOURCE_IDS[number]>)
  const perSource = Math.max(20, Math.ceil(limit / Math.max(1, wanted.size)))
  const parts: Array<{ events: NormalizedEvent[]; info: AuditSourceInfo }> = []
  if (wanted.has('approvals')) parts.push(approvalsEvents(perSource))
  if (wanted.has('domain')) parts.push(domainEvents(perSource))
  if (wanted.has('provider')) parts.push(await providerEvents(perSource))
  if (wanted.has('kanban')) parts.push(await kanbanEvents(perSource))
  for (const id of SOURCE_IDS) {
    if (wanted.has(id) && !parts.some((p) => p.info.id === id)) {
      parts.push({ events: [], info: { id, available: false, note: '未采集' } })
    }
  }
  const q = opts?.q?.trim().toLowerCase()
  let events = parts.flatMap((p) => p.events)
  if (q) {
    events = events.filter((e) =>
      `${e.actor} ${e.action} ${e.target} ${e.result}`.toLowerCase().includes(q),
    )
  }
  events.sort((a, b) => b.ts - a.ts)
  return {
    ok: true,
    sources: parts.map((p) => p.info),
    total: events.length,
    events: events.slice(0, limit),
  }
}
