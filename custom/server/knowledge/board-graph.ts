/**
 * 板级共享知识图谱（丙7+丙8，2026-09-30 调研落地）。
 *
 * 丙7：每板一份 KG（~/.hermes/semantica/board-<slug>.json），结案任务摄取为
 * task/agent 实体 + performed 关系——"一个 agent 的发现对其他 agent 可见"的信息流
 * 底座（最小形态：任务协作事实共享）。摄取=同步模型（POST 触发，marker 文件防重），
 * 不宣称实时。
 *
 * 丙8：冲突收件箱——实体属性矛盾（同 id 异值）不静默覆盖（bridge 写保护），冲突
 * 进 JSONL 收件箱待裁决；裁决动作 keep-existing（维持现状）| take-incoming（force
 * 重写）。Conflicts 来源目前=摄取对比；多 agent 上报面属增量（如实登记）。
 *
 * 写者边界登记：board KG 写者=本模块（bridge 串行+文件锁）；agent MCP 实例不指向
 * 板级 KG（各走各文件）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'

// ---- bridge 操作（复用 decisiongraph 客户端的执行器注入） ----
import { semanticaPython, setBridgeRunnerForTests, bridgeScript, type BridgeRunner } from '../decisiongraph/semantica-client'
import { spawn } from 'node:child_process'

export interface EntityConflict {
  entityId: string
  field: string
  existing: unknown
  incoming: unknown
}

export interface InboxEntry {
  inboxId: string
  ts: number
  board: string
  entityId: string
  field: string
  existing: unknown
  incoming: unknown
  resolved: false | { action: 'keep-existing' | 'take-incoming'; at: number }
}

async function runKgOp<T>(op: string, kgPath: string, input: Record<string, unknown>): Promise<T | null> {
  const python = semanticaPython()
  if (!python || process.env.HERMES_DECISION_GRAPH === '0') return null
  return new Promise((res) => {
    const child = spawn(python, [bridgeScript(), op, '--kg', kgPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000)
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.on('close', () => {
      clearTimeout(timer)
      const lines = out.split('\n').filter((l) => l.trim().startsWith('{'))
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]) as T & { ok?: boolean }
          if (parsed.ok !== false) { res(parsed); return }
        } catch { /* 找下一行 */ }
      }
      res(null)
    })
    child.on('error', () => { clearTimeout(timer); res(null) })
    child.stdin.write(JSON.stringify(input))
    child.stdin.end()
  })
}

// ---- 路径族 ----

export function boardKgDir(): string {
  const env = process.env.SEMANTICA_BOARD_KG_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes', 'semantica')
}

export function boardKgPath(slug: string): string {
  const safe = slug.replace(/[^A-Za-z0-9._-]/g, '_') || 'main'
  return join(boardKgDir(), `board-${safe}.json`)
}

function markerPath(slug: string): string {
  const base = process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR?.trim()
  const dir = base ? resolve(base) : resolve(homedir(), '.hermes-web-ui', 'overlay')
  return join(dir, `board-sync-${slug.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

function inboxPath(): string {
  const env = process.env.GOVERNANCE_CONFLICT_INBOX?.trim()
  return env ? resolve(env) : resolve(homedir(), '.hermes-web-ui', 'overlay', 'conflict-inbox.jsonl')
}

// ---- 冲突收件箱（append-only JSONL） ----

export function appendConflictInbox(entry: Omit<InboxEntry, 'inboxId' | 'ts' | 'resolved'> & { ts?: number }): InboxEntry {
  const full: InboxEntry = {
    ...entry,
    inboxId: `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts: entry.ts ?? Date.now(),
    resolved: false,
  }
  try {
    const file = inboxPath()
    mkdirSync(join(file, '..'), { recursive: true })
    appendFileSync(file, JSON.stringify(full) + '\n')
  } catch (err) {
    console.warn(`[board-graph] 冲突收件箱追加失败（fail-soft）：${err instanceof Error ? err.message : String(err)}`)
  }
  return full
}

export function listConflictInbox(): InboxEntry[] {
  const file = inboxPath()
  if (!existsSync(file)) return []
  const out: InboxEntry[] = []
  try {
    for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      try {
        const j = JSON.parse(line) as InboxEntry
        if (j && typeof j.inboxId === 'string' && j.resolved !== undefined) out.push(j)
      } catch { /* 坏行跳过 */ }
    }
  } catch { return [] }
  return out.reverse()  // 新→旧
}

export function resolveConflictInbox(inboxId: string, action: 'keep-existing' | 'take-incoming'): InboxEntry | null {
  const file = inboxPath()
  const entries = listConflictInbox().reverse()
  const hit = entries.find((e) => e.inboxId === inboxId)
  if (!hit || hit.resolved) return hit ?? null
  if (action === 'take-incoming') {
    // force 重写实体（裁决"取新值"）：经 bridge 写回，board 从 entityId 前缀 task:/agent: 推断
    const board = hit.board
    const props: Record<string, unknown> = { [hit.field]: hit.incoming, type: hit.entityId.split(':')[0] === 'task' ? 'task' : 'agent' }
    void runKgOp('entity', boardKgPath(board), { id: hit.entityId, type: props.type as string, props, force: true })
  }
  hit.resolved = { action, at: Date.now() }
  try {
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
    renameSync(tmp, file)
  } catch { /* 持久化失败仅影响下次读取仍为未决，可接受 */ }
  return hit
}

