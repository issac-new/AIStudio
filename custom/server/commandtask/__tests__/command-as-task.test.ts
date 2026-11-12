// 任务形态 slash 命令守门（A7：派生/槽位/门禁随行/纯命令不派生）。
import { describe, it, expect } from 'vitest'
import { deriveTask, hasUnfilledSlots, type SlashCommand } from '../command-as-task'

const cmd = (over: Partial<SlashCommand> = {}): SlashCommand => ({
  name: '/deploy', ...over,
})

describe('deriveTask（A7 任务形态语义）', () => {
  it('有任务模板即派生；槽位由参数填充；门禁随行', () => {
    const c = cmd({
      requiresApproval: true,
      taskTemplate: {
        title: '部署 {{env}}',
        goal: '把 {{svc}} 部署到 {{env}}',
        acceptance: ['{{env}} 健康检查通过'],
      },
    })
    const task = deriveTask(c, { env: 'staging', svc: 'api' })
    expect(task).not.toBeNull()
    expect(task!.title).toBe('部署 staging')
    expect(task!.goal).toBe('把 api 部署到 staging')
    expect(task!.requiresApproval).toBe(true)
    expect(task!.sourceCommand).toBe('/deploy')
    expect(hasUnfilledSlots(task!)).toBe(false)
  })

  it('无任务模板=纯命令不派生（null）', () => {
    expect(deriveTask(cmd(), {})).toBeNull()
  })

  it('缺参留槽且 hasUnfilledSlots 报警', () => {
    const c = cmd({ taskTemplate: { title: '部署 {{env}}', goal: 'g', acceptance: [] } })
    const task = deriveTask(c, {})
    expect(task!.title).toBe('部署 {{env}}')
    expect(hasUnfilledSlots(task!)).toBe(true)
  })
})
