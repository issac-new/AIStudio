// overlay/custom/client/ia2/__tests__/manage-adapter.test.ts
// 管理场景适配器守门：人员聚合 + 任务↔群弱锚点（[taskId前8位] 前缀约定）。
import { describe, it, expect } from 'vitest'
import { aggregateByAssignee, taskRoomPrefix, matchRoomByPrefix } from '../adapters/manage'

describe('aggregateByAssignee — 人员在办聚合', () => {
  it('按 assignee 分桶：open/blocked/review 计数；done/archived 不计入', () => {
    const rows = aggregateByAssignee([
      { assignee: 'alice', status: 'running' },
      { assignee: 'alice', status: 'blocked' },
      { assignee: 'alice', status: 'done' },
      { assignee: 'bob', status: 'review' },
      { assignee: null, status: 'todo' },
      { assignee: '  ', status: 'triage' },
    ])
    const alice = rows.find(r => r.name === 'alice')!
    expect([alice.open, alice.blocked, alice.review, alice.total]).toEqual([1, 1, 0, 2])
    const bob = rows.find(r => r.name === 'bob')!
    expect([bob.open, bob.review]).toEqual([0, 1])
    // null 与纯空白都归未指派桶（name=''）
    const none = rows.find(r => r.name === '')!
    expect(none.open).toBe(2)
  })

  it('排序：total 降序，平手按 name locale；空输入空输出', () => {
    expect(aggregateByAssignee([])).toEqual([])
    const rows = aggregateByAssignee([
      { assignee: 'b', status: 'todo' },
      { assignee: 'a', status: 'todo' },
      { assignee: 'c', status: 'todo' }, { assignee: 'c', status: 'running' },
    ])
    expect(rows.map(r => r.name)).toEqual(['c', 'a', 'b'])
  })
})

describe('任务↔群弱锚点', () => {
  it('taskRoomPrefix = [taskId 前 8 位]', () => {
    expect(taskRoomPrefix('abcdef12-3456-7890')).toBe('[abcdef12]')
    expect(taskRoomPrefix('short')).toBe('[short]')
  })

  it('matchRoomByPrefix 命中首个前缀匹配；无命中返回 null', () => {
    const rooms = [
      { roomId: '!a:sv', name: '[abcdef12] 需求评审' },
      { roomId: '!b:sv', name: '日常闲聊' },
      { roomId: '!c:sv', name: null },
    ]
    expect(matchRoomByPrefix(rooms, '[abcdef12]')?.roomId).toBe('!a:sv')
    expect(matchRoomByPrefix(rooms, '[ffffff00]')).toBeNull()
  })
})
