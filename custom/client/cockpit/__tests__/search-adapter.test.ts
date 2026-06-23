// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  matchLocalTask,
  matchMatrixRoom,
  extractSessionIdFromTenant,
  extractRoomIdFromTenant,
  mapSearchToTaskIds,
} from '@/custom/cockpit/adapters/search-adapter'
import type { CockpitTask } from '@/custom/cockpit/store/cockpit'

const t = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: 't1', title: '测试任务', priority: 'P3', status: 'todo',
  assignee: 'alice', workspace: '~', tenant: null, boardSlug: 'default',
  createdAt: 0,
  ...over,
})

describe('matchLocalTask', () => {
  it('hits title', () => {
    expect(matchLocalTask(t({ title: 'PR #142 修复' }), 'PR')).toBe(true)
  })
  it('hits id', () => {
    expect(matchLocalTask(t({ id: 'abc-123' }), 'abc')).toBe(true)
  })
  it('hits boardSlug', () => {
    expect(matchLocalTask(t({ boardSlug: 'my-board' }), 'my-board')).toBe(true)
  })
  it('hits tenant', () => {
    expect(matchLocalTask(t({ tenant: 'team-x' }), 'team-x')).toBe(true)
  })
  it('hits assignee', () => {
    expect(matchLocalTask(t({ assignee: 'bob' }), 'bob')).toBe(true)
  })
  it('case-insensitive', () => {
    expect(matchLocalTask(t({ title: 'Hello' }), 'hello')).toBe(true)
  })
  it('no match returns false', () => {
    expect(matchLocalTask(t({ title: 'foo' }), 'zzz')).toBe(false)
  })
  it('null tenant treated as empty string', () => {
    expect(matchLocalTask(t({ tenant: null, title: 'x' }), 'x')).toBe(true)
  })
})

describe('matchMatrixRoom', () => {
  it('hits name', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', name: 'Auth联调' }, 'Auth')).toBe('!r:s')
  })
  it('hits topic', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', topic: 'OAuth2 集成' }, 'OAuth2')).toBe('!r:s')
  })
  it('no match returns null', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', name: 'foo' }, 'zzz')).toBeNull()
  })
  it('case-insensitive', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', name: 'Hello' }, 'hello')).toBe('!r:s')
  })
})

describe('extractSessionIdFromTenant', () => {
  it('extracts with profile', () => {
    expect(extractSessionIdFromTenant('session:sess1@default:My Session')).toBe('sess1')
  })
  it('extracts without profile', () => {
    expect(extractSessionIdFromTenant('session:sess2:My Session')).toBe('sess2')
  })
  it('non-session tenant returns null', () => {
    expect(extractSessionIdFromTenant('matrix:!r:s:Room')).toBeNull()
    expect(extractSessionIdFromTenant('team-x')).toBeNull()
  })
  it('minimal session tenant', () => {
    expect(extractSessionIdFromTenant('session:s1')).toBe('s1')
  })
})

describe('extractRoomIdFromTenant', () => {
  it('extracts roomId with colons', () => {
    expect(extractRoomIdFromTenant('matrix:!abc:matrix.org:My Room')).toBe('!abc:matrix.org')
  })
  it('extracts simple roomId', () => {
    expect(extractRoomIdFromTenant('matrix:!simple:Name')).toBe('!simple')
  })
  it('non-matrix tenant returns null', () => {
    expect(extractRoomIdFromTenant('session:s1@d:X')).toBeNull()
    expect(extractRoomIdFromTenant('team-x')).toBeNull()
  })
})

describe('mapSearchToTaskIds', () => {
  it('direct task hit (title)', () => {
    const tasks = [t({ id: '1', title: 'Fix bug' }), t({ id: '2', title: 'Refactor' })]
    const ids = mapSearchToTaskIds(tasks, [], [], 'bug')
    expect(ids.has('1')).toBe(true)
    expect(ids.has('2')).toBe(false)
  })

  it('matrix room hit maps to task via tenant', () => {
    const tasks = [
      t({ id: '1', title: 'A', tenant: 'matrix:!abc:matrix.org:MyRoom' }),
      t({ id: '2', title: 'B', tenant: 'session:s1:Chat' }),
    ]
    const rooms = [{ roomId: '!abc:matrix.org', name: 'MyRoom' }]
    const ids = mapSearchToTaskIds(tasks, rooms, [], 'MyRoom')
    expect(ids.has('1')).toBe(true)
    expect(ids.has('2')).toBe(false)
  })

  it('session hit maps to task via tenant', () => {
    const tasks = [
      t({ id: '1', title: 'A', tenant: 'session:s1@default:Chat' }),
      t({ id: '2', title: 'B', tenant: 'matrix:!r:m:X' }),
    ]
    const sessions = [{ id: 's1', title: 'Chat session' }]
    const ids = mapSearchToTaskIds(tasks, [], sessions, 'chat')
    expect(ids.has('1')).toBe(true)
    expect(ids.has('2')).toBe(false)
  })

  it('session hit without matching task does not add to result', () => {
    const tasks = [t({ id: '1', title: 'A', tenant: 'session:s999:Other' })]
    const sessions = [{ id: 's1', title: 'Chat' }]
    const ids = mapSearchToTaskIds(tasks, [], sessions, 'chat')
    expect(ids.size).toBe(0)
  })

  it('empty q returns empty set (caller should short-circuit)', () => {
    const ids = mapSearchToTaskIds([t()], [], [], '')
    expect(ids.size).toBe(0)
  })

  it('session in results maps to task even if q does not directly match task', () => {
    // sessionResults 是服务端预匹配的输出，mapSearchToTaskIds 不再对其重检 q
    const tasks = [
      t({ id: '1', title: 'Fix login' }),
      t({ id: '2', title: 'Docs', tenant: 'session:s1@d:AI对话' }),
    ]
    const sessions = [{ id: 's1', title: 'AI session' }]
    const ids = mapSearchToTaskIds(tasks, [], sessions, 'login')
    expect(ids.has('1')).toBe(true) // direct title match
    expect(ids.has('2')).toBe(true) // session s1 in sessionResults → maps to t2 via tenant
  })

  it('union — all three sources match distinct tasks', () => {
    const tasks = [
      t({ id: '1', title: '部署 app' }),
      t({ id: '2', title: 'Auth', tenant: 'matrix:!r:m:部署验证频道' }),
      t({ id: '3', title: 'Docs', tenant: 'session:s1:Chat' }),
    ]
    const rooms = [{ roomId: '!r:m', name: '部署验证频道' }]
    const sessions = [{ id: 's1', title: 'Chat stuff' }]
    const ids = mapSearchToTaskIds(tasks, rooms, sessions, '部署')
    expect(ids.has('1')).toBe(true) // direct title hit (title contains '部署')
    expect(ids.has('2')).toBe(true) // matrix room name contains '部署'
    expect(ids.has('3')).toBe(true) // session s1 in sessionResults (pre-matched by server)
    expect(ids.size).toBe(3)
  })
})
