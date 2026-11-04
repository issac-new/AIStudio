// custom/server/projectworkflow/__tests__/projectworkflow.test.ts
// 项目工作流域回归：跨板聚合、完成守卫（422/override/幂等）、pause/resume 流转、
// 坏 JSON fail-soft（2026-11-04 项目工作流域）。
// 控制器层用最小 mock ctx 直调导出 handler——ok/fail 落在 ctx.status/ctx.body 上，
// 断言 HTTP 语义（422+problems / 409 / 200）不需要起真服务。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from 'koa'
import {
  getProjectState, projectsStatePath, readState, setStatus,
} from '../state-store'
import { listProjectIds, projectTaskStats, unfinishedProjectTasks } from '../project-tasks'
import {
  completeProject, getProject, listProjects, pauseProject, resumeProject,
} from '../controller'

let root: string
let prevHome: string | undefined

/** 最小看板库：tasks 只建本域依赖的列（id/title/status/project_id）。 */
function makeKanbanDb(path: string, rows: Array<{ id: string; title: string; status: string; project_id: string }>): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown }; close(): void }
  }
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, project_id TEXT)')
  for (const r of rows) {
    db.prepare('INSERT INTO tasks (id, title, status, project_id) VALUES (?, ?, ?, ?)')
      .run(r.id, r.title, r.status, r.project_id)
  }
  db.close()
}

function execSql(path: string, sql: string, ...params: unknown[]): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => { prepare(s: string): { run(...a: unknown[]): unknown }; close(): void }
  }
  const db = new DatabaseSync(path)
  db.prepare(sql).run(...params)
  db.close()
}

interface MockCtxInput {
  params?: Record<string, string>
  query?: Record<string, string>
  body?: Record<string, unknown>
  username?: string
}

/** 最小 ctx：ok/fail 只写 status/body；handler 只读 params/query/request.body/state。 */
function makeCtx(input: MockCtxInput = {}): Context {
  return {
    params: input.params ?? {},
    query: input.query ?? {},
    request: { body: input.body ?? {} },
    state: input.username ? { user: { username: input.username } } : {},
    status: 0,
    body: undefined,
  } as unknown as Context
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'projectworkflow-'))
  prevHome = process.env.HERMES_KANBAN_HOME
  process.env.HERMES_KANBAN_HOME = root
  // 两板三项目：default 板 p-alpha/p-beta；team-a 板 p-alpha/p-gamma；
  // p-delta 只在状态文件（零板任务）。
  makeKanbanDb(join(root, 'kanban.db'), [
    { id: 't-a1', title: 'alpha 收尾卡', status: 'done', project_id: 'p-alpha' },
    { id: 't-a2', title: 'alpha 在途卡', status: 'in_progress', project_id: 'p-alpha' },
    { id: 't-b1', title: 'beta 待办卡', status: 'todo', project_id: 'p-beta' },
  ])
  makeKanbanDb(join(root, 'kanban', 'boards', 'team-a', 'kanban.db'), [
    { id: 't-a3', title: 'alpha 阻塞卡', status: 'blocked', project_id: 'p-alpha' },
    { id: 't-a4', title: 'alpha 完成卡', status: 'done', project_id: 'p-alpha' },
    { id: 't-c1', title: 'gamma 全结卡', status: 'done', project_id: 'p-gamma' },
  ])
  mkdirSync(root, { recursive: true })
  writeFileSync(projectsStatePath(), JSON.stringify({
    version: 1,
    projects: {
      'p-delta': {
        status: 'paused',
        pausedAt: 1_000,
        timeline: [
          { at: 1_000, kind: 'pause', detail: 'actor=seed' },
          { at: 2_000, kind: 'note', detail: 'seed 事件（验 timeline 倒序）' },
        ],
      },
    },
  }))
})

afterEach(() => {
  if (prevHome === undefined) delete process.env.HERMES_KANBAN_HOME
  else process.env.HERMES_KANBAN_HOME = prevHome
  rmSync(root, { recursive: true, force: true })
})

