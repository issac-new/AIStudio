// 生命周期 REST 契约（融合批一）：真 Koa + 临时 SIM_ROOT。覆盖：
// 判词双源合并、G1 判读、UAT 判词/覆盖、熔断全链（trip→check→reset/override/block）
// 与留痕副作用（issues.log/approved.events 由服务落——导演侧记账退役的对账面）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { governanceRoutes } from '../governance-controller'

let server: Server
let base = ''
let simRoot = ''
const savedEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  simRoot = mkdtempSync(resolve(tmpdir(), 'lifecycle-rest-'))
  for (const key of ['OBS_SIM_ROOT', 'SIM_BRANCHES_REPO', 'SIM_ANCHOR_REPO']) {
    savedEnv[key] = process.env[key]
    process.env[key] = simRoot
  }
  mkdirSync(resolve(simRoot, 'runs', 'run-lc'), { recursive: true })
  const app = new Koa()
  app.use(bodyParser())
  app.use(governanceRoutes.routes())
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/governance`
})

afterAll(() => {
  server.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(simRoot, { recursive: true, force: true })
})

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

describe('REST：判词/G1/UAT 判读', () => {
  it('gate-verdict：双源保守合并（卡 FAIL 压过房 PASS）；入参缺 gate=400', async () => {
    const bad = await post('/lifecycle/gate-verdict', { roomText: 'READY-GATE-PASS' })
    expect(bad.status).toBe(400)
    const r = await post('/lifecycle/gate-verdict', {
      gate: 'READY-GATE',
      roomText: '结论行：READY-GATE-PASS（七项齐备）',
      cardText: 'READY-GATE-FAIL（附缺项：回滚阈值）',
    })
    expect(r.status).toBe(200)
    expect(r.json.verdict).toBe('FAIL')
    expect(r.json.room).toBe('PASS')
    expect(r.json.card).toBe('FAIL')
  })

  it('requirement-judge：四要素缺失项逐条返回', async () => {
    const r = await post('/lifecycle/requirement-judge', { doc: '# 只有标题' })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(false)
    expect(r.json.missing).toHaveLength(4)
  })

  it('uat-verdict / uat-coverage：AC-1 不被 AC-10 误满足；ac 形态校验', async () => {
    const bad = await post('/lifecycle/uat-verdict', { body: 'AC-1 通过', ac: '1' })
    expect(bad.status).toBe(400)
    const v = await post('/lifecycle/uat-verdict', { body: 'AC-10 通过', ac: 'AC-1' })
    expect(v.json.verdict).toBe('未见')
    const c = await post('/lifecycle/uat-coverage', { body: 'AC-10 通过', acList: ['AC-1', 'AC-10'] })
    expect(c.json.missing).toEqual(['AC-1'])
  })
})

describe('REST：熔断全链（服务端持久化+留痕）', () => {
  it('trip×2 → check block（tripped 只落一次）→ 复查幂等不刷单', async () => {
    for (let i = 0; i < 2; i++) {
      const t = await post('/lifecycle/breaker/trip', { run: 'run-lc', gate: 'G5', unpassedRounds: 1, sig: 's0' })
      expect(t.status).toBe(200)
    }
    const c1 = await post('/lifecycle/breaker/check', { run: 'run-lc', gate: 'G5', sig: 's0', label: 'G5 发布准出' })
    expect(c1.json.action).toBe('block')
    expect(c1.json.firstLog).toBe(true)
    const c2 = await post('/lifecycle/breaker/check', { run: 'run-lc', gate: 'G5', sig: 's0', label: 'G5 发布准出' })
    expect(c2.json.action).toBe('block')
    expect(c2.json.firstLog).toBe(false)
    const issues = readFileSync(resolve(simRoot, 'runs/run-lc/evidence/issues.log'), 'utf8')
    expect(issues.split('\n').filter((l) => l.includes('gate-breaker-tripped'))).toHaveLength(1)
  })

  it('证据变化复位：签名漂移 → reset 并落 gate-breaker-reset', async () => {
    const r = await post('/lifecycle/breaker/check', { run: 'run-lc', gate: 'G5', sig: 's1-new-evidence' })
    expect(r.json.action).toBe('reset')
    const st = await get('/lifecycle/breaker?run=run-lc&gate=G5')
    expect(st.json.state.failRounds).toBe(0)
    const issues = readFileSync(resolve(simRoot, 'runs/run-lc/evidence/issues.log'), 'utf8')
    expect(issues).toContain('gate-breaker-reset')
  })

  it('人工复议：缺原因拒绝；带原因放行并落 approved.events', async () => {
    await post('/lifecycle/breaker/trip', { run: 'run-lc', gate: 'G5', unpassedRounds: 2, sig: 's2' })
    const refused = await post('/lifecycle/breaker/check', {
      run: 'run-lc', gate: 'G5', sig: 's2', overrideFlag: true, overrideReason: '',
    })
    expect(refused.json.action).toBe('override-refused')
    const ok = await post('/lifecycle/breaker/check', {
      run: 'run-lc', gate: 'G5', sig: 's2',
      overrideFlag: true, overrideReason: '卡面终判词与复审 PASS 已核实，对照事件锚',
    })
    expect(ok.json.action).toBe('override')
    const approved = readFileSync(resolve(simRoot, 'runs/run-lc/evidence/approved.events'), 'utf8')
    expect(approved).toContain('GATE-BREAKER-REVIEW')
    const issues = readFileSync(resolve(simRoot, 'runs/run-lc/evidence/issues.log'), 'utf8')
    expect(issues).toContain('gate-breaker-override|director|')
  })

  it('SIM_ROOT 缺席 fail-closed（503）；run 非法 400', async () => {
    const saved = process.env.OBS_SIM_ROOT
    delete process.env.OBS_SIM_ROOT
    const r = await get('/lifecycle/breaker?run=run-lc&gate=G5')
    expect(r.status).toBe(503)
    process.env.OBS_SIM_ROOT = saved
    const bad = await get('/lifecycle/breaker?run=../etc&gate=G5')
    expect(bad.status).toBe(400)
  })
})
