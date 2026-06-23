import { describe, it, expect } from 'vitest'
import { fromMatrixRoom, fromChatSession, fromGroupRoom } from '@/custom/cockpit/adapters/notify-adapter'

const mkRoom = (over: Record<string, any> = {}) => ({
  roomId: '!abc:server',
  name: 'auth-svc 联调',
  timeline: [
    { getType: () => 'm.room.message', getContent: () => ({ body: 'hello' }), getTs: () => 1000, getSender: () => '@shi:server' },
  ],
  ...over,
})

describe('fromMatrixRoom', () => {
  it('unread > 0 → NotifyItem with count + preview', () => {
    const item = fromMatrixRoom(mkRoom(), () => 2)
    expect(item).toEqual({
      id: 'matrix:!abc:server',
      kind: 'matrix',
      title: 'auth-svc 联调',
      preview: 'shi: hello',
      ts: 1000,
      count: 2,
      routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: '!abc:server' } },
    })
  })
  it('unread === 0 → null', () => {
    expect(fromMatrixRoom(mkRoom(), () => 0)).toBeNull()
  })
  it('timeline 无 message → preview 空, ts 0', () => {
    const item = fromMatrixRoom(mkRoom({ timeline: [] }), () => 1)
    expect(item!.preview).toBe('')
    expect(item!.ts).toBe(0)
  })
  it('roomId 无 name → 用 roomId 作 title', () => {
    const item = fromMatrixRoom(mkRoom({ name: undefined }), () => 1)
    expect(item!.title).toBe('!abc:server')
  })
})

describe('fromChatSession', () => {
  it('构造 NotifyItem, count 恒 1, preview 固定文案', () => {
    const item = fromChatSession({ id: 's1', title: 'SQL 注入排查', profile: 'claude', lastActiveAt: '2026-06-23T14:20:00Z' })
    expect(item).toEqual({
      id: 'chat:s1',
      kind: 'chat',
      title: 'SQL 注入排查',
      preview: '助手运行完成，请查看结果',
      ts: Date.parse('2026-06-23T14:20:00Z'),
      count: 1,
      routeTarget: { name: 'hermes.session', params: { sessionId: 's1' }, query: { profile: 'claude' } },
    })
  })
  it('无 profile → query 空', () => {
    const item = fromChatSession({ id: 's2', title: 'X' })
    expect(item!.routeTarget.query).toEqual({})
  })
})

describe('fromGroupRoom', () => {
  it('count > 0 + lastMsg → 完整 item', () => {
    const item = fromGroupRoom({ id: 'g1', name: '前端架构组' }, 3, { content: '组件库 v2', senderName: '李华', ts: 2000 })
    expect(item).toEqual({
      id: 'group:g1',
      kind: 'group',
      title: '前端架构组',
      preview: '李华: 组件库 v2',
      ts: 2000,
      count: 3,
      routeTarget: { name: 'hermes.groupChatRoom', params: { roomId: 'g1' } },
    })
  })
  it('count === 0 → null', () => {
    expect(fromGroupRoom({ id: 'g1', name: 'X' }, 0, null)).toBeNull()
  })
  it('无 lastMsg → preview 用 count', () => {
    const item = fromGroupRoom({ id: 'g2', name: 'X' }, 5, null)
    expect(item!.preview).toBe('5 条新消息')
    expect(item!.ts).toBe(0)
  })
})