describe('project-tasks：跨板只读聚合', () => {
  it('unfinished 跨 default+team-a 两板聚合，done/archived 不算未终结', () => {
    const rows = unfinishedProjectTasks('p-alpha')
    expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 't-a2', status: 'in_progress', title: 'alpha 在途卡', board: 'default' },
      { id: 't-a3', status: 'blocked', title: 'alpha 阻塞卡', board: 'team-a' },
    ])
  })

  it('stats 按 status 聚合并计总数（跨板求和）', () => {
    expect(projectTaskStats('p-alpha')).toEqual({
      byStatus: { done: 2, in_progress: 1, blocked: 1 },
      total: 4,
    })
    // 零板任务的项目：空统计而非报错
    expect(projectTaskStats('p-delta')).toEqual({ byStatus: {}, total: 0 })
  })

  it('listProjectIds 全库发现三项目（无状态行也算）', () => {
    expect(listProjectIds()).toEqual(['p-alpha', 'p-beta', 'p-gamma'])
  })
})

describe('controller：GET 面合并状态与事实', () => {
  it('列表并集：库发现项目 × 状态文件项目（零板任务也列出）', async () => {
    const ctx = makeCtx()
    await listProjects(ctx)
    expect(ctx.status).toBe(200)
    const projects = (ctx.body as { projects: Array<Record<string, unknown>> }).projects
    const byId = Object.fromEntries(projects.map((p) => [p.id, p]))
    expect(Object.keys(byId).sort()).toEqual(['p-alpha', 'p-beta', 'p-delta', 'p-gamma'])
    expect(byId['p-delta']).toMatchObject({ status: 'paused', pausedAt: 1_000 })
    expect((byId['p-delta'] as { taskStats: { total: number } }).taskStats.total).toBe(0)
    expect((byId['p-alpha'] as { taskStats: { total: number } }).taskStats.total).toBe(4)
  })

  it('详情：未终结清单 + timeline 倒序（最新在前）', async () => {
    const ctx = makeCtx({ params: { id: 'p-delta' } })
    await getProject(ctx)
    expect(ctx.status).toBe(200)
    const body = ctx.body as {
      status: string; unfinishedTasks: unknown[]; timeline: Array<{ at: number }>
    }
    expect(body.status).toBe('paused')
    expect(body.unfinishedTasks).toEqual([])
    expect(body.timeline.map((e) => e.at)).toEqual([2_000, 1_000])
  })
})

describe('controller：pause/resume 流转', () => {
  it('pause 落 pausedAt+事件，resume 清 pausedAt 回 active', async () => {
    const pauseCtx = makeCtx({ params: { id: 'p-beta' }, username: 'ops' })
    await pauseProject(pauseCtx)
    expect(pauseCtx.status).toBe(200)
    expect((pauseCtx.body as { status: string }).status).toBe('paused')
    const paused = getProjectState('p-beta')
    expect(paused.status).toBe('paused')
    expect(typeof paused.pausedAt).toBe('number')
    expect(paused.timeline.at(-1)).toMatchObject({ kind: 'pause', detail: 'actor=ops' })

    const resumeCtx = makeCtx({ params: { id: 'p-beta' } })
    await resumeProject(resumeCtx)
    expect(resumeCtx.status).toBe(200)
    const resumed = getProjectState('p-beta')
    expect(resumed.status).toBe('active')
    expect(resumed.pausedAt).toBeUndefined()
    expect(resumed.timeline.map((e) => e.kind)).toEqual(['pause', 'resume'])
  })

  it('completed 是终态：resume 与 pause 均 409', async () => {
    await completeProject(makeCtx({ params: { id: 'p-gamma' } })) // 全 done → 可直接完成
    const resumeCtx = makeCtx({ params: { id: 'p-gamma' } })
    await resumeProject(resumeCtx)
    expect(resumeCtx.status).toBe(409)
    expect((resumeCtx.body as { ok: boolean; code?: string }).code).toBe('completed_terminal')
    const pauseCtx = makeCtx({ params: { id: 'p-gamma' } })
    await pauseProject(pauseCtx)
    expect(pauseCtx.status).toBe(409)
  })
})

