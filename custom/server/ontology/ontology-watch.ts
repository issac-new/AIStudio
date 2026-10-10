/**
 * 本体结卡校验面（2026-10-10 本体轮四阶段，三路线评估落地）：
 *
 *   ① 单任务增量摄取+校验（共享前置件）——ingestSingleTask：
 *      读单任务行 → upsert 该任务实例（kb: 前缀，单条替换）→ 返回该任务违规。
 *      毫秒级（内存求值），供轮询环与执行式校验器共用。
 *   ② column_transition 轮询环（路线一，零 patch 全覆盖）——OntologyWatcher：
 *      周期扫各板 task_events 的 column_transition 增量（断点状态文件记
 *      last event id，重启续跑），发现 status=done → 单任务摄取+校验 →
 *      error 聚合推冲突收件箱（三阶段通道复用）。timer=RunSpawner 同款
 *      setInterval().unref()；ONTOLOGY_WATCH=off 关。
 *
 * 结卡拦截（路线二）在 agent 面 patch 591（kanban_gates.py validatorExec），
 * 本文件只做事后报告半环——两半互补：591 当场拦（配置了门的板），
 * 本环兜底全覆盖（未配门的板/其他状态转换路径）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { openReadonly } from '../governance/governance-analytics'
import { appendConflictInbox, listConflictInbox } from '../knowledge/board-graph'
import { loadInstances, loadSpec, replaceIngested } from './ontology-store'
import { validateInstances } from './ontology-validate'
import type { OntologyInstance, Violation } from './ontology-types'

interface TaskRow {
  id: string
  title: string | null
  assignee: string | null
  status: string
  estimate_days?: number | null
}

function slugOfDb(dbPath: string): string {
  const m = dbPath.split('\\').join('/').match(/boards\/([^/]+)\/kanban\.db$/)
  return m ? m[1] : 'main'
}

function defaultHome(): string {
  return process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
}

function boardDbPath(slug: string, homeDir?: string): string {
  const home = homeDir?.trim() || defaultHome()
  return slug === 'main' ? join(home, 'kanban.db') : join(home, 'kanban', 'boards', slug, 'kanban.db')
}

/** 单任务 → 实例（与全量摄取同映射：九态/estimate_days/taskRef/task_links 边） */
export async function buildTaskInstance(slug: string, taskId: string, now = Date.now(), homeDir?: string): Promise<OntologyInstance | null> {
  const dbPath = boardDbPath(slug, homeDir)
  if (!existsSync(dbPath)) return null
  let row: TaskRow | undefined
  let links: Array<{ parent_id: string; child_id: string }> = []
  let db: Awaited<ReturnType<typeof openReadonly>> | undefined
  try {
    db = await openReadonly(dbPath)
    // estimate_days 是估算轮迁移列——新建板无此列（sqlite: no such column），
    // 查询列自适应：带列版失败即回退无列版（estimate 语义缺席，不阻塞摄取）
    try {
      row = db.prepare('SELECT id, title, assignee, status, estimate_days FROM tasks WHERE id = ?').get(taskId) as unknown as TaskRow | undefined
    } catch {
      row = db.prepare('SELECT id, title, assignee, status FROM tasks WHERE id = ?').get(taskId) as unknown as TaskRow | undefined
    }
    if (!row) return null
    try {
      links = db.prepare('SELECT parent_id, child_id FROM task_links WHERE parent_id = ? OR child_id = ?').all(taskId, taskId) as unknown as typeof links
    } catch { links = [] }
  } catch { return null }
  finally { try { db?.close() } catch { /* 已关 */ } }

  const data: Record<string, unknown> = { title: row.title ?? row.id, status: row.status, taskRef: `${slug}#${row.id}` }
  if (typeof row.estimate_days === 'number' && Number.isFinite(row.estimate_days)) data.estimate_days = row.estimate_days
  const relations: Array<{ property: string; target: string }> = [
    { property: 'belongsTo', target: `kb:board:${slug}` },
  ]
  if (row.assignee?.trim()) relations.push({ property: 'assignedTo', target: `kb:agent:${row.assignee.trim()}` })
  for (const l of links) {
    if (l.parent_id === taskId) relations.push({ property: 'dependsOn', target: `kb:${slug}:task:${l.child_id}` })
    // 子指向本任务的边挂在对端实例上——单任务窗口不回写对端（全量摄取负责）
  }
  return { id: `kb:${slug}:task:${row.id}`, type: 'Task', label: (row.title ?? row.id).slice(0, 80), data, relations, updatedAt: now }
}

