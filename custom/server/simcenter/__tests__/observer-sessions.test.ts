// 跨实例只读检索推演会话守门（2026-10-27 立项）：
//   ① SIM 根缺席 → available:false fail-soft；
//   ② 多 profile state.db sessions 表 LIKE 命中与 profile 归属；
//   ③ limit 上限与默认；④ 空关键词不返回全量（防倾倒）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Server } from 'node:http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import { simcenterRouter, __resetObserverSessionsCache } from '../simcenter-controller'

const require = createRequire(import.meta.url)

function makeSessionsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'sim-sessions-'))
  const { DatabaseSync } = require('node:sqlite')
  for (const [profile, rows] of [
    ['fanfan', [
      ['s1', 'group', 'agent:fanfan:matrix:group:!a:matrix.test:$e1', '支付收银台需求分析讨论群'],
      ['s2', 'dm', 'agent:fanfan:matrix:dm:@chen:matrix.test', '与陈的单聊'],
    ]],
    ['chen', [
      ['s3', 'group', 'agent:chen:matrix:group:!a:matrix.test:$e2', '支付收银台需求分析讨论群'],
      ['s4', 'dm', 'agent:chen:matrix:dm:@wei:matrix.test', '支付对账沟通'],
    ]],
  ] as Array<[string, Array<[string, string, string, string]>]>) {
    const dir = join(root, 'hermes', 'profiles', profile)
    mkdirSync(dir, { recursive: true })
    const db = new DatabaseSync(join(dir, 'state.db'))
    db.exec('create table sessions (id text primary key, source text, created_source text, user_id text, session_key text, chat_id text, chat_type text, thread_id text, display_name text, origin_json text, expiry_finalized integer, model text)')
    for (const [id, chatType, key, name] of rows) {
      db.prepare('insert into sessions (id, source, chat_type, session_key, display_name) values (?,?,?,?,?)').run(id, 'matrix', chatType, key, name)
    }
    db.close()
  }
  return root
}

describe('observer /observer/sessions 跨实例检索', () => {
  let server: Server
  let base = ''
  const savedEnv: Record<string, string | undefined> = {}
  let root = ''

  beforeAll(async () => {
    for (const k of ['SIM_OBSERVER_ROOT', 'OBS_SIM_ROOT', 'SIM_ROOT', 'AIPAY_SIM_ROOT']) savedEnv[k] = process.env[k]
    const app = new Koa()
    app.use(bodyParser())
    app.use(simcenterRouter.routes())
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(r => server.once('listening', r))
    const addr = server.address()
    if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`
  })
  afterAll(() => {
    server.close()
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  async function get(path: string): Promise<any> {
    const r = await fetch(base + path)
    return { status: r.status, body: await r.json() }
  }

  it('SIM 根缺席 → available:false fail-soft', async () => {
    delete process.env.SIM_OBSERVER_ROOT
    delete process.env.OBS_SIM_ROOT
    delete process.env.SIM_ROOT
    delete process.env.AIPAY_SIM_ROOT
    const cwdSave = process.cwd
    process.cwd = () => '/nonexistent-sim-nowhere'
    try {
      const { status, body } = await get('/api/hermes/sim/observer/sessions?q=支付')
      expect(status).toBe(200)
      expect(body.available).toBe(false)
    } finally {
      process.cwd = cwdSave
    }
  })

  it('关键词命中多 profile 并带归属；profile 名也可作为检索面', async () => {
    root = makeSessionsRoot()
    process.env.SIM_OBSERVER_ROOT = root
    __resetObserverSessionsCache()
    const { body } = await get('/api/hermes/sim/observer/sessions?q=' + encodeURIComponent('支付'))
    expect(body.available).toBe(true)
    const names = body.results.map((r: any) => `${r.profile}:${r.displayName}`)
    expect(names).toContain('fanfan:支付收银台需求分析讨论群')
    expect(names).toContain('chen:支付收银台需求分析讨论群')
    expect(names).toContain('chen:支付对账沟通')
    expect(body.results.every((r: any) => typeof r.id === 'string' && typeof r.chatType === 'string')).toBe(true)
  })

  it('limit 上限 200 生效；空关键词不倾倒全量', async () => {
    __resetObserverSessionsCache()
    const bad = await get('/api/hermes/sim/observer/sessions?q=a&limit=9999')
    expect(bad.body.results.length).toBeLessThanOrEqual(200)
    const empty = await get('/api/hermes/sim/observer/sessions?q=')
    expect(empty.body.results.length).toBe(0)
  })

  it('60s 缓存内重复同词查询命中缓存（fetchedAt 不变）', async () => {
    __resetObserverSessionsCache()
    const a = await get('/api/hermes/sim/observer/sessions?q=' + encodeURIComponent('单聊'))
    const b = await get('/api/hermes/sim/observer/sessions?q=' + encodeURIComponent('单聊'))
    expect(a.body.fetchedAt).toBe(b.body.fetchedAt)
    expect(b.body.results.length).toBeGreaterThan(0)
    rmSync(root, { recursive: true, force: true })
  })
})
