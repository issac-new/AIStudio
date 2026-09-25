// 任务组守门（antigravity：定义幂等/待批步骤/组汇总）。
import { describe, it, expect } from 'vitest'
import { approveStep, defineGroup, groupSummary, type TaskGroup } from '../task-groups'

const g = (id: string, over: Partial<TaskGroup> = {}): TaskGroup => ({
  groupId: id, title: `组${id}`, editedFiles: ['a.ts'], steps: [
    { stepId: 's1', description: '跑测试', needsApproval: true, approved: false },
    { stepId: 's2', description: '改代码', needsApproval: false, approved: false },
  ], ...over,
})

describe('任务组（antigravity 语义）', () => {
  it('定义幂等替换；批步骤幂等；汇总待批数/文件数', () => {
    let groups = defineGroup([], g('g1'))
    groups = defineGroup(groups, g('g1', { title: '新标题' }))
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('新标题')

    groups = approveStep(groups, 'g1', 's1', true)
    expect(groupSummary(groups)).toEqual([{ groupId: 'g1', pendingApprovals: 0, editedFileCount: 1 }])
    expect(groupSummary([g('g2', { editedFiles: [] })])).toEqual([{ groupId: 'g2', pendingApprovals: 1, editedFileCount: 0 }])
  })
})
