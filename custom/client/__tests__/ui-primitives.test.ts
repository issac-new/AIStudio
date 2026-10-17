// @vitest-environment jsdom
// overlay/custom/client/__tests__/ui-primitives.test.ts
// 共享 UI 基元守门（批 B）：UiStatusPill 消费单一事实源取色、UiEmptyState
// 结构分层与修饰档类名。防基元被改散（新增直接写色值/类名漂移）。
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiStatusPill from '../ui/UiStatusPill.vue'
import UiEmptyState from '../ui/UiEmptyState.vue'
import { toneColor, STATUS_COLORS } from '../ui/status'

describe('UiStatusPill（状态徽章基元）', () => {
  it('语义态走 STATUS_COLORS、流水线五态走 --ia-* token（单一事实源）', () => {
    expect(toneColor('error')).toBe(STATUS_COLORS.error)
    expect(toneColor('fresh')).toBe('var(--ia-fresh, #2e9e5b)')
    expect(toneColor('fail')).toBe('var(--ia-fail, #e06666)')
  })

  it('渲染缺省映射词与 data-tone，dot 可选', () => {
    const w = mount(UiStatusPill, { props: { tone: 'fail' } })
    expect(w.text()).toBe('失败')
    expect(w.attributes('data-tone')).toBe('fail')
    expect(w.find('.ui-status-pill__dot').exists()).toBe(false)
    const w2 = mount(UiStatusPill, { props: { tone: 'review', dot: true } })
    expect(w2.find('.ui-status-pill__dot').exists()).toBe(true)
  })

  it('自定义 label 覆盖缺省词', () => {
    const w = mount(UiStatusPill, { props: { tone: 'stale', label: '停滞 2h' } })
    expect(w.text()).toBe('停滞 2h')
  })
})

describe('UiEmptyState（空态基元）', () => {
  it('title/hint/action 槽分层；compact/boxed 修饰档', () => {
    const w = mount(UiEmptyState, {
      props: { title: '暂无判定', hint: '等待 G5 评审', compact: true },
      slots: { action: '<button>去催办</button>' },
    })
    expect(w.find('.ui-empty-state--compact').exists()).toBe(true)
    expect(w.find('.ui-empty-state__title').text()).toBe('暂无判定')
    expect(w.find('.ui-empty-state__hint').text()).toBe('等待 G5 评审')
    expect(w.find('.ui-empty-state__action button').exists()).toBe(true)
  })
})
