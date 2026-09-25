// turn notify 钩子守门（codex：占位替换/关闭态/未配置/触发台账）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { listNotifies, planTurnNotify, recordNotify } from '../turn-notify'

beforeEach(() => {
  process.env.HERMES_TURN_NOTIFY = 'on'
  process.env.HERMES_TURN_NOTIFY_CMD = 'osascript -e "display notification \\"{status}\\" with title \\"{turn}\\""'
})
afterEach(() => {
  delete process.env.HERMES_TURN_NOTIFY
  delete process.env.HERMES_TURN_NOTIFY_CMD
})

describe('turn notify（codex 外呼钩子语义）', () => {
  it('占位替换；off 关；未配置不触发', () => {
    const plan = planTurnNotify({ turnId: 't1', status: 'completed', workspacePath: '/w', at: 1 })
    expect(plan.command).toContain('completed')
    expect(plan.command).toContain('t1')

    process.env.HERMES_TURN_NOTIFY = 'off'
    expect(planTurnNotify({ turnId: 'x', status: 'failed', workspacePath: '/w', at: 1 }).command).toBeNull()

    process.env.HERMES_TURN_NOTIFY = 'on'
    delete process.env.HERMES_TURN_NOTIFY_CMD
    expect(planTurnNotify({ turnId: 'x', status: 'failed', workspacePath: '/w', at: 1 }).command).toBeNull()
  })

  it('触发台账（外呼留痕，环形 200）', () => {
    for (let i = 0; i < 205; i++) recordNotify({ turnId: `t${i}`, command: 'cmd', at: i })
    const log = listNotifies(500)
    expect(log.length).toBeLessThanOrEqual(200)
    expect(log[0].turnId).toBe('t204')  // 新在前
    expect(listNotifies(1)[0].turnId).toBe('t204')
  })
})
