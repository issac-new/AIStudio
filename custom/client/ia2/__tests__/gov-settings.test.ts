// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/gov-settings.test.ts
// C9 治理·系统设置页单测（R9——设计正本 §二 设置）：
//   1) 分区注册表完备：七区齐（总务/人员/流程/功能/资产/成本/审计）、来源徽标只两类、
//      门控字段受控
//   2) 视图：分区说明常驻（验收门一）；superAdmin 条目对非管理员不可见（验收门二）
//      ——mock currentSuperAdmin=false 断言 profiles/agentManager/performance 不渲染
//   3) 条目路由可达（registry 名字全部在路由表）
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))
vi.mock('@/api/client', () => ({ isStoredSuperAdmin: vi.fn(() => false) }))
vi.mock('../../../../config/features', () => ({ features: { pet: false, agentManager: true, ekko: true } }))

import { GOV_SETTINGS_DOMAINS } from '../views/gov/gov-settings-registry'
import GovSettingsView from '../views/gov/GovSettingsView.vue'
import { buildIaRoutes } from '../routes'

function makeRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() as RouteRecordRaw[] })
}

describe('GOV_SETTINGS_DOMAINS — 分区注册表（对账总表 E/F/G 投影）', () => {
  it('七区齐（总务/人员/流程/功能/资产/成本/审计）；每区有常驻说明与条目', () => {
    expect(GOV_SETTINGS_DOMAINS.map(d => d.key)).toEqual(['general', 'people', 'process', 'function', 'assets', 'cost', 'audit'])
    for (const d of GOV_SETTINGS_DOMAINS) {
      expect(d.note.length).toBeGreaterThan(6)
      expect(d.entries.length).toBeGreaterThan(0)
    }
  })
  it('来源徽标只两类；superAdmin/featureGate 字段受控', () => {
    for (const d of GOV_SETTINGS_DOMAINS) for (const e of d.entries) {
      expect(['native', 'legacy']).toContain(e.source)
      if (e.featureGate !== undefined) expect(['pet', 'agentManager', 'ekko', 'versionPreview']).toContain(e.featureGate)
    }
  })
})

describe('GovSettingsView — C9 验收门', () => {
  it('非管理员：superAdmin 条目不可见（profiles/agentManager/performance/ekko 运维隐藏）；分区说明常驻', { timeout: 20000 }, async () => {
    const router = makeRouter()
    await router.push('/app/gov/settings')
    await router.isReady()
    const w = mount(GovSettingsView, { global: { plugins: [router] } })
    await flushPromises()
    // 验收门一：每区说明常驻
    for (const key of ['general', 'people', 'process', 'function', 'assets', 'cost', 'audit']) {
      const sec = w.find(`[data-testid="gs-domain-${key}"]`)
      expect(sec.exists(), `分区 ${key}`).toBe(true)
      expect(sec.find('.gs__domain-note').text().length).toBeGreaterThan(6)
    }
    // 验收门二：superAdmin 条目对非管理员不可见
    expect(w.find('[data-testid="gs-entry-hermes.profiles"]').exists()).toBe(false)
    expect(w.find('[data-testid="gs-entry-hermes.agentManager"]').exists()).toBe(false)
    expect(w.find('[data-testid="gs-entry-hermes.performance"]').exists()).toBe(false)
    // 普通条目在位；petdex 随 features.pet=false 隐藏
    expect(w.find('[data-testid="gs-entry-hermes.models"]').exists()).toBe(true)
    expect(w.find('[data-testid="gs-entry-hermes.petdex"]').exists()).toBe(false)
    // 来源徽标两类并存（同域同区合并呈现，来源只标注不分隔）
    expect(w.find('[data-testid="gs-source-hermes.settings"]').text()).toBe('原生')
    expect(w.find('[data-testid="gs-source-hermes.kanban"]').text()).toBe('旧族')
    w.unmount()
  })

  it('注册表条目全部路由可达（hasRoute 全真——死链零容忍）', { timeout: 20000 }, async () => {
    const router = makeRouter()
    await router.push('/app/gov/settings')
    await router.isReady()
    for (const d of GOV_SETTINGS_DOMAINS) for (const e of d.entries) {
      expect(router.hasRoute(e.name), `路由 ${e.name}`).toBe(true)
    }
  })
})
