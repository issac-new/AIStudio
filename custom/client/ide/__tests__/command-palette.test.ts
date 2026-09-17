// overlay/custom/client/ide/__tests__/command-palette.test.ts
// 命令面板守门：store 开关、命令区构建与过滤、任务区过滤切换、键盘导航执行。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const { switchSession, newChat, loadSessions } = vi.hoisted(() => ({
  switchSession: vi.fn(async () => {}),
  newChat: vi.fn(),
  loadSessions: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    sessions: [
      { id: 's1', title: '修复登录跳转' },
      { id: 's2', title: '重构终端面板' },
      { id: 's-active', title: '当前会话（不应出现）' },
    ],
    activeSessionId: 's-active',
    sessionProfileFilter: null,
    switchSession,
    newChat,
    loadSessions,
  }),
}))
const { openRunTrace } = vi.hoisted(() => ({ openRunTrace: vi.fn() }))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ openRunTrace }),
}))
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import IdeCommandPalette from '../components/IdeCommandPalette.vue'
import { useIdeStore } from '../store/ide'

describe('IdeCommandPalette', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mountPalette() {
    return mount(IdeCommandPalette, {
      global: { stubs: { Teleport: true } },
    })
  }

  it('paletteOpen 关闭时不渲染面板，开启后渲染命令+任务两区', async () => {
    const ide = useIdeStore()
    const wrapper = mountPalette()
    expect(wrapper.find('.ide-palette__panel').exists()).toBe(false)

    ide.openPalette()
    await flushPromises()
    expect(wrapper.find('.ide-palette__panel').exists()).toBe(true)
    // 命令区含布局开关/新会话/导航；任务区含非当前会话
    const sectionLabels = wrapper.findAll('.ide-palette__section-label').map((n) => n.text())
    expect(sectionLabels).toContain('ide.paletteSectionCommands')
    expect(sectionLabels).toContain('ide.paletteSectionTasks')
    const items = wrapper.findAll('.ide-palette__item').map((n) => n.text())
    expect(items).toContain('ide.paletteCmdNewSession')
    expect(items).toContain('ide.links.settings')
    expect(items).toContain('重构终端面板')
    // 当前会话不出现在任务区
    expect(items).not.toContain('当前会话（不应出现）')
  })

  it('query 过滤：命中任务标题时只剩任务区对应项', async () => {
    const ide = useIdeStore()
    const wrapper = mountPalette()
    ide.openPalette()
    await flushPromises()

    await wrapper.find('.ide-palette__input').setValue('终端')
    const items = wrapper.findAll('.ide-palette__item').map((n) => n.text())
    expect(items).toEqual(['重构终端面板'])
  })

  it('query 无命中显示空态', async () => {
    const ide = useIdeStore()
    const wrapper = mountPalette()
    ide.openPalette()
    await flushPromises()

    await wrapper.find('.ide-palette__input').setValue('不存在的命令xyz')
    expect(wrapper.find('.ide-palette__empty').exists()).toBe(true)
  })

  it('点击任务项：关闭面板并 switchSession', async () => {
    const ide = useIdeStore()
    const wrapper = mountPalette()
    ide.openPalette()
    await flushPromises()

    await wrapper.findAll('.ide-palette__item').find((n) => n.text() === '修复登录跳转')!.trigger('click')
    expect(ide.paletteOpen).toBe(false)
    expect(switchSession).toHaveBeenCalledWith('s1')
  })

  it('点击导航命令：跳转对应路由并关闭面板', async () => {
    const ide = useIdeStore()
    const wrapper = mountPalette()
    ide.openPalette()
    await flushPromises()

    await wrapper.findAll('.ide-palette__item').find((n) => n.text() === 'ide.links.settings')!.trigger('click')
    expect(ide.paletteOpen).toBe(false)
    expect(push).toHaveBeenCalledWith({ name: 'hermes.settings' })
  })

  it('键盘：Enter 执行首项（新会话），ArrowDown 移动激活项，Escape 关闭', async () => {
    const ide = useIdeStore()
    const wrapper = mountPalette()
    ide.openPalette()
    await flushPromises()

    const input = wrapper.find('.ide-palette__input')
    // 首项（新会话）激活：Enter 直接执行
    expect(wrapper.find('.ide-palette__item.is-active').text()).toBe('ide.paletteCmdNewSession')
    await input.trigger('keydown', { key: 'Enter' })
    expect(newChat).toHaveBeenCalled()
    expect(ide.paletteOpen).toBe(false)

    // 重新打开：ArrowDown 后激活项移到第二项
    ide.openPalette()
    await flushPromises()
    await wrapper.find('.ide-palette__input').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('.ide-palette__item.is-active').text()).toBe('ide.paletteCmdToggleTerminal')

    await wrapper.find('.ide-palette__input').trigger('keydown', { key: 'Escape' })
    expect(ide.paletteOpen).toBe(false)
  })
})
