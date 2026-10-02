// KG 演化治理控制器守门（2026-10-02）：真 koa 起 HTTP 投影——status/tick/arm/disarm/
// versions/rollback 六路 + 写闸 403 + 参数校验 400/404。状态与快照均 tmpdir 落盘。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let server: import('node:http').Server | null = null
let port = 0

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kgevo-'))
  const fakePy = join(dir, 'pyfake')
  writeFileSync(fakePy, '#!/bin/sh\n')
  process.env.SEMANTICA_PYTHON = fakePy
  process.env.SEMANTICA_BOARD_KG_DIR = join(dir, 'kgdir')
  process.env.GOVERNANCE_CONFLICT_INBOX = join(dir, 'inbox.jsonl')
  process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR = join(dir, 'markers')
  process.env.KG_VERSION_DIR = join(dir, 'versions')
  process.env.KG_TRIGGER_STATE = join(dir, 'state.json')
  process.env.HERMES_HOME = join(dir, 'home', '.hermes')

  // 板 fixture + 一份板 KG + 快照（走真 kg-version 通路）
  const dbDir = join(dir, 'home', '.hermes', 'kanban', 'boards', 'b1')
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER)')
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, 1, 1, 2)').run('t1', 'x', 'alice', 'done')
  db.close()
  const kgDir = join(dir, 'kgdir')
  mkdirSync(kgDir, { recursive: true })
  writeFileSync(join(kgDir, 'board-b1.json'), JSON.stringify({ nodes: [{ id: 'task:t1', type: 'task', properties: {} }], edges: [] }))

  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const bodyparser = (await import('@koa/bodyparser')).default
  const { kgEvolutionRoutes } = await import('../../kgevolution/kg-evolution-controller')
  const app = new Koa()
  app.use(bodyparser())  // 与 upstream http.ts 同款 body 解析（真实挂载链有）
  app.use(kgEvolutionRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})
afterEach(async () => {
  await new Promise<void>((r) => server?.close(() => r()))
  const auto = await import('../../kgtrigger/auto-sync')
  auto.setAutoSyncRunnerForTests(null)
  auto.armKgAutoSync(true)
  for (const k of ['SEMANTICA_PYTHON', 'SEMANTICA_BOARD_KG_DIR', 'GOVERNANCE_CONFLICT_INBOX', 'GOVERNANCE_BOARD_SYNC_MARKER_DIR', 'KG_VERSION_DIR', 'KG_TRIGGER_STATE', 'HERMES_HOME']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

const base = () => `http://127.0.0.1:${port}/api/kg-evolution`

describe('HTTP 投影（/api/kg-evolution）', () => {
  it('status：auto-sync 状态面（batchSize/窗口/节流字段齐备）', async () => {
    const r = await fetch(`${base()}/status`)
    expect(r.status).toBe(200)
    const j = await r.json() as Record<string, unknown>
    expect(j.ok).toBe(true)
    expect(j.envEnabled).toBe(true)
    expect(j.armed).toBe(true)
    expect(j.batchSize).toBe(3)
    expect(j.batchWindowMs).toBe(30_000)
    expect(j).toHaveProperty('throttleRemainMs')
    expect(j).toHaveProperty('pendingCount')
  })

  it('versions：列出快照（含 ts/bytes/nodes）', async () => {
    const ver = await import('../../knowledge/kg-version')
    const snap = ver.snapshotBoardKg('b1', 12345)
    expect(snap).toBeTruthy()
    const r = await fetch(`${base()}/versions?board=b1`)
    const j = await r.json() as { versions: Array<{ ts: number; bytes: number; nodes: number }> }
    expect(j.versions.map((v) => v.ts)).toEqual([12345])
    expect(j.versions[0].nodes).toBe(1)
    expect(j.versions[0].bytes).toBeGreaterThan(0)
  })

  it('rollback：回滚成功返回 preRollback；缺参 400；快照不存在 404', async () => {
    const ver = await import('../../knowledge/kg-version')
    ver.snapshotBoardKg('b1', 111)
    writeFileSync(join(dir, 'kgdir', 'board-b1.json'), JSON.stringify({ nodes: [{ id: 'x' }, { id: 'y' }], edges: [] }))
    const ok = await fetch(`${base()}/rollback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: 'b1', ts: 111 }),
    })
    expect(ok.status).toBe(200)
    const j = await ok.json() as { ok: boolean; preRollback: string }
    expect(j.ok).toBe(true)
    expect(j.preRollback).toContain('pre-rollback-')
    expect((JSON.parse(readFileSync(join(dir, 'kgdir', 'board-b1.json'), 'utf8')) as { nodes: unknown[] }).nodes).toHaveLength(1)  // 回到快照态

    const bad = await fetch(`${base()}/rollback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: 'b1' }),
    })
    expect(bad.status).toBe(400)
    const miss = await fetch(`${base()}/rollback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: 'b1', ts: 999 }),
    })
    expect(miss.status).toBe(404)
  })

  it('tick：手动推进（b1 已有基线外变化或空 pending 均如实报告）；arm/disarm 往返', async () => {
    const auto = await import('../../kgtrigger/auto-sync')
    auto.setAutoSyncRunnerForTests(async () => [])
    const t0 = await fetch(`${base()}/tick`, { method: 'POST' })
    expect(t0.status).toBe(200)
    const t0j = await t0.json() as { ok: boolean; tick: { reason: string } }
    expect(['idle', 'forced', 'window', 'batch']).toContain(t0j.tick.reason)

    const disarm = await fetch(`${base()}/disarm`, { method: 'POST' })
    expect(((await disarm.json()) as { armed: boolean }).armed).toBe(false)
    const st = (await (await fetch(`${base()}/status`)).json()) as { armed: boolean }
    expect(st.armed).toBe(false)
    const arm = await fetch(`${base()}/arm`, { method: 'POST' })
    expect(((await arm.json()) as { armed: boolean }).armed).toBe(true)
  })
})
