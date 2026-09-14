// @vitest-environment jsdom
// 顶栏 "Swarm Studio" 字样入口守门。
// 2026-09-14 用户指定：改指「总览」页（ia2.overview，新 IA 工作台首屏）——
// 此前为 hermes.loop 循环工程列表页（09-12 指定，用户当日要求改离）。
// 另守两面：① Loop Engineering 按钮冻结为旧 LoopModal 弹窗（emit loop、不走
// 路由）；② 顶栏内嵌团队切换器（原独占 teambar 行已并入顶栏，与 Gateway 同行）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ searchQuery: '', runSearch: vi.fn(), clearSearch: vi.fn(), _sessionSearching: false }),
}))
vi.mock('@/stores/hermes/app', () => ({ useAppStore: () => ({ connected: false }) }))
// 布局组件经 @/api/client 顶层 createRouter 拉起路由实例，与本测试的 useRouter mock 冲突，直接换成哑组件
vi.mock('@/components/layout/ThemeSwitch.vue', () => ({ default: { name: 'ThemeSwitch', template: '<span class="theme-stub" />' } }))
vi.mock('@/components/layout/LanguageSwitch.vue', () => ({ default: { name: 'LanguageSwitch', template: '<span class="lang-stub" />' } }))
// 团队切换器有自己的 store/profiles 依赖，此处只验证它被顶栏挂载
vi.mock('@/custom/cockpit/components/CockpitTeamSwitcher.vue', () => ({
  default: { name: 'CockpitTeamSwitcher', template: '<span class="team-switcher-stub" />' },
}))

import CockpitTopBar from '@/custom/cockpit/components/CockpitTopBar.vue'

function mountBar() {
  return mount(CockpitTopBar, {
    props: { notifyCount: 0, scheduleCount: 0, userName: 'tester' },
    global: { stubs: { ThemeSwitch: true, LanguageSwitch: true, CockpitIcon: true } },
  })
}

describe('CockpitTopBar "Swarm Studio" 入口', () => {
  beforeEach(() => { pushMock.mockClear() })

  it('点击 "Swarm Studio" 字样导航「总览」页（ia2.overview）', async () => {
    const w = mountBar()
    const el = w.find('.cockpit-top__sub')
    expect(el.text()).toBe('Swarm Studio')
    await el.trigger('click')
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith({ name: 'ia2.overview' })
    w.unmount()
  })

  it('Enter 键同样触发导航（role=link 可达性）', async () => {
    const w = mountBar()
    await w.find('.cockpit-top__sub').trigger('keydown.enter')
    expect(pushMock).toHaveBeenCalledWith({ name: 'ia2.overview' })
    w.unmount()
  })

  it('Loop Engineering 按钮冻结为旧 LoopModal：emit loop、不走路由', async () => {
    const w = mountBar()
    const loopBtn = w.findAll('.cockpit-top__btn').find(b => b.text().includes('sidebar.loop'))
    expect(loopBtn, 'Loop Engineering 按钮须存在').toBeTruthy()
    await loopBtn!.trigger('click')
    expect(w.emitted('loop')).toHaveLength(1)
    expect(pushMock).not.toHaveBeenCalled()
    w.unmount()
  })

  it('团队切换器挂载在顶栏内（与 Gateway 探测组同行，teambar 行已废）', async () => {
    const w = mountBar()
    expect(w.find('.team-switcher-stub').exists()).toBe(true)
    w.unmount()
  })
})
