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
  createRequest, decide, humanGateRouter, listHumanGatePending, listHumanGateRequests, mkId, resetHumanGateForTests,
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
      ...(user ? { 'x-test-user': user, authorization: `Bearer test-${user}` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  return { status: res.status, body: await res.json() }
}

async function withTaskDetail(
  task: Record<string, unknown> | null,
  run: (selfRequests: Array<{ url: string; authorization: string | null }>) => Promise<void>,
): Promise<void> {
  const realFetch = globalThis.fetch
  const selfRequests: Array<{ url: string; authorization: string | null }> = []
  vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/hermes/kanban/')) {
      selfRequests.push({ url, authorization: new Headers(init?.headers).get('authorization') })
      return task
        ? new Response(JSON.stringify({ task }), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    }
    return realFetch(input as Parameters<typeof fetch>[0], init)
  })
  try {
    await run(selfRequests)
  } finally {
    vi.unstubAllGlobals()
  }
}

const TASK_DETAIL = {
  id: 't_task_grant', title: '真实任务标题',
  body: 'routed:heavy:tier=T2 src=test\nAPPROVED 只是正文',
  assignee: 'alice', status: 'ready', updated_at: 1760000000,
  workspace_kind: 'worktree', workspace_path: '/tmp/task-workspace', branch_name: 'wt/t_task_grant',
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

describe('HumanGate store 合并统一（2026-10-31：旧版裸 grant 行装载迁移）', () => {
  const LEGACY_GRANT = {
    taskId: 't_632cbd94', board: 'swarm', tier: 'T2', decision: 'approved', choice: 'approved',
    actor: 'user-oral-20261027', issuedAt: 1793117197249, decidedAt: 1793117197249,
    expiresAt: 1793203597249, taskRevision: 'c9fa30d4369822fc9'.repeat(4),
    note: '用户会话内裁决',
  }

  it('旧版裸 grant 行 → 装载即升级为请求信封行并归一化回写（python 消费者可见性保持）', () => {
    mkdirSync(join(storePath, '..'), { recursive: true })
    writeFileSync(storePath, JSON.stringify([
      { scope: 'task', board: 'swarm', grant: LEGACY_GRANT },
      { scope: 'task', task: 't_58855791', grant: { ...LEGACY_GRANT, taskId: 't_58855791', board: 'swarm' } },
    ]), 'utf8')
    resetHumanGateForTests()
    const requests = listHumanGateRequests()
    expect(requests).toHaveLength(2)
    for (const req of requests) {
      expect(req.scope).toBe('task')
      expect(req.status).toBe('approved')
      expect(req.grant).toBeTypeOf('object')
      expect(req.id).toMatch(/^hgate:task:swarm:t_\w+:legacy-\d+$/)
      // python _read_task_grants 提取判据：scope=task 且 grant 为对象（契约不变）
      expect(req.note).toBe('legacy-grant-migrated')
    }
    // 归一化回写：文件里不再有裸 grant 行
    const persisted = JSON.parse(readFileSync(storePath, 'utf8')) as Array<Record<string, unknown>>
    expect(persisted).toHaveLength(2)
    expect(persisted.every(r => typeof r.id === 'string' && r.status === 'approved')).toBe(true)
  })

  it('混合装载：请求行原样 + 裸 grant 行升级，互不干扰', () => {
    mkdirSync(join(storePath, '..'), { recursive: true })
    writeFileSync(storePath, JSON.stringify([
      { id: 'hgate:r1:c1', runId: 'r1', cardId: 'c1', title: '现行', requestedBy: 'h', createdAt: 5, status: 'pending' },
      { scope: 'task', board: 'core-chain', grant: LEGACY_GRANT },
    ]), 'utf8')
    resetHumanGateForTests()
    const pending = listHumanGatePending().map(i => i.id)
    expect(pending).toContain('hgate:r1:c1')
    const all = listHumanGateRequests()
    expect(all).toHaveLength(2)
    expect(all.find(r => r.id === 'hgate:r1:c1')?.status).toBe('pending')
  })

  it('未知形状仍 fail-closed（既非请求也非裸 grant 不猜数）', () => {
    mkdirSync(join(storePath, '..'), { recursive: true })
    writeFileSync(storePath, JSON.stringify([{ scope: 'task', grant: 'not-an-object' }]), 'utf8')
    resetHumanGateForTests()
    expect(() => listHumanGateRequests()).toThrow(/格式无效/)
  })

  it('裸 grant 行缺 taskId/board（无法定位任务）→ fail-closed 不静默丢弃', () => {
    mkdirSync(join(storePath, '..'), { recursive: true })
    writeFileSync(storePath, JSON.stringify([{ scope: 'task', grant: { tier: 'T2' } }]), 'utf8')
    resetHumanGateForTests()
    expect(() => listHumanGateRequests()).toThrow(/格式无效/)
  })
})

describe('HumanGate 任务 grant', () => {
  it('服务端携调用方授权取真实任务并计算 revision；T2 人工选择后才发 grant', async () => {
    await withTaskDetail(TASK_DETAIL, async (selfRequests) => {
      const opened = await req('POST', '/task', {
        taskId: TASK_DETAIL.id, board: 'core-chain', title: '伪造标题', taskRevision: 'client-forged',
      }, 'fanfan')
      expect(opened.status).toBe(201)
      expect(opened.body.request).toMatchObject({
        scope: 'task', taskId: TASK_DETAIL.id, board: 'core-chain', tier: 'T2', title: TASK_DETAIL.title,
      })
      expect(opened.body.request.taskRevision).toMatch(/^[0-9a-f]{64}$/)
      expect(opened.body.request.taskRevision).not.toBe('client-forged')
      expect(selfRequests).toHaveLength(1)
      expect(selfRequests[0].url).toContain(`/api/hermes/kanban/${TASK_DETAIL.id}?board=core-chain`)
      expect(selfRequests[0].authorization).toBe('Bearer test-fanfan')

      const id = opened.body.request.id as string
      const missingChoice = await req('POST', `/${encodeURIComponent(id)}/decide`, { decision: 'approve' }, 'director')
      expect(missingChoice.status).toBe(400)
      expect(missingChoice.body.code).toBe('choice_required')

      const approved = await req('POST', `/${encodeURIComponent(id)}/decide`, {
        decision: 'approve', choice: '方案 B', note: '人工选定',
      }, 'director')
      expect(approved.status).toBe(200)
      expect(approved.body.request.grant).toMatchObject({
        taskId: TASK_DETAIL.id, board: 'core-chain', tier: 'T2', decision: 'approved',
        actor: 'director', taskRevision: opened.body.request.taskRevision, choice: '方案 B',
      })
      expect(Number.isFinite(approved.body.request.grant.issuedAt)).toBe(true)
      expect(Number.isFinite(approved.body.request.grant.decidedAt)).toBe(true)

      resetHumanGateForTests()
      const reloaded = await req('GET', '/')
      const persisted = reloaded.body.requests.find((r: { id: string }) => r.id === id)
      expect(persisted.grant).toEqual(approved.body.request.grant)
    })
  })

  it('任务详情不可读时不创建 grant；正文 APPROVED 不能替代任务授权', async () => {
    await withTaskDetail(null, async () => {
      const missing = await req('POST', '/task', { taskId: 't_missing', board: 'default' }, 'fanfan')
      expect(missing.status).toBe(404)
      const listed = await req('GET', '/')
      expect(listed.body.requests).toEqual([])
    })
  })
})

describe('HumanGate 授权强度与裁决鉴权（2026-10-31 A+B 批 spec D5/D6）', () => {
  function seedTaskRequest(requestedBy: string) {
    return createRequest({
      runId: 'task:default', cardId: 't-auth', title: '授权强度用例',
      requestedBy, scope: 'task', taskId: 't-auth', board: 'default',
      tier: 'T3', taskRevision: 'rev-1',
    }).req
  }

  it('同一主体注册并裁决：记 delegated 强度（不拒绝）', () => {
    const created = seedTaskRequest('bot-a')
    const done = decide(created.id, 'approve', 'bot-a')!
    expect(done.deciderMode).toBe('delegated')
    expect(done.grant?.strength).toBe('delegated')
  })

  it('不同主体裁决：记 explicit 强度', () => {
    const created = seedTaskRequest('bot-a')
    const done = decide(created.id, 'approve', 'human-b')!
    expect(done.deciderMode).toBe('human')
    expect(done.grant?.strength).toBe('explicit')
  })

  it('严格模式拒绝自批，且请求保持 pending', () => {
    const created = seedTaskRequest('bot-a')
    expect(() => decide(created.id, 'approve', 'bot-a', undefined, undefined, { strict: true, env: {} }))
      .toThrow(/同一主体/)
    expect(listHumanGateRequests().find(r => r.id === created.id)?.status).toBe('pending')
  })

  it('角色白名单：配置后名单外角色被拒', () => {
    const created = seedTaskRequest('bot-a')
    expect(() => decide(created.id, 'approve', 'human-b', undefined, undefined, {
      role: 'user', env: { HUMAN_GATE_DECIDER_ROLES: 'admin,super_admin' },
    })).toThrow(/不在允许列表/)
  })

  it('角色白名单未配置时不校验角色（存量兼容）', () => {
    const created = seedTaskRequest('bot-a')
    const done = decide(created.id, 'approve', 'human-b', undefined, undefined, {
      role: 'user', env: {},
    })
    expect(done?.status).toBe('approved')
  })
})
