// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitGraphNode from '@/custom/cockpit/components/CockpitGraphNode.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

describe('CockpitGraphNode', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const props = {
    node: { id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file' as const, focus: true, links: [] },
    taskId: 't1',
    left: 100,
    top: 20,
  }

  it('renders label', () => {
    const w = mount(CockpitGraphNode, { props })
    expect(w.text()).toContain('refresh.ts')
  })

  it('is-selected class when node in selectedGraphNodeIds', () => {
    const s = useCockpitStore()
    s.selectedGraphNodeIds = { t1: ['n1'] }
    const w = mount(CockpitGraphNode, { props })
    expect(w.find('.cockpit-graph-node').classes()).toContain('is-selected')
  })

  it('clicking toggles selection in store', async () => {
    const s = useCockpitStore()
    const w = mount(CockpitGraphNode, { props })
    await w.find('.cockpit-graph-node').trigger('click')
    expect(s.selectedGraphNodeIds['t1']).toContain('n1')
  })

  it('shows focus indicator when focus=true', () => {
    const w = mount(CockpitGraphNode, { props })
    expect(w.find('.cockpit-graph-node').classes()).toContain('is-focus')
  })

  it('emits drag with new position on pointermove', async () => {
    const w = mount(CockpitGraphNode, { props })
    const el = w.find('.cockpit-graph-node').element as HTMLElement
    Object.defineProperty(el, 'offsetLeft', { value: 100, configurable: true })
    Object.defineProperty(el, 'offsetTop', { value: 20, configurable: true })
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 20, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 30 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await w.vm.$nextTick()
    const drag = w.emitted('drag')
    expect(drag).toBeTruthy()
    expect(drag!.at(-1)![0]).toEqual({ left: 130, top: 30 })
  })

  it('renders occupant dots with title when node has occupants', () => {
    const w = mount(CockpitGraphNode, {
      props: { ...props, node: { ...props.node, occupants: ['张三', 'review-agent'] } },
    })
    const occs = w.findAll('.cockpit-graph-node__occ')
    expect(occs).toHaveLength(2)
    expect(occs[0].attributes('title')).toBe('张三')
    expect(occs[0].text()).toBe('张')
    expect(occs[1].attributes('title')).toBe('review-agent')
  })

  it('shows +N overflow dot when occupants exceed 3 and hides row when none', () => {
    // 超出 3 个 → 前 3 圆点 + 一个 +N
    const wMore = mount(CockpitGraphNode, {
      props: { ...props, node: { ...props.node, occupants: ['a', 'b', 'c', 'd', 'e'] } },
    })
    const dotsMore = wMore.findAll('.cockpit-graph-node__occ')
    expect(dotsMore).toHaveLength(4) // 3 个 + 1 个 +N
    expect(dotsMore.at(-1)!.classes()).toContain('cockpit-graph-node__occ--more')
    expect(dotsMore.at(-1)!.text()).toBe('+2')

    // 无 occupants → 不渲染该行
    const wNone = mount(CockpitGraphNode, { props })
    expect(wNone.findAll('.cockpit-graph-node__occ')).toHaveLength(0)
  })
})
