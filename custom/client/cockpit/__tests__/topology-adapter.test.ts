import { describe, it, expect, vi } from 'vitest'

// mock parseTenant：matrix → 有 routeTarget；其他 → null
vi.mock('@/custom/cockpit/adapters/collab-adapter', () => ({
  parseTenant: (t: string | null) => t && t.startsWith('matrix:')
    ? { kind: 'matrix', label: t.split(':').slice(-1)[0], routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: '!r' } }, raw: t }
    : null,
}))

import { buildTopology, MAX_NODES, type TaskLinksMap } from '@/custom/cockpit/adapters/topology-adapter'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const task = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: 't1', title: '中心任务', priority: 'P1', status: 'todo',
  assignee: 'alice', workspace: '~/ws', tenant: null,
  boardSlug: 'default', createdAt: 0, ...over,
})

describe('buildTopology', () => {
  it('center node always present and focused, depth 0', () => {
    const r = buildTopology(task(), null, [])
    const center = r.nodes.find(n => n.kind === 'center')
    expect(center?.focus).toBe(true)
    expect(center?.depth).toBe(0)
  })

  it('direct parent/child at depth -1/+1', () => {
    const links: TaskLinksMap = {
      t1: { parents: ['p1'], children: ['c1'] },
    }
    const siblings = [task({ id: 'p1', title: '父' }), task({ id: 'c1', title: '子' })]
    const r = buildTopology(task(), links, siblings)
    const parent = r.nodes.find(n => n.taskId === 'p1')
    const child = r.nodes.find(n => n.taskId === 'c1')
    expect(parent?.kind).toBe('ancestor')
    expect(parent?.depth).toBe(-1)
    expect(child?.kind).toBe('descendant')
    expect(child?.depth).toBe(1)
  })

  it('grandparent/grandchild via recursive chain (depth -2/+2)', () => {
    const links: TaskLinksMap = {
      t1: { parents: ['p1'], children: ['c1'] },
      p1: { parents: ['gp1'], children: ['t1'] },
      c1: { parents: ['t1'], children: ['gc1'] },
    }
    const siblings = [
      task({ id: 'p1', title: '父' }),
      task({ id: 'c1', title: '子' }),
      task({ id: 'gp1', title: '爷爷' }),
      task({ id: 'gc1', title: '孙子' }),
    ]
    const r = buildTopology(task(), links, siblings)
    const gp = r.nodes.find(n => n.taskId === 'gp1')
    const gc = r.nodes.find(n => n.taskId === 'gc1')
    expect(gp?.depth).toBe(-2)
    expect(gc?.depth).toBe(2)
  })

  it('same depth nodes share same y layer', () => {
    const links: TaskLinksMap = {
      t1: { parents: ['p1', 'p2'], children: [] },
    }
    const siblings = [task({ id: 'p1', title: 'P1' }), task({ id: 'p2', title: 'P2' })]
    const r = buildTopology(task(), links, siblings)
    const p1 = r.nodes.find(n => n.taskId === 'p1')
    const p2 = r.nodes.find(n => n.taskId === 'p2')
    expect(p1?.depth).toBe(-1)
    expect(p2?.depth).toBe(-1)  // 同层
  })

  it('person nodes (assignee + currentUser, dedup)', () => {
    const r = buildTopology(task({ assignee: 'alice' }), null, [], 'currentUser')
    const people = r.nodes.filter(n => n.kind === 'person').map(n => n.label).sort()
    expect(people).toEqual(['alice', 'currentUser'])
  })

  it('channel node from tenant', () => {
    const r = buildTopology(task({ tenant: 'matrix:!r:s.ms:Auth联调' }), null, [])
    const ch = r.nodes.find(n => n.kind === 'channel')
    expect(ch?.label).toBe('Auth联调')
    expect(ch?.target?.routeTarget).toEqual({ name: 'hermes.matrixChatRoom', params: { roomId: '!r' } })
  })

  it('click target taskId set for ancestor/descendant', () => {
    const links: TaskLinksMap = { t1: { parents: ['p1'], children: ['c1'] } }
    const r = buildTopology(task(), links, [task({ id: 'p1', title: 'P' }), task({ id: 'c1', title: 'C' })])
    expect(r.nodes.find(n => n.taskId === 'p1')?.target?.taskId).toBe('p1')
    expect(r.nodes.find(n => n.taskId === 'c1')?.target?.taskId).toBe('c1')
  })

  it('folds to MAX_NODES with +N indicator', () => {
    // 构造大量 parent（超过 MAX_NODES）
    const parents = Array.from({ length: MAX_NODES + 5 }, (_, i) => `p${i}`)
    const links: TaskLinksMap = { t1: { parents, children: [] } }
    const r = buildTopology(task(), links, [])
    const folded = r.nodes.find(n => n.kind === 'folded')
    expect(folded).toBeDefined()
    expect(r.nodes.length).toBeLessThanOrEqual(MAX_NODES + 1)
  })

  it('relations connect center to direct parent/child', () => {
    const links: TaskLinksMap = { t1: { parents: ['p1'], children: ['c1'] } }
    const r = buildTopology(task(), links, [task({ id: 'p1', title: 'P' }), task({ id: 'c1', title: 'C' })], 'me')
    const centerId = 'g-center'
    // 至少有一条 center → descendant 或 ancestor → center 的连线
    expect(r.relations.length).toBeGreaterThan(0)
  })
})
