// overlay/custom/client/ia2/__tests__/stage-task-filter.test.ts
// 阶段 → 任务状态映射守门（2026-10-19 P2-9 续批）：映射单一事实源 + 过滤叠加
// + 阶段页传参链路。改映射必须同步两处源文件的字面值，测试当场红。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STAGE_BOARD_STATUSES, stageBoardStatuses, stageBoardStatusLabel } from '../stage-task-filter'
import { filterTasksByStatuses } from '../../kanban/utils/task-status-filter'

describe('阶段 → 任务状态映射', () => {
  it('③ 分析设计 = 待分类/待办/已排期/可开工', () => {
    expect(stageBoardStatuses(3)).toEqual(['triage', 'todo', 'scheduled', 'ready'])
  })
  it('④ 开发 = 进行中/阻塞/待验收', () => {
    expect(stageBoardStatuses(4)).toEqual(['running', 'blocked', 'review'])
  })
  it('无阶段视图的阶段（1/2/5/6）不额外过滤', () => {
    for (const stage of [1, 2, 5, 6]) expect(stageBoardStatuses(stage)).toEqual([])
  })
  it('说明文案双语与映射同源', () => {
    expect(stageBoardStatusLabel(3, true)).toContain('待分类')
    expect(stageBoardStatusLabel(4, false)).toContain('In progress')
    expect(stageBoardStatusLabel(5, true)).toBe('')
  })
  it('映射表只覆盖 3/4，键集合稳定', () => {
    expect(Object.keys(STAGE_BOARD_STATUSES).sort()).toEqual(['3', '4'])
  })
})

describe('filterTasksByStatuses 叠加规则', () => {
  const tasks = [
    { id: 'a', status: 'ready' },
    { id: 'b', status: 'blocked' },
    { id: 'c', status: 'done' },
  ]
  it('空映射返回全量副本（不共享原数组）', () => {
    const out = filterTasksByStatuses(tasks, [])
    expect(out.map(t => t.id)).toEqual(['a', 'b', 'c'])
    expect(out).not.toBe(tasks)
  })
  it('按映射取交集', () => {
    expect(filterTasksByStatuses(tasks, stageBoardStatuses(3)).map(t => t.id)).toEqual(['a'])
    expect(filterTasksByStatuses(tasks, stageBoardStatuses(4)).map(t => t.id)).toEqual(['b'])
  })
})

describe('阶段页与看板接线（源级守门）', () => {
  it('StageShell 内嵌看板时传 statuses，说明文案引用映射', () => {
    const src = readFileSync(resolve(__dirname, '../views/stage/StageShell.vue'), 'utf8')
    expect(src).toContain("from '../../stage-task-filter'")
    expect(src).toContain('stageBoardStatuses(props.stage)')
    expect(src).toContain('statuses: boardStatuses.value')
    expect(src).toContain('stg-board-filter-note')
  })
  it('SwarmKanbanView 提供视图级 statuses 过滤且不改 store', () => {
    const src = readFileSync(resolve(__dirname, '../../kanban/views/SwarmKanbanView.vue'), 'utf8')
    expect(src).toContain('statuses?: readonly string[]')
    expect(src).toContain('filterTasksByStatuses(filteredTasks.value, props.statuses)')
    expect(src).toContain(':tasks="viewTasks"')
    expect(src).toContain('data-status-filter')
  })
})
