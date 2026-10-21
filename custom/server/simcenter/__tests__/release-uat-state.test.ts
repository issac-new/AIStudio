// G5 发布门 + UAT 判定状态机守门（接管补测，spec 2026-10-21-g5-uat-state-machine）：
// 纯函数矩阵（合法/非法/幂等/旧账兼容/权限/入参校验）+ UAT 聚合 + REST 面（409/幂等）。
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { Server } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  applyReleaseAction, deriveReleaseState, isReleaseActionIdempotent, releasePermissions,
  validateReleaseActionInput, RELEASE_ALLOWED, type ReleaseGateRecord,
} from '../release-state'
import {
  aggregateUatByAc, normalizeUatAc, validateUatVerdictFields, type UatVerdictRecord,
} from '../uat-state'
import { simcenterRouter } from '../simcenter-controller'

// ── 纯函数：G5 状态机 ──

describe('G5 状态机矩阵', () => {
  it('合法迁移链 draft→pending→approved→released', () => {
    expect(applyReleaseAction('draft', 'submit')).toBe('pending')
    expect(applyReleaseAction('pending', 'approve')).toBe('approved')
    expect(applyReleaseAction('approved', 'release')).toBe('released')
  })

  it('draft/pending 可直接 reject（兼容旧台账直接批准/驳回）', () => {
    expect(applyReleaseAction('draft', 'reject')).toBe('rejected')
    expect(applyReleaseAction('pending', 'reject')).toBe('rejected')
    expect(applyReleaseAction('draft', 'approve')).toBe('approved')
  })

  it('终态无出口（改变状态的动作全空）；重复同判为幂等同态不改状态', () => {
    // rejected：submit/approve/release 非法；reject 幂等（同态）
    expect(applyReleaseAction('rejected', 'submit')).toBeNull()
    expect(applyReleaseAction('rejected', 'approve')).toBeNull()
    expect(applyReleaseAction('rejected', 'release')).toBeNull()
    expect(applyReleaseAction('rejected', 'reject')).toBe('rejected')
    // released：submit/approve?/reject 非法；release 幂等
    expect(applyReleaseAction('released', 'submit')).toBeNull()
    expect(applyReleaseAction('released', 'reject')).toBeNull()
    expect(applyReleaseAction('released', 'release')).toBe('released')
    // 「会改变状态」的白名单在两个终态均为空
    expect(RELEASE_ALLOWED.rejected).toEqual([])
    expect(RELEASE_ALLOWED.released).toEqual([])
  })

  it('幂等同态：pending 再 submit / approved 再 approve 不改状态', () => {
    expect(isReleaseActionIdempotent('pending', 'submit')).toBe(true)
    expect(isReleaseActionIdempotent('approved', 'approve')).toBe(true)
    expect(isReleaseActionIdempotent('draft', 'submit')).toBe(false)
  })

  it('事件流派生：新台账非法序列忽略并标记；旧台账 approve↔reject 改判按旧语义', () => {
    const legacy: ReleaseGateRecord[] = [
      { ts: '2026-10-21T01:00:00Z', actor: 'a', run: 'r1', decision: 'approve' },
      { ts: '2026-10-21T02:00:00Z', actor: 'a', run: 'r1', decision: 'reject' },
    ]
    expect(deriveReleaseState(legacy).state).toBe('rejected')

    const bad: ReleaseGateRecord[] = [
      { ts: '2026-10-21T01:00:00Z', actor: 'a', run: 'r1', action: 'release' },
    ]
    const d = deriveReleaseState(bad)
    expect(d.state).toBe('draft')
    expect(d.history[0]?.ignored).toBe(true)
  })
})

describe('G5 入参与权限', () => {
  it('approve 必填锚、reject 必填理由、超长拒绝、兼容旧 decision', () => {
    expect(validateReleaseActionInput({ action: 'approve' })).toMatchObject({ ok: false })
    expect(validateReleaseActionInput({ action: 'approve', anchor: 'evidence/uat-verdicts.jsonl#AC-1' })).toMatchObject({ ok: true })
    expect(validateReleaseActionInput({ action: 'reject' })).toMatchObject({ ok: false })
    expect(validateReleaseActionInput({ action: 'reject', note: '锚缺失' })).toMatchObject({ ok: true })
    expect(validateReleaseActionInput({ decision: 'approve', evidence: 'commit:abc' })).toMatchObject({ ok: true, value: { action: 'approve' } })
    expect(validateReleaseActionInput({ action: 'approve', anchor: 'x'.repeat(301) })).toMatchObject({ ok: false })
  })

  it('权限：未鉴权放行；鉴权后裁决动作仅 super_admin/release', () => {
    expect(releasePermissions(undefined, false)).toEqual({ submit: true, approve: true, reject: true, release: true })
    expect(releasePermissions('user', true)).toEqual({ submit: true, approve: false, reject: false, release: false })
    expect(releasePermissions('release', true).approve).toBe(true)
    expect(releasePermissions('super_admin', true).release).toBe(true)
  })
})

// ── 纯函数：UAT ──

