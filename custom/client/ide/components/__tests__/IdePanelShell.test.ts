// overlay/custom/client/ide/components/IdePanelShell —— 统一弹窗/面板外壳（2026-11-16 工具栏清晰化批）。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IdePanelShell from '../IdePanelShell.vue'

describe('IdePanelShell', () => {
  it('dialog 变体：渲染统一遮罩/标题/关闭钮，Esc 触发关闭', async () => {
    const wrapper = mount(IdePanelShell, {
      props: { title: '恢复到历史点', variant: 'dialog', testid: 'shell-dlg' },
      slots: { default: '<p class="body-slot">内容</p>' },
      attachTo: document.body,
    })
    try {
      expect(wrapper.find('[data-testid="shell-dlg"]').exists()).toBe(true)
      expect(wrapper.find('.ide-panel-shell--dialog').exists()).toBe(true)
      expect(wrapper.find('[data-testid="shell-dlg"]').attributes('role')).toBe('dialog')
      expect(wrapper.find('[data-testid="ide-panel-shell-title"]').text()).toBe('恢复到历史点')
      expect(wrapper.find('.body-slot').exists()).toBe(true)
      await wrapper.find('[data-testid="ide-panel-shell-close"]').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await new Promise(r => setTimeout(r, 0))
      expect(wrapper.emitted('close')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })

  it('panel 变体：无遮罩，标题条 + 关闭钮统一', async () => {
    const wrapper = mount(IdePanelShell, {
      props: { title: '历史提示', variant: 'panel', testid: 'shell-panel' },
      slots: { default: '<div class="body-slot" />' },
    })
    expect(wrapper.find('.ide-panel-shell--panel').exists()).toBe(true)
    expect(wrapper.find('.ide-panel-shell__mask').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ide-panel-shell-title"]').text()).toBe('历史提示')
    await wrapper.find('[data-testid="ide-panel-shell-close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('panel 变体支持右侧工具槽（计数/状态不打进标题）', () => {
    const wrapper = mount(IdePanelShell, {
      props: { title: '后台任务', variant: 'panel' },
      slots: { default: '<div />', tools: '<span data-testid="shell-tools-count">3</span>' },
    })
    expect(wrapper.find('[data-testid="shell-tools-count"]').exists()).toBe(true)
  })
})
