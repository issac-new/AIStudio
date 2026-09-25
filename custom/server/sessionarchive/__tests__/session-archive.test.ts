// 会话筛选守门（minimax：Recent/Archived×workspace/all/子串搜索/新在前）。
import { describe, it, expect } from 'vitest'
import { filterSessions, type SessionEntry } from '../session-archive'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000
const s = (id: string, over: Partial<SessionEntry> = {}): SessionEntry => ({
  sessionId: id, title: `任务${id}`, summary: '摘要', workspacePath: '/w',
  archived: false, lastActiveAt: NOW - DAY, ...over,
})

describe('两轴筛选（minimax 语义）', () => {
  it('recent=7 天内未归档；archived=归档档', () => {
    const sessions = [
      s('a', { lastActiveAt: NOW - DAY }),
      s('b', { lastActiveAt: NOW - 10 * DAY }),      // 超 7 天
      s('c', { archived: true }),
    ]
    expect(filterSessions(sessions, { time: 'recent', scope: 'all' }, NOW).map((x) => x.sessionId)).toEqual(['a'])
    expect(filterSessions(sessions, { time: 'archived', scope: 'all' }, NOW).map((x) => x.sessionId)).toEqual(['c'])
  })

  it('workspace 范围+子串搜索+新在前', () => {
    const sessions = [
      s('x1', { title: '登录页 bug', workspacePath: '/w1', lastActiveAt: NOW - 2 * DAY }),
      s('x2', { title: '登录页优化', workspacePath: '/w2', lastActiveAt: NOW - DAY }),
      s('x3', { title: '无关任务', workspacePath: '/w1', lastActiveAt: NOW }),
    ]
    const ws = filterSessions(sessions, { time: 'recent', scope: 'workspace', workspacePath: '/w1' }, NOW)
    expect(ws.map((x) => x.sessionId)).toEqual(['x3', 'x1'])
    const q = filterSessions(sessions, { time: 'recent', scope: 'all', query: '登录' }, NOW)
    expect(q.map((x) => x.sessionId)).toEqual(['x2', 'x1'])  // 新在前
  })
})
