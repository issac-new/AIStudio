import { describe, it, expect } from 'vitest'

// MatrixEvent 是 SDK 实例，用方法访问字段。mock 一个最小实现。
const mkMatrixEvent = (over: Partial<{ id: string; sender: string; content: { body?: string }; ts: number }> = {}) => ({
  getId: () => over.id ?? '$1',
  getSender: () => over.sender ?? '@alice:ms.org',
  getContent: () => over.content ?? { body: 'hello' },
  getTs: () => over.ts ?? 1000,
})

import { fromMatrix, fromChat, fromGroup } from '@/custom/cockpit/adapters/chat-adapter'

describe('fromMatrix', () => {
  it('maps SDK event via methods; isMe by currentUserId', () => {
    const ev = mkMatrixEvent({ id: '$e1', sender: '@me:ms.org', content: { body: 'hi' }, ts: 2000 })
    const out = fromMatrix(ev as any, '@me:ms.org', 'ch1')
    expect(out).toEqual({
      id: '$e1', channelId: 'ch1', author: '@me:ms.org', isMe: true, text: 'hi', ts: 2000,
    })
  })
  it('other sender → isMe false', () => {
    const out = fromMatrix(mkMatrixEvent({ sender: '@bob:ms.org' }) as any, '@me:ms.org', 'ch1')
    expect(out.isMe).toBe(false)
  })
})

describe('fromChat', () => {
  it('maps chatStore message (role: user → isMe when sender is current)', () => {
    const out = fromChat({
      id: 'm1', role: 'user', content: '请审查', timestamp: 5000,
    } as any, 'me', 'ch1')
    expect(out).toEqual({
      id: 'm1', channelId: 'ch1', author: 'me', isMe: true, text: '请审查', ts: 5000,
    })
  })
  it('assistant role → isMe false, author = role', () => {
    const out = fromChat({ id: 'm2', role: 'assistant', content: 'ok', timestamp: 6 } as any, 'me', 'ch1')
    expect(out.isMe).toBe(false)
    expect(out.author).toBe('assistant')
  })
})

describe('fromGroup', () => {
  it('maps group message (senderId === currentUserId → isMe)', () => {
    const out = fromGroup({
      id: 'g1', senderId: 'me', senderName: '我', content: '回复', timestamp: 9,
    } as any, 'me', 'ch1')
    expect(out).toEqual({
      id: 'g1', channelId: 'ch1', author: '我', isMe: true, text: '回复', ts: 9,
    })
  })
})
