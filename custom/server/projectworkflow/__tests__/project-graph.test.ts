// custom/server/projectworkflow/__tests__/project-graph.test.ts
// 拓扑契约回归（2026-11-04 AgentTeams 吸收批三）：nodes 全量 / edges 父→子 /
// next 门控（同板父链 done|archived，对齐 _parents_satisfied）/ interrupts 五
// kind / 跨板链不建边 / 环丢弃 / mermaid 文本（classDef、转义、class 归组）。
// 夹具：临时根两板库（default + team-a）+ 父子链 + 环 + 跨板链 + 同板他项目
// 父 + blocked(block_kind+事件 reason) + review + paused 状态文件。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from 'koa'
import { projectsStatePath } from '../state-store'
import { projectTaskGraph, specToMermaid, type ProjectTaskGraph } from '../graph'
import { getProjectGraph } from '../controller'

let root: string
let prevHome: string | undefined

interface TaskFixture {
  id: string
  title: string
  status: string
  project_id: string
  assignee?: string
  block_kind?: string
}

/** 测试板库：tasks/task_links/task_events 三表（本域依赖列；语义同 kanban_db.py）。 */
function makeBoardDb(path: string, tasks: TaskFixture[], links: Array<[string, string]>, events: Array<{ task_id: string; kind: string; payload: string }> = []): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => {
      exec(sql: string): void
      prepare(sql: string): { run(...a: unknown[]): unknown }
      close(): void
    }
  }
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, assignee TEXT, project_id TEXT, block_kind TEXT)`)
  db.exec(`CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY (parent_id, child_id))`)
  db.exec(`CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT)`)
  for (const t of tasks) {
    db.prepare('INSERT INTO tasks (id, title, status, assignee, project_id, block_kind) VALUES (?, ?, ?, ?, ?, ?)')
      .run(t.id, t.title, t.status, t.assignee ?? null, t.project_id, t.block_kind ?? null)
  }
  for (const [parent, child] of links) {
    db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)').run(parent, child)
  }
  for (const e of events) {
    db.prepare('INSERT INTO task_events (task_id, kind, payload) VALUES (?, ?, ?)').run(e.task_id, e.kind, e.payload)
  }
  db.close()
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'project-graph-'))
  prevHome = process.env.HERMES_KANBAN_HOME
  process.env.HERMES_KANBAN_HOME = root

  // default 板：p-graph 主链 + 环 + 跨板链 + 他项目父 + blocked/review 各态。
  makeBoardDb(join(root, 'kanban.db'), [
    { id: 't-01', title: '基础底座', status: 'done', project_id: 'p-graph' },
    { id: 't-02', title: '子任务A', status: 'todo', project_id: 'p-graph', assignee: 'worker-a' },
    { id: 't-03', title: '子任务B', status: 'todo', project_id: 'p-graph' },
    { id: 't-04', title: '含"引号"与[方括]标题', status: 'ready', project_id: 'p-graph' },
    { id: 't-05', title: '进行中的父', status: 'running', project_id: 'p-graph' },
    { id: 't-06', title: '阻塞卡', status: 'blocked', project_id: 'p-graph', block_kind: 'needs_input' },
    { id: 't-07', title: '评审卡', status: 'review', project_id: 'p-graph' },
    { id: 't-08', title: '跨板子', status: 'todo', project_id: 'p-graph' },
    { id: 't-09', title: '外部父子', status: 'todo', project_id: 'p-graph' },
    { id: 't-10', title: '环A', status: 'todo', project_id: 'p-graph' },
    { id: 't-11', title: '环B', status: 'todo', project_id: 'p-graph' },
    { id: 't-12', title: '环C', status: 'todo', project_id: 'p-graph' },
    // 同板他项目父：门控（内核 JOIN 不筛 project）但不进本图节点。
    { id: 't-x0', title: '他项目的卡', status: 'todo', project_id: 'p-other' },
  ], [
    ['t-01', 't-02'], // 父 done → t-02 可进 next
    ['t-05', 't-03'], // 父 running → t-03 不进 next；同板项目内 → 建边
    ['t-10', 't-11'], // 环三连前两条
    ['t-11', 't-12'],
    ['t-12', 't-10'], // 成环 → 丢弃 + cycle-dropped
    ['t-99', 't-08'], // 父在 team-a 板 → 跨板链不建边
    ['t-x0', 't-09'], // 同板他项目父 → 门控不建边
  ], [
    { task_id: 't-06', kind: 'blocked', payload: '{"kind":"needs_input","reason":"等外部接口"}' },
    { task_id: 't-07', kind: 'review', payload: '{}' },
  ])

  // team-a 板：t-99 是 t-08 的跨板父；t-21 无链就绪。
  makeBoardDb(join(root, 'kanban', 'boards', 'team-a', 'kanban.db'), [
    { id: 't-20', title: '他板完成卡', status: 'done', project_id: 'p-graph' },
    { id: 't-21', title: '他板就绪', status: 'ready', project_id: 'p-graph' },
    { id: 't-99', title: '他板的父', status: 'todo', project_id: 'p-graph' },
  ], [])

  mkdirSync(root, { recursive: true })
  writeFileSync(projectsStatePath(), JSON.stringify({
    version: 1,
    projects: { 'p-graph': { status: 'paused', pausedAt: 1_700_000_000_000, timeline: [{ at: 1_700_000_000_000, kind: 'pause', detail: 'actor=seed' }] } },
  }))
})

afterEach(() => {
  if (prevHome === undefined) delete process.env.HERMES_KANBAN_HOME
  else process.env.HERMES_KANBAN_HOME = prevHome
  rmSync(root, { recursive: true, force: true })
})

describe('projectTaskGraph：nodes/edges 投影', () => {
  it('nodes 全量含两板（确定序 板→id），assignee 只在非空时出现', () => {
    const g = projectTaskGraph(root, 'p-graph')
    expect(g.nodes.map((n) => `${n.board}/${n.id}`)).toEqual([
      'default/t-01', 'default/t-02', 'default/t-03', 'default/t-04', 'default/t-05', 'default/t-06',
      'default/t-07', 'default/t-08', 'default/t-09', 'default/t-10', 'default/t-11', 'default/t-12',
      'team-a/t-20', 'team-a/t-21', 'team-a/t-99',
    ])
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    expect(byId['t-02']).toMatchObject({ title: '子任务A', status: 'todo', board: 'default', assignee: 'worker-a' })
    expect(byId['t-01'].assignee).toBeUndefined()
    expect(byId['t-99']).toMatchObject({ board: 'team-a', status: 'todo' })
    expect(g.projectStatus).toBe('paused')
  })

  it('edges 只含同板项目内父→子：环第三边丢弃、跨板链与他项目父不建边', () => {
    const g = projectTaskGraph(root, 'p-graph')
    expect(g.edges).toEqual([
      { source: 't-01', target: 't-02' },
      { source: 't-05', target: 't-03' },
      { source: 't-10', target: 't-11' },
      { source: 't-11', target: 't-12' },
    ])
  })

  it('无任务项目 → 空图不抛（状态行仍给出 projectStatus）', () => {
    const g = projectTaskGraph(root, 'p-none')
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
    expect(g.next).toEqual([])
    expect(g.interrupts).toEqual([])
    expect(g.projectStatus).toBe('active')
  })
})

describe('projectTaskGraph：next 门控', () => {
  it('todo|ready 且全部同板父 done/archived 才进；父未 done / 他项目父 / 环内 / review 均不进', () => {
    const g = projectTaskGraph(root, 'p-graph')
    // t-02 父 done 进；t-04/t-21 无父进；t-08 跨板父不门控进；t-99 本板无链进。
    // t-03 父 running、t-09 同板他项目父 todo、t-10/11/12 环内互为未终结父、
    // t-07 review 态——均不进。
    expect(g.next).toEqual(['t-02', 't-04', 't-08', 't-21', 't-99'])
  })
})

describe('projectTaskGraph：interrupts 五 kind', () => {
  it('blocked 卡带 block_kind 与事件 reason；review 逐条；跨板链与环各记边级；paused 一条', () => {
    const g = projectTaskGraph(root, 'p-graph')
    const byId = Object.fromEntries(g.interrupts.map((i) => [i.id, i]))
    expect(g.interrupts.map((i) => i.kind).sort()).toEqual([
      'blocked-card', 'cross-board-link', 'cycle-dropped', 'project-paused', 'review-pending',
    ])
    expect(byId['t-06']).toMatchObject({ kind: 'blocked-card' })
    expect(byId['t-06'].reason).toContain('kind=needs_input')
    expect(byId['t-06'].reason).toContain('等外部接口')
    expect(byId['t-07']).toMatchObject({ kind: 'review-pending' })
    expect(byId['t-07'].reason).toContain('评审卡')
    expect(byId['t-99->t-08']).toMatchObject({ kind: 'cross-board-link' })
    expect(byId['t-99->t-08'].reason).toContain('t-99')
    expect(byId['t-12->t-10']).toMatchObject({ kind: 'cycle-dropped' })
    expect(byId['p-graph']).toMatchObject({ kind: 'project-paused' })
    expect(byId['p-graph'].reason).toContain('暂停')
  })
})

describe('specToMermaid：graph TD 文本', () => {
  it('节点 label 含 assignee；引号/方括号转义为 mermaid 实体码；边与 classDef 齐全', () => {
    const g = projectTaskGraph(root, 'p-graph')
    const m = specToMermaid(g)
    expect(m.startsWith('graph TD')).toBe(true)
    // 节点序号=nodes 下标：T1 带_assignee、T3 是转义用例
    expect(m).toContain('T1["子任务A @worker-a"]')
    expect(m).toContain('T3["含#quot;引号#quot;与#91;方括#93;标题"]')
    // 边：父→子；环第三边与跨板边不得出现
    expect(m).toContain('T0 --> T1')
    expect(m).toContain('T4 --> T2')
    expect(m).toContain('T10 --> T11')
    expect(m).not.toContain('T11 --> T9')
    expect(m).not.toContain('T14 --> T7')
    // 五态 classDef + 高亮/虚线
    expect(m).toContain('classDef st-done fill:#c8e6c9,stroke:#2e7d32')
    expect(m).toContain('classDef st-blocked fill:#ffcdd2,stroke:#c62828')
    expect(m).toContain('classDef st-review fill:#fff9c4,stroke:#f9a825')
    expect(m).toContain('classDef st-running fill:#bbdefb,stroke:#1565c0')
    expect(m).toContain('classDef st-other fill:#eceff1,stroke:#90a4ae')
    expect(m).toContain('classDef next stroke:#1565c0,stroke-width:3px')
    expect(m).toContain('classDef interrupt stroke-dasharray:5 5')
    // next 节点（t-02=T1）与 blocked 节点（t-06=T5）各自挂上语义 class
    expect(m).toMatch(/class (?:\S+,)*T1(?:,\S+)* st-other,next/)
    expect(m).toMatch(/class (?:\S+,)*T5(?:,\S+)* st-blocked,interrupt/)
  })

  it('空图仍输出合法头与 classDef（mermaid 消费面不炸）', () => {
    const m = specToMermaid(projectTaskGraph(root, 'p-none'))
    expect(m.startsWith('graph TD')).toBe(true)
    expect(m).toContain('classDef st-done fill:#c8e6c9,stroke:#2e7d32')
    expect(m).not.toContain('-->')
  })
})

describe('controller：GET /projects/:id/graph', () => {
  interface MockCtxInput { params?: Record<string, string>; query?: Record<string, string> }

  function makeCtx(input: MockCtxInput = {}): Context {
    return {
      params: input.params ?? {},
      query: input.query ?? {},
      request: { body: {} },
      state: {},
      status: 0,
      body: undefined,
    } as unknown as Context
  }

  it('默认 JSON：ok + graph 四元（nodes/edges/next/interrupts）', async () => {
    const ctx = makeCtx({ params: { id: 'p-graph' } })
    await getProjectGraph(ctx)
    expect(ctx.status).toBe(200)
    const body = ctx.body as { ok: boolean; graph: ProjectTaskGraph }
    expect(body.ok).toBe(true)
    expect(body.graph.nodes).toHaveLength(15)
    expect(body.graph.next).toEqual(['t-02', 't-04', 't-08', 't-21', 't-99'])
    expect(body.graph.interrupts.map((i) => i.kind)).toHaveLength(5)
  })

  it('?format=mermaid → text/plain + graph TD 源（ctx.body 直赋为声明例外）', async () => {
    const ctx = makeCtx({ params: { id: 'p-graph' }, query: { format: 'mermaid' } })
    await getProjectGraph(ctx)
    expect(ctx.status).toBe(200)
    expect((ctx as unknown as { type?: string }).type).toBe('text/plain; charset=utf-8')
    expect(String(ctx.body).startsWith('graph TD')).toBe(true)
    expect(String(ctx.body)).toContain('T0 --> T1')
  })

  it('无任务项目 → 200 空图（不 404，项目可能只有状态行）', async () => {
    const ctx = makeCtx({ params: { id: 'p-none' } })
    await getProjectGraph(ctx)
    expect(ctx.status).toBe(200)
    const body = ctx.body as { ok: boolean; graph: ProjectTaskGraph }
    expect(body.ok).toBe(true)
    expect(body.graph).toMatchObject({ nodes: [], edges: [], next: [], interrupts: [] })
  })

  it('缺 id → 400（机器可读 code）', async () => {
    const ctx = makeCtx({})
    await getProjectGraph(ctx)
    expect(ctx.status).toBe(400)
    expect((ctx.body as { code?: string }).code).toBe('missing_project_id')
  })
})
