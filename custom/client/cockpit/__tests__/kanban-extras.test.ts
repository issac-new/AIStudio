import { describe, it, expect, vi, beforeEach } from 'vitest'

const requestMock = vi.fn()
vi.mock('@/api/client', () => ({ request: (...args: unknown[]) => requestMock(...args) }))

import { searchSessions, listWorkspaceFiles, getTimeline } from '@/custom/cockpit/api/kanban-extras'

beforeEach(() => requestMock.mockReset())

describe('searchSessions', () => {
  it('calls /api/hermes/kanban/search-sessions with task_id+profile', async () => {
    requestMock.mockResolvedValue({ results: [{ id: 's1', title: 't' }] })
    const out = await searchSessions('task-1', 'arch')
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/hermes/kanban/search-sessions?task_id=task-1&profile=arch'),
    )
    expect(out).toEqual([{ id: 's1', title: 't' }])
  })
  it('encodes special chars', async () => {
    requestMock.mockResolvedValue({ results: [] })
    await searchSessions('t space', 'p@')
    const call = requestMock.mock.calls[0][0] as string
    // URLSearchParams 编码空格为 +，@ 为 %40；关键是特殊字符被编码（非原样）
    expect(call).not.toContain('task_id=t space')
    expect(call).toContain('profile=p%40')
  })
})

describe('listWorkspaceFiles', () => {
  it('returns mapped FileNode[] from entries', async () => {
    requestMock.mockResolvedValue({
      path: '', entries: [
        { name: 'src', isDir: true, size: 0, modified: 1, children: [
          { name: 'a.ts', isDir: false, size: 10, modified: 2 },
        ] },
        { name: 'p.json', isDir: false, size: 5, modified: 3 },
      ],
    })
    const out = await listWorkspaceFiles('t1', undefined, '', 2)
    expect(out).toEqual([
      { id: 'src', name: 'src', isDir: true, size: 0, modified: 1, children: [
        { id: 'src/a.ts', name: 'a.ts', isDir: false, size: 10, modified: 2 },
      ] },
      { id: 'p.json', name: 'p.json', isDir: false, size: 5, modified: 3 },
    ])
  })
})

describe('getTimeline', () => {
  it('calls /timeline with limit/since', async () => {
    requestMock.mockResolvedValue({ items: [], total: 0 })
    await getTimeline({ limit: 50, since: 1000 })
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/hermes/kanban/timeline?limit=50&since=1000'),
    )
  })
})
