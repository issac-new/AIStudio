// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CockpitGraphNode from '@/custom/cockpit/components/CockpitGraphNode.vue'
import type { GraphNode } from '@/custom/cockpit/store/cockpit'

const node = (over: Partial<GraphNode> = {}): GraphNode => ({
  id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'center', focus: false, ...over,
})

describe('CockpitGraphNode', () => {
  it('renders label + kind icon', () => {
    const w = mount(CockpitGraphNode, { props: { node: node({ kind: 'center', label: '中心任务' }), x: 10, y: 20 } })
    expect(w.text()).toContain('中心任务')
    expect(w.find('[data-node-kind="center"]').exists()).toBe(true)
  })

  it('is-focus class when node.focus', () => {
    const w = mount(CockpitGraphNode, { props: { node: node({ focus: true }), x: 0, y: 0 } })
    expect(w.find('.cockpit-graph-node').classes()).toContain('is-focus')
  })

  it('emits click with the node on click', async () => {
    const n = node({ id: 'g-parent-p1', kind: 'parent', target: { taskId: 'p1' } })
    const w = mount(CockpitGraphNode, { props: { node: n, x: 5, y: 5 } })
    await w.find('.cockpit-graph-node').trigger('click')
    expect(w.emitted('click')).toBeTruthy()
    expect(w.emitted('click')![0]![0]).toStrictEqual(n)
  })

  it('applies is-{kind} class for each relation', () => {
    for (const k of ['center', 'parent', 'child', 'person', 'channel', 'folded'] as const) {
      const w = mount(CockpitGraphNode, { props: { node: node({ kind: k }), x: 0, y: 0 } })
      expect(w.find('.cockpit-graph-node').classes()).toContain('is-' + k)
    }
  })
})
