/**
 * 本体摄取管线（kanban → 本体实例，GB/T 48000.3 落地的"实"面）。
 *
 * 把 swarm kanban 真实任务自动搬进本体（A-Box），本体不再只是手工字典：
 *   tasks 行      → Task 实例（id=kb:<slug>:task:<tid>，taskRef=<slug>#<tid> 唯一键防重）
 *   assignee      → Agent 实例（id=kb:agent:<name>，跨板共享；SwarmStudio 看板执行者
 *                   现状全是 AI 代理名——如实映射 Agent，人类协作方人工补录 Human）
 *   板            → Board 实例（id=kb:board:<slug>）
 *   task_links    → dependsOn 关系（两端任务都摄取才建边，无环公理求值兜底）
 *   assignee      → assignedTo 关系；所属板 → belongsTo
 *
 * 替换语义：摄取实例统一 `kb:` 前缀，重跑=删旧批换新批（任务状态演进如实刷新）；
 * 手工实例零交集。写入前跑全量校验，error 涉及的实例剔除出批（违规进 skipped
 * 呈现给人，不静默吞），两轮内收敛。数据源只读（openReadonly 同款）。
 */
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { loadInstances, loadSpec, replaceIngested } from './ontology-store'
import { validateInstances } from './ontology-validate'
import type { OntologyInstance, Violation } from './ontology-types'

export const INGEST_PREFIX = 'kb:'

interface TaskRow {
  id: string
  title: string | null
  assignee: string | null
  status: string
  estimate_days: number | null
}

interface LinkRow { parent_id: string; child_id: string }

function slugOf(dbPath: string): string {
  // Windows join() 产反斜杠——先归一分隔符（syncAllBoardGraphs 同坑）
  const m = dbPath.split('\\').join('/').match(/boards\/([^/]+)\/kanban\.db$/)
  return m ? m[1] : 'main'
}

export interface IngestResult {
  ok: boolean
  boards: Array<{ slug: string; tasks: number; links: number }>
  ingested: { tasks: number; agents: number; boards: number; relations: number }
  /** 校验剔除的任务（error 级违规，呈现给人） */
  skipped: Violation[]
  /** 写入后的全量健康度 */
  summary: { error: number; warning: number; info: number }
  instanceTotal: number
}

/** 单板/全板摄取。board 指定 slug 只跑该板；缺省全板。 */
export async function ingestFromKanban(opts?: { board?: string; homeDir?: string }, now = Date.now()): Promise<IngestResult> {
  const res: IngestResult = {
    ok: true, boards: [], ingested: { tasks: 0, agents: 0, boards: 0, relations: 0 },
    skipped: [], summary: { error: 0, warning: 0, info: 0 }, instanceTotal: 0,
  }
  const files = kanbanDbFiles(opts?.homeDir).filter((f) => (opts?.board ? slugOf(f) === opts.board : true))
  const spec = loadSpec()

  const batch: OntologyInstance[] = []
  const agents = new Map<string, OntologyInstance>()
  const boards = new Map<string, OntologyInstance>()
  const taskIds = new Set<string>()  // 本批任务实例 id（建边过滤）

  for (const dbPath of files) {
    if (!existsSync(dbPath)) continue
    const slug = slugOf(dbPath)
    let rows: TaskRow[] = []
    let links: LinkRow[] = []
    let db: Awaited<ReturnType<typeof openReadonly>> | undefined
    try {
      db = await openReadonly(dbPath)
      rows = db.prepare('SELECT id, title, assignee, status, estimate_days FROM tasks').all() as unknown as TaskRow[]
      try {
        links = db.prepare('SELECT parent_id, child_id FROM task_links').all() as unknown as LinkRow[]
      } catch { links = [] /* 无 task_links 表的老库：任务照搬，依赖关系如实缺席 */ }
    } catch { continue }
    finally { try { db?.close() } catch { /* 已关 */ } }

    const boardInst: OntologyInstance = {
      id: `kb:board:${slug}`, type: 'Board', label: slug,
      data: { slug, title: slug }, relations: [], updatedAt: now,
    }
    boards.set(slug, boardInst)
    res.boards.push({ slug, tasks: rows.length, links: links.length })

    for (const t of rows) {
      const instId = `kb:${slug}:task:${t.id}`
      const data: Record<string, unknown> = {
        title: t.title ?? t.id,
        status: t.status,
        taskRef: `${slug}#${t.id}`,
      }
      if (typeof t.estimate_days === 'number' && Number.isFinite(t.estimate_days)) data.estimate_days = t.estimate_days
      const rels: Array<{ property: string; target: string }> = [
        { property: 'belongsTo', target: boardInst.id },
      ]
      if (t.assignee?.trim()) {
        const name = t.assignee.trim()
        if (!agents.has(name)) {
          agents.set(name, {
            id: `kb:agent:${name}`, type: 'Agent', label: name,
            data: { name }, relations: [], updatedAt: now,
          })
        }
        rels.push({ property: 'assignedTo', target: `kb:agent:${name}` })
      }
      batch.push({ id: instId, type: 'Task', label: (t.title ?? t.id).slice(0, 80), data, relations: rels, updatedAt: now })
      taskIds.add(instId)
    }

    // 依赖关系（第二遍：两端都在本批才建边——悬空边违背闭世界契约）
    for (const l of links) {
      const from = `kb:${slug}:task:${l.parent_id}`
      const to = `kb:${slug}:task:${l.child_id}`
      if (!taskIds.has(from) || !taskIds.has(to)) continue
      const host = batch.find((x) => x.id === from)
      if (host) host.relations.push({ property: 'dependsOn', target: to })
    }
  }

  batch.push(...boards.values(), ...agents.values())

  // 写前校验：error 涉及的实例剔除出批（最多两轮收敛——剔除可能消除悬空边）
  let candidates = batch
  for (let round = 0; round < 2; round++) {
    const violations = validateInstances(spec, [...loadInstances().filter((x) => !x.id.startsWith(INGEST_PREFIX)), ...candidates])
    const bad = new Set(violations.filter((v) => v.severity === 'error').map((v) => v.subject))
    if (bad.size === 0) break
    res.skipped.push(...violations.filter((v) => bad.has(v.subject)))
    candidates = candidates.filter((x) => !bad.has(x.id))
  }

  replaceIngested(INGEST_PREFIX, candidates)
  const finalInstances = loadInstances()
  const finalV = validateInstances(spec, finalInstances)
  res.ingested = {
    tasks: candidates.filter((x) => x.type === 'Task').length,
    agents: candidates.filter((x) => x.type === 'Agent').length,
    boards: candidates.filter((x) => x.type === 'Board').length,
    relations: candidates.reduce((n, x) => n + x.relations.length, 0),
  }
  res.summary = {
    error: finalV.filter((v) => v.severity === 'error').length,
    warning: finalV.filter((v) => v.severity === 'warning').length,
    info: finalV.filter((v) => v.severity === 'info').length,
  }
  res.instanceTotal = finalInstances.length
  return res
}

/** kanban 数据源概览（摄取按钮旁的健康提示用；不读任务体，只数行）。 */
export function kanbanSourceOverview(homeDir?: string): Array<{ slug: string; path: string; exists: boolean }> {
  return kanbanDbFiles(homeDir).map((p) => ({ slug: slugOf(p), path: p, exists: existsSync(p) }))
}

export function defaultHome(): string {
  return process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
}
