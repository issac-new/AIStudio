/**
 * HumanGate：发布批准兼容性、认证人责、原子持久化与投影失败警告。
 * 测试全部使用临时 store，绝不写真实 Hermes home。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import { appendApprovalLog } from '../approval-log'
import {
  createRequest, decide, humanGateRouter, listHumanGatePending, mkId, resetHumanGateForTests,
} from '../human-gate'

vi.mock('../approval-log', () => ({ appendApprovalLog: vi.fn() }))

const approvalLogMock = vi.mocked(appendApprovalLog)
let temp = ''
let storePath = ''
let server: Server | undefined
let base = ''

beforeEach(async () => {
  temp = mkdtempSync(join(tmpdir(), 'human-gate-'))
  storePath = join(temp, 'store', 'human-gate.json')
  vi.stubEnv('HUMAN_GATE_STORE', storePath)
  vi.stubEnv('HERMES_HOME', join(temp, 'unused-home'))
  vi.stubEnv('AISTUDIO_LOCAL_OPERATOR', '')
  vi.stubEnv('HUMAN_GATE_EVENTS', '')
  approvalLogMock.mockReset()
  resetHumanGateForTests()

  const app = new Koa()
  app.use(bodyParser())
  app.use((ctx, next) => {
    const username = ctx.get('x-test-user').trim()
    if (username) {
      ctx.state.user = {
        id: username,
        username,
        role: ctx.get('x-test-role').trim() || 'user',
      }
    }
    return next()
  })
  app.use(humanGateRouter.routes())
  server = createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = undefined
  resetHumanGateForTests()
  vi.unstubAllEnvs()
  rmSync(temp, { recursive: true, force: true })
})

async function req(
  method: string,
  path: string,
  payload?: unknown,
  user?: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(user ? { 'x-test-user': user } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  return { status: res.status, body: await res.json() }
}

describe('HumanGate 发布批准兼容与持久化', () => {
  it('创建 → pending 可见 + runId/cardId 幂等；裁决后移除 pending', async () => {
    const a = createRequest({ runId: 'r22', cardId: 't_19142fc9', title: 'RFD-001 对外发布', requestedBy: 'fanfan' })
    expect(a.existed).toBe(false)
    expect(a.req.status).toBe('pending')
    const b = createRequest({ runId: 'r22', cardId: 't_19142fc9', title: '重发', requestedBy: 'fanfan' })
    expect(b.existed).toBe(true)
    expect(b.req.id).toBe(a.req.id)
    expect(listHumanGatePending().some(i => i.id === a.req.id)).toBeTruthy()
    expect(listHumanGatePending()[0]).toMatchObject({ kind: 'review', risk: 'high' })

    const done = decide(a.req.id, 'approve', 'director-human', '发布确认')
    expect(done).toMatchObject({ status: 'approved', decidedBy: 'director-human' })
    expect(listHumanGatePending().some(i => i.id === a.req.id)).toBe(false)
    expect(decide(a.req.id, 'reject', 'again')).toBeNull()
  })

  it('默认 store 位于 HERMES_HOME；重载保留 pending 和已决记录', () => {
    process.env.HERMES_HOME = join(temp, 'hermes-home')
    process.env.HUMAN_GATE_STORE = ''
    resetHumanGateForTests()
    const { req } = createRequest({ runId: 'r1', cardId: 'c1', title: '默认路径', requestedBy: 'human' })
    expect(existsSync(join(process.env.HERMES_HOME, 'approvals', 'human-gate.json'))).toBe(true)

    resetHumanGateForTests()
    expect(listHumanGatePending().map(i => i.id)).toContain(req.id)
    expect(decide(req.id, 'approve', 'human')?.status).toBe('approved')
    resetHumanGateForTests()
    const reloaded = createRequest({ runId: 'r1', cardId: 'c1', title: '重发', requestedBy: 'human' })
    expect(reloaded.existed).toBe(true)
    expect(reloaded.req.status).toBe('approved')
  })

  it('store 原子写失败时创建抛错且不留下内存假 pending', () => {
    expect(listHumanGatePending()).toEqual([])
    mkdirSync(storePath, { recursive: true })
    expect(() => createRequest({ runId: 'r1', cardId: 'write-fail', title: '失败', requestedBy: 'human' }))
      .toThrow()
    expect(listHumanGatePending().some(i => i.id === mkId('r1', 'write-fail'))).toBe(false)
  })

  it('裁决持久化失败时抛错且原单仍 pending', () => {
    const { req } = createRequest({ runId: 'r1', cardId: 'decide-fail', title: '失败', requestedBy: 'human' })
    rmSync(storePath)
    mkdirSync(storePath)
    expect(() => decide(req.id, 'approve', 'human')).toThrow()
    const still = createRequest({ runId: 'r1', cardId: 'decide-fail', title: '重查', requestedBy: 'human' })
    expect(still.req.status).toBe('pending')
    expect(approvalLogMock).not.toHaveBeenCalled()
  })

  it('审计和事件投影失败返回 warnings，不冒充已留痕；权威 store 已批准', async () => {
    const opened = await req('POST', '/', { runId: 'r1', cardId: 'warn', title: '投影失败' }, 'requester')
    const id = opened.body.request.id as string
    approvalLogMock.mockImplementation(() => { throw new Error('audit disk full') })
    process.env.HUMAN_GATE_EVENTS = join(temp, 'events-as-directory')
    mkdirSync(process.env.HUMAN_GATE_EVENTS)

    const resolved = await req('POST', `/${encodeURIComponent(id)}/decide`, { decision: 'approve' }, 'director')
    expect(resolved.status).toBe(200)
    expect(resolved.body.request.status).toBe('approved')
    expect(resolved.body.warnings).toHaveLength(2)
    expect(resolved.body.warnings.join(' ')).toMatch(/audit|approval/i)
    expect(resolved.body.warnings.join(' ')).toMatch(/event/i)
    expect(decide(id, 'approve', 'again')).toBeNull()
  })
})

describe('HumanGate 人责边界', () => {
  it('匿名创建和匿名裁决均 401；body actor/approver 不被采信', async () => {
    const anonymousCreate = await req('POST', '/', {
      runId: 'r1', cardId: 'anon', title: '匿名', requestedBy: 'mallory',
    })
    expect(anonymousCreate.status).toBe(401)

    const opened = await req('POST', '/', {
      runId: 'r1', cardId: 'auth', title: '认证', requestedBy: 'mallory', actor: 'mallory',
    }, 'fanfan')
    expect(opened.status).toBe(201)
    expect(opened.body.request.requestedBy).toBe('fanfan')
    const id = opened.body.request.id as string

    const anonymousDecision = await req('POST', `/${encodeURIComponent(id)}/decide`, {
      decision: 'approve', actor: 'mallory', approver: 'mallory',
    })
    expect(anonymousDecision.status).toBe(401)

    const approved = await req('POST', `/${encodeURIComponent(id)}/decide`, {
      decision: 'approve', actor: 'mallory', approver: 'mallory',
    }, 'director')
    expect(approved.status).toBe(200)
    expect(approved.body.request.decidedBy).toBe('director')
    expect(approvalLogMock).toHaveBeenCalledWith(expect.objectContaining({ actor: 'director' }))
  })

  it('显式单机部署只使用 AISTUDIO_LOCAL_OPERATOR，不回退 anonymous/studio-ui', async () => {
    process.env.AISTUDIO_LOCAL_OPERATOR = 'local-human'
    const opened = await req('POST', '/', { runId: 'r1', cardId: 'local', title: '本机' })
    expect(opened.status).toBe(201)
    expect(opened.body.request.requestedBy).toBe('local-human')
    const resolved = await req('POST', `/${encodeURIComponent(opened.body.request.id)}/decide`, { decision: 'approve' })
    expect(resolved.status).toBe(200)
    expect(resolved.body.request.decidedBy).toBe('local-human')
    expect(JSON.stringify(resolved.body)).not.toMatch(/anonymous|studio-ui/)
  })

  it('旧记录数组可直接加载，缺失记录裁决返回 null', () => {
    mkdirSync(join(storePath, '..'), { recursive: true })
    const legacy = [{
      id: 'hgate:old:card', runId: 'old', cardId: 'card', title: '旧记录',
      requestedBy: 'old-human', createdAt: 1, status: 'pending',
    }]
    writeFileSync(storePath, JSON.stringify(legacy), 'utf8')
    resetHumanGateForTests()
    expect(listHumanGatePending().map(i => i.id)).toContain('hgate:old:card')
    expect(decide('hgate:none:none', 'approve', 'x')).toBeNull()
    expect(JSON.parse(readFileSync(storePath, 'utf8'))).toHaveLength(1)
  })
})
