// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell-header.test.ts
// 驾驶舱统一壳页头守门（2026-09-18 统一导航重构 Task 2）：
// IaShellHeader = CockpitTopBar 裁剪迁移——品牌（连接点 + ia2.brand）/全局搜索/
// 团队切换/Gateway 探测组（倒计时+详情面板）/主题语言/通知/用户，固定最右
// ⇄ IDE 按钮跳 ide.shell；schedule/loop/runtrace 按钮、时钟、"Swarm Studio" 字样已裁。
// fetch mock 写法参照 cockpit-topbar-health.test.ts；i18n 走全局 setup mock（t 直返 key）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ searchQuery: '', runSearch: vi.fn(), clearSearch: vi.fn(), _sessionSearching: false }),
}))
vi.mock('@/stores/hermes/app', () => ({ useAppStore: () => ({ connected: true }) }))
vi.mock('@/components/layout/ThemeSwitch.vue', () => ({ default: { name: 'ThemeSwitch', template: '<span class="theme-stub" />' } }))
vi.mock('@/components/layout/LanguageSwitch.vue', () => ({ default: { name: 'LanguageSwitch', template: '<span class="lang-stub" />' } }))
// 团队切换器有 store/profiles 依赖，换哑组件避免拉起上游 router（同 cockpit-topbar-health）
vi.mock('@/custom/cockpit/components/CockpitTeamSwitcher.vue', () => ({
  default: { name: 'CockpitTeamSwitcher', template: '<span class="team-switcher-stub" />' },
}))

import IaShellHeader from '../components/IaShellHeader.vue'

function mockHealth(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => payload })))
}

async function mountHeader() {
  mockHealth({ gateway_state: 'running', loaded_platforms: {} })
  const w = mount(IaShellHeader, {
    props: { notifyCount: 3, userName: 'tester' },
    global: { stubs: { CockpitIcon: true } },
  })
  await w.vm.$nextTick()
  return w
}

describe('IaShellHeader — 统一壳页头', () => {
  beforeEach(() => { vi.unstubAllGlobals(); pushMock.mockClear() })

  it('品牌：连接点 + ia2.brand 文案（无 Swarm Studio 字样）', async () => {
    const w = await mountHeader()
    expect(w.text()).toContain('ia2.brand')
    expect(w.text()).not.toContain('Swarm Studio')
    w.unmount()
  })

  it('⇄ IDE 按钮固定最右渲染，点击跳 ide.shell', async () => {
    const w = await mountHeader()
    const btn = w.find('[data-testid="ia-header-ide"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('ia2.shell.gotoIde')
    await btn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'ide.shell' })
    w.unmount()
  })

  it('通知按钮点击 emit notify，badge 显示 notifyCount', async () => {
    const w = await mountHeader()
    const btn = w.find('[data-testid="ia-header-notify"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('3')
    await btn.trigger('click')
    expect(w.emitted('notify')).toHaveLength(1)
    w.unmount()
  })

  it('用户按钮跳 hermes.settings（avatar = userName 首字符）', async () => {
    const w = await mountHeader()
    const btn = w.find('[data-testid="ia-header-user"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('tester')
    await btn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.settings' })
    w.unmount()
  })

  it('Gateway 探测区渲染（/agent-health/detailed → running 投影）', async () => {
    const w = await mountHeader()
    const grp = w.find('.cockpit-top__grp')
    expect(grp.exists()).toBe(true)
    expect(grp.text()).toContain('Gateway')
    await vi.waitFor(() => {
      expect(w.find('.cockpit-top__grp .cockpit-top__ustat.is-running').exists()).toBe(true)
    })
    w.unmount()
  })
})
