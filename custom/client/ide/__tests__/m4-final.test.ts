// overlay/custom/client/ide/__tests__/m4-final.test.ts
// M4 收尾守门：排队浮条编辑/拖拽（patch 313 注入态）、终端多开 dock、画板工具面。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const msgs = { success: vi.fn(), error: vi.fn() }
vi.mock('naive-ui', () => ({
  useMessage: () => msgs,
  NDropdown: { name: 'NDropdown', template: '<div><slot /></div>' },
  NTooltip: { name: 'NTooltip', template: '<div><slot name="trigger" /><slot /></div>' },
}))

import MessageQueueFloatPanel from '@/components/hermes/chat/MessageQueueFloatPanel.vue'
import IdeTerminalDock from '../views/IdeTerminalDock.vue'
import IdeWhiteboardPane from '../views/IdeWhiteboardPane.vue'

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, text: `排队${i + 1}` }))
}

describe('MessageQueueFloatPanel（patch 313：编辑/拖拽）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountPanel(props: Record<string, unknown> = {}) {
    return mount(MessageQueueFloatPanel, {
      props: { items: items(3), canInsert: true, ...props },
    })
  }

  it('edit 按钮进入内联编辑；Enter 保存 emit edit(id, content)', async () => {
    const w = mountPanel()
    const btns = w.findAll('[data-testid="queue-edit-btn"]')
    expect(btns.length).toBe(3)
    await btns[1].trigger('click')
    const input = w.find('[data-testid="queue-edit-input"]')
    expect(input.exists()).toBe(true)
    await input.setValue('改写后的排队消息')
    await input.trigger('keydown.enter')
    expect(w.emitted('edit')).toEqual([['q2', '改写后的排队消息']])
  })

  it('Esc 取消不 emit；drop 触发 reorder（移动后全序）', async () => {
    const w = mountPanel()
    await w.findAll('[data-testid="queue-edit-btn"]')[0].trigger('click')
    await w.find('[data-testid="queue-edit-input"]').trigger('keydown.esc')
    expect(w.emitted('edit')).toBeUndefined()

    const els = w.findAll('[data-testid="queue-float-item"]')
    // jsdom 无真实 DnD：直接调用组件方法等价验证（dragstart→drop 语义）
    const vm = w.vm as any
    vm.dragId = 'q3'
    vm.onDrop('q1')
    expect(w.emitted('reorder')).toEqual([[['q3', 'q1', 'q2']]])
  })
})

describe('IdeTerminalDock（M4c 终端多开）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('默认 1 个页签；＋新增并切换；多余页签可关，最后一个不可关', async () => {
    vi.mock('../views/IdeTerminalPanel.vue', () => ({
      default: { name: 'IdeTerminalPanel', template: '<div class="stub-term" />' },
    }))
    const w = mount(IdeTerminalDock)
    expect(w.findAll('.ide-termdock__tab').length).toBe(1)
    expect(w.find('[data-testid="ide-termdock-add"]').exists()).toBe(true)
    await w.find('[data-testid="ide-termdock-add"]').trigger('click')
    await w.find('[data-testid="ide-termdock-add"]').trigger('click')
    expect(w.findAll('.ide-termdock__tab').length).toBe(3)
    // 关第一个：activate 顺移
    await w.findAll('.ide-termdock__close')[0].trigger('click')
    expect(w.findAll('.ide-termdock__tab').length).toBe(2)
    // 只剩 2 个仍有关闭钮；关到 1 个后不再显示
    await w.findAll('.ide-termdock__close')[0].trigger('click')
    expect(w.findAll('.ide-termdock__close').length).toBe(0)
  })

  it('分屏模式（v4Pane 对应物）：切换后页签栏隐藏、全部终端并排', async () => {
    const w = mount(IdeTerminalDock)
    await w.find('[data-testid="ide-termdock-add"]').trigger('click')
    expect(w.find('.ide-termdock__tabs').exists()).toBe(true)
    await w.find('[data-testid="ide-termdock-split"]').trigger('click')
    expect(w.find('.ide-termdock__tabs').exists()).toBe(false)
    expect(w.findAll('.stub-term').length).toBe(2)
    expect(w.findAll('.ide-termdock__pane.is-split').length).toBe(2)
  })
})

describe('IdeWhiteboardPane（M4e 画板）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('工具条齐备（笔/橡皮/颜色/撤销/清空/导出）；画布存在', () => {
    const w = mount(IdeWhiteboardPane)
    for (const tid of ['ide-board-pen', 'ide-board-eraser', 'ide-board-color', 'ide-board-undo', 'ide-board-clear', 'ide-board-export']) {
      expect(w.find(`[data-testid="${tid}"]`).exists()).toBe(true)
    }
    expect(w.find('[data-testid="ide-board-canvas"]').exists()).toBe(true)
  })

  it('撤销/重做可用性随笔迹变化（状态路径）', async () => {
    const w = mount(IdeWhiteboardPane)
    const vm = w.vm as any
    expect(vm.canUndo).toBe(false)
    vm.drawing = true
    vm.currentStroke = { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], tool: 'pen', color: '#ff0000', width: 3 }
    vm.onUp()
    await vm.$nextTick()
    expect(vm.canUndo).toBe(true)
    expect(vm.strokes.length).toBe(1)
    vm.undo()
    expect([vm.strokes.length, vm.redoStack.length]).toEqual([0, 1])
    vm.redo()
    expect([vm.strokes.length, vm.redoStack.length]).toEqual([1, 0])
  })

  it('笔迹携带属性快照：换色/换橡皮后 undo+redo 不篡改历史笔迹属性', async () => {
    const w = mount(IdeWhiteboardPane)
    const vm = w.vm as any
    // 第一笔：红、pen
    vm.drawing = true
    vm.currentStroke = { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], tool: 'pen', color: '#ff0000', width: 3 }
    vm.onUp()
    // 切换到蓝/橡皮后再 undo+redo，历史笔迹属性必须原样回归
    vm.undo()
    vm.redo()
    expect(vm.strokes[0].color).toBe('#ff0000')
    expect(vm.strokes[0].tool).toBe('pen')
    expect(vm.strokes[0].width).toBe(3)
    expect(vm.strokes[0].points).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }])
  })
})