export interface SingleTaskResult {
  ok: boolean
  found: boolean
  instance?: OntologyInstance
  violations: Violation[]
  /** 写盘动作（单条替换语义：该任务旧摄取实例被覆盖，其余不动） */
  written: boolean
  inboxPushed: number
}

/**
 * 单任务增量摄取+校验（毫秒级）：
 *   1. 读任务行建实例（缺席返回 found=false——未入库不伪造语义）；
 *   2. 单条替换写盘（该任务旧 kb: 实例被新态覆盖，Agent/Board 实例交由全量摄取）；
 *   3. 全量校验后过滤出「以该实例为 subject」的违规返回（收件箱推送由调用方
 *      决定——轮询环走聚合推送，CLI 校验器直接透出）。
 */
export async function ingestSingleTask(slug: string, taskId: string, opts?: { now?: number; homeDir?: string }): Promise<SingleTaskResult> {
  const now = opts?.now ?? Date.now()
  const inst = await buildTaskInstance(slug, taskId, now, opts?.homeDir)
  if (!inst) return { ok: true, found: false, violations: [], written: false, inboxPushed: 0 }
  // 伴随实体（单任务窗口一并建，防悬空关系）：assignee 的 Agent + 所属 Board +
  // dependsOn 对端任务（存在才建——闭世界不造缺席语义）
  const companion: OntologyInstance[] = [
    { id: `kb:board:${slug}`, type: 'Board', label: slug, data: { slug, title: slug }, relations: [], updatedAt: now },
  ]
  const assignee = (inst.relations.find((r) => r.property === 'assignedTo')?.target) ?? ''
  if (assignee) {
    const name = assignee.replace(/^kb:agent:/, '')
    companion.push({ id: assignee, type: 'Agent', label: name, data: { name }, relations: [], updatedAt: now })
  }
  for (const rel of inst.relations) {
    if (rel.property !== 'dependsOn') continue
    const peerSlug = slug
    const peerId = rel.target.replace(`kb:${peerSlug}:task:`, '')
    const peer = await buildTaskInstance(peerSlug, peerId, now, opts?.homeDir)
    if (peer) companion.push(peer)
  }
  const batch = [inst, ...companion.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)]
  const kept = loadInstances().filter((x) => !batch.some((b) => b.id === x.id))
  const next = [...kept, ...batch]
  const spec = loadSpec()
  const all = validateInstances(spec, next)
  // error 涉及本实例才拒写（他实例的存量违规不阻塞本任务——单条替换不该被邻居连坐）
  const mine = all.filter((v) => v.subject === inst.id)
  if (mine.some((v) => v.severity === 'error')) {
    return { ok: false, found: true, instance: inst, violations: mine, written: false, inboxPushed: 0 }
  }
  replaceIngested('kb:', next.filter((x) => x.id.startsWith('kb:')))
  return { ok: true, found: true, instance: inst, violations: mine, written: true, inboxPushed: 0 }
}

/** 单任务违规聚合推送（轮询环用；同 code 幂等，复用三阶段聚合语义） */
export function pushViolationsToInbox(violations: Violation[]): number {
  const errors = violations.filter((v) => v.severity === 'error')
  if (errors.length === 0) return 0
  const byCode = new Map<string, { n: number; sample: string }>()
  for (const v of errors) {
    const hit = byCode.get(v.code) ?? { n: 0, sample: v.detail }
    hit.n += 1
    byCode.set(v.code, hit)
  }
  const openCodes = new Set(listConflictInbox().filter((e) => !e.resolved && e.kind === 'ontology').map((e) => e.field))
  let pushed = 0
  for (const [code, { n, sample }] of byCode) {
    if (openCodes.has(code)) continue
    openCodes.add(code)
    appendConflictInbox({
      board: 'ontology', entityId: `(聚合) ${code}`, field: code,
      existing: '(本体数据契约)', incoming: `×${n}：${sample}`, kind: 'ontology',
    })
    pushed += 1
  }
  return pushed
}

