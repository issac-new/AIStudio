// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/gov-settings.test.ts
// C9 设置目录页单测（R9 起源；2026-10-27 产品一致性 Task 7 升级）：
//   1) 分区注册表完备：八区齐（总务/人员/协作/流程/功能/资产/成本/观察诊断）——
//      用量/性能/日志归「观察诊断」、群组归「协作」（仅呈现分组，路由不动）、
//      来源徽标只两类、surface/superAdmin/featureGate 字段受控
//   2) 视图：分区说明常驻（验收门一）；superAdmin 条目对非管理员不可见（验收门二）
//      ——mock currentSuperAdmin=false 断言 profiles/agentManager/performance 不渲染
//   3) 条目路由可达（registry 名字在路由表；ekko.settings=上游 bootstrap 注册例外）
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
  it('八区齐（总务/人员/协作/流程/功能/资产/成本/观察诊断）；每区有常驻说明与条目', () => {
    expect(GOV_SETTINGS_DOMAINS.map(d => d.key)).toEqual(['general', 'people', 'collab', 'process', 'function', 'assets', 'cost', 'diagnostics'])
    for (const d of GOV_SETTINGS_DOMAINS) {
      expect(d.note.length).toBeGreaterThan(6)
      expect(d.entries.length).toBeGreaterThan(0)
    }
  })
  it('来源徽标只两类；surface/superAdmin/featureGate 字段受控', () => {
    for (const d of GOV_SETTINGS_DOMAINS) for (const e of d.entries) {
      expect(['native', 'legacy']).toContain(e.source)
      expect(['catalog', 'sidebar', 'both', 'none']).toContain(e.surface)
      if (e.featureGate !== undefined) expect(['pet', 'agentManager', 'ekko', 'versionPreview']).toContain(e.featureGate)
    }
  })
})

describe('GovSettingsView — C9 验收门', () => {
  it('非管理员：superAdmin 条目不可见（profiles/agentManager/performance/版本预览隐藏）；分区说明常驻', { timeout: 60000 }, async () => {
    const router = makeRouter()
    await router.push('/app/gov/settings')
    await router.isReady()
    const w = mount(GovSettingsView, { global: { plugins: [router] } })
    await flushPromises()
    // 验收门一：每区说明常驻（people 区两条目均 superAdmin 门控，非管理员整区隐藏）
    for (const key of ['general', 'collab', 'process', 'function', 'assets', 'cost', 'diagnostics']) {
      const sec = w.find(`[data-testid="gs-domain-${key}"]`)
      expect(sec.exists(), `分区 ${key}`).toBe(true)
      expect(sec.find('.gs__domain-note').text().length).toBeGreaterThan(6)
    }
    expect(w.find('[data-testid="gs-domain-people"]').exists()).toBe(false)
    // 验收门二：superAdmin 条目对非管理员不可见
    expect(w.find('[data-testid="gs-entry-hermes.profiles"]').exists()).toBe(false)
    expect(w.find('[data-testid="gs-entry-hermes.agentManager"]').exists()).toBe(false)
    expect(w.find('[data-testid="gs-entry-hermes.performance"]').exists()).toBe(false)
    expect(w.find('[data-testid="gs-entry-hermes.versionPreview"]').exists()).toBe(false)
    // 普通条目在位；petdex 随 features.pet=false 隐藏
    expect(w.find('[data-testid="gs-entry-hermes.models"]').exists()).toBe(true)
    expect(w.find('[data-testid="gs-entry-hermes.petdex"]').exists()).toBe(false)
    // 侧栏专属面（theme/ekko）不进目录（Task 7 surface 派生）
    expect(w.find('[data-testid="gs-entry-hermes.theme"]').exists()).toBe(false)
    expect(w.find('[data-testid="gs-entry-ekko.settings"]').exists()).toBe(false)
    // 界面不再暴露内部迁移术语（原生/旧族）
    expect(w.text()).not.toContain('原生')
    expect(w.text()).not.toContain('旧族')
    w.unmount()
  })

  it('注册表条目全部路由可达（ekko.settings 例外=上游 bootstrap 注册，非 ia2 树）', { timeout: 60000 }, async () => {
    const router = makeRouter()
    await router.push('/app/gov/settings')
    await router.isReady()
    for (const d of GOV_SETTINGS_DOMAINS) for (const e of d.entries) {
      if (e.name === 'ekko.settings') continue
      expect(router.hasRoute(e.name), `路由 ${e.name}`).toBe(true)
    }
  })
})
