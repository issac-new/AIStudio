// overlay/custom/client/ia2/__tests__/col-widths-sync.test.ts
// R6 三栏宽度同步联动守门：colWidths 单一事实源（共享 localStorage key +
// 历史 key 迁移 + CustomEvent 广播）/ clamp 边界 / 单边更新另一边保留。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readColWidths, writeColWidths, updateColWidth, onColWidthsChange,
  COL_WIDTHS_EVENT, type ColWidths,
} from '../utils/colWidths'

describe('R6 三栏宽度同步联动（colWidths 单一事实源）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认宽度（无 key 无历史）→ 默认 280/480 并回填共享 key', () => {
    const w = readColWidths()
    expect(w).toEqual({ left: 280, right: 480 })
    expect(JSON.parse(localStorage.getItem('ncwk.cols')!)).toEqual({ left: 280, right: 480 })
  })

  it('历史 key 迁移回填（ncwk.wb.leftWidth/rightWidth → ncwk.cols）', () => {
    localStorage.setItem('ncwk.wb.leftWidth', '320')
    localStorage.setItem('ncwk.wb.rightWidth', '500')
    const w = readColWidths()
    expect(w).toEqual({ left: 320, right: 500 })
    expect(JSON.parse(localStorage.getItem('ncwk.cols')!)).toEqual({ left: 320, right: 500 })
  })

  it('共享 key 优先于历史 key', () => {
    localStorage.setItem('ncwk.cols', JSON.stringify({ left: 300, right: 460 }))
    localStorage.setItem('ncwk.wb.leftWidth', '999')
    const w = readColWidths()
    expect(w).toEqual({ left: 300, right: 460 })
  })

  it('clamp 边界（<180→180，>560→560）', () => {
    localStorage.setItem('ncwk.cols', JSON.stringify({ left: 50, right: 999 }))
    expect(readColWidths()).toEqual({ left: 180, right: 560 })
  })

  it('updateColWidth 单边更新另一边保留 + 广播', () => {
    localStorage.setItem('ncwk.cols', JSON.stringify({ left: 280, right: 480 }))
    const events: ColWidths[] = []
    const off = onColWidthsChange((w) => events.push(w))
    const next = updateColWidth('left', 320)
    expect(next).toEqual({ left: 320, right: 480 })
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ left: 320, right: 480 })
    off()
  })

  it('writeColWidths silent 不广播（迁移防抖动）', () => {
    const events: ColWidths[] = []
    const off = onColWidthsChange((w) => events.push(w))
    writeColWidths({ left: 300, right: 460 }, { silent: true })
    expect(events).toHaveLength(0)
    off()
  })

  it('onColWidthsChange 退订后不再收', () => {
    const events: ColWidths[] = []
    const off = onColWidthsChange((w) => events.push(w))
    off()
    updateColWidth('left', 300)
    expect(events).toHaveLength(0)
  })

  it('COL_WIDTHS_EVENT 常量稳定（跨 store 订阅同名事件）', () => {
    expect(COL_WIDTHS_EVENT).toBe('ncwk:cols-changed')
  })
})
