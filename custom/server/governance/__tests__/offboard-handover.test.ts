// overlay/custom/server/governance/__tests__/offboard-handover.test.ts
// 数字员工批一 Task 7：逐卡改派核实（verifyTaskHandover）守门——
// 核实是只读查询：指派对象等于预期 → reassigned=true；不等 → false 并带原值；
// 查不到 → after=null、reassigned=false、note 写明。查询函数可注入（测试替身）。
import { describe, it, expect } from 'vitest'
import { verifyTaskHandover } from '../offboard-handover'

describe('verifyTaskHandover（逐卡改派核实）', () => {
  it('指派对象等于预期 → reassigned=true；不等 → false 并带原值', async () => {
    const fetchAssignee = async (taskId: string): Promise<string | null> =>
      taskId === 't1' ? 'worker-coder' : 'old'
    const rows = await verifyTaskHandover(['t1', 't2'], 'worker-coder', fetchAssignee)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ taskId: 't1', after: 'worker-coder', reassigned: true })
    expect(rows[1]).toMatchObject({ taskId: 't2', before: 'old', reassigned: false })
    expect(rows[1].note).toContain('old')
  })

  it('任务不存在 → after=null、reassigned=false、note 写明', async () => {
    const rows = await verifyTaskHandover(['t-x'], 'worker-coder', async () => null)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ taskId: 't-x', after: null, reassigned: false })
    expect(rows[0].note).toContain('任务不存在或不可读')
  })

  it('查询函数抛错按不可读处理（不中断其余卡）', async () => {
    const fetchAssignee = async (taskId: string): Promise<string | null> => {
      if (taskId === 't-bad') throw new Error('db locked')
      return 'worker-coder'
    }
    const rows = await verifyTaskHandover(['t-bad', 't1'], 'worker-coder', fetchAssignee)
    expect(rows[0]).toMatchObject({ taskId: 't-bad', after: null, reassigned: false })
    expect(rows[0].note).toContain('任务不存在或不可读')
    expect(rows[1]).toMatchObject({ taskId: 't1', reassigned: true })
  })
})
