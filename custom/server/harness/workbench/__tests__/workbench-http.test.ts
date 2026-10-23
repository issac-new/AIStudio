// Harness² 改进实验台 HTTP 全链：提案→基线→提交→批准→探测→组合→晋级→回滚。
// fixture 全 tmpdir：HERMES_HOME、workbench store、eval store 均隔离，不触真 home/真评测库。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let server: import('node:http').Server
let port: number
let baseSetId = ''

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
  baseSetId = baseSet.set.id
  store.appendRun(runOf('run-base', baseSet.set.id, 0.5))
  store.appendRun(runOf('run-probe', baseSet.set.id, 0.8))
  store.appendRun({ ...runOf('run-origin-probe', baseSet.set.id, 0.9), evidenceMode: 'origin' as const })

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

  it('候选探测拒绝 origin 诊断运行，必须提供 fresh explicit 证据', async () => {
    const composed = await createSubmittedApproved()
    const probeId = composed.probes[1].id
    const rec = await post(`/api/harness/workbench/proposals/${composed.id}/probes/${probeId}/record`, { evalRunId: 'run-origin-probe' })
    expect(rec.status).toBe(400)
    expect(rec.body.error).toContain('诊断证据')
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

// ---------- RRSI 正则化（2026-10-23 吸收轮） ----------

describe('RRSI 正则化 HTTP', () => {
  it('噪声标定：<2 条拒；诊断证据拒；跨集拒；成功后 δ=passAt1 半极差且派生可见', async () => {
    const created = await post('/api/harness/workbench/proposals', {
      title: '标定', hypothesis: '先测噪声', surfaceKey: 'system_prompt',
      targetPath: 'profiles/p1/SOUL.md', budgetCapUsd: 5, evidenceRefs: ['task:t1'],
      variants: [{ label: '候选 A', content: 'persona A' }],
    })
    const id = created.body.proposal.id
    expect((await post(`/api/harness/workbench/proposals/${id}/baseline`, { evalRunId: 'run-base' })).status).toBe(200)

    expect((await post(`/api/harness/workbench/proposals/${id}/noise`, { runIds: ['run-base'] })).status).toBe(400)
    expect((await post(`/api/harness/workbench/proposals/${id}/noise`, { runIds: ['run-base', 'run-origin-probe'] })).status).toBe(400)
    expect((await post(`/api/harness/workbench/proposals/${id}/noise`, { runIds: ['run-base', 'run-reg'] })).status).toBe(400)

    const ok = await post(`/api/harness/workbench/proposals/${id}/noise`, { runIds: ['run-base', 'run-probe'] })
    expect(ok.status).toBe(200)
    expect(ok.body.proposal.noise.delta).toBeCloseTo(0.15)
    expect(ok.body.proposal.noise.method).toBe('half-range')
    expect(ok.body.proposal.derived.regularization.noiseDelta).toBeCloseTo(0.15)
    expect(ok.body.proposal.derived.regularization.noiseRuns).toBe(2)
  })

  it('overview 含 evolution 段：超参/时间线/未探索面；提案派生带 regularization', async () => {
    const composed = await createSubmittedApproved()
    const prom = await post(`/api/harness/workbench/proposals/${composed.id}/promote`, { apply: false })
    expect(prom.status).toBe(200)

    const { body } = await get('/api/harness/workbench/overview')
    expect(body.evolution.config.horizon).toBeGreaterThan(0)
    expect(body.evolution.config.bMin).toBeGreaterThanOrEqual(1)
    const sys = body.evolution.surfaces.find((s: any) => s.surfaceKey === 'system_prompt')
    expect(sys.rounds).toBe(1)
    expect(sys.timeline).toHaveLength(1)
    expect(sys.timeline[0].passAt1).toBeCloseTo(0.8)
    expect(sys.timeline[0].passAt1Delta).toBeCloseTo(0.3)
    expect(body.evolution.unexercised.length).toBeGreaterThan(0)
    const view = body.proposals.find((x: any) => x.id === composed.id)
    expect(view.derived.regularization.round).toBe(1)
    expect(view.derived.regularization.editBudgetExceeded).toBe(false)
  })

  it('提交期泄漏批评者：候选携带基线集任务 ID → 400 benchmark_leakage', async () => {
    const store = await import('../../../eval/store')
    const leakSet = store.createSet({
      name: '泄漏哨兵集',
      track: 'e2e',
      tasks: [{ id: 'task-secret-001', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
    })
    if (!leakSet.ok) throw new Error(JSON.stringify(leakSet))
    store.appendRun(runOf('run-leak-base', leakSet.set.id, 0.5))

    const created = await post('/api/harness/workbench/proposals', {
      title: '带题', hypothesis: '记住这道题', surfaceKey: 'system_prompt',
      targetPath: 'profiles/p1/SOUL.md', budgetCapUsd: 5, evidenceRefs: ['task:t1'],
      variants: [{ label: '候选 A', content: 'persona A，特别注意 task-secret-001 要按题面特判处理' }],
    })
    const id = created.body.proposal.id
    expect((await post(`/api/harness/workbench/proposals/${id}/baseline`, { evalRunId: 'run-leak-base' })).status).toBe(200)
    const submit = await post(`/api/harness/workbench/proposals/${id}/submit`, {})
    expect(submit.status).toBe(400)
    expect(submit.body.blockers.map((b: any) => b.code)).toContain('benchmark_leakage')
  })

  it('提交期退火预算：树候选 5 文件 > 首轮预算 4 → 400 edit_budget_exceeded', async () => {
    const created = await post('/api/harness/workbench/proposals', {
      title: '大捆绑', hypothesis: '一次改五个机制', surfaceKey: 'memory',
      budgetCapUsd: 5, evidenceRefs: ['task:t1'],
      variants: [{
        label: '候选 A',
        files: [1, 2, 3, 4, 5].map((n) => ({ path: `memory/note-${n}.md`, content: `note ${n}` })),
      }],
    })
    const id = created.body.proposal.id
    expect((await post(`/api/harness/workbench/proposals/${id}/baseline`, { evalRunId: 'run-base' })).status).toBe(200)
    const submit = await post(`/api/harness/workbench/proposals/${id}/submit`, {})
    expect(submit.status).toBe(400)
    expect(submit.body.blockers.map((b: any) => b.code)).toContain('edit_budget_exceeded')
  })

  it('晋级期噪声地板：标定 δ=0.25 后 0.05 增益落带内 → 409 gain_within_noise（非首个提案，无探索豁免）', async () => {
    const store = await import('../../../eval/store')
    store.appendRun(runOf('run-noise-lo', baseSetId, 0.5))
    store.appendRun(runOf('run-noise-hi', baseSetId, 1.0))
    store.appendRun(runOf('run-low-probe', baseSetId, 0.55))

    // 先造一个同面前序提案：该面不再是「首个提案」，带内增益不享受结构性探索豁免
    const prior = await post('/api/harness/workbench/proposals', {
      title: '前序', hypothesis: '占位', surfaceKey: 'system_prompt',
      targetPath: 'profiles/p1/SOUL.md', budgetCapUsd: 5, evidenceRefs: ['task:t1'],
      variants: [{ label: '候选 Z', content: 'persona Z' }],
    })
    expect(prior.status).toBe(200)

    const created = await post('/api/harness/workbench/proposals', {
      title: '小增益', hypothesis: '微调措辞', surfaceKey: 'system_prompt',
      targetPath: 'profiles/p1/SOUL.md', budgetCapUsd: 5, evidenceRefs: ['task:t1'],
      variants: [{ label: '候选 A', content: 'persona A' }],
    })
    const id = created.body.proposal.id
    expect((await post(`/api/harness/workbench/proposals/${id}/baseline`, { evalRunId: 'run-base' })).status).toBe(200)
    expect((await post(`/api/harness/workbench/proposals/${id}/noise`, { runIds: ['run-noise-lo', 'run-noise-hi'] })).status).toBe(200)
    expect((await post(`/api/harness/workbench/proposals/${id}/submit`, {})).status).toBe(200)
    expect((await post(`/api/harness/workbench/proposals/${id}/decide`, { decision: 'approve', actor: 'r', note: '' })).status).toBe(200)
    const probed = await post(`/api/harness/workbench/proposals/${id}/probes`, {})
    for (const probe of probed.body.proposal.probes) {
      const rec = await post(`/api/harness/workbench/proposals/${id}/probes/${probe.id}/record`, {
        evalRunId: 'run-low-probe', regressionRunId: 'run-reg',
      })
      expect(rec.status).toBe(200)
    }
    expect((await post(`/api/harness/workbench/proposals/${id}/compose`, { variantId: 'v1', rationale: '微调' })).status).toBe(200)
    const prom = await post(`/api/harness/workbench/proposals/${id}/promote`, { apply: false })
    expect(prom.status).toBe(409)
    expect(prom.body.blockers.map((b: any) => b.code)).toContain('gain_within_noise')
  })
})

// ---------- RRSI 跟进批（2026-10-23）：AI 起草器 + held-out 读数 ----------

import type { SuggestCli } from '../service'

describe('RRSI 跟进批 HTTP', () => {
  it('AI 起草器：合法 JSON → draft 提案入库（走 createProposal 全部校验）', async () => {
    const fakeCli: SuggestCli = async () => ({
      ok: true,
      stdout: '前置废话\n{"title":"收紧输出格式","hypothesis":"要求纯文本输出可减少返工","content":"# Orchestrator\\n\\n要求：最终回答只给结论本身。\\n"}\n后置废话',
    })
    // 测试机上有真 hermes：把 CLI 指到不存在的二进制，让生产路径快速失败（如实 502）
    const prevBin = process.env.HERMES_PROBE_HERMES_BIN
    process.env.HERMES_PROBE_HERMES_BIN = '/nonexistent/hermes-test-bin'
    try {
      const res = await post('/api/harness/workbench/proposals/suggest', {
        surfaceKey: 'system_prompt', targetPath: 'profiles/p1/SOUL.md', actor: 'tester',
      })
      expect(res.status).toBe(502)
      expect(String(res.body.error)).toContain('起草器执行失败')
    } finally {
      if (prevBin === undefined) delete process.env.HERMES_PROBE_HERMES_BIN
      else process.env.HERMES_PROBE_HERMES_BIN = prevBin
    }
    const { suggestProposal } = await import('../service')
    const view = await suggestProposal({
      surfaceKey: 'system_prompt', targetPath: 'profiles/p1/SOUL.md', actor: 'tester', cli: fakeCli,
    })
    expect(view.status).toBe('draft')
    expect(view.title).toBe('收紧输出格式')
    expect(view.variants).toHaveLength(1)
    expect(view.variants[0].content).toContain('最终回答只给结论本身')
    expect(view.createdBy).toBe('tester')
    expect(view.derived.regularization.firstOnSurface).toBe(true)
  })

  it('AI 起草器：输出无 JSON → 502 如实报错', async () => {
    const { suggestProposal } = await import('../service')
    await expect(suggestProposal({
      surfaceKey: 'system_prompt', targetPath: 'profiles/p1/SOUL.md',
      cli: async () => ({ ok: true, stdout: '我不会输出 JSON' }),
    })).rejects.toThrow('未包含合法 JSON')
  })

  it('AI 起草器：起草内容带评测判词标记 → createProposal 拒绝（400）', async () => {
    const { suggestProposal, ServiceError } = await import('../service')
    await expect(suggestProposal({
      surfaceKey: 'system_prompt', targetPath: 'profiles/p1/SOUL.md',
      cli: async () => ({ ok: true, stdout: '{"title":"x","hypothesis":"y","content":"包含 deterministic_eval_summary 标记"}' }),
    })).rejects.toMatchObject({ status: 400 })
    void ServiceError
  })

  it('record probe 后回归证据带 passAt1（held-out 读数）', async () => {
    const composed = await createSubmittedApproved()
    const sel = composed.derived.selectedVariantId
    const probe = composed.probes.find((x: any) => x.variantId === sel)
    expect(probe.evidence.regression.passAt1).toBeCloseTo(1)
    const overview = await get('/api/harness/workbench/overview')
    const view = overview.body.proposals.find((x: any) => x.id === composed.id)
    const selProbe = view.probes.find((x: any) => x.variantId === sel)
    expect(selProbe.evidence.regression.passAt1).toBeCloseTo(1)
  })
})
