// @vitest-environment jsdom
// D13 六阶段工作页单测：路由可达+阶段页渲染+工具卡直达+状态推导。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }), createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }) }))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import StageShell from '../views/stage/StageShell.vue'

const mockedFetch = vi.mocked(authFetch)

function makeRouter(path: string, stage: number): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path, component: StageShell, props: { stage } }] as RouteRecordRaw[],
  })
}

async function mountStage(stage: number, path = `/x`) {
  const router = makeRouter(path, stage)
  await router.push(path)
  await router.isReady()
  const w = mount(StageShell, { props: { stage }, global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('StageShell — D13 时序六阶段工作页', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('①搭台：标题+导语+三工具卡（组织资产/系统设置/运行观测）', async () => {
    const { w } = await mountStage(1)
    expect(w.find('[data-testid="stg-page-1"]').exists()).toBe(true)
    expect(w.text()).toContain('搭台：建立组织与资产')
    expect(w.findAll('.stg__tool').length).toBeGreaterThanOrEqual(3)
    expect(w.text()).toContain('组织与资产')
    w.unmount()
  })

  it('④生产：四工具卡（inbox/看板/IDE/证据库）', async () => {
    const { w } = await mountStage(4)
    expect(w.text()).toContain('生产：编码测试与日常协调')
    const labels = w.findAll('.stg__tool-label').map(x => x.text())
    for (const t of ['把关待办 inbox', '看板（工作台三栏）', 'IDE 画布', '证据库']) expect(labels).toContain(t)
    w.unmount()
  })

  it('带 run 状态：完成阶段✓、首个未完成=当前（②在 smoke 后=当前）', async () => {
    const { w } = await mountStage(2, '/x?run=r')
    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ run: 'r', posture: 'standard', gates: {}, steps: { smoke_done: '1' }, ledger: { open: 0 } }),
    } as never)
    // 触发重载：run watch 已 immediate——手动再 load 一次（组件暴露无；重挂）
    w.unmount()
    const router = makeRouter('/x?run=r', 2)
    await router.push('/x?run=r')
    await router.isReady()
    const w2 = mount(StageShell, { props: { stage: 2 }, global: { plugins: [router] } })
    await flushPromises()
    await flushPromises()
    expect(w2.find('[data-testid="stg-state-2"]').text()).toContain('当前阶段')
    w2.unmount()
  })
})
