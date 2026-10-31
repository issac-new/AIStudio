// R6（2026-10-31 二批执行）：heldout 门＋R12b 约束消融＋R5 gap 桥 http 链路。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let server: import('node:http').Server
let port: number
let baseSetId = ''

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'r6-http-'))
  process.env.HERMES_HOME = join(dir, 'home')
  process.env.HARNESS2_STORE = join(dir, 'workbench', 'workbench.json')
  process.env.EVAL_STORE = join(dir, 'eval')
  process.env.HELDOUT_STORE = join(dir, 'heldout')
  process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals.json')
  delete process.env.HARNESS2_APPLY
  delete process.env.HARNESS2_RSI_REQUIRE_HELDOUT
  mkdirSync(join(process.env.HERMES_HOME, 'profiles/p1'), { recursive: true })
  writeFileSync(join(process.env.HERMES_HOME, 'profiles/p1/SOUL.md'), 'old persona')

  const evalMod = await import('../../../eval/store')
  const store = evalMod
  store._useStoreDirForTests(process.env.EVAL_STORE)
  const baseSet = store.createSet({
    name: '基线集', track: 'e2e',
    tasks: [{ id: 't1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
  })
  if (!baseSet.ok) throw new Error(JSON.stringify(baseSet))
  baseSetId = baseSet.set.id
  store.appendRun({ ...runOf('run-base', baseSetId, 0.5), aggregates: { taskCount: 1, passAt1: 0.5, passAtK: 0.5, byLayer: { result: 0.5, trajectory: 0.5, efficiency: { avgTokens: 100, avgCostUsd: 1, avgSteps: 5, avgDurationMs: 100 } }, unknownRatio: 0, riskVeto: false, judgeOnline: true } as never })
  store.appendRun({ ...runOf('run-probe', baseSetId, 0.8), aggregates: { taskCount: 1, passAt1: 0.8, passAtK: 0.8, byLayer: { result: 0.8, trajectory: 0.8, efficiency: { avgTokens: 120, avgCostUsd: 1.2, avgSteps: 6, avgDurationMs: 110 } }, unknownRatio: 0, riskVeto: false, judgeOnline: true } as never })

  const regSet = store.createSet({
    name: '回归样本库', track: 'e2e',
    tasks: [{ id: 'r1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
  })
  if (!regSet.ok) throw new Error(JSON.stringify(regSet))
  store.appendRun({
    ...runOf('run-reg', regSet.set.id, 1),
    attempts: [{ taskId: 'r1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' }], passed: true }],
  })

  // heldout 密封题库
  const heldout = await import('../../../heldout/held-out-store')
  heldout._useStoreDirForTests(process.env.HELDOUT_STORE)
  const hs = heldout.createSet({ name: '留出集', items: [{ prompt: '该改进对哪类任务有效', expected: '通用任务' }] }, 'reviewer')
  if (!hs.ok) throw new Error(JSON.stringify(hs))

  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const { harnessRoutes } = await import('../../harness-controller')
  const app = new Koa()
  app.use(async (ctx: any, next: () => Promise<unknown>) => {
    if (ctx.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of ctx.req) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString('utf8')
      ctx.request.body = raw ? JSON.parse(raw) : {}
    }
    await next()
  })
  app.use(harnessRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  rmSync(dir, { recursive: true, force: true })
})

function runOf(id: string, setId: string, pass: number) {
  return {
    id, setId, target: {}, k: 2, status: 'done' as const, attempts: [],
    aggregates: {
      taskCount: 1, passAt1: pass, passAtK: pass,
      byLayer: { result: pass, trajectory: pass, efficiency: { avgTokens: 100, avgCostUsd: 1, avgSteps: 5, avgDurationMs: 100 } },
      unknownRatio: 0, riskVeto: false, judgeOnline: true,
    },
  }
}

const post = async (path: string, body: unknown): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}
const get = async (path: string): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, body: await res.json() }
}

