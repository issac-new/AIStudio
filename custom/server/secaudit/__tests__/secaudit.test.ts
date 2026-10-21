// overlay/secaudit 域：单测（判定纪律硬约束逐条锁定）。
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _useSecAuditStoreForTests,
} from '../store'
import {
  createProject, finalizeRun, getProjectOrFail, reviewRecord, startRun, submitCandidate, updateProjectTarget, verifyCandidate,
} from '../engine'
import { buildCoverageLedger } from '../coverage'
import { recordReviewSummary } from '../verify'
import { validateReportSchema } from '../report'
import type { AuditProject } from '../types'

let storeDir: string

beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'secaudit-store-'))
  _useSecAuditStoreForTests(join(storeDir, 'store.json'))
})

afterAll(() => {
  rmSync(storeDir, { recursive: true, force: true })
  delete process.env.SECAUDIT_STORE
})

function newProject(): AuditProject {
  const result = createProject({
    name: `审计-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    target: { kind: 'agent-deployment', hermesHome: '/tmp/hermes' },
    createdBy: 'tester',
  })
  expect(result.ok).toBe(true)
  return (result as { ok: true; value: AuditProject }).value
}

describe('项目与运行', () => {
  it('创建项目 + 开跑：覆盖账本初始化（15 面=部署 12+代码仓 3，自动面入账）', async () => {
    const p = newProject()
    const run = await startRun(p.projectId)
    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.value.targetFingerprint).toBe(p.fingerprint)
    expect(run.value.ledger?.summary.total).toBe(15)
    // 自动面（有采集器）应进入 full/partial，不该留在 unchecked
    const auto = run.value.ledger?.entries.filter((e) => e.autoFindingCount !== undefined) ?? []
    expect(auto.length).toBeGreaterThanOrEqual(4)
  })

  it('未知攻击面被拒', () => {
    const result = createProject({
      name: 'bad',
      target: { kind: 'agent-deployment' },
      surfaces: ['nonsense'] as never,
    })
    expect(result.ok).toBe(false)
  })
})

describe('候选登记与三态裁决', () => {
  it('confirmed 缺追踪链/有界观察被拒', () => {
    const p = newProject()
    const cand = submitCandidate(p.projectId, {
      surfaceClass: 'tool_exec', title: '审批旁路', detail: 'd', author: 'hunter-1',
    })
    expect(cand.ok).toBe(true)
    if (!cand.ok) return
    const bad = verifyCandidate(p.projectId, cand.value.findingId, {
      verifier: 'verifier-1', status: 'confirmed',
    })
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.problems.map((x) => x.code)).toEqual(expect.arrayContaining(['missing_trace_chain', 'missing_observation']))
  })

  it('自证拒绝（409 语义）', () => {
    const p = newProject()
    const cand = submitCandidate(p.projectId, {
      surfaceClass: 'skills', title: 'x', detail: 'd', author: 'hunter-2',
      traceChain: 'file.ts:10', observation: '复现',
    })
    if (!cand.ok) throw new Error('candidate failed')
    const self = verifyCandidate(p.projectId, cand.value.findingId, {
      verifier: 'hunter-2', status: 'confirmed',
    })
    expect(self.ok).toBe(false)
    if (self.ok) return
    expect(self.problems.some((x) => x.code === 'self_verification_forbidden')).toBe(true)
  })

  it('needs_validation 必须写未解事实且不评严重性', () => {
    const p = newProject()
    const cand = submitCandidate(p.projectId, {
      surfaceClass: 'secrets', title: 'y', detail: 'd', author: 'hunter-3',
    })
    if (!cand.ok) throw new Error('candidate failed')
    const noFact = verifyCandidate(p.projectId, cand.value.findingId, {
      verifier: 'v1', status: 'needs_validation',
    })
    expect(noFact.ok).toBe(false)

    const withSeverity = verifyCandidate(p.projectId, cand.value.findingId, {
      verifier: 'v1', status: 'needs_validation', unknownFact: '该 token 是否真泄露', severity: 'high',
    })
    expect(withSeverity.ok).toBe(false)
    if (withSeverity.ok) return
    expect(withSeverity.problems.some((x) => x.code === 'severity_on_needs_validation')).toBe(true)
  })

  it('rejected 必须写证伪理由', () => {
    const p = newProject()
    const cand = submitCandidate(p.projectId, {
      surfaceClass: 'agents', title: 'z', detail: 'd', author: 'hunter-4',
    })
    if (!cand.ok) throw new Error('candidate failed')
    const bad = verifyCandidate(p.projectId, cand.value.findingId, {
      verifier: 'v1', status: 'rejected',
    })
    expect(bad.ok).toBe(false)

    const good = verifyCandidate(p.projectId, cand.value.findingId, {
      verifier: 'v1', status: 'rejected', refutation: '该进程是合法网关',
    })
    expect(good.ok).toBe(true)
  })

  it('纵深防御缺口强制归口 needs_validation 且去 severity', () => {
    const p = newProject()
    const cand = submitCandidate(p.projectId, {
      surfaceClass: 'tool_exec', title: 'w', detail: 'd', author: 'hunter-5',
      traceChain: 'a.ts:1', observation: '复现',
    })
    if (!cand.ok) throw new Error('candidate failed')
    const result = verifyCandidate(p.projectId, cand.value.findingId, {
      verifier: 'v1', status: 'confirmed', severity: 'high', defenseInDepth: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('needs_validation')
    expect(result.value.severity).toBeUndefined()
    expect(result.value.defenseInDepth).toBe(true)
  })
})

describe('报告期独立记录复核', () => {
  it('内容改动后复核失效；发现者不得复核自己', () => {
    const p = newProject()
    const cand = submitCandidate(p.projectId, {
      surfaceClass: 'mcp', title: 'm', detail: 'd', author: 'hunter-6',
      traceChain: 'x', observation: 'y',
    })
    if (!cand.ok) throw new Error('candidate failed')
    verifyCandidate(p.projectId, cand.value.findingId, { verifier: 'v1', status: 'confirmed' })

    const selfReview = reviewRecord(p.projectId, cand.value.findingId, { reviewer: 'hunter-6', outcome: 'verified' })
    expect(selfReview.ok).toBe(false)

    const review = reviewRecord(p.projectId, cand.value.findingId, { reviewer: 'rr-1', outcome: 'verified' })
    expect(review.ok).toBe(true)

    // 复核后再改候选内容 → 复核失效
    const got = getProjectOrFail(p.projectId)
    if (!got.ok) throw new Error('project missing')
    const finding = got.value.findings[0]
    finding.candidate.detail = '改过的 detail'
    const summary = recordReviewSummary([finding])
    expect(summary.stale).toBe(1)
    expect(summary.verified).toBe(0)
  })
})

describe('报告', () => {
  it('覆盖批评者暴露未检查面；报告 schema 自校验通过', async () => {
    const p = newProject()
    const run = await startRun(p.projectId)
    if (!run.ok) throw new Error('run failed')
    const ledger = run.value.ledger
    expect(ledger).toBeDefined()
    expect(ledger!.critic.some((c) => c.kind === 'unchecked_surface')).toBe(true)

    // 无候选时 finalize 直接过（无需复核记录）
    const final = finalizeRun(p.projectId, run.value.runId)
    expect(final.ok).toBe(true)
    if (!final.ok) return
    expect(validateReportSchema(final.value.report)).toEqual([])
    expect(final.value.markdown).toContain('安全审计报告')
  })

  it('有 confirmed 记录未复核时 finalize 拒绝', async () => {
    const p = newProject()
    const run = await startRun(p.projectId)
    if (!run.ok) throw new Error('run failed')
    const cand = submitCandidate(p.projectId, {
      surfaceClass: 'supply_chain', title: 's', detail: 'd', author: 'h',
      traceChain: 'x', observation: 'y',
    })
    if (!cand.ok) throw new Error('candidate failed')
    verifyCandidate(p.projectId, cand.value.findingId, { verifier: 'v1', status: 'confirmed' })

    const blocked = finalizeRun(p.projectId, run.value.runId)
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.problems.some((x) => x.code === 'record_review_incomplete')).toBe(true)

    // 复核后放行
    reviewRecord(p.projectId, cand.value.findingId, { reviewer: 'rr', outcome: 'verified' })
    const ok = finalizeRun(p.projectId, run.value.runId)
    expect(ok.ok).toBe(true)
  })
})

describe('目标指纹降级', () => {
  it('目标指纹变化后上一轮证据降级 partial', async () => {
    const p = newProject()
    const run1 = await startRun(p.projectId)
    if (!run1.ok) throw new Error('run1 failed')
    const updated = updateProjectTarget(p.projectId, { hermesHome: '/tmp/other' })
    expect(updated.ok).toBe(true)
    const run2 = await startRun(p.projectId)
    if (!run2.ok) throw new Error('run2 failed')
    const downgraded = run2.value.ledger?.entries.filter((e) => e.status === 'partial' && e.partialReason?.includes('目标指纹已变'))
    expect((downgraded ?? []).length).toBeGreaterThanOrEqual(1)
  })
})
