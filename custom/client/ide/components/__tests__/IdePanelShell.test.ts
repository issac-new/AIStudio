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

  // 终审 IMPORTANT 3：document 级 Esc 无层次——多层同开一次 Esc 全关，对照分屏选中态
  // 与侧问草稿会被连坐清空。要求模块级开窗栈：后开先关，一次 Esc 只关栈顶。
  it('Esc 开窗栈：两壳叠开按一次 Esc 只关栈顶（后挂载者），再按关下一层', async () => {
    const flush = () => new Promise(r => setTimeout(r, 0))
    const first = mount(IdePanelShell, {
      props: { title: '第一层：恢复到历史点', variant: 'dialog', testid: 'shell-stack-first' },
      attachTo: document.body,
    })
    const second = mount(IdePanelShell, {
      props: { title: '第二层：抽帧', variant: 'dialog', testid: 'shell-stack-second' },
      attachTo: document.body,
    })
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flush()
      expect(second.emitted('close'), '一次 Esc 只关栈顶（后挂载者）').toHaveLength(1)
      expect(first.emitted('close'), '底层壳不得被连坐关闭').toBeUndefined()
      // 父层响应 close 卸载栈顶后，Esc 落到下一层
      second.unmount()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flush()
      expect(first.emitted('close'), '栈顶已关，再按 Esc 关下一层').toHaveLength(1)
    } finally {
      first.unmount()
      if (document.body.contains(second.element)) second.unmount()
    }
  })

  // 终审 IMPORTANT 3：Safari 中文组词取消候选词的 Esc（isComposing，老版缺席时 keyCode 229）
  // 不得连带关面板。
  it('IME 组词中的 Esc 不关壳（isComposing 与 keyCode 229 双守卫），普通 Esc 仍关闭', async () => {
    const flush = () => new Promise(r => setTimeout(r, 0))
    // jsdom 构造器不认 isComposing/keyCode 遗留初始化键，实例级覆写保证两条守卫分支可达
    const escEvent = (overrides: { isComposing?: boolean; keyCode?: number }): KeyboardEvent => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape' })
      for (const [k, v] of Object.entries(overrides)) Object.defineProperty(ev, k, { value: v })
      return ev
    }
    const wrapper = mount(IdePanelShell, {
      props: { title: '恢复到历史点', variant: 'dialog', testid: 'shell-ime' },
      attachTo: document.body,
    })
    try {
      document.dispatchEvent(escEvent({ isComposing: true }))
      document.dispatchEvent(escEvent({ keyCode: 229 }))
      await flush()
      expect(wrapper.emitted('close'), 'IME 组词 Esc 不触发关闭').toBeUndefined()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flush()
      expect(wrapper.emitted('close'), '守卫不得吞掉普通 Esc').toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })
})
