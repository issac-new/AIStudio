// A1 执行面守门（KG 演化治理 2026-10-02）：tickKgAutoSync 端到端（fixture 板 mtime
// 变化 → pending → 攒批/force 触发 → 注入的假同步被调 → 状态持久化 → 节流）+ env 总闸
// + arm/disarm + start/stop。真 sqlite（node:sqlite 只读），假同步执行器注入。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let syncCalls: string[][]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kgauto-'))
  syncCalls = []
  process.env.HERMES_HOME = join(dir, 'home', '.hermes')
  process.env.KG_TRIGGER_STATE = join(dir, 'state.json')
  // 假 python：kgAvailable=false 也不影响本测试面（真同步被注入替换，不会触达 bridge）
  const fakePy = join(dir, 'pyfake')
  writeFileSync(fakePy, '#!/bin/sh\n')
  process.env.SEMANTICA_PYTHON = fakePy
  process.env.SEMANTICA_BOARD_KG_DIR = join(dir, 'kgdir')
  process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR = join(dir, 'markers')
  process.env.GOVERNANCE_CONFLICT_INBOX = join(dir, 'inbox.jsonl')
})
afterEach(async () => {
  const auto = await import('../auto-sync')
  auto.stopKgAutoSync()
  auto.setAutoSyncRunnerForTests(null)
  auto.armKgAutoSync(true)
  for (const k of ['HERMES_HOME', 'KG_TRIGGER_STATE', 'SEMANTICA_PYTHON', 'SEMANTICA_BOARD_KG_DIR', 'GOVERNANCE_BOARD_SYNC_MARKER_DIR', 'GOVERNANCE_CONFLICT_INBOX', 'KG_AUTO_SYNC']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

function makeBoard(slug: string, closedTasks = 1): string {
  const dbDir = join(dir, 'home', '.hermes', 'kanban', 'boards', slug)
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER)')
  for (let i = 0; i < closedTasks; i++) db.prepare('INSERT INTO tasks VALUES (?, ?, NULL, ?, 1, 1, 2)').run(`t${i}`, `x${i}`, 'done')
  db.close()
  return join(dbDir, 'kanban.db')
}

const touch = (file: string, at: number) => utimesSync(file, new Date(at * 1000), new Date(at * 1000))
const stateJson = () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
  baselines: Record<string, number>
  pending: Record<string, { mtimeMs: number; firstSeenAt: number; count: number }>
  lastSuccessAt: number
}

describe('tickKgAutoSync：观测→攒批→触发→持久化', () => {
  it('首轮建基线不触发；变化后未攒够不触发；force 立即同步并清 pending 记时间', async () => {
    const auto = await import('../auto-sync')
    auto.setAutoSyncRunnerForTests(async () => { syncCalls.push(['sync']); return [] })
    const b1 = makeBoard('b1', 5)
    const b2 = makeBoard('b2', 2)

    const r1 = await auto.tickKgAutoSync()
    expect(r1.synced).toBe(false)  // 首轮只建基线
    expect(Object.keys(stateJson().baselines).sort()).toEqual(['b1', 'b2'])

    touch(b1, 2000)  // b1 变化（1<3 板、窗口内 → 不触发）
    const r2 = await auto.tickKgAutoSync()
    expect(r2.synced).toBe(false)
    expect(r2.reason).toBe('idle')
    expect(syncCalls).toHaveLength(0)
    expect(stateJson().pending.b1.count).toBe(5)  // 待办数=结案任务数（sqlite 实查）

    const r3 = await auto.tickKgAutoSync({ force: true })  // 手动兜底：立即推进
    expect(r3.synced).toBe(true)
    expect(r3.reason).toBe('forced')
    expect(syncCalls).toHaveLength(1)
    expect(stateJson().pending).toEqual({})  // 成功清 pending
    expect(stateJson().lastSuccessAt).toBeGreaterThan(0)
    void b2
  })

  it('攒够 3 板自动触发（batch）；节流期内第二波不空转，窗口过后可再触发', async () => {
    const auto = await import('../auto-sync')
    auto.setAutoSyncRunnerForTests(async () => { syncCalls.push(['sync']); return [] })
    const dbs = [makeBoard('b1'), makeBoard('b2'), makeBoard('b3')]
    await auto.tickKgAutoSync()  // 基线
    for (const [i, db] of dbs.entries()) touch(db, 3000 + i)
    const r = await auto.tickKgAutoSync()
    expect(r.synced).toBe(true)
    expect(r.reason).toBe('batch')
    expect(syncCalls).toHaveLength(1)

    // 节流：成功后立刻再来一波变化（3 板）→ 条件满足但被 5min 节流拦下
    for (const [i, db] of dbs.entries()) touch(db, 9000 + i)
    const throttled = await auto.tickKgAutoSync()
    expect(throttled.synced).toBe(false)
    expect(throttled.reason).toBe('throttled')
    expect(syncCalls).toHaveLength(1)  // 没有第二次真同步
    expect(Object.keys(stateJson().pending)).toHaveLength(3)  // pending 保留

    // 窗口过后（改写状态文件把 lastSuccessAt 拨回 6min 前）→ 可再触发
    const st = stateJson()
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ ...st, lastSuccessAt: Date.now() - 6 * 60 * 1000 }))
    const again = await auto.tickKgAutoSync()
    expect(again.synced).toBe(true)
    expect(syncCalls).toHaveLength(2)
  })

  it('同步失败（runner 返回 null）pending 不动，下轮重试', async () => {
    const auto = await import('../auto-sync')
    let fail = true
    auto.setAutoSyncRunnerForTests(async () => (fail ? null : []))
    const db = makeBoard('solo')
    await auto.tickKgAutoSync()
    touch(db, 5000)
    const r1 = await auto.tickKgAutoSync({ force: true })
    expect(r1.synced).toBe(false)  // 失败如实报告
    expect(Object.keys(stateJson().pending)).toHaveLength(1)  // pending 保留
    fail = false
    const r2 = await auto.tickKgAutoSync({ force: true })
    expect(r2.synced).toBe(true)
    expect(stateJson().pending).toEqual({})
  })
})

