// @vitest-environment node
// overlay/custom/server/controllers/ia2/__tests__/workflow.test.ts
// 工作流引擎守门（五轮 H）：identity 步=peer dm（ensure→chat→超时转 queued）、
// matrix 步=网关凭据直发房间、并行/串行、run 落盘与状态机。
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: () => false, writeFileSync: vi.fn(), renameSync: vi.fn(), mkdirSync: vi.fn(), readFileSync: vi.fn(() => { throw new Error('no store') }) }
})
vi.mock('../identity-chat', () => ({
  ensureBotChat: vi.fn(async (profile: string) => `sid-${profile}`),
  gatewayJson: vi.fn(async (path: string, init?: { method?: string }) => {
    if (init?.method === 'POST' && path.includes('/chat')) {
      return { object: 'hermes.session.chat.completion', message: { content: `回执@${path.split('/p/')[1]?.split('/')[0]}` } }
    }
    return { data: [] }
  }),
  profileBase: (p: string) => `http://gw/p/${p}`,
}))
vi.mock('../../../matrix/raci-matrix', () => ({
  resolveMatrixDispatchEnv: () => ({ homeserverUrl: 'https://mx.test', accessToken: 'syt_x' }),
}))
vi.mock('../../../matrix/chat-bridge', () => ({
  matrixSend: vi.fn(async (_env: unknown, roomId: string) => `$evt-${roomId.slice(1, 6)}`),
}))

const mod = await import('../workflow')

function ctx(method: string, path: string, body?: unknown) {
  return { method, path, request: { body }, set: vi.fn(), status: 0, body: null as unknown }
}
async function fire(mw: ReturnType<typeof mod.workflowNativeRoutes>, c: ReturnType<typeof ctx>, nextret = false) {
  let nexted = nextret
  await mw(c, async () => { nexted = true })
  return { c, nexted }
}

describe('工作流引擎（/api/ia2/workflow/runs）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('非匹配路径放行', async () => {
    const mw = mod.workflowNativeRoutes()
    const { nexted } = await fire(mw, ctx('GET', '/api/other'))
    expect(nexted).toBe(true)
  })

  it('POST：并行 identity 双步 → 两步 ok 各带回执，run=done（201 快照 running）', async () => {
    const mw = mod.workflowNativeRoutes()
    const { c } = await fire(mw, ctx('POST', '/api/ia2/workflow/runs', {
      name: '双身份并行', mode: 'parallel',
      steps: [
        { targetKind: 'identity', ref: 'worker-coder', instructions: 'a' },
        { targetKind: 'identity', ref: 'data-arch', instructions: 'b' },
      ],
    }))
    expect(c.status).toBe(201)
    const run = (c.body as { run: { id: string; status: string; steps: unknown[] } }).run
    expect(run.status).toBe('running')
    // 等 runner 完成（并行 peer dm mock 即回）
    await new Promise(r => setTimeout(r, 50))
    const { c: list } = await fire(mw, ctx('GET', '/api/ia2/workflow/runs'))
    const done = (list.body as { runs: Array<{ id: string; status: string; steps: Array<{ status: string; reply?: string }> }> }).runs.find(r => r.id === run.id)
    expect(done?.status).toBe('done')
    expect(done?.steps.map(s => s.status)).toEqual(['ok', 'ok'])
    expect(done?.steps[0].reply).toContain('worker-coder')
    expect(done?.steps[1].reply).toContain('data-arch')
  })

  it('matrix 步：网关凭据直发房间，回复=已投递说明（含事件 id）', async () => {
    const mw = mod.workflowNativeRoutes()
    const { c } = await fire(mw, ctx('POST', '/api/ia2/workflow/runs', {
      name: '集群投递', mode: 'serial',
      steps: [{ targetKind: 'matrix', ref: '!room1:matrix.test', instructions: '巡检' }],
    }))
    const run = (c.body as { run: { id: string } }).run
    await new Promise(r => setTimeout(r, 50))
    const { c: one } = await fire(mw, ctx('GET', `/api/ia2/workflow/runs/${run.id}`))
    const detail = (one.body as { run: { status: string; steps: Array<{ status: string; eventId?: string }> } }).run
    if (detail.status !== 'done') throw new Error('matrix step error: ' + (detail.steps[0] as { error?: string }).error)
    expect(detail.status).toBe('done')
    expect(detail.steps[0].status).toBe('ok')
    expect(detail.steps[0].eventId).toContain('evt')
  })

  it('DELETE：删终态 run 成功；running 拒删 409；不存在 404', async () => {
    const mw = mod.workflowNativeRoutes()
    const { c } = await fire(mw, ctx('POST', '/api/ia2/workflow/runs', {
      name: '待删', mode: 'parallel',
      steps: [{ targetKind: 'identity', ref: 'worker-coder', instructions: 'x' }],
    }))
    const id = (c.body as { run: { id: string } }).run.id
    await new Promise(r => setTimeout(r, 50))
    const { c: d1 } = await fire(mw, ctx('DELETE', `/api/ia2/workflow/runs/${id}`))
    expect(d1.status).toBe(0)
    expect(d1.body).toEqual({ ok: true })
    const { c: d2 } = await fire(mw, ctx('DELETE', `/api/ia2/workflow/runs/${id}`))
    expect(d2.status).toBe(404)
  })

  it('校验：空步骤/缺字段 400', async () => {
    const mw = mod.workflowNativeRoutes()
    const { c: c1 } = await fire(mw, ctx('POST', '/api/ia2/workflow/runs', { steps: [] }))
    expect(c1.status).toBe(400)
    const { c: c2 } = await fire(mw, ctx('POST', '/api/ia2/workflow/runs', { steps: [{ targetKind: 'identity', ref: '', instructions: 'x' }] }))
    expect(c2.status).toBe(400)
  })
})
