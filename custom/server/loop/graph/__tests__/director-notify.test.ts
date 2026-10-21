// 导演台 Matrix 事件通知守门（2026-10-21 挂账实施轮）：
// 未配置房间=跳过；已配置=走 humansim 通道发送并审计；发送失败如实回因，不阻断。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { sendHumansimMessage } = vi.hoisted(() => ({ sendHumansimMessage: vi.fn() }))
vi.mock('../../../humansim/humansim-controller', () => ({ sendHumansimMessage }))

import { notifyDirectorEvent } from '../director-notify'

const ENV_KEYS = ['SIM_DIRECTOR_NOTIFY_ROOM', 'SIM_DIRECTOR_NOTIFY_AS'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  sendHumansimMessage.mockReset()
})

describe('notifyDirectorEvent', () => {
  it('未配置 SIM_DIRECTOR_NOTIFY_ROOM：跳过且不发', async () => {
    const r = await notifyDirectorEvent('started', { runId: 'run-x', title: '收银台' })
    expect(r.sent).toBe(false)
    expect(r.reason).toContain('SIM_DIRECTOR_NOTIFY_ROOM')
    expect(sendHumansimMessage).not.toHaveBeenCalled()
  })

  it('已配置：以通知账号发 kind=notice 的真实消息（含操作人与标题）', async () => {
    process.env.SIM_DIRECTOR_NOTIFY_ROOM = '!obs:matrix.test'
    process.env.SIM_DIRECTOR_NOTIFY_AS = 'fanfan'
    sendHumansimMessage.mockResolvedValue({ eventId: '$e1', audit: '/tmp/a.ndjson' })
    const r = await notifyDirectorEvent('gate-approved', { runId: 'run-x', title: 'g1-lock-gate', actor: 'admin' })
    expect(r.sent).toBe(true)
    expect(sendHumansimMessage).toHaveBeenCalledWith(expect.objectContaining({
      as: 'fanfan',
      room: '!obs:matrix.test',
      kind: 'notice',
    }))
    const body = sendHumansimMessage.mock.calls[0][0].body as string
    expect(body).toContain('[人工闸批准] run-x')
    expect(body).toContain('g1-lock-gate')
    expect(body).toContain('操作人：admin')
  })

  it('发送失败：如实回因不抛出', async () => {
    process.env.SIM_DIRECTOR_NOTIFY_ROOM = '!obs:matrix.test'
    sendHumansimMessage.mockRejectedValue(new Error('账号 admin 无 token 文件'))
    const r = await notifyDirectorEvent('gate-rejected', { runId: 'run-x' })
    expect(r.sent).toBe(false)
    expect(r.reason).toContain('token')
  })
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})
