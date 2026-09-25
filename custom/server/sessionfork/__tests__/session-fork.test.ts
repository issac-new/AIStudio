// 会话 fork 守门（qoder：分叉点/谱系/树投影/越界拒）。
import { describe, it, expect } from 'vitest'
import { forkSession, childrenOf, rootOf, type ForkableSession } from '../session-fork'

const s = (id: string, over: Partial<ForkableSession> = {}): ForkableSession => ({
  sessionId: id, messageCount: 10, ...over,
})

describe('forkSession（qoder 语义）', () => {
  it('前缀 [0..atIndex] 进新会话；记谱系', () => {
    const child = forkSession({
      source: s('src'), newSessionId: 'fork1', atIndex: 3, now: 1000,
    })
    expect(child.parentSessionId).toBe('src')
    expect(child.forkPoint).toBe(3)
    expect(child.messageCount).toBe(4)
  })

  it('分叉点越界拒（负值或超出消息数）', () => {
    expect(() => forkSession({ source: s('src'), newSessionId: 'x', atIndex: -1, now: 0 })).toThrow(RangeError)
    expect(() => forkSession({ source: s('src'), newSessionId: 'x', atIndex: 10, now: 0 })).toThrow(RangeError)
  })

  it('childrenOf/rootOf 树投影', () => {
    const sessions = [
      s('root'),
      s('a', { parentSessionId: 'root', forkPoint: 2 }),
      s('b', { parentSessionId: 'a', forkPoint: 1 }),
    ]
    expect(childrenOf(sessions, 'root').map((x) => x.sessionId)).toEqual(['a'])
    expect(rootOf(sessions, 'b')).toBe('root')
    expect(rootOf(sessions, 'root')).toBe('root')
  })
})
