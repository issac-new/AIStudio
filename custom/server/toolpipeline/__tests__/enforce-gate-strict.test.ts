// AGT 吸收轮 F（2026-10-21）：strict 姿态单测——deny-by-default 只在显式开启时生效，
// 默认 opt-in 语义零变化（2026-10-16 整改方案 v2「零阻断」裁定不被擅动）。
import { describe, expect, it } from 'vitest'
import { evaluateEnforcement, type EnforceEnv } from '../enforce-gate'
import type { AutonomyLadderEntry } from '../../autonomyladder/autonomy-ladder'

const noPolicy: EnforceEnv = {
  masterOn: true,
  globalMode: null,
  sessionModeOf: () => null,
  ladderOf: () => null,
  identityOf: () => null,
}

const assistLadder = {
  target: 'profile:p1', level: 'assist', maxRiskTier: 'medium',
  approvalPoints: [], updatedBy: 'test', updatedAt: 0,
} as unknown as AutonomyLadderEntry

describe('enforce-gate strict（HERMES_TOOL_ENFORCE_STRICT）', () => {
  it('strict 关（默认）：总闸开+无任何策略 → no-config 不执法（既有语义原样）', () => {
    const v = evaluateEnforcement('write_file', { path: '/tmp/x' }, 'p1', noPolicy)
    expect(v).toEqual({ enforcing: false, rule: 'no-config' })
  })

  it('strict 开：总闸开+无任何策略 → strict-deny（deny-by-default）', () => {
    const v = evaluateEnforcement('write_file', { path: '/tmp/x' }, 'p1', { ...noPolicy, strictOn: true })
    expect(v.enforcing).toBe(true)
    if (v.enforcing && v.allow === false) {
      expect(v.rule).toBe('strict-deny')
      expect(v.error).toContain('strict')
    } else {
      expect.unreachable('strict 无配置应拒绝')
    }
  })

  it('strict 开：身份白名单执法层在 → identity-pass（strict 不误伤已有执法层）', () => {
    const v = evaluateEnforcement('read_file', { path: '/tmp/x' }, 'p1', {
      ...noPolicy, strictOn: true,
      identityOf: () => ({ id: 'u1', name: 'one', toolAllowlist: ['read_file'] }),
    })
    expect(v).toEqual({ enforcing: true, allow: true, rule: 'identity-pass' })
  })

  it('strict 开：阶梯在 → 正常裁决不受 strict 影响（assist 放行 read/medium 内）', () => {
    const v = evaluateEnforcement('memory_search', { q: 'x' }, 'p1', {
      ...noPolicy, strictOn: true, ladderOf: () => assistLadder,
    })
    expect(v).toEqual({ enforcing: true, allow: true, rule: 'ladder-pass' })
  })

  it('strict 开但总闸关 → master-off（strict 不越总闸；opt-in 层级保留）', () => {
    const v = evaluateEnforcement('write_file', { path: '/tmp/x' }, 'p1', {
      ...noPolicy, masterOn: false, strictOn: true,
    })
    expect(v).toEqual({ enforcing: false, rule: 'master-off' })
  })
})
