// 姿态准入判据单测（C2）：三档策略、逐条点名、digest 稳定性。
// 变异探针：把 bare→blockers 的判定删掉，第 2/3 例会变红；把 strict 的两开关检查
// 删掉，第 5/6 例会变红。
import { describe, expect, it } from 'vitest'
import {
  digestOf, evaluatePostureAdmission, resolvePosturePolicy,
  type PosturePolicy,
} from '../posture-admission'
import type { GovernancePosture, PostureProfile } from '../posture'

function profile(name: string, lamp: PostureProfile['lamp'], extra: Partial<PostureProfile> = {}): PostureProfile {
  return {
    name,
    configExists: true,
    approvalsMode: lamp === 'bare' ? 'off' : lamp === 'governed' ? 'smart' : null,
    approvalsDeclared: lamp === 'governed',
    deviations: [],
    lamp,
    ...extra,
  }
}

function postureOf(profiles: PostureProfile[], opts: {
  master?: boolean
  strict?: boolean
  enforceMode?: string | null
  ledgerProblems?: string[]
  expectationsExists?: boolean
} = {}): GovernancePosture {
  return {
    at: 1_700_000_000_000,
    hermesHome: '/tmp/hermes',
    global: {
      enforceMasterOn: opts.master ?? false,
      strictOn: opts.strict ?? false,
      enforceMode: opts.enforceMode ?? null,
      sandboxRoots: 0, browserAllow: 0, browserDeny: 0,
      toolBlacklist: 0, budgetPolicies: 0, identityAllowlists: 0, ladderEntries: 0, loadedRuleTotal: 0,
    },
    ledger: { exists: true, problems: opts.ledgerProblems ?? [] },
    expectations: { file: '/tmp/exp.json', exists: opts.expectationsExists ?? true },
    profiles,
    summary: {
      total: profiles.length,
      governed: profiles.filter((p) => p.lamp === 'governed').length,
      partial: profiles.filter((p) => p.lamp === 'partial').length,
      bare: profiles.filter((p) => p.lamp === 'bare').length,
      configMissing: profiles.filter((p) => !p.configExists).length,
    },
  }
}

const report: PosturePolicy = { mode: 'report', raw: null, policyInvalid: false }
const requireGate: PosturePolicy = { mode: 'require-for-gate', raw: 'require-for-gate', policyInvalid: false }
const strict: PosturePolicy = { mode: 'strict', raw: 'strict', policyInvalid: false }

describe('resolvePosturePolicy（策略解析）', () => {
  it('缺省 report；合法值直取；非法值回落 report 且标 invalid', () => {
    expect(resolvePosturePolicy({}).mode).toBe('report')
    expect(resolvePosturePolicy({ HERMES_POSTURE_POLICY: 'strict' }).mode).toBe('strict')
    const bad = resolvePosturePolicy({ HERMES_POSTURE_POLICY: 'STRICT' })
    expect(bad.mode).toBe('report')
    expect(bad.policyInvalid).toBe(true)
    expect(bad.raw).toBe('STRICT')
  })
})

describe('evaluatePostureAdmission（三档准入）', () => {
  it('report 档零行为变化：bare 也放行，偏差只进 warnings', () => {
    const p = postureOf([profile('a', 'bare'), profile('b', 'partial')])
    const r = evaluatePostureAdmission(p, report)
    expect(r.admits).toBe(true)
    expect(r.blockers).toEqual([])
    expect(r.warnings.join('\n')).toContain('partial')
  })

  it('require-for-gate：bare 拒，且逐 profile 点名并给解除路径', () => {
    const p = postureOf([profile('worker-a', 'bare'), profile('worker-b', 'bare'), profile('ok', 'governed')])
    const r = evaluatePostureAdmission(p, requireGate)
    expect(r.admits).toBe(false)
    expect(r.blockers).toHaveLength(2)
    expect(r.blockers[0]).toContain('worker-a')
    expect(r.blockers[0]).toContain('approvals.mode')
    expect(r.blockers[0]).toContain('解除=')
  })

  it('require-for-gate：全 governed 放行', () => {
    const p = postureOf([profile('a', 'governed'), profile('b', 'governed')])
    expect(evaluatePostureAdmission(p, requireGate).admits).toBe(true)
  })

  it('require-for-gate：治理台账问题与配置读错都阻断', () => {
    const p = postureOf([profile('a', 'governed')], { ledgerProblems: ['缺 capabilities.yaml'] })
    const r = evaluatePostureAdmission(p, requireGate)
    expect(r.admits).toBe(false)
    expect(r.blockers.join('\n')).toContain('治理台账')

    const p2 = postureOf([profile('b', 'governed', { configError: 'YAML 语法错误' })])
    const r2 = evaluatePostureAdmission(p2, requireGate)
    expect(r2.admits).toBe(false)
    expect(r2.blockers.join('\n')).toContain('YAML 语法错误')
  })

  it('strict：总闸未开拒；仅总闸开但 strict 未开仍拒；两者都开才放行', () => {
    const p = postureOf([profile('a', 'governed')], { master: false, strict: false })
    const r1 = evaluatePostureAdmission(p, strict)
    expect(r1.admits).toBe(false)
    expect(r1.blockers.join('\n')).toContain('HERMES_TOOL_ENFORCE')

    const p2 = postureOf([profile('a', 'governed')], { master: true, strict: false })
    const r2 = evaluatePostureAdmission(p2, strict)
    expect(r2.admits).toBe(false)
    expect(r2.blockers.join('\n')).toContain('HERMES_TOOL_ENFORCE_STRICT')

    const p3 = postureOf([profile('a', 'governed')], { master: true, strict: true })
    expect(evaluatePostureAdmission(p3, strict).admits).toBe(true)
  })

  it('strict 只在 require 基础上加严，不放宽 bare 检查', () => {
    const p = postureOf([profile('a', 'bare')], { master: true, strict: true })
    expect(evaluatePostureAdmission(p, strict).admits).toBe(false)
  })

  it('非法策略值出现在 warnings（不静默）', () => {
    const p = postureOf([profile('a', 'governed')])
    const bad: PosturePolicy = { mode: 'report', raw: 'STRICT', policyInvalid: true }
    const r = evaluatePostureAdmission(p, bad)
    expect(r.admits).toBe(true)
    expect(r.warnings.join('\n')).toContain('策略值非法')
  })
})

describe('digestOf（姿态摘要稳定性）', () => {
  it('同内容同摘要；开关变化摘要变化；profile 增删不改变摘要（只取判据面）', () => {
    const a = postureOf([profile('a', 'governed')])
    const b = postureOf([profile('a', 'governed')])
    expect(digestOf(a)).toBe(digestOf(b))

    const c = postureOf([profile('a', 'governed')], { master: true })
    expect(digestOf(c)).not.toBe(digestOf(a))

    const d = postureOf([profile('a', 'governed'), profile('z', 'governed')])
    expect(digestOf(d)).toBe(digestOf(a))
  })
})