async function composedProposal(calibrateNoiseFirst = false): Promise<string> {
  const created = await post('/api/harness/workbench/proposals', {
    title: 't', hypothesis: 'h', surfaceKey: 'system_prompt', targetPath: 'profiles/p1/SOUL.md',
    evidenceRefs: ['task:t1'], variants: [{ label: 'a', content: 'new persona' }],
  })
  const id = created.body.proposal.id
  await post(`/api/harness/workbench/proposals/${id}/baseline`, { evalRunId: 'run-base' })
  await post(`/api/harness/workbench/proposals/${id}/submit`, {})
  await post(`/api/harness/workbench/proposals/${id}/decide`, { decision: 'approve', actor: 'r' })
  if (calibrateNoiseFirst) {
    const evalStore2 = await import("../../../eval/store")
    evalStore2.appendRun(runOf('run-noise-lo', baseSetId, 0.5))
    evalStore2.appendRun(runOf('run-noise-hi', baseSetId, 0.52))
    const cal = await post(`/api/harness/workbench/proposals/${id}/noise`, { runIds: ['run-noise-lo', 'run-noise-hi'] })
    expect(cal.status).toBe(200)
  }
  await post(`/api/harness/workbench/proposals/${id}/probes`, {})
  const probing = await get('/api/harness/workbench/overview')
  const view = probing.body.proposals.find((p: any) => p.id === id)
  for (const probe of view.probes) {
    await post(`/api/harness/workbench/proposals/${id}/probes/${probe.id}/record`, { evalRunId: 'run-probe', regressionRunId: 'run-reg' })
  }
  await post(`/api/harness/workbench/proposals/${id}/compose`, { variantId: 'v1', rationale: 'x' })
  return id
}

describe('R6 heldout 门', () => {
  it('增益>0 无留出 → warning heldout_missing；env 升 blocker', async () => {
    const id = await composedProposal()
    const promote = await post(`/api/harness/workbench/proposals/${id}/promote`, { apply: false, actor: 'r' })
    expect(promote.status).toBe(200) // warning 不拦
    const codes = promote.body.gate.warnings.map((w: any) => w.code)
    expect(codes).toContain('heldout_missing')

    process.env.HARNESS2_RSI_REQUIRE_HELDOUT = '1'
    try {
      const id2 = await composedProposal()
      const blocked = await post(`/api/harness/workbench/proposals/${id2}/promote`, { apply: false, actor: 'r' })
      expect(blocked.status).toBe(409)
      expect(String(blocked.body.error)).toContain('晋级门禁未通过')
    } finally { delete process.env.HARNESS2_RSI_REQUIRE_HELDOUT }
  })

  it('绑定留出读数（密封题库 scoreSet）→ p.heldout 落库；低通过率 → blocker heldout_regression', async () => {
    const id = await composedProposal(true)

    const attach = await post(`/api/harness/workbench/proposals/${id}/heldout`, {
      setId: (await (await import('../../../heldout/held-out-store')).listSets())[0]?.id ?? 'x',
      answers: [{ index: 0, answer: '错误答案' }],
      actor: 'reviewer',
    })
    if (attach.status !== 200) throw new Error('attach ' + attach.status + ' ' + JSON.stringify(attach.body))
    expect(attach.body.proposal.heldout).toMatchObject({ n: 1, passRate: 0 })

    const promote = await post(`/api/harness/workbench/proposals/${id}/promote`, { apply: false, actor: 'r' })
    expect(promote.status).toBe(409)
    expect(String(promote.body.error)).toContain('晋级门禁未通过')
  })

  it('不存在的留出集 / 越界 answers → 400', async () => {
    const id = await composedProposal()
    const bad = await post(`/api/harness/workbench/proposals/${id}/heldout`, { setId: 'no-such', answers: [{ index: 0, answer: 'x' }] })
    expect(bad.status).toBe(400)
  })
})
