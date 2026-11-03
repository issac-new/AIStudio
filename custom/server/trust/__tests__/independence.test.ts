// 审阅者独立性单测（C3）：指纹归一、三态判定、策略降级、服务层接入。
// 变异探针：把 same-model 判定改成 independent → 第 3 例红；把 blocksVerified 恒 false
// → 第 6/7 例红；把缺指纹默认成 independent → 第 4 例红。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assessIndependence, modelFingerprint, resolveIndependencePolicy,
  type IndependencePolicy,
} from '../independence'

const report: IndependencePolicy = { mode: 'report', raw: null, policyInvalid: false }
const requireForVerified: IndependencePolicy = {
  mode: 'require-for-verified', raw: 'require-for-verified', policyInvalid: false,
}

describe('modelFingerprint（指纹归一）', () => {
  it('大小写/空白归一后同指纹；要素差异则不同；全空返回空串', () => {
    const a = modelFingerprint({ provider: 'CC-Switch', model: 'GLM-4.7', version: '1' })
    const b = modelFingerprint({ provider: ' cc-switch ', model: 'glm-4.7', version: '1' })
    expect(a).toBe(b)
    expect(a).not.toBe(modelFingerprint({ provider: 'cc-switch', model: 'glm-4.7', version: '2' }))
    expect(modelFingerprint({})).toBe('')
    expect(modelFingerprint(null)).toBe('')
  })

  it('指纹不包含原值（只出摘要）', () => {
    const fp = modelFingerprint({ provider: 'openai', model: 'gpt-x' })
    expect(fp).toMatch(/^[0-9a-f]{40}$/)
    expect(fp).not.toContain('openai')
  })
})

describe('resolveIndependencePolicy（策略解析）', () => {
  it('缺省 report；合法值直取；非法值回落 report 且标 invalid', () => {
    expect(resolveIndependencePolicy({}).mode).toBe('report')
    expect(resolveIndependencePolicy({ HERMES_TRUST_INDEPENDENCE: 'require-for-verified' }).mode)
      .toBe('require-for-verified')
    const bad = resolveIndependencePolicy({ HERMES_TRUST_INDEPENDENCE: 'strict' })
    expect(bad.mode).toBe('report')
    expect(bad.policyInvalid).toBe(true)
  })
})

describe('assessIndependence（三态）', () => {
  it('两枚指纹不同 → independent，永不阻断', () => {
    const r = assessIndependence({
      authorModel: { provider: 'a', model: 'm1' },
      reviewerModel: { provider: 'b', model: 'm2' },
      policy: requireForVerified,
    })
    expect(r.status).toBe('independent')
    expect(r.blocksVerified).toBe(false)
  })

  it('两枚指纹相同 → same-model（身份分离不等于模型独立）', () => {
    const r = assessIndependence({
      authorModel: { provider: 'a', model: 'm1' },
      reviewerModel: { provider: 'a', model: 'm1' },
      policy: report,
    })
    expect(r.status).toBe('same-model')
    expect(r.blocksVerified).toBe(false) // report 档只记录
    expect(r.reason).toContain('模型级不独立')
  })

  it('缺任一指纹 → unknown，不默认成独立', () => {
    const r = assessIndependence({ authorModel: { provider: 'a', model: 'm1' }, policy: requireForVerified })
    expect(r.status).toBe('unknown')
    expect(r.blocksVerified).toBe(false)
    expect(r.reason).toContain('指纹缺席')
  })

  it('require-for-verified 档下共模才阻断 verified', () => {
    const same = { provider: 'a', model: 'm1' }
    expect(assessIndependence({ authorModel: same, reviewerModel: same, policy: requireForVerified }).blocksVerified)
      .toBe(true)
    expect(assessIndependence({ authorModel: same, reviewerModel: { provider: 'b', model: 'm2' }, policy: requireForVerified }).blocksVerified)
      .toBe(false)
  })
})

// ---- 服务层接入：同一案件用同模型审阅，report 记录 / require 拒绝 ----

const ENV_KEYS = ['HERMES_TRUST_DIR', 'HERMES_TRUST_ROOTS', 'HERMES_TRUST_INDEPENDENCE'] as const
let dir = ''
let ws = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trust-indep-'))
  ws = join(dir, 'ws')
  mkdirSync(join(ws, 'src'), { recursive: true })
  writeFileSync(join(ws, 'src', 'login.ts'), 'export const login = 1\n')
  process.env.HERMES_TRUST_DIR = join(dir, 'store')
  process.env.HERMES_TRUST_ROOTS = dir
})

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

async function auditedCase(auditorModel?: Record<string, string>): Promise<{ id: string; audits: unknown[] }> {
  const svc = await import('../service')
  const c = svc.openCase({
    title: '登录改造',
    workspaceRoot: ws,
    actor: 'manager',
    claims: [{
      id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'],
      claimedBy: 'dev', claimedByModel: { provider: 'p', model: 'm', version: '1' },
    }],
  })
  svc.beginAudit(c.id, 'auditor-lead')
  const audits = svc.recordAudits(c.id, [{
    claimId: 'c1', verdict: 'verified', auditor: 'auditor-a',
    observations: ['读取 src/login.ts 并核对摘要'],
    ...(auditorModel ? { auditorModel } : {}),
  }], 'auditor-lead')
  return { id: c.id, audits }
}

describe('trust 服务接入（C3）', () => {
  it('report 档：共模评审放行，但审计记录带 same-model 评估', async () => {
    const { audits } = await auditedCase({ provider: 'p', model: 'm', version: '1' })
    const a = audits[0] as { independence?: { status: string } }
    expect(a.independence?.status).toBe('same-model')
  })

  it('require-for-verified 档：共模 verified 直接拒，给解除路径所需字段', async () => {
    process.env.HERMES_TRUST_INDEPENDENCE = 'require-for-verified'
    await expect(auditedCase({ provider: 'p', model: 'm', version: '1' }))
      .rejects.toThrow(/共模评审不能支撑 verified/)
  })

  it('require-for-verified 档：异模型 verified 正常通过', async () => {
    process.env.HERMES_TRUST_INDEPENDENCE = 'require-for-verified'
    const { audits } = await auditedCase({ provider: 'other', model: 'm2' })
    const a = audits[0] as { independence?: { status: string } }
    expect(a.independence?.status).toBe('independent')
  })
})
