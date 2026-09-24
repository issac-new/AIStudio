// R4-P2 验收闭环守门：客户端投影 store——事件词表消费、chip 文案映射、状态条接线。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  REASON_CHIP_TEXT, handleZcodeEvent, resetProjectionStateForTests, useZcodeProjection,
} from '../store/zcode-projection'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

describe('zcode 投影 store（/zcode 事件消费）', () => {
  it('session.upserted/removed 维护会话面；conversation.frame 累计 delta', () => {
    resetProjectionStateForTests()
    handleZcodeEvent({ type: 'session.upserted', workspaceId: '/w', sessionId: 's1', session: { title: 'a', phase: 'idle' }, at: 1 })
    handleZcodeEvent({ type: 'session.upserted', workspaceId: '/w', sessionId: 's2', session: {}, at: 2 })
    handleZcodeEvent({ type: 'conversation.frame', workspaceId: '/w', sessionId: 's1', deltaCount: 3, at: 3 })
    handleZcodeEvent({ type: 'session.removed', workspaceId: '/w', sessionId: 's2', at: 4 })
    const { state, sessionCount } = useZcodeProjection()
    expect(sessionCount.value).toBe(1)
    expect(state.sessions.s1.title).toBe('a')
    expect(state.conversationDeltaTotal).toBe(3)
  })

  it('status/mention 事件按词表字面值映射 chip 文案；非成功档标 trouble', () => {
    resetProjectionStateForTests()
    handleZcodeEvent({ type: 'projection.status', workspaceId: '/w', reason: 'runtime_offline', at: 1 })
    const p1 = useZcodeProjection()
    expect(p1.lastReasonText.value).toBe('运行时离线')
    expect(p1.lastReasonIsTrouble.value).toBe(true)
    handleZcodeEvent({ type: 'mention.outcome', workspaceId: '/w', reason: 'queued', at: 2 })
    const p2 = useZcodeProjection()
    expect(p2.lastReasonText.value).toBe('已入队')
    expect(p2.lastReasonIsTrouble.value).toBe(false)
  })

  it('未知 reason 原样展示字面值；状态环有界 20', () => {
    resetProjectionStateForTests()
    handleZcodeEvent({ type: 'projection.status', workspaceId: '/w', reason: 'future_code_xyz', at: 1 })
    expect(useZcodeProjection().lastReasonText.value).toBe('future_code_xyz')
    for (let i = 0; i < 30; i++) {
      handleZcodeEvent({ type: 'projection.status', workspaceId: '/w', reason: 'queued', at: i })
    }
    expect(useZcodeProjection().state.statusEvents.length).toBe(20)
  })
})

describe('状态条与 socket 接线守门', () => {
  it('IdeStatusBar 挂投影 chip；socket 客户端对齐 loop-socket 模式', () => {
    const bar = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ide/views/IdeStatusBar.vue'), 'utf8')
    expect(bar).toContain('useZcodeProjection')
    expect(bar).toContain('ide-zcode-projection')
    const sock = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/zcode/api/zcode-socket.ts'), 'utf8')
    expect(sock).toContain("io(`${baseUrl}/zcode`")
    expect(sock).toContain("emit('subscribe-session'")
  })

  it('chip 文案表与服务端词表的关键档对齐（字面值即契约）', () => {
    for (const key of ['queued', 'coalesced', 'runtime_offline', 'engine_unreachable', 'command_rejected', 'frame_fragment_skipped']) {
      expect(REASON_CHIP_TEXT[key], `缺 ${key} 文案`).toBeTruthy()
    }
  })
})
