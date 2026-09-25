// 看板组织面守门（multica：四视图/五档排序/acceptance 准备度/父子缩进）。
import { describe, it, expect } from 'vitest'
import { acceptanceReadiness, projectView, type BoardTask, type Priority } from '../board-organize'

const t = (id: string, over: Partial<BoardTask> = {}): BoardTask => ({
  taskId: id, parentId: null, title: `T${id}`, priority: 'p2' as Priority,
  column: 'todo', assignee: 'alice', acceptance: [], startAt: null, endAt: null, ...over,
})

describe('四视图投影（multica 语义）', () => {
  it('gantt 按时序；swimlane 按 assignee+priority；board 按列；list 父子缩进', () => {
    const tasks = [
      t('1', { startAt: 200, assignee: 'a', priority: 'p1' }),
      t('2', { startAt: 100, assignee: 'b', priority: 'p0', parentId: '1' }),
      t('3', { startAt: null, assignee: 'a', priority: 'p3' }),
    ]
    const gantt = projectView(tasks, 'gantt') as Array<{ taskId: string }>
    expect(gantt.map((x) => x.taskId)).toEqual(['2', '1', '3'])  // null 排尾
    const swim = projectView(tasks, 'swimlane') as Record<string, Array<{ taskId: string }>>
    expect(swim.a.map((x) => x.taskId)).toEqual(['1', '3'])  // p1>p3
    const list = projectView(tasks, 'list') as Array<{ taskId: string; indented: boolean }>
    expect(list[0].taskId).toBe('2')  // p0 最前
    expect(list[0].indented).toBe(true)  // 有 parent 缩进
  })

  it('acceptance 准备度（有验收标准才 ready）', () => {
    const r = acceptanceReadiness([t('1', { acceptance: ['登录成功'] }), t('2')])
    expect(r.ready).toEqual(['1'])
    expect(r.missing).toEqual(['2'])
  })
})
