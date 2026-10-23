// overlay/custom/client/ia2/__tests__/effectiveness-i18n.test.ts
// 交付效能页签文案守门（2026-10-23 天猫吸收轮）：zh/en 键成对、核心键在位——
// 同 sim-tabs/i18n-tasks-tabs 守门先例（vue-tsc 不覆盖 custom client，缺口靠此测试拦）。

import { describe, it, expect } from 'vitest'
import { EFFECTIVENESS_TEXT } from '../views/effectiveness/i18n'

describe('交付效能页签文案（模块内小字典）', () => {
  it('zh/en 键严格成对', () => {
    expect(Object.keys(EFFECTIVENESS_TEXT.zh)).toEqual(Object.keys(EFFECTIVENESS_TEXT.en))
  })

  it('核心键在位：三区标题 + 介入六类 + 两层', () => {
    for (const k of [
      'title', 'digestTitle', 'matrixTitle', 'interventionsTitle',
      'layerCollab', 'layerDelivery',
      'typeRaise', 'typeContext', 'typeNudge', 'typeUnblock', 'typeConfirm', 'typeRework',
      'riskSignals', 'listBlockers', 'listReview', 'suggestions',
    ] as const) {
      expect(EFFECTIVENESS_TEXT.zh, k).toHaveProperty(k)
      expect(String(EFFECTIVENESS_TEXT.zh[k]).length).toBeGreaterThan(0)
    }
  })
})
