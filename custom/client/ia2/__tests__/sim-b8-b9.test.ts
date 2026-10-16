// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-b8-b9.test.ts
// B8 推演设置页+B9 编排挂面单测（E28/A8+D9）：
//   1) SETTING_FIELDS 四区在位（E28 锚定不漂移）
//   2) SimSettingsView：读取渲染当前有效值→改值保存→回传更新；400 原文如实
//   3) 路由面：/app/sim/settings 与 /app/sim/orchestration 可达；/app/eng 重定向编排挂面
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))
vi.mock('../api/sim-settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sim-settings')>()
  return { ...actual, fetchSimSettings: vi.fn(), putSimSettings: vi.fn() }
})

import { SETTING_FIELDS, fetchSimSettings, putSimSettings } from '../api/sim-settings'
import SimSettingsView from '../views/sim/SimSettingsView.vue'
import { buildIaRoutes } from '../routes'

const mockedFetch = vi.mocked(fetchSimSettings)
const mockedPut = vi.mocked(putSimSettings)

const VALUES = {
  posture_default: 'standard' as const,
  observation_window_seconds: 1200,
  clearance_policy: 'block' as const,
  approval_escalate_minutes: 30,
}

describe('SETTING_FIELDS — E28 四区在位', () => {
  it('四键齐：姿态缺省/观察窗节奏/清偿门策略/审批升级超时', () => {
    expect(SETTING_FIELDS.map(f => f.key)).toEqual([
      'posture_default', 'observation_window_seconds', 'clearance_policy', 'approval_escalate_minutes',
    ])
  })
})

describe('SimSettingsView — 推演设置页（B8）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('读取渲染四区当前有效值；改姿态保存后回传更新+已保存反馈', { timeout: 20000 }, async () => {
    mockedFetch.mockResolvedValue({ values: VALUES })
    mockedPut.mockResolvedValue({ values: { ...VALUES, posture_default: 'strict' } })
    const w = mount(SimSettingsView, { global: { plugins: [await makeRouter()] } })
    await flushPromises()
    expect(w.findAll('.sst__row')).toHaveLength(4)
    expect(w.find('[data-testid="sst-input-posture_default"]').element as HTMLSelectElement).toBeTruthy()
    expect(w.text()).toContain('当前有效值：standard')
    await w.find('[data-testid="sst-input-posture_default"]').setValue('strict')
    await w.find('[data-testid="sst-save"]').trigger('click')
    await flushPromises()
    expect(mockedPut).toHaveBeenCalledWith({ ...VALUES, posture_default: 'strict' })
    expect(w.find('[data-testid="sst-saved"]').exists()).toBe(true)
    expect(w.text()).toContain('当前有效值：strict')
    w.unmount()
  })

  it('保存 400（值域越界）原文如实；读取 503 如实', { timeout: 20000 }, async () => {
    mockedFetch.mockResolvedValue({ values: VALUES })
    mockedPut.mockRejectedValue(new Error('PUT /api/hermes/sim/settings → 400（{"error":"observation_window_seconds ∈ 30-3600 整数秒"}）'))
    const w = mount(SimSettingsView, { global: { plugins: [await makeRouter()] } })
    await flushPromises()
    await w.find('[data-testid="sst-save"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sst-save-error"]').text()).toContain('30-3600')
    w.unmount()
    mockedFetch.mockRejectedValue(new Error('/api/hermes/sim/settings → 503'))
    const w2 = mount(SimSettingsView, { global: { plugins: [await makeRouter()] } })
    await flushPromises()
    expect(w2.find('[data-testid="sst-error"]').text()).toContain('503')
    w2.unmount()
  })
})

describe('路由面 — B8/B9 挂入与 /app/eng 重定向', () => {
  it('/app/sim/settings 与 /app/sim/orchestration 路由可达（resolve 不抛）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() as never })
    const settings = router.resolve({ name: 'ia2.simSettings' })
    const orch = router.resolve({ name: 'ia2.simOrchestration' })
    expect(settings.matched).toHaveLength(2) // 父壳+页面
    expect(orch.matched).toHaveLength(2)
  })

  it('/app/eng 重定向编排挂面新家（保留一版本周期）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() as never })
    await router.push('/app/eng')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('ia2.simOrchestration')
  })
})

async function makeRouter(): Promise<Router> {
  const router = createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() as never })
  await router.push('/app/sim/settings')
  await router.isReady()
  return router
}
// 全量并发下视图挂载（含路由与 i18n 链）显著慢于单跑——两例视图件给 20s 预算
