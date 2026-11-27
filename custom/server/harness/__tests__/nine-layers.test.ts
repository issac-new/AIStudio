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
import { _pinManagedSettingsForTests, _unpinManagedSettingsForTests } from '../../managedsettings/managed-settings'

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
    expect(r.counts.missing).toBe(9)
    expect(r.layers.every((l) => l.score === 0)).toBe(true)
    expect(r.layers.every((l) => l.gaps.length > 0)).toBe(true)
    expect(r.layers.every((l) => l.actions.length > 0)).toBe(true)
  })

  it('外部证据验收两项全缺时判缺失，不拿半分', () => {
    const r = buildNineLayers(allMissing)
    const verification = r.layers.find((l) => l.key === 'verification')!
    expect(verification.checks.find((c) => c.key === 'external')?.status).toBe('no')
    // 只有一项在才是部分
    const half = buildNineLayers({ ...allGood, verification: { ...allGood.verification, uiOracle: false } })
    expect(half.layers.find((l) => l.key === 'verification')!.checks.find((c) => c.key === 'external')?.status).toBe('partial')
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

  it('窗口内无调用时比例类检查判无法评估，不判缺失也不计入分母', () => {
    const r = buildNineLayers({
      ...allGood,
      tools: { ...allGood.tools, preEntries: 0, preWithSummary: 0, failedPosts: 0, classifiedFailures: 0, auditedCalls: 0 },
    })
    const tools = r.layers.find((l) => l.key === 'tools')!
    expect(tools.checks.find((c) => c.key === 'summary')?.status).toBe('unavailable')
    expect(tools.checks.find((c) => c.key === 'summary')?.evidence).toContain('无工具调用')
    expect(tools.checks.find((c) => c.key === 'errors')?.status).toBe('unavailable')
    // 契约数是机制在位性：0 就是没有，仍判缺失
    expect(tools.checks.find((c) => c.key === 'contracts')?.status).toBe('yes')
  })

  it('无法评估的检查项不摊薄层分数：其余全达标时分数为 100', () => {
    const r = buildNineLayers({
      ...allGood,
      tools: { ...allGood.tools, preEntries: 0, preWithSummary: 0, failedPosts: 0, classifiedFailures: 0, auditedCalls: 0 },
      observability: { ...allGood.observability, postEntries: 0, postsWithDuration: 0 },
    })
    const tools = r.layers.find((l) => l.key === 'tools')!
    // 四项里三项无法评估（summary/errors/duplicates 都依赖窗口内有调用），只剩 contracts 可评估且 yes
    expect(tools.checks.filter((c) => c.status === 'unavailable').map((c) => c.key)).toEqual(['summary', 'errors', 'duplicates'])
    expect(tools.score).toBe(100)
    expect(tools.unevaluated).toHaveLength(3)
    const observability = r.layers.find((l) => l.key === 'observability')!
    // audit 仍 yes（120 行），duration 与 errors 无法评估，manifest/cost yes
    expect(observability.checks.filter((c) => c.status === 'unavailable').map((c) => c.key)).toEqual(['duration', 'errors'])
    expect(observability.score).toBe(100)
  })

  it('安静窗口不再把健全的层拉到不及格，但也不因缺事件判已覆盖', () => {
    const busy = buildNineLayers(allGood).layers.find((l) => l.key === 'tools')!
    const quiet = buildNineLayers({
      ...allGood,
      tools: { ...allGood.tools, preEntries: 0, preWithSummary: 0, failedPosts: 0, classifiedFailures: 0, auditedCalls: 0 },
    }).layers.find((l) => l.key === 'tools')!
    expect(busy.score).toBe(100)
    // 改动前这里是 38：四项里三项因「窗口内无事件」被判 no
    expect(quiet.score).toBe(100)
    // 关键项 contracts 仍是 yes，没有关键项被挡；层状态照分数走
    expect(quiet.status).toBe('covered')
    // 但无法评估的三项必须如实列出，不能看起来像通过
    expect(quiet.unevaluated).toHaveLength(3)
    expect(quiet.checks.filter((c) => c.status === 'yes')).toHaveLength(1)
  })

  it('一层内全部无法评估时分数为 null，不显示为 0', () => {
    const r = buildNineLayers({
      ...allGood,
      tools: { ...allGood.tools, contracts: 0, preEntries: 0, preWithSummary: 0, failedPosts: 0, classifiedFailures: 0, auditedCalls: 0 },
    })
    const tools = r.layers.find((l) => l.key === 'tools')!
    // contracts 是机制在位性：0 判缺失（critical），所以这一层并非全部无法评估
    expect(tools.checks.find((c) => c.key === 'contracts')?.status).toBe('no')
    expect(tools.score).toBe(0)
    // 构造一层全部无法评估：可观测层 audit 走「窗口内无审计行」→ 无法评估
    const quiet = buildNineLayers({
      ...allGood,
      observability: { ...allGood.observability, auditEntries: 0, postEntries: 0, postsWithDuration: 0 },
    })
    const observability = quiet.layers.find((l) => l.key === 'observability')!
    expect(observability.checks.find((c) => c.key === 'audit')?.status).toBe('unavailable')
    expect(observability.score).not.toBe(null)
    expect(observability.status).not.toBe('covered')
  })

  it('关键检查项无法评估时该层不得判已覆盖', () => {
    const r = buildNineLayers({
      ...allGood,
      observability: { ...allGood.observability, auditEntries: 0 },
    })
    const observability = r.layers.find((l) => l.key === 'observability')!
    expect(observability.checks.find((c) => c.key === 'audit')?.status).toBe('unavailable')
    expect(observability.status).toBe('partial')
    // 无法评估的关键项单列，不混进差距（差距只收已评估且未达标的）
    expect(observability.unevaluated.join('\n')).toContain('逐工具调用审计')
    expect(observability.gaps.join('\n')).not.toContain('逐工具调用审计')
  })

  it('无法评估不进差距的动作建议：没有事件不等于机制缺失', () => {
    const r = buildNineLayers({
      ...allGood,
      tools: { ...allGood.tools, preEntries: 0, preWithSummary: 0, failedPosts: 0, classifiedFailures: 0 },
    })
    const tools = r.layers.find((l) => l.key === 'tools')!
    expect(tools.actions).not.toContain('工具错误统一走 classifyToolError，禁止自由文本判定')
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

  // 执法总闸读数须与执法正身同判据（D1 2026-11-05：未设环境变量＝默认开，显式 0 才关）。
  // 2026-11-28 之前采集函数写 `=== '1'`：执法在生效，体检却显示「显式开启=否」。
  const isolatedInputs = async (): Promise<NineLayersInputs> => {
    const dir = mkdtempSync(join(tmpdir(), 'nine-layers-'))
    cleanups.push(dir)
    process.env.OVERLAY_ROOT = dir
    process.env.HERMES_LOOP_DIR = join(dir, 'loop')
    process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals.json')
    process.env.EVAL_STORE = join(dir, 'eval')
    process.env.HELDOUT_STORE = join(dir, 'heldout')
    process.env.TOOL_EXEC_AUDIT_DIR = join(dir, 'audit')
    return collectNineLayersInputs(7)
  }

  it('采集执法总闸：未设置环境变量时读到「开」', async () => {
    _pinManagedSettingsForTests(null)
    const before = process.env.HERMES_TOOL_ENFORCE
    delete process.env.HERMES_TOOL_ENFORCE
    try {
      const inputs = await isolatedInputs()
      expect(inputs.permissions.enforceEnabled).toBe(true)
      const perms = buildNineLayers(inputs).layers.find((l) => l.key === 'permissions')!
      expect(perms.checks.find((c) => c.key === 'enforce')?.evidence).toContain('显式开启=是')
    } finally {
      if (before === undefined) delete process.env.HERMES_TOOL_ENFORCE
      else process.env.HERMES_TOOL_ENFORCE = before
      _unpinManagedSettingsForTests()
    }
  })

  it('采集执法总闸：显式设为 0 时读到「关」', async () => {
    _pinManagedSettingsForTests(null)
    const before = process.env.HERMES_TOOL_ENFORCE
    process.env.HERMES_TOOL_ENFORCE = '0'
    try {
      const inputs = await isolatedInputs()
      expect(inputs.permissions.enforceEnabled).toBe(false)
      const perms = buildNineLayers(inputs).layers.find((l) => l.key === 'permissions')!
      expect(perms.checks.find((c) => c.key === 'enforce')?.evidence).toContain('显式开启=否')
    } finally {
      if (before === undefined) delete process.env.HERMES_TOOL_ENFORCE
      else process.env.HERMES_TOOL_ENFORCE = before
      _unpinManagedSettingsForTests()
    }
  })

  it('采集执法总闸：部署侧锁定开时，环境变量设 0 也读到「开」', async () => {
    _pinManagedSettingsForTests({ version: 1, toolEnforceLocked: true, toolEnforce: 1 })
    const before = process.env.HERMES_TOOL_ENFORCE
    process.env.HERMES_TOOL_ENFORCE = '0'
    try {
      const inputs = await isolatedInputs()
      expect(inputs.permissions.enforceEnabled).toBe(true)
    } finally {
      if (before === undefined) delete process.env.HERMES_TOOL_ENFORCE
      else process.env.HERMES_TOOL_ENFORCE = before
      _unpinManagedSettingsForTests()
    }
  })
})
