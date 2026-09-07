// overlay/custom/client/cockpit/composables/useTaskLifecycle.test.ts
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useTaskLifecycle, fmtDwell, STATUS_FLOW } from './useTaskLifecycle'
import type { CockpitTask } from '../adapters/task-adapter'

function mkTask(partial: Partial<CockpitTask>): CockpitTask {
  return {
    id: partial.id ?? 't_test',
    title: partial.title ?? 'task',
    priority: partial.priority ?? 'P2',
    status: partial.status ?? 'running',
    assignee: partial.assignee ?? 'worker-coder',
    workspace: partial.workspace ?? '',
    tenant: partial.tenant ?? null,
    boardSlug: partial.boardSlug ?? 'swarm',
    createdAt: partial.createdAt ?? Date.now() - 3600_000,
  }
}

describe('useTaskLifecycle', () => {
  it('aggregates status counts across tasks', () => {
    const tasks = ref<CockpitTask[]>([
      mkTask({ id: '1', status: 'triage' }),
      mkTask({ id: '2', status: 'triage' }),
      mkTask({ id: '3', status: 'running' }),
      mkTask({ id: '4', status: 'done' }),
    ])
    const details = ref<Record<string, any>>({})
    const { statusCounts, activeCounts } = useTaskLifecycle(tasks, details)
    expect(statusCounts.value.find(s => s.status === 'triage')?.count).toBe(2)
    expect(statusCounts.value.find(s => s.status === 'running')?.count).toBe(1)
    expect(statusCounts.value.find(s => s.status === 'done')?.count).toBe(1)
    // active 排除 done
    expect(activeCounts.value.find(s => s.status === 'done')).toBeUndefined()
    expect(activeCounts.value.find(s => s.status === 'triage')?.count).toBe(2)
  })

  it('computes dwell from detail status_changed events', () => {
    const now = Date.now()
    const twoHoursAgoSec = Math.floor((now - 2 * 3600_000) / 1000)
    const tasks = ref<CockpitTask[]>([
      mkTask({ id: '1', status: 'blocked', createdAt: now - 10 * 3600_000 }),
    ])
    const details = ref<Record<string, any>>({
      '1': { events: [{ kind: 'status_changed', payload: { to: 'blocked' }, created_at: twoHoursAgoSec }] },
    })
    const { dwell, bottleneck } = useTaskLifecycle(tasks, details)
    const blocked = dwell.value.find(d => d.status === 'blocked')
    expect(blocked).toBeDefined()
    // ≈2h（允许少量误差）
    expect(blocked!.avgMs).toBeGreaterThan(1.9 * 3600_000)
    expect(blocked!.avgMs).toBeLessThan(2.1 * 3600_000)
    // 样本 1 个 <2，bottleneck 不产出
    expect(bottleneck.value).toBeNull()
  })

  it('falls back to createdAt dwell when no detail events', () => {
    const now = Date.now()
    const tasks = ref<CockpitTask[]>([
      mkTask({ id: '1', status: 'running', createdAt: now - 5 * 3600_000 }),
    ])
    const details = ref<Record<string, any>>({})
    const { dwell } = useTaskLifecycle(tasks, details)
    const running = dwell.value.find(d => d.status === 'running')
    expect(running).toBeDefined()
    expect(running!.avgMs).toBeGreaterThan(4.9 * 3600_000)
  })

  it('computes median done duration from completed_at', () => {
    const now = Date.now()
    const tasks = ref<CockpitTask[]>([
      mkTask({ id: '1', status: 'done', createdAt: now - 10 * 3600_000 }),
      mkTask({ id: '2', status: 'done', createdAt: now - 20 * 3600_000 }),
      mkTask({ id: '3', status: 'done', createdAt: now - 30 * 3600_000 }),
    ])
    const details = ref<Record<string, any>>({
      '1': { task: { completed_at: Math.floor((now - 4 * 3600_000) / 1000) } },  // 6h
      '2': { task: { completed_at: Math.floor((now - 12 * 3600_000) / 1000) } }, // 8h
      '3': { task: { completed_at: Math.floor((now - 10 * 3600_000) / 1000) } }, // 20h
    })
    const { medianDoneMs } = useTaskLifecycle(tasks, details)
    // 排序 [6h, 8h, 20h] → 中位 8h
    expect(medianDoneMs.value).toBeCloseTo(8 * 3600_000, -5)
  })

  it('builds priority × status matrix', () => {
    const tasks = ref<CockpitTask[]>([
      mkTask({ id: '1', priority: 'P0', status: 'running' }),
      mkTask({ id: '2', priority: 'P0', status: 'blocked' }),
      mkTask({ id: '3', priority: 'P2', status: 'running' }),
    ])
    const details = ref<Record<string, any>>({})
    const { priorityMatrix } = useTaskLifecycle(tasks, details)
    expect(priorityMatrix.value.find(c => c.priority === 'P0' && c.status === 'running')?.count).toBe(1)
    expect(priorityMatrix.value.find(c => c.priority === 'P0' && c.status === 'blocked')?.count).toBe(1)
    expect(priorityMatrix.value.find(c => c.priority === 'P2' && c.status === 'running')?.count).toBe(1)
  })

  it('identifies bottleneck among multi-sample active statuses', () => {
    const now = Date.now()
    const tasks = ref<CockpitTask[]>([
      mkTask({ id: '1', status: 'review', createdAt: now - 1 * 3600_000 }),
      mkTask({ id: '2', status: 'review', createdAt: now - 2 * 3600_000 }),
      mkTask({ id: '3', status: 'running', createdAt: now - 0.5 * 3600_000 }),
    ])
    const details = ref<Record<string, any>>({})
    const { bottleneck } = useTaskLifecycle(tasks, details)
    // review 平均 (1+2)/2 = 1.5h > running 0.5h（样本1，被排除）
    expect(bottleneck.value?.status).toBe('review')
  })

  it('STATUS_FLOW is ordered funnel', () => {
    expect(STATUS_FLOW).toEqual([
      'triage', 'todo', 'scheduled', 'ready', 'running', 'review', 'done', 'archived',
    ])
  })
})

describe('fmtDwell', () => {
  it('formats seconds/minutes/hours/days', () => {
    expect(fmtDwell(30_000)).toBe('30s')
    expect(fmtDwell(5 * 60_000)).toBe('5m')
    expect(fmtDwell(2.5 * 3600_000)).toBe('2.5h')
    expect(fmtDwell(3 * 86_400_000)).toBe('3.0d')
  })
})
