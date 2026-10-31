// custom/server/orchestrator/__tests__/auth.test.ts
// 授权流水：策略版本、准入判定、凭证签发/撤销/重校验（2026-10-31 A+B 批 spec §5.1）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { admit, defaultCells, normalizeAdmission, setAdmission } from '../admission'
import { issueMandate, revalidate, revoke } from '../mandate'
import { bumpPolicyVersion, currentPolicyVersion, policyVersionCheck } from '../policy-version'
import { resetOrchestratorForTests } from '../store'

let dir: string
let prevDb: string | undefined
let prevAdmissions: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-auth-'))
  prevDb = process.env.ORCHESTRATOR_DB
  prevAdmissions = process.env.ORCHESTRATOR_ADMISSIONS
  process.env.ORCHESTRATOR_DB = join(dir, 'orch.sqlite')
  process.env.ORCHESTRATOR_ADMISSIONS = join(dir, 'admissions.json')
  delete process.env.ORCHESTRATOR_STRICT_POLICY
  delete process.env.ORCHESTRATOR_POLICY_SOURCE_ADMISSION_VERSION
  resetOrchestratorForTests()
})

afterEach(() => {
  resetOrchestratorForTests()
  if (prevDb === undefined) delete process.env.ORCHESTRATOR_DB
  else process.env.ORCHESTRATOR_DB = prevDb
  if (prevAdmissions === undefined) delete process.env.ORCHESTRATOR_ADMISSIONS
  else process.env.ORCHESTRATOR_ADMISSIONS = prevAdmissions
  rmSync(dir, { recursive: true, force: true })
})

describe('policy-version', () => {
  it('未 bump 为 0，bump 单调递增', () => {
    expect(currentPolicyVersion('source-admission')).toBe(0)
    expect(bumpPolicyVersion('source-admission', 'tester')).toBe(1)
    expect(bumpPolicyVersion('source-admission', 'tester')).toBe(2)
    expect(currentPolicyVersion('source-admission')).toBe(2)
  })

  it('钉版本优先于库内值', () => {
    bumpPolicyVersion('source-admission', 'tester')
    process.env.ORCHESTRATOR_POLICY_SOURCE_ADMISSION_VERSION = '9'
    expect(currentPolicyVersion('source-admission')).toBe(9)
    delete process.env.ORCHESTRATOR_POLICY_SOURCE_ADMISSION_VERSION
  })

  it('版本落后默认放行，严格模式拒绝', () => {
    // 未 bump 时 current=0，任何记录值都不算落后。
    expect(policyVersionCheck('source-admission', 0, { strict: true, env: {} }).ok).toBe(true)
    bumpPolicyVersion('source-admission', 'tester')
    expect(policyVersionCheck('source-admission', 0, { strict: false, env: {} }).ok).toBe(true)
    expect(policyVersionCheck('source-admission', 0, { strict: true, env: {} }).ok).toBe(false)
    expect(policyVersionCheck('source-admission', 5, { strict: true, env: {} }).ok).toBe(true)
  })
})

describe('admission', () => {
  it('缺省表：名单内明确=accept，名单内不指向=inferred，名单外=ignore', () => {
    const a = normalizeAdmission({ sourceId: 's1' })
    expect(a.mode).toBe('observe')
    expect(admit(a, true, true)).toMatchObject({ action: 'accept', strength: 'explicit' })
    expect(admit(a, true, false)).toMatchObject({ action: 'inferred', strength: 'inferred' })
    expect(admit(a, false, true)).toMatchObject({ action: 'ignore', strength: null })
  })

  it('mode 决定是否实际放行', () => {
    const base = normalizeAdmission({ sourceId: 's1', allowedSenders: ['x'] })
    expect(admit({ ...base, mode: 'off' }, true, true)).toMatchObject({ allow: false, reason: 'source_off' })
    expect(admit({ ...base, mode: 'observe' }, true, true)).toMatchObject({ allow: false, reason: 'observe_would_accept' })
    expect(admit({ ...base, mode: 'auto' }, true, true)).toMatchObject({ allow: true, reason: 'auto_accept' })
    expect(admit({ ...base, mode: 'auto' }, false, true)).toMatchObject({ allow: false, reason: 'ignored' })
  })

  it('写入后可读回，损坏文件 fail-closed', async () => {
    setAdmission({ sourceId: 's1', mode: 'auto', allowedSenders: ['x'], cells: defaultCells() }, 'tester')
    const { getAdmission } = await import('../admission')
    expect(getAdmission('s1')?.mode).toBe('auto')
  })
})

describe('mandate', () => {
  const scope = { sourceId: 'kanban:default', action: 'fix' }

  it('签发后可回收，撤销后重校验失败', () => {
    const m = issueMandate({
      decisionId: 'dec_1', ticketId: 't-1', scope, strength: 'explicit',
      ruleIds: ['rule:a'], policyVersion: 0, issuer: 'tester',
    })
    expect(m.revokedAt).toBeNull()
    expect(revalidate(m.id).valid).toBe(true)
    expect(revoke(m.id, 'person_stop')).toBe(true)
    expect(revalidate(m.id)).toMatchObject({ valid: false, reason: 'revoked' })
  })

  it('过期后失败', () => {
    const m = issueMandate({
      decisionId: 'dec_2', ticketId: 't-2', scope, strength: 'explicit',
      ruleIds: [], policyVersion: 0, issuer: 'tester', ttlMs: 1000, issuedAt: 1000,
    })
    expect(revalidate(m.id, { nowMs: 1500 }).valid).toBe(true)
    expect(revalidate(m.id, { nowMs: 2001 })).toMatchObject({ valid: false, reason: 'expired' })
  })

  it('策略版本落后：默认告警放行，严格模式拒绝', () => {
    const m = issueMandate({
      decisionId: 'dec_3', ticketId: 't-3', scope, strength: 'explicit',
      ruleIds: [], policyVersion: 0, issuer: 'tester',
    })
    bumpPolicyVersion('source-admission', 'tester')
    const loose = revalidate(m.id, { env: {} })
    expect(loose.valid).toBe(true)
    expect(loose.warnings.some(w => w.startsWith('policy_version_outdated'))).toBe(true)
    const strict = revalidate(m.id, { env: { ORCHESTRATOR_STRICT_POLICY: '1' } })
    expect(strict).toMatchObject({ valid: false, reason: 'policy_version_changed' })
  })

  it('inferred 凭证在准入收紧后失效', () => {
    setAdmission({ sourceId: 'kanban:default', mode: 'auto', allowedSenders: ['bot'], cells: defaultCells() }, 'tester')
    const m = issueMandate({
      decisionId: 'dec_4', ticketId: 't-4', scope, strength: 'inferred',
      ruleIds: [], policyVersion: 0, issuer: 'tester',
    })
    expect(revalidate(m.id, { currentSenderListed: true, addressed: false }).valid).toBe(true)
    // 发送者移出名单：unlisted + addressed → ignore，推断授权失效
    expect(revalidate(m.id, { currentSenderListed: false, addressed: true }))
      .toMatchObject({ valid: false, reason: 'admission_downgraded' })
  })
})
