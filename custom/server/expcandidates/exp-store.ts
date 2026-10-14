// overlay[expcandidates] 经验候选 store（eval store 同模式）+ 提取执行面。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ExpCandidate, ExpStoreShape } from './exp-types'
import { extractCandidates, toCandidate, type ExtractEventRow, type ExtractOptions } from './extract'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'

export function storeDir(): string {
  const env = process.env.EXP_STORE?.trim()
  return env || join(homedir(), '.hermes-web-ui', 'expcandidates')
}

function storePath(): string {
  return join(storeDir(), 'exp-candidates.json')
}

export function readExpStore(): ExpStoreShape {
  let raw: Partial<ExpStoreShape>
  try {
    raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<ExpStoreShape>
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { candidates: [], nextSeq: 1 }
    throw e
  }
  return {
    candidates: Array.isArray(raw.candidates) ? raw.candidates : [],
    nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
  }
}

export function writeExpStore(store: ExpStoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = storePath()
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function listCandidates(): ExpCandidate[] {
  return readExpStore().candidates
}

export function curateCandidate(id: string, status: 'approved' | 'rejected' | 'candidate'): ExpCandidate {
  const store = readExpStore()
  const idx = store.candidates.findIndex((c) => c.id === id)
  if (idx < 0) throw new Error(`候选不存在：${id}`)
  store.candidates[idx] = { ...store.candidates[idx], status, updatedAt: new Date().toISOString() }
  writeExpStore(store)
  return store.candidates[idx]
}

/** B2 注入留痕（追加制，幂等）。 */
export function recordInjection(ids: string[], runLabel: string): void {
  const store = readExpStore()
  for (const c of store.candidates) {
    if (ids.includes(c.id) && !c.injectedRuns.includes(runLabel)) {
      c.injectedRuns.push(runLabel)
      c.updatedAt = new Date().toISOString()
    }
  }
  writeExpStore(store)
}

// ---------- 提取执行面（读板库→归一→提取→指纹幂等入库） ----------

interface RawEventRow { id: number; task_id: string; kind: string; payload: unknown; created_at: number }

export function normalizeEvents(rows: RawEventRow[]): ExtractEventRow[] {
  const out: ExtractEventRow[] = []
  for (const r of rows) {
    let payload: { to?: string; results?: Array<{ gate?: string; ok?: boolean; reason?: string; detail?: string }> } = {}
    try {
      payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload as never) ?? {}
    } catch { continue }
    const failures = (payload.results ?? [])
      .filter((x) => x && x.ok === false)
      .map((x) => ({ gate: String(x.gate ?? 'unknown'), reason: String(x.reason ?? 'unknown'), detail: x.detail ? String(x.detail) : undefined }))
    out.push({
      taskId: String(r.task_id),
      kind: r.kind,
      to: payload.to ? String(payload.to) : undefined,
      failures: failures.length ? failures : undefined,
      at: Number(r.created_at),
      seq: Number(r.id),
    })
  }
  return out
}

export interface ExtractRunResult {
  boardsRead: number
  eventsScanned: number
  newCandidates: number
  duplicatesSkipped: number
  candidates: ExpCandidate[]
}

export async function runExtraction(opts: ExtractOptions & { days?: number } = {}): Promise<ExtractRunResult> {
  const days = Math.max(1, Math.min(180, opts.days ?? 14))
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const events: ExtractEventRow[] = []
  let boardsRead = 0
  for (const f of kanbanDbFiles()) {
    try {
      const db = await openReadonly(f)
      try {
        const rows = db
          .prepare('SELECT id, task_id, kind, payload, created_at FROM task_events WHERE created_at >= ? ORDER BY id')
          .all(since) as unknown as RawEventRow[]
        events.push(...normalizeEvents(rows))
        boardsRead += 1
      } finally {
        db.close()
      }
    } catch { /* 单板失败不阻断（多板合并口径） */ }
  }
  const extracted = extractCandidates(events, opts)
  const store = readExpStore()
  const known = new Set(store.candidates.map((c) => c.fingerprint))
  const now = new Date().toISOString()
  let added = 0
  let skipped = 0
  for (const item of extracted) {
    if (known.has(item.fingerprint)) { skipped += 1; continue }
    const candidate = toCandidate(item, `exp-${String(store.nextSeq).padStart(3, '0')}`, now)
    store.nextSeq += 1
    store.candidates.push(candidate)
    known.add(item.fingerprint)
    added += 1
  }
  if (added > 0) writeExpStore(store)
  return {
    boardsRead, eventsScanned: events.length, newCandidates: added, duplicatesSkipped: skipped,
    candidates: added > 0 ? store.candidates.slice(-added) : [],
  }
}

/** 测试隔离。 */
export function _useStoreDirForTests(dir: string): void {
  process.env.EXP_STORE = dir
}