// ---- 路线一：column_transition 轮询环 ----

interface TransitionEvent { id: number; task_id: string; payload: string }

export interface WatchTickResult {
  checked: number
  ingested: number
  violations: number
  inboxPushed: number
  error?: string
}

function watchStateFile(): string {
  const base = process.env.ONTOLOGY_WATCH_STATE?.trim()
  if (base) return base
  return join(homedir(), '.hermes-web-ui', 'overlay', 'ontology-watch.json')
}

function readLastEventId(): number {
  try {
    return Number(JSON.parse(readFileSync(watchStateFile(), 'utf8')).lastEventId ?? 0)
  } catch { return 0 }
}

function writeLastEventId(id: number): void {
  try {
    const file = watchStateFile()
    mkdirSync(join(file, '..'), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, JSON.stringify({ lastEventId: id, updatedAt: Date.now() }))
    renameSync(tmp, file)
  } catch { /* 断点丢失=重扫一轮（幂等），可接受 */ }
}

class OntologyWatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  lastTick: WatchTickResult | null = null

  async runOnce(): Promise<WatchTickResult> {
    const res: WatchTickResult = { checked: 0, ingested: 0, violations: 0, inboxPushed: 0 }
    if (this.busy) return res
    this.busy = true
    try {
      let lastId = readLastEventId()
      let maxId = lastId
      // 各板独立序（task_events.id 全库自增）；扫全部板取增量，状态记全局最大 id
      // ——跨板重扫的代价=重复摄取同任务（幂等），不漏事件的优先级更高
      const home = defaultHome()
      const boardsRoot = join(home, 'kanban', 'boards')
      const dbs: string[] = []
      if (existsSync(join(home, 'kanban.db'))) dbs.push(join(home, 'kanban.db'))
      try {
        const { readdirSync } = require('node:fs') as typeof import('node:fs')
        for (const slug of readdirSync(boardsRoot, { withFileTypes: true })) {
          if (!slug.isDirectory()) continue
          const f = join(boardsRoot, slug.name, 'kanban.db')
          if (existsSync(f)) dbs.push(f)
        }
      } catch { /* boards 目录缺席=单库形态 */ }

      for (const dbPath of dbs) {
        const slug = slugOfDb(dbPath)
        let events: TransitionEvent[] = []
        let db: Awaited<ReturnType<typeof openReadonly>> | undefined
        try {
          db = await openReadonly(dbPath)
          events = db.prepare("SELECT id, task_id, payload FROM task_events WHERE kind = 'column_transition' AND id > ? ORDER BY id").all(lastId) as unknown as TransitionEvent[]
        } catch { continue }
        finally { try { db?.close() } catch { /* 已关 */ } }
        for (const ev of events) {
          maxId = Math.max(maxId, ev.id)
          res.checked += 1
          let payload: { status?: unknown } = {}
          try { payload = JSON.parse(ev.payload) } catch { continue }
          if (payload.status !== 'done') continue
          const r = await ingestSingleTask(slug, ev.task_id)
          if (r.found) res.ingested += 1
          if (!r.ok) {
            res.violations += r.violations.length
            res.inboxPushed += pushViolationsToInbox(r.violations)
          }
        }
      }
      if (maxId > lastId) writeLastEventId(maxId)
      this.lastTick = res
      return res
    } catch (err) {
      res.error = err instanceof Error ? err.message : String(err)
      this.lastTick = res
      return res
    } finally {
      this.busy = false
    }
  }

  start(intervalMs = 30_000): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.runOnce() }, intervalMs)
    this.timer.unref()
    void this.runOnce()
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }
}

let watcherSingleton: OntologyWatcher | null = null

export function ensureOntologyWatcher(): OntologyWatcher {
  if (!watcherSingleton) watcherSingleton = new OntologyWatcher()
  return watcherSingleton
}

export function startOntologyWatchIfEnabled(): OntologyWatcher | null {
  if (process.env.ONTOLOGY_WATCH === 'off') return null
  const w = ensureOntologyWatcher()
  w.start(Number(process.env.ONTOLOGY_WATCH_INTERVAL_MS ?? 30_000))
  return w
}
