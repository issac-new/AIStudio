import { describe, expect, it } from 'vitest'

import {
  DELIVERY_CONTRACTS,
  detectDeliveryTypes,
  requiredArtifactsForDeliveryTypes,
  requiredRuntimeEvidence,
  validateDeliveryEvidence,
} from '../delivery-contract'

describe('delivery-contract：交付形态感知契约（平台根治件）', () => {
  it('嗅探：小程序标记命中 → mini-program（wxml/project.config.json 双源）', () => {
    expect(detectDeliveryTypes(['apps/csw-cashier-mp/wechat/pages/cashier/index.wxml'])).toContain('mini-program')
    expect(detectDeliveryTypes(['apps/x/mini.project.json'])).toContain('mini-program')
  })
  it('嗅探：仅 package.json 无其他标记 → backend-service 兜底；无标记 → 空集（governance-doc 由任务声明）', () => {
    expect(detectDeliveryTypes(['package.json'])).toEqual(['backend-service'])
    expect(detectDeliveryTypes(['docs/readme.md'])).toEqual([])
  })
  it('核验：mini-program 无 devtools-proof=违例且点名「单测全绿不等于可运行」', () => {
    const bad = validateDeliveryEvidence('mini-program', ['unit-tests'])
    expect(bad.ok).toBe(false)
    expect(bad.violations[0]).toContain('单测全绿不等于可运行')
    expect(validateDeliveryEvidence('mini-program', ['devtools-proof']).ok).toBe(true)
  })
  it('governance-doc 免运行证据（none-required 直接过）', () => {
    expect(validateDeliveryEvidence('governance-doc', []).ok).toBe(true)
  })
  it('看板建议件：两形态去重合成 requiredArtifacts', () => {
    const arts = requiredArtifactsForDeliveryTypes(['mini-program', 'web-frontend'])
    expect(arts).toContain('docs/evidence/*runtime-proof.json')
    expect(arts).toContain('docs/evidence/*walkthrough*.png')
    expect(arts.length).toBe(2)
  })
  it('契约面完备：六型齐、每型 label/证据形态/教学声明在位', () => {
    expect(Object.keys(DELIVERY_CONTRACTS).length).toBe(6)
    for (const c of Object.values(DELIVERY_CONTRACTS)) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(requiredRuntimeEvidence(c.type).kind.length).toBeGreaterThan(0)
    }
  })
})