describe('env 总闸 + arm/disarm + start/stop', () => {
  it('KG_AUTO_SYNC=0：tick 拒绝且 start 返回 null；arm 拒绝开', async () => {
    process.env.KG_AUTO_SYNC = '0'
    const auto = await import('../auto-sync')
    auto.setAutoSyncRunnerForTests(async () => { syncCalls.push(['sync']); return [] })
    const db = makeBoard('gated')
    await auto.tickKgAutoSync()
    touch(db, 100)
    const r = await auto.tickKgAutoSync({ force: true })
    expect(r.synced).toBe(false)
    expect(r.reason).toBe('env-off')
    expect(syncCalls).toHaveLength(0)
    expect(auto.startKgAutoSync()).toBeNull()
    expect(auto.armKgAutoSync(true)).toEqual({ armed: false, envEnabled: false })
    delete process.env.KG_AUTO_SYNC
    // 恢复后可 arm、可启动、可幂等重启
    expect(auto.armKgAutoSync(true).armed).toBe(true)
    const h1 = auto.startKgAutoSync()
    expect(h1).not.toBeNull()
    const h2 = auto.startKgAutoSync()  // 幂等
    expect(h2).not.toBeNull()
    h2!.stop()
    expect(auto.kgAutoSyncStatus().running).toBe(false)
  })

  it('disarm 后自动 tick 观望（disarmed），手动 force 仍可推进；arm 恢复', async () => {
    const auto = await import('../auto-sync')
    auto.setAutoSyncRunnerForTests(async () => { syncCalls.push(['sync']); return [] })
    const db = makeBoard('armb')
    await auto.tickKgAutoSync()
    touch(db, 700)
    auto.armKgAutoSync(false)
    const r = await auto.tickKgAutoSync()
    expect(r.reason).toBe('disarmed')
    expect(syncCalls).toHaveLength(0)
    const forced = await auto.tickKgAutoSync({ force: true })  // 兜底面独立于开关
    expect(forced.synced).toBe(true)
    auto.armKgAutoSync(true)
    const st = auto.kgAutoSyncStatus()
    expect(st.armed).toBe(true)
    expect(st.envEnabled).toBe(true)
    expect(st.batchSize).toBe(3)
    expect(st.batchWindowMs).toBe(30_000)
    expect(st.throttleRemainMs).toBeGreaterThan(0)  // 刚成功过 → 有节流余量
  })
})