// ---- 板同步（结案任务摄取） ----

export interface BoardSyncResult {
  board: string
  scanned: number
  ingested: number
  relations: number
  conflicts: EntityConflict[]
  kgAvailable: boolean
}

interface TaskRow { id: string | number; title: string | null; assignee: string | null; status: string; completed_at: number | null }

function readMarker(slug: string): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(markerPath(slug), 'utf8')) as string[])
  } catch { return new Set() }
}

function writeMarker(slug: string, seen: Set<string>): void {
  try {
    const file = markerPath(slug)
    mkdirSync(join(file, '..'), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, JSON.stringify([...seen]))
    renameSync(tmp, file)
  } catch { /* marker 失败=下次重摄取，图谱幂等可接受 */ }
}

/** 单板同步：结案（done/archived）任务→实体+关系；conflicts 进收件箱。 */
export async function syncBoardGraph(slug: string, boardDb?: string): Promise<BoardSyncResult> {
  const res: BoardSyncResult = { board: slug, scanned: 0, ingested: 0, relations: 0, conflicts: [], kgAvailable: semanticaPython() !== null }
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
  const dbPath = boardDb ?? join(home, 'kanban', 'boards', slug, 'kanban.db')
  if (!existsSync(dbPath)) return res
  let rows: TaskRow[] = []
  let db: Awaited<ReturnType<typeof openReadonly>> | undefined
  try {
    db = await openReadonly(dbPath)
    rows = db.prepare("SELECT id, title, assignee, status, completed_at FROM tasks WHERE status IN ('done','archived')").all() as unknown as TaskRow[]
  } catch { return res }
  finally { try { db?.close() } catch { /* 已关 */ } }
  res.scanned = rows.length
  const seen = readMarker(slug)
  const kg = boardKgPath(slug)
  // 批量摄取（丙7 性能根治）：整板两次 bridge 调用（entity-batch + relation-batch），
  // 替代每任务 2-3 次子进程（744 任务 × 2.2s → 两板各 2 次调用，分钟级降为秒级）。
  const entities: Array<{ id: string; type: string; props: Record<string, unknown> }> = []
  const relations: Array<{ src: string; dst: string; type: string }> = []
  const touched: string[] = []
  for (const t of rows) {
    const tid = String(t.id)
    if (seen.has(tid)) continue
    entities.push({ id: `task:${tid}`, type: 'task', props: { title: t.title ?? '', status: t.status, type: 'task' } })
    if (t.assignee?.trim()) {
      entities.push({ id: `agent:${t.assignee.trim()}`, type: 'agent', props: { name: t.assignee.trim(), type: 'agent' } })
      relations.push({ src: `agent:${t.assignee.trim()}`, dst: `task:${tid}`, type: 'performed' })
    }
    touched.push(tid)
  }
  if (entities.length > 0) {
    const batch = await runKgOp<{ ok: boolean; added: number; conflicts: Array<{ entityId: string; fields: EntityConflict[] }> }>('entity-batch', kg, { items: entities })
    if (!batch) {
      res.kgAvailable = false
      return res  // python 缺席：如实降级，不写 marker（下次重试）
    }
    res.ingested = batch.added ?? 0
    for (const c of batch.conflicts ?? []) {
      for (const f of c.fields) {
        res.conflicts.push({ entityId: c.entityId, field: f.field, existing: f.existing, incoming: f.incoming })
        appendConflictInbox({ board: slug, entityId: c.entityId, field: f.field, existing: f.existing, incoming: f.incoming })
      }
    }
  }
  if (relations.length > 0) {
    const relBatch = await runKgOp<{ ok: boolean; added: number }>('relation-batch', kg, { items: relations })
    if (!relBatch) {
      res.kgAvailable = false
      return res
    }
    res.relations = relBatch.added ?? 0
  }
  for (const tid of touched) seen.add(tid)
  if (res.kgAvailable) writeMarker(slug, seen)
  return res
}

/** 全板同步（root=main + boards/*）。 */
export async function syncAllBoardGraphs(): Promise<BoardSyncResult[]> {
  const out: BoardSyncResult[] = []
  for (const file of kanbanDbFiles()) {
    const m = file.match(/boards[\/]([^/]+)[\/]kanban\.db$/)
    const slug = m ? m[1] : 'main'
    out.push(await syncBoardGraph(slug, file))
  }
  return out
}

export async function boardGraphSummary(slug: string): Promise<{ board: string; nodes: number; edges: number; byType: Record<string, number>; recent: Array<{ id: string; type: string }> | null }> {
  const r = await runKgOp<{ nodes: number; edges: number; byType: Record<string, number>; recent: Array<{ id: string; type: string }> }>('kg-summary', boardKgPath(slug), {})
  return { board: slug, nodes: r?.nodes ?? 0, edges: r?.edges ?? 0, byType: r?.byType ?? {}, recent: r?.recent ?? null }
}

export { setBridgeRunnerForTests }
export type { BridgeRunner }
