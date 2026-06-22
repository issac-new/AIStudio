import { describe, it, expect, vi } from 'vitest'

// mock parseTenant：matrix → 有 routeTarget；其他 → null
vi.mock('@/custom/cockpit/adapters/collab-adapter', () => ({
  parseTenant: (t: string | null) => t && t.startsWith('matrix:')
    ? { kind: 'matrix', label: t.split(':').slice(-1)[0], routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: '!r' } }, raw: t }
    : null,
}))

import { buildTopology, MAX_NODES } from '@/custom/cockpit/adapters/topology-adapter'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'

const task = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: 't1', title: '中心任务', priority: 'P1', status: 'todo',
  assignee: 'alice', workspace: '~/ws', tenant: null, ...over,
})

const detail = (over: Partial<KanbanTaskDetail>): KanbanTaskDetail => ({
  task: { id: 't1', title: '', body: null, assignee: null, status: 'todo', priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
  latest_summary: null, comments: [], events: [], runs: [],
  ...over,
})

describe('buildTopology', () => {
  it('center node always present and focused', () => {
    const r = buildTopology(task(), null, [])
    expect(r.nodes.find(n => n.kind === 'center')?.focus).toBe(true)
  })

  it('parent/child from detail, clickable to selectTask', () => {
    const d = detail({ parents: ['p1'], children: ['c1', 'c2'] })
    const siblingTasks: CockpitTask[] = [
      task({ id: 'p1', title: '父任务' }),
      task({ id: 'c1', title: '子1' }),
      task({ id: 'c2', title: '子2' }),
    ]
    const r = buildTopology(task(), d, siblingTasks)
    const parent = r.nodes.find(n => n.kind === 'parent')
    const children = r.nodes.filter(n => n.kind === 'child')
    expect(parent?.label).toBe('父任务')
    expect(parent?.target?.taskId).toBe('p1')
    expect(children.map(n => n.label).sort()).toEqual(['子1', '子2'])
  })

  it('missing sibling task (id not in list) → use id as label', () => {
    const d = detail({ parents: ['ghost'] })
    const r = buildTopology(task(), d, [])
    const parent = r.nodes.find(n => n.kind === 'parent')
    expect(parent?.label).toBe('ghost')
    expect(parent?.target?.taskId).toBe('ghost')
  })

  it('person nodes from assignee + created_by + current user, dedup', () => {
    const d = detail({
      task: { id: 't1', title: '', body: null, assignee: 'alice', status: 'todo', priority: 0, created_by: 'bob', created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
    })
    const r = buildTopology(task({ assignee: 'alice' }), d, [], 'currentUser')
    const people = r.nodes.filter(n => n.kind === 'person').map(n => n.label).sort()
    expect(people).toEqual(['alice', 'bob', 'currentUser'])
  })

  it('channel node from tenant', () => {
    const r = buildTopology(task({ tenant: 'matrix:!r:s.ms:Auth联调' }), null, [])
    const ch = r.nodes.find(n => n.kind === 'channel')
    expect(ch?.label).toBe('Auth联调')
    expect(ch?.target?.routeTarget).toEqual({ name: 'hermes.matrixChatRoom', params: { roomId: '!r' } })
  })

  it('folds to MAX_NODES with +N indicator', () => {
    // task 无 assignee/created_by/tenant，确保只有 center + parents 两类节点
    const parentCount = MAX_NODES + 5
    const overflow = parentCount + 1 /* center */ - MAX_NODES  // = 6
    const d = detail({ parents: Array.from({ length: parentCount }, (_, i) => `p${i}`) })
    const r = buildTopology(task({ assignee: '未分配', tenant: null }), d, [])
    expect(r.nodes.length).toBe(MAX_NODES + 1)
    const folded = r.nodes.find(n => n.kind === 'folded')
    expect(folded).toBeDefined()
    expect(folded!.label).toBe(`+${overflow} 更多`)
  })

  it('relations: center → each non-center non-folded node', () => {
    const d = detail({ parents: ['p1'], children: ['c1'] })
    const r = buildTopology(task(), d, [task({ id: 'p1', title: 'P' }), task({ id: 'c1', title: 'C' })], 'me')
    const centerId = r.nodes.find(n => n.kind === 'center')!.id
    const nonCenter = r.nodes.filter(n => n.kind !== 'center' && !n.label.startsWith('+'))
    for (const n of nonCenter) {
      expect(r.relations.some(rel => rel.from === centerId && rel.to === n.id)).toBe(true)
    }
  })
})