describe('controller：complete 完成守卫', () => {
  it('有未终结任务 → 422 + problems 带板/卡/状态/标题', async () => {
    const ctx = makeCtx({ params: { id: 'p-alpha' } })
    await completeProject(ctx)
    expect(ctx.status).toBe(422)
    const body = ctx.body as { ok: boolean; code: string; problems: string[] }
    expect(body.ok).toBe(false)
    expect(body.code).toBe('unfinished_tasks')
    expect(body.problems.sort()).toEqual([
      'default/t-a2 [in_progress] alpha 在途卡',
      'team-a/t-a3 [blocked] alpha 阻塞卡',
    ])
  })

  it('override=true 缺 reason → 400；带 reason → 放行并落 override+complete_override', async () => {
    const missing = makeCtx({ params: { id: 'p-beta' }, query: { override: 'true' } })
    await completeProject(missing)
    expect(missing.status).toBe(400)
    expect((missing.body as { code?: string }).code).toBe('override_reason_required')

    const withReason = makeCtx({
      params: { id: 'p-beta' },
      query: { override: 'true' },
      body: { reason: '下游已手动接管剩余卡' },
      username: 'manager',
    })
    await completeProject(withReason)
    expect(withReason.status).toBe(200)
    const done = getProjectState('p-beta')
    expect(done.status).toBe('completed')
    expect(done.override).toMatchObject({ reason: '下游已手动接管剩余卡', actor: 'manager' })
    expect(done.timeline.at(-1)?.kind).toBe('complete_override')
  })

  it('全 done 后直接完成 200；已完成再完成幂等 200 不追加事件', async () => {
    const first = makeCtx({ params: { id: 'p-gamma' }, username: 'ops' })
    await completeProject(first)
    expect(first.status).toBe(200)
    expect(getProjectState('p-gamma').timeline.map((e) => e.kind)).toEqual(['complete'])

    const again = makeCtx({ params: { id: 'p-gamma' } })
    await completeProject(again)
    expect(again.status).toBe(200)
    expect((again.body as { idempotent?: boolean }).idempotent).toBe(true)
    // 幂等：不追加第二条 complete 事件
    expect(getProjectState('p-gamma').timeline.map((e) => e.kind)).toEqual(['complete'])
  })

  it('在途卡清账后（全 done）守卫放行 200', async () => {
    execSql(join(root, 'kanban.db'), "UPDATE tasks SET status = 'done' WHERE id = 't-a2'")
    execSql(join(root, 'kanban', 'boards', 'team-a', 'kanban.db'), "UPDATE tasks SET status = 'archived' WHERE id = 't-a3'")
    const ctx = makeCtx({ params: { id: 'p-alpha' } })
    await completeProject(ctx)
    expect(ctx.status).toBe(200)
    expect((ctx.body as { status: string }).status).toBe('completed')
  })
})

describe('state-store：fail-soft', () => {
  it('坏 JSON → 空状态重建，读面不抛、项目回落缺省 active', () => {
    writeFileSync(projectsStatePath(), '{not-json')
    expect(readState()).toEqual({ version: 1, projects: {} })
    expect(getProjectState('p-alpha').status).toBe('active')
    // 写面在坏档上可恢复：setStatus 覆写坏档为新状态
    const next = setStatus('p-alpha', 'paused', { actor: 'recover' })
    expect(next.status).toBe('paused')
    expect(readState().projects['p-alpha']?.status).toBe('paused')
  })

  it('缺文件 → 空状态（不猜数）', () => {
    rmSync(projectsStatePath())
    expect(readState().projects).toEqual({})
    expect(projectsStatePath().startsWith(root)).toBe(true)
  })
})
