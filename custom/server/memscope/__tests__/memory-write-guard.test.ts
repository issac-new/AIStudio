import { describe, it, expect } from 'vitest'
import { decideMemoryWrite } from '../memory-write-guard'

describe('记忆写入准入（handbook 记忆关）', () => {
  it('作用域明确、证据已确认、来源可追溯 → 允许', () => {
    expect(decideMemoryWrite({
      tenantId: 't1', userId: 'u1', evidence: 'confirmed', sourceRef: 'trace:abc', scope: 'project',
    }).allow).toBe(true)
  })

  it('缺作用域/跨租户/跨用户 → 拒绝', () => {
    expect(decideMemoryWrite({ evidence: 'confirmed', sourceRef: 'x' }).allow).toBe(false)
    expect(decideMemoryWrite({
      tenantId: 't1', userId: 'u1', ownerTenantId: 't2', evidence: 'confirmed', sourceRef: 'x',
    }).reason).toContain('跨租户')
    expect(decideMemoryWrite({
      tenantId: 't1', userId: 'u1', ownerUserId: 'u2', evidence: 'confirmed', sourceRef: 'x',
    }).reason).toContain('跨用户')
  })

  it('模型自述完成/猜测/临时值/缺来源 → 拒绝', () => {
    const base = { tenantId: 't1', userId: 'u1', sourceRef: 'trace:abc' }
    expect(decideMemoryWrite({ ...base, evidence: 'model_done' }).allow).toBe(false)
    expect(decideMemoryWrite({ ...base, evidence: 'guess' }).allow).toBe(false)
    expect(decideMemoryWrite({ ...base, evidence: 'temporary' }).allow).toBe(false)
    expect(decideMemoryWrite({ tenantId: 't1', userId: 'u1', evidence: 'confirmed' }).reason).toContain('来源')
  })
})
