// 自动化调度守门（qoder：到期自停/无人值守授权/日分组键）。
import { describe, it, expect } from 'vitest'
import { automationReadiness, executionGroupKey, type AutomationSpec } from '../automation-schedule'

const NOW = 1_700_000_000_000
const spec = (over: Partial<AutomationSpec> = {}): AutomationSpec => ({
  specId: 'a1', cron: '0 9 * * *', timeZone: 'Asia/Shanghai', deadline: null,
  unattended: true, ...over,
})

describe('自动化调度（qoder 语义）', () => {
  it('到期自停；无人值守授权双门', () => {
    expect(automationReadiness(spec(), NOW)).toMatchObject({ runnable: true })
    expect(automationReadiness(spec({ deadline: '2020-01-01' }), NOW)).toMatchObject({ runnable: false })
    expect(automationReadiness(spec({ unattended: false }), NOW).reason).toContain('需人放行')
    expect(automationReadiness(spec({ deadline: '2099-01-01' }), NOW).runnable).toBe(true)  // 未到期
  })

  it('执行记录按日分组键（时区敏感；非法时区降级 UTC）', () => {
    expect(executionGroupKey(NOW, 'UTC')).toBe('2023-11-14')
    expect(executionGroupKey(NOW, 'Asia/Shanghai')).toBe('2023-11-15')  // +8 跨日
    expect(executionGroupKey(NOW, 'Bad/Zone')).toBe('2023-11-14')       // 降级
  })
})