describe('UAT 判定', () => {
  it('AC 归一与字段校验（conditional 双必填、reject 必填理由、note 上限）', () => {
    expect(normalizeUatAc('3')).toBe('AC-3')
    expect(normalizeUatAc('ac 12')).toBe('AC-12')
    expect(normalizeUatAc('AC-9999')).toBeNull()
    expect(validateUatVerdictFields({ ac: '1', verdict: 'conditional', note: '说明' })).toMatchObject({ ok: false })
    expect(validateUatVerdictFields({ ac: '1', verdict: 'conditional', note: '说明', acknowledged: true })).toMatchObject({ ok: true })
    expect(validateUatVerdictFields({ ac: '1', verdict: 'reject' })).toMatchObject({ ok: false })
    expect(validateUatVerdictFields({ ac: '1', verdict: 'pass' })).toMatchObject({ ok: true, ac: 'AC-1' })
  })

  it('聚合：最新胜出（同 ts 取后出现者）、blocked=最新为 reject、按编号排序', () => {
    const mk = (ac: string, verdict: UatVerdictRecord['verdict'], ts: string): UatVerdictRecord =>
      ({ ts, actor: 'a', run: 'r1', ac, verdict })
    const agg = aggregateUatByAc([
      mk('AC-2', 'pass', '2026-10-21T01:00:00Z'),
      mk('AC-2', 'reject', '2026-10-21T02:00:00Z'),
      mk('AC-10', 'conditional', '2026-10-21T03:00:00Z'),
      mk('AC-1', 'pass', '2026-10-21T03:00:00Z'),
    ])
    expect(agg.byAc.map((a) => a.ac)).toEqual(['AC-1', 'AC-2', 'AC-10'])
    expect(agg.byAc.find((a) => a.ac === 'AC-2')).toMatchObject({ state: 'reject', blocked: true })
    expect(agg.summary).toEqual({ acCount: 3, pass: 1, conditional: 1, reject: 1, blocked: 1 })
  })
})

// ── REST 面（真 koa + 临时 SIM_ROOT）──

let server: Server
let base = ''
let simRoot = ''
const savedEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  simRoot = mkdtempSync(resolve(tmpdir(), 'g5-uat-state-'))
  for (const key of ['OBS_SIM_ROOT', 'SIM_BRANCHES_REPO', 'SIM_ANCHOR_REPO']) {
    savedEnv[key] = process.env[key]
    process.env[key] = simRoot
  }
  mkdirSync(resolve(simRoot, 'runs', 'run-g5'), { recursive: true })
  const app = new Koa()
  app.use(bodyParser())
  app.use(simcenterRouter.routes())
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>(r => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hermes/sim`
})

afterAll(() => {
  server.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(simRoot, { recursive: true, force: true })
})

afterEach(() => {
  rmSync(resolve(simRoot, 'evidence'), { recursive: true, force: true })
})

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

describe('REST：G5 状态机与 UAT 台账', () => {
  it('全链：submit→approve(锚)→release；非法迁移 409；幂等重批 idempotent', async () => {
    const submit = await post('/release-gate', { run: 'run-g5', action: 'submit' })
    expect([200, 201]).toContain(submit.status)
    expect(submit.json.state).toBe('pending')

    const noAnchor = await post('/release-gate', { run: 'run-g5', action: 'approve' })
    expect(noAnchor.status).toBe(400)

    const approve = await post('/release-gate', { run: 'run-g5', action: 'approve', anchor: 'evidence/uat-verdicts.jsonl#AC-1' })
    expect([200, 201]).toContain(approve.status)
    expect(approve.json.state).toBe('approved')

    const again = await post('/release-gate', { run: 'run-g5', action: 'approve', anchor: 'x' })
    expect(again.status).toBe(200)
    expect(again.json.idempotent).toBe(true)

    const rejectNow = await post('/release-gate', { run: 'run-g5', action: 'reject', note: '迟到的驳回' })
    expect(rejectNow.status).toBe(409)

    const release = await post('/release-gate', { run: 'run-g5', action: 'release' })
    expect([200, 201]).toContain(release.status)
    expect(release.json.state).toBe('released')

    const state = await get('/release-gate/state?run=run-g5')
    expect(state.status).toBe(200)
    expect(state.json.state).toBe('released')
  })

  it('UAT：写判定→按 AC 聚合；conditional 缺认可 400', async () => {
    const bad = await post('/uat-verdict', { run: 'run-g5', ac: '1', verdict: 'conditional', note: '说明' })
    expect(bad.status).toBe(400)

    const pass = await post('/uat-verdict', { run: 'run-g5', ac: '1', verdict: 'pass' })
    expect([200, 201]).toContain(pass.status)

    const reject = await post('/uat-verdict', { run: 'run-g5', ac: '2', verdict: 'reject', note: '验收不过' })
    expect([200, 201]).toContain(reject.status)

    const agg = await get('/uat-verdicts?run=run-g5')
    expect(agg.status).toBe(200)
    const summary = agg.json.summary
    expect(summary).toMatchObject({ acCount: 2, pass: 1, reject: 1, blocked: 1 })
  })
})
