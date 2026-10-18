// 九层运行体检单测（2026-10-18 Harness 可靠性轮）：层序、评分/状态、
// 差距与动作映射、数据缺席不造数。
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildNineLayers,
  collectNineLayersInputs,
  NINE_LAYER_ORDER,
  type NineLayersInputs,
} from '../nine-layers'

const cleanups: string[] = []
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.OVERLAY_ROOT
  delete process.env.HERMES_LOOP_DIR
  delete process.env.HERMES_APPROVALS_LOG_FILE
  delete process.env.EVAL_STORE
  delete process.env.HELDOUT_STORE
  delete process.env.TOOL_EXEC_AUDIT_DIR
})

const allGood: NineLayersInputs = {
  days: 7,
  tools: { contracts: 30, auditedCalls: 120, preEntries: 60, preWithSummary: 60, failedPosts: 10, classifiedFailures: 10, duplicateFlagged: 0 },
  loop: { runawayGuard: true, stuckDetector: true, guardedEdges: true, classifiedRetry: true, checkpoints: 40, runsWithCheckpoints: 5 },
  memory: { checkpointDb: true, graphCheckpoints: 40, agentCheckpoints: 3, handoffCheckpoints: 2 },
  context: { rootAgentsMd: true, rootAgentsMdLines: 80, moduleAgentsMd: 2, specFiles: 100 },
  sandbox: { permissionMatrix: true, workspaceGuard: true, pathAllowlist: true, networkAllowlist: true, secretRedaction: true, declaredTimeouts: 30, teardown: true },
  verification: { gatePacks: 15, typecheckScript: true, evalSets: 2, releaseGate: true, uiOracle: true },
  permissions: { enforceWired: true, enforceEnabled: true, approvalRecords: 20, scopedApprovals: true, identityInEnforcement: true, allowDecisionsAudited: true },
  observability: { auditEntries: 120, postEntries: 60, postsWithDuration: 60, traceFiles: 10, runManifest: true, runManifestCount: 3, costPerRun: true },
  evals: { fixedSets: 2, evalRuns: 10, heldoutQuestions: 20, coveredDimensions: 7, gateIntegrated: true },
}

const allMissing: NineLayersInputs = {
  days: 7,
  tools: { contracts: 0, auditedCalls: 0, preEntries: 0, preWithSummary: 0, failedPosts: 0, classifiedFailures: 0, duplicateFlagged: 0 },
  loop: { runawayGuard: false, stuckDetector: false, guardedEdges: false, classifiedRetry: false, checkpoints: 0, runsWithCheckpoints: 0 },
  memory: { checkpointDb: false, graphCheckpoints: 0, agentCheckpoints: 0, handoffCheckpoints: 0 },
  context: { rootAgentsMd: false, rootAgentsMdLines: null, moduleAgentsMd: 0, specFiles: 0 },
  sandbox: { permissionMatrix: false, workspaceGuard: false, pathAllowlist: false, networkAllowlist: false, secretRedaction: false, declaredTimeouts: 0, teardown: false },
  verification: { gatePacks: 0, typecheckScript: false, evalSets: 0, releaseGate: false, uiOracle: false },
  permissions: { enforceWired: false, enforceEnabled: false, approvalRecords: 0, scopedApprovals: false, identityInEnforcement: false, allowDecisionsAudited: false },
  observability: { auditEntries: 0, postEntries: 0, postsWithDuration: 0, traceFiles: 0, runManifest: false, costPerRun: false },
  evals: { fixedSets: 0, evalRuns: 0, heldoutQuestions: 0, coveredDimensions: 0, gateIntegrated: false },
}

describe('buildNineLayers', () => {
  it('九层齐备且顺序固定', () => {
    const r = buildNineLayers(allGood)
    expect(r.layers.map((l) => l.key)).toEqual(NINE_LAYER_ORDER)
    expect(r.layers.every((l) => l.checks.length >= 4)).toBe(true)
  })

  it('达标输入九层全 covered，计数合计为 9', () => {
    const r = buildNineLayers(allGood)
    expect(r.counts).toEqual({ covered: 9, partial: 0, missing: 0 })
    expect(r.layers.every((l) => l.score >= 80)).toBe(true)
  })

  it('全缺输入如实标 missing，不造数据', () => {
    const r = buildNineLayers(allMissing)
    expect(r.counts.covered).toBe(0)
    expect(r.counts.missing).toBeGreaterThan(0)
    expect(r.layers.every((l) => l.gaps.length > 0)).toBe(true)
    expect(r.layers.every((l) => l.actions.length > 0)).toBe(true)
  })

  it('权限层未接发起用户身份时不给 covered，并给出对应差距', () => {
    const r = buildNineLayers({
      ...allGood,
      permissions: { ...allGood.permissions, identityInEnforcement: false },
    })
    const perms = r.layers.find((l) => l.key === 'permissions')!
    expect(perms.status).not.toBe('covered')
    expect(perms.gaps.join('\n')).toContain('按发起用户鉴权')
    expect(perms.actions.join('\n')).toContain('enforce-gate')
  })

  it('入口超 100 行时渐进披露降为 partial', () => {
    const r = buildNineLayers({
      ...allGood,
      context: { ...allGood.context, rootAgentsMdLines: 150 },
    })
    const ctx = r.layers.find((l) => l.key === 'context')!
    expect(ctx.checks.find((c) => c.key === 'progressive')?.status).toBe('partial')
    expect(ctx.score).toBeLessThan(100)
    expect(ctx.gaps.join('\n')).toContain('渐进披露')
  })

  it('审计比例按真实分母计算，不因无调用而假绿', () => {
    const r = buildNineLayers({
      ...allGood,
      tools: { ...allGood.tools, preEntries: 0, preWithSummary: 0, failedPosts: 0, classifiedFailures: 0, auditedCalls: 0 },
    })
    const tools = r.layers.find((l) => l.key === 'tools')!
    expect(tools.checks.find((c) => c.key === 'summary')?.status).toBe('no')
    expect(tools.checks.find((c) => c.key === 'summary')?.evidence).toContain('无工具调用')
  })

  it('聚合计数与层状态一致', () => {
    const r = buildNineLayers(allGood)
    const counted = { covered: 0, partial: 0, missing: 0 }
    for (const layer of r.layers) counted[layer.status] += 1
    expect(counted).toEqual(r.counts)
  })
})

describe('collectNineLayersInputs', () => {
  it('空环境 fail-soft：返回九层且不抛，缺席如实降级', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nine-layers-'))
    cleanups.push(dir)
    process.env.OVERLAY_ROOT = dir
    process.env.HERMES_LOOP_DIR = join(dir, 'loop')
    process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals.json')
    process.env.EVAL_STORE = join(dir, 'eval')
    process.env.HELDOUT_STORE = join(dir, 'heldout')
    process.env.TOOL_EXEC_AUDIT_DIR = join(dir, 'audit')

    const inputs = await collectNineLayersInputs(7)
    const report = buildNineLayers(inputs)
    expect(report.layers).toHaveLength(9)
    expect(report.meta.note).toContain('自检清单')
    expect(inputs.context.rootAgentsMd).toBe(false)
    expect(inputs.memory.graphCheckpoints).toBe(0)
    expect(inputs.evals.fixedSets).toBe(0)
  })
})
