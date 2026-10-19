// Harness² 改进实验台 HTTP 全链：提案→基线→提交→批准→探测→组合→晋级→回滚。
// fixture 全 tmpdir：HERMES_HOME、workbench store、eval store 均隔离，不触真 home/真评测库。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let server: import('node:http').Server
let port: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'harness2-http-'))
  process.env.HERMES_HOME = join(dir, 'home')
  process.env.HARNESS2_STORE = join(dir, 'workbench', 'workbench.json')
  process.env.EVAL_STORE = join(dir, 'eval')
  process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals.json')
  delete process.env.HARNESS2_APPLY
  mkdirSync(join(process.env.HERMES_HOME, 'profiles/p1'), { recursive: true })
  mkdirSync(join(process.env.HERMES_HOME, 'skills/s1'), { recursive: true })
  writeFileSync(join(process.env.HERMES_HOME, 'profiles/p1/SOUL.md'), 'old persona')
  writeFileSync(join(process.env.HERMES_HOME, 'skills/s1/SKILL.md'), '# old skill')

  // 真实评测库夹具：基线运行 / 候选运行 / 回归运行。
  const store = await import('../../../eval/store')
  store._useStoreDirForTests(process.env.EVAL_STORE)
  const baseSet = store.createSet({
    name: '基线集',
    track: 'e2e',
    tasks: [{ id: 't1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
  })
  if (!baseSet.ok) throw new Error(JSON.stringify(baseSet))
  store.appendRun(runOf('run-base', baseSet.set.id, 0.5))
  store.appendRun(runOf('run-probe', baseSet.set.id, 0.8))

  const regSet = store.createSet({
    name: '回归样本库',
    track: 'e2e',
    tasks: [{ id: 'r1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
  })
  if (!regSet.ok) throw new Error(JSON.stringify(regSet))
  store.appendRun({
    ...runOf('run-reg', regSet.set.id, 1),
    attempts: [{ taskId: 'r1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' }], passed: true }],
  })

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

function runOf(id: string, setId: string, pass: number) {
  return {
    id,
    setId,
    target: {},
    k: 2,
    status: 'done' as const,
    attempts: [],
    aggregates: {
      taskCount: 1,
      passAt1: pass,
      passAtK: pass,
      byLayer: {
        result: pass,
        trajectory: pass,
        risk: 'none' as const,
        efficiency: { avgTokens: 1000, avgCostUsd: 1, avgSteps: 10, avgDurationMs: 1000 },
      },
      unknownRatio: 0,
      rubricDrilldownHint: false,
      riskVeto: false,
      statisticallyInsufficient: false,
      judgeOnline: true,
    },
    createdAt: Date.now(),
  }
}

afterEach(async () => {
  server.close()
  for (const k of ['HERMES_HOME', 'HARNESS2_STORE', 'EVAL_STORE', 'HERMES_APPROVALS_LOG_FILE', 'HARNESS2_APPLY']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

const get = async (path: string): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, body: await res.json() }
}
const post = async (path: string, body: unknown): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function createSubmittedApproved(): Promise<any> {
  const created = await post('/api/harness/workbench/proposals', {
    title: '收紧提示词',
    hypothesis: '输出约束更明确可减少返工',
    surfaceKey: 'system_prompt',
    targetPath: 'profiles/p1/SOUL.md',
    budgetCapUsd: 5,
    domain: 'legal',
    evidenceRefs: ['task:t1'],
    variants: [
      { label: '候选 A', content: 'persona A' },
      { label: '候选 B', content: 'persona B' },
    ],
  })
  expect(created.status).toBe(200)
  const id = created.body.proposal.id
  expect((await post(`/api/harness/workbench/proposals/${id}/baseline`, { evalRunId: 'run-base' })).status).toBe(200)
  expect((await post(`/api/harness/workbench/proposals/${id}/submit`, {})).status).toBe(200)
  expect((await post(`/api/harness/workbench/proposals/${id}/decide`, { decision: 'approve', actor: 'reviewer', note: '同意' })).status).toBe(200)
  const probed = await post(`/api/harness/workbench/proposals/${id}/probes`, {})
  expect(probed.status).toBe(200)
  expect(probed.body.proposal.probes).toHaveLength(2)
  for (const probe of probed.body.proposal.probes) {
    const rec = await post(`/api/harness/workbench/proposals/${id}/probes/${probe.id}/record`, {
      evalRunId: 'run-probe', regressionRunId: 'run-reg', note: '真实评测',
    })
    expect(rec.status).toBe(200)
  }
  const composed = await post(`/api/harness/workbench/proposals/${id}/compose`, {
    variantId: 'v1', rationale: '通过率提升且回归无倒退',
  })
  expect(composed.status).toBe(200)
  return composed.body.proposal
}

describe('Harness² 工作台 HTTP', () => {
  it('GET overview：八面 + 计数 + 边界说明', async () => {
    const { status, body } = await get('/api/harness/workbench/overview')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.surfaces).toHaveLength(8)
    expect(body.counts.managedSurfaces).toBe(2)
    expect(body.meta.boundary).toContain('HARNESS2_APPLY=1')
  })

  it('全链：提案→基线→提交→批准→探测→组合→晋级→回滚', async () => {
    const composed = await createSubmittedApproved()
    expect(composed.status).toBe('composed')
    expect(composed.approval.decision).toBe('approved')
    expect(composed.probes.every((p: any) => p.status === 'recorded')).toBe(true)
    expect(composed.derived.gate.ok).toBe(true)

    const promoted = await post(`/api/harness/workbench/proposals/${composed.id}/promote`, {
      apply: false,
      actor: 'reviewer',
      reflection: { cue: '同类合同条款冲突', lesson: '先对齐付款条款再生成', evidence: 'run-probe 通过率 0.8，回归 0 失败' },
    })
    expect(promoted.status).toBe(200)
    expect(promoted.body.applied).toBe(false)
    expect(promoted.body.proposal.status).toBe('promoted')
    expect(promoted.body.experience).toMatchObject({ status: 'adopted', domain: 'legal', sourceProposalId: composed.id })
    expect(promoted.body.experience.snapshot.content).toBe('persona A')

    const overview = await get('/api/harness/workbench/overview')
    expect(overview.body.counts.champions).toBe(1)
    expect(overview.body.experiences.some((e: any) => e.sourceProposalId === composed.id && e.status === 'adopted')).toBe(true)

    const rolled = await post(`/api/harness/workbench/proposals/${composed.id}/rollback`, { reason: '实验结束', actor: 'reviewer' })
    expect(rolled.status).toBe(200)
    expect(rolled.body.proposal.status).toBe('rolled_back')
    const after = await get('/api/harness/workbench/overview')
    expect(after.body.counts.champions).toBe(0)
    expect(after.body.experiences.find((e: any) => e.sourceProposalId === composed.id).status).toBe('retired')
  })

  it('候选含评测判词标记 → 400 拒绝（源文防泄漏）', async () => {
    const res = await post('/api/harness/workbench/proposals', {
      title: '泄漏测试', hypothesis: 'h', surfaceKey: 'system_prompt',
      targetPath: 'profiles/p1/SOUL.md', evidenceRefs: ['task:t1'],
      variants: [{ label: 'bad', content: 'copy this {\"pass_rate\": 1.0} into prompt' }],
    })
    expect(res.status).toBe(400)
    expect(res.body.blockers.markers).toContain('"pass_rate"')
    expect(res.body.error).toContain('评测判词')
  })

  it('探测必须绑定真实评测运行：不存在的 run → 400', async () => {
    const composed = await createSubmittedApproved()
    const id = composed.id
    // 已组合后仍可重录（便于纠正错误证据），此处用不存在 run 验证拒绝。
    const probeId = composed.probes[1].id
    const rec = await post(`/api/harness/workbench/proposals/${id}/probes/${probeId}/record`, { evalRunId: 'no-such-run' })
    expect(rec.status).toBe(400)
    expect(rec.body.error).toContain('评测运行不存在')
  })

  it('请求写盘但环境未开 → 409 apply_env_disabled', async () => {
    const composed = await createSubmittedApproved()
    const promoted = await post(`/api/harness/workbench/proposals/${composed.id}/promote`, { apply: true })
    expect(promoted.status).toBe(409)
    expect((promoted.body.blockers as any[]).map((b) => b.code)).toContain('apply_env_disabled')
  })

  it('批准后候选集合变化会失效（此实现不允许改候选，验证摘要绑定入账）', async () => {
    const composed = await createSubmittedApproved()
    expect(composed.approval.variantSetDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(composed.approval.approvalLogId).toBeTruthy()
  })

  it('树候选：缺 description 的技能被树校验拒绝（400 带 issues）', async () => {
    const res = await post('/api/harness/workbench/proposals', {
      title: '坏树', hypothesis: 'h', surfaceKey: 'skills',
      evidenceRefs: ['task:t1'],
      variants: [{
        label: 'bad',
        files: [
          { path: 'profiles/p1/SOUL.md', content: '你是工程师。load the `new_skill` skill.' },
          { path: 'skills/new_skill/SKILL.md', content: '---\nname: new_skill\n---\n' },
        ],
      }],
    })
    expect(res.status).toBe(400)
    expect((res.body.blockers as any[]).some((b) => b.code === 'skill_missing_description')).toBe(true)
  })

  it('树候选全链：多文件晋级写盘（新建+修改）→ 回滚三态恢复', async () => {
    process.env.HARNESS2_APPLY = '1'
    const soulNew = '你是工程师。When 审查代码, load the `new_skill` skill.'
    const skillNew = '---\nname: new_skill\ndescription: 新技能\n---\n# new_skill\n'
    const created = await post('/api/harness/workbench/proposals', {
      title: '新增审查技能', hypothesis: '把审查流程沉淀为技能',
      surfaceKey: 'skills', treeRoot: '',
      budgetCapUsd: 5, evidenceRefs: ['task:t1'],
      variants: [{
        label: '候选 A',
        files: [
          { path: 'profiles/p1/SOUL.md', content: soulNew },
          { path: 'skills/new_skill/SKILL.md', content: skillNew },
        ],
      }],
    })
    expect(created.status).toBe(200)
    const v = created.body.proposal.variants[0]
    expect(v.files).toHaveLength(2)
    expect(v.digest).toMatch(/^[0-9a-f]{64}$/)
    const id = created.body.proposal.id
    expect((await post(`/api/harness/workbench/proposals/${id}/baseline`, { evalRunId: 'run-base' })).status).toBe(200)
    expect((await post(`/api/harness/workbench/proposals/${id}/submit`, {})).status).toBe(200)
    expect((await post(`/api/harness/workbench/proposals/${id}/decide`, { decision: 'approve', actor: 'reviewer' })).status).toBe(200)
    expect((await post(`/api/harness/workbench/proposals/${id}/probes`, {})).status).toBe(200)
    const probed = await get('/api/harness/workbench/proposals')
    const proposal = probed.body.proposals.find((p: any) => p.id === id)
    for (const probe of proposal.probes) {
      const rec = await post(`/api/harness/workbench/proposals/${id}/probes/${probe.id}/record`, {
        evalRunId: 'run-probe', regressionRunId: 'run-reg',
      })
      expect(rec.status).toBe(200)
    }
    expect((await post(`/api/harness/workbench/proposals/${id}/compose`, { variantId: 'v1', rationale: '证据充分' })).status).toBe(200)
    const promoted = await post(`/api/harness/workbench/proposals/${id}/promote`, { apply: true, actor: 'reviewer' })
    expect(promoted.status).toBe(200)
    expect(promoted.body.applied).toBe(true)
    const { readFileSync, existsSync } = await import('node:fs')
    expect(readFileSync(join(process.env.HERMES_HOME!, 'profiles/p1/SOUL.md'), 'utf8')).toBe(soulNew)
    expect(readFileSync(join(process.env.HERMES_HOME!, 'skills/new_skill/SKILL.md'), 'utf8')).toBe(skillNew)
    const rolled = await post(`/api/harness/workbench/proposals/${id}/rollback`, { reason: '实验结束' })
    expect(rolled.status).toBe(200)
    expect(readFileSync(join(process.env.HERMES_HOME!, 'profiles/p1/SOUL.md'), 'utf8')).toBe('old persona')
    expect(existsSync(join(process.env.HERMES_HOME!, 'skills/new_skill/SKILL.md'))).toBe(false)
    delete process.env.HARNESS2_APPLY
  })
})
