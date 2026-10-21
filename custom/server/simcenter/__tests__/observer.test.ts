// 推演观察面守门（2026-10-21 挂账实施轮）：
//   ① SIM 根候选解析（显式 env 优先 + cwd/家目录约定位）；
//   ② state.env 房间键提取与当前 run 解析（软链真身优先，mtime 回落）；
//   ③ /observer/overview 端到端：tmpdir SIM 根（真实 sqlite 板库 + current-state 软链）
//      → available:true + 跨板任务 + 房间；SIM 根缺席 → available:false fail-soft。
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Server } from 'node:http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import {
  observerSimRootCandidates, observerSimRootOrNull, simRoomKeysOf, currentRunOf, simcenterRouter,
} from '../simcenter-controller'

const require = createRequire(import.meta.url)

function makeSimRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'sim-observer-'))
  // hermes/kanban/boards/<slug>/kanban.db（node:sqlite 建真实板库）
  const { DatabaseSync } = require('node:sqlite')
  for (const slug of ['fanfan-pm-plan', 'chen-pay-core']) {
    const dir = join(root, 'hermes', 'kanban', 'boards', slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'board.json'), JSON.stringify({ slug, name: slug }))
    const db = new DatabaseSync(join(dir, 'kanban.db'))
    db.exec('create table tasks (id text primary key, title text, status text, priority integer, assignee text, created_at integer)')
    db.prepare('insert into tasks values (?,?,?,?,?,?)').run(`t_${slug}`, `${slug} 卡`, 'todo', 3, 'fanfan', 1792000000)
    db.close()
  }
  // runs/<id>/state.env + var/current-state.env 软链
  const runDir = join(root, 'runs', 'ut-run-1')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(join(runDir, 'state.env'), [
    'run_started_at=1792000000',
    'posture=standard',
    'room_analysis=!roomA:matrix.test',
    'dlv_room=!roomB:matrix.test',
    'g1_frozen=1',
  ].join('\n'))
  mkdirSync(join(root, 'var'), { recursive: true })
  symlinkSync(join(runDir, 'state.env'), join(root, 'var', 'current-state.env'))
  return root
}

describe('observer 纯函数', () => {
  it('根候选：显式 env 优先且去重，其后 cwd/家目录约定位', () => {
    const list = observerSimRootCandidates(
      { SIM_OBSERVER_ROOT: '/tmp/a', SIM_ROOT: '/tmp/b' }, '/w/ncwk/overlay', '/home/u')
    expect(list[0]).toBe('/tmp/a')
    expect(list).toContain('/tmp/b')
    expect(list).toContain('/w/ncwk/ncwk-sim-mux')
    expect(list).toContain('/w/ncwk-sim-mux')
    expect(list).toContain('/home/u/ncwk-sim-mux')
    expect(new Set(list).size).toBe(list.length)
  })

  it('房间键提取：!local:server 形态命中，其余键忽略', () => {
    expect(simRoomKeysOf({
      room_analysis: '!roomA:matrix.test',
      dlv_room: '!roomB:matrix.test',
      g1_frozen: '1',
      marker: 'not-a-room',
    })).toEqual([
      { key: 'room_analysis', roomId: '!roomA:matrix.test' },
      { key: 'dlv_room', roomId: '!roomB:matrix.test' },
    ])
  })

  it('当前 run：current-state 软链真身优先，缺席回落 mtime 最新，根缺失如实 null', () => {
    const root = makeSimRoot()
    const hit = currentRunOf(root)
    expect(hit.runId).toBe('ut-run-1')
    expect(hit.stateFile?.replace('/private/', '/')).toBe(resolve(root, 'runs', 'ut-run-1', 'state.env'))
    rmSync(join(root, 'var', 'current-state.env'))
    expect(currentRunOf(root).runId).toBe('ut-run-1')
    expect(currentRunOf(join(root, 'nope'))).toEqual({ runId: null, stateFile: null })
    rmSync(root, { recursive: true, force: true })
  })
})

describe('observer /observer/overview 端到端', () => {
  let server: Server
  let base = ''
  let root = ''
  const savedEnv: Record<string, string | undefined> = {}
  const savedCwd = process.cwd

  beforeAll(() => {
    for (const k of ['SIM_OBSERVER_ROOT', 'OBS_SIM_ROOT', 'SIM_ROOT', 'AIPAY_SIM_ROOT']) savedEnv[k] = process.env[k]
    const app = new Koa()
    app.use(bodyParser())
    app.use(simcenterRouter.routes())
    server = app.listen(0, '127.0.0.1')
    return new Promise<void>(r => server.once('listening', r))
  })

  afterAll(() => {
    server.close()
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  beforeEach(() => {
    root = makeSimRoot()
    process.env.SIM_OBSERVER_ROOT = root
    delete process.env.OBS_SIM_ROOT
    delete process.env.SIM_ROOT
    delete process.env.AIPAY_SIM_ROOT
    process.cwd = () => join(root, 'overlay')
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    process.cwd = savedCwd
  })

  it('SIM 根在位：available=true，跨板任务与房间键齐备', async () => {
    const res = await fetch(`${base}/api/hermes/sim/observer/overview`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(true)
    expect(body.runId).toBe('ut-run-1')
    expect(body.posture).toBe('standard')
    expect(body.startedAt).toBeGreaterThan(0)
    expect(body.rooms).toEqual(expect.arrayContaining([{ key: 'room_analysis', roomId: '!roomA:matrix.test' }]))
    expect(body.boards.map((b: { slug: string }) => b.slug))
      .toEqual(expect.arrayContaining(['fanfan-pm-plan', 'chen-pay-core']))
    expect(body.tasks.map((e: { task: { id: string } }) => e.task.id))
      .toEqual(expect.arrayContaining(['t_fanfan-pm-plan', 't_chen-pay-core']))
  })

  it('SIM 根缺席：available=false fail-soft，不抛 5xx', async () => {
    delete process.env.SIM_OBSERVER_ROOT
    process.cwd = () => join(root, 'var') // 约定位全部落空（var 下无 ncwk-sim-mux）
    expect(observerSimRootOrNull()).toBeNull()
    const res = await fetch(`${base}/api/hermes/sim/observer/overview`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(typeof body.reason).toBe('string')
  })
})
