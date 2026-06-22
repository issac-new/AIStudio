import { describe, it, expect } from 'vitest'
import { mergeDetail, formatWhen, kindToWhat } from '@/custom/cockpit/adapters/event-adapter'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'

const today = new Date()
const tsToday = (h: number, m: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).getTime()
const tsOther = new Date(2025, 0, 5, 9, 30).getTime()

const detail = (over: Partial<KanbanTaskDetail> = {}): KanbanTaskDetail => ({
  task: {
    id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
    priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
    workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null,
    result: null, skills: null,
  },
  latest_summary: null,
  comments: [],
  events: [],
  runs: [],
  ...over,
})

describe('formatWhen', () => {
  it('same day → HH:mm', () => {
    const t = tsToday(14, 36)
    expect(formatWhen(t)).toMatch(/^\d{2}:\d{2}$/)
  })
  it('other day → MM-DD HH:mm', () => {
    expect(formatWhen(tsOther)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})

describe('kindToWhat', () => {
  it('covers known kinds', () => {
    expect(kindToWhat('created', {})).toBe('创建任务')
    expect(kindToWhat('status_changed', { to: 'done' })).toBe('状态 → done')
    expect(kindToWhat('assigned', { assignee: 'bob' })).toBe('指派给 bob')
    expect(kindToWhat('completed', { result: 'OK' })).toBe('完成：OK')
  })
  it('fallback to kind for unknown', () => {
    expect(kindToWhat('something_new', {})).toBe('something_new')
  })
})

describe('mergeDetail', () => {
  it('merges events + runs + session messages, sorted by ts asc, unique ids', () => {
    const d = detail({
      events: [
        { id: 1, task_id: 't1', kind: 'created', payload: {}, created_at: tsToday(10, 0), run_id: null },
        { id: 2, task_id: 't1', kind: 'commented', payload: { body: 'hi' }, created_at: tsToday(11, 0), run_id: null },
      ],
      runs: [
        { id: 5, task_id: 't1', profile: 'arch', status: 'completed', outcome: 'success', summary: 'done', error: null, metadata: null, worker_pid: null, started_at: tsToday(9, 0), ended_at: tsToday(9, 30) } as any,
        { id: 6, task_id: 't1', profile: 'qa', status: 'running', outcome: null, summary: null, error: null, metadata: null, worker_pid: null, started_at: tsToday(12, 0), ended_at: null } as any,
      ],
      session: {
        id: 'sess1', title: null, source: 'kanban', model: 'm', started_at: tsToday(8, 0), ended_at: null,
        messages: [
          { id: 'msg1', session_id: 'sess1', role: 'user', content: '请审查', tool_call_id: null, tool_calls: null, tool_name: null, timestamp: tsToday(8, 30), token_count: null, finish_reason: null, reasoning: null },
          { id: 'msg2', session_id: 'sess1', role: 'assistant', content: '好的我来', tool_call_id: null, tool_calls: null, tool_name: null, timestamp: tsToday(8, 45), token_count: null, finish_reason: null, reasoning: null },
        ],
      },
    })
    const out = mergeDetail(d)
    expect(out.map(e => e.ts)).toEqual([
      tsToday(8, 30), tsToday(8, 45), tsToday(9, 0), tsToday(10, 0), tsToday(11, 0), tsToday(12, 0),
    ])
    expect(out.map(e => e.id)).toEqual([
      'evt-msg-msg1', 'evt-msg-msg2', 'evt-run-5', 'evt-event-1', 'evt-event-2', 'evt-run-6',
    ])
    const byId = Object.fromEntries(out.map(e => [e.id, e]))
    expect(byId['evt-msg-msg1'].kind).toBe('A2H')        // role=user
    expect(byId['evt-msg-msg2'].kind).toBe('A2A')        // role=assistant
    expect(byId['evt-run-5'].actor).toBe('arch')
    expect(byId['evt-run-6'].pending).toBe(true)          // status=running
    expect(out.every(e => e.taskId === 't1')).toBe(true)
  })

  it('empty detail → empty array', () => {
    expect(mergeDetail(detail())).toEqual([])
  })
})
