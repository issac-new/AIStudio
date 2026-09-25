// 工作区分组守门（dsh：登记幂等/pin 置顶/清单汇总）。
import { describe, it, expect } from 'vitest'
import { registerWorkspace, togglePin, type WorkspaceEntry } from '../workspace-groups'

const e = (path: string, over: Partial<WorkspaceEntry> = {}): WorkspaceEntry => ({
  path, label: path, pinned: false, sessionCount: 0, registeredAt: 0, ...over,
})

describe('工作区分组（dsh 语义）', () => {
  it('登记幂等更新+label 自动；pin 置顶+最近注册序', () => {
    let g = registerWorkspace([], { path: '/w/a', sessionCount: 2 }, 100)
    g = registerWorkspace(g.entries, { path: '/w/b', label: 'B 区' }, 200)
    g = registerWorkspace(g.entries, { path: '/w/a', sessionCount: 5 }, 300)  // 重登记
    expect(g.entries.map((x) => x.path)).toEqual(['/w/b', '/w/a'])  // 最近注册在前
    expect(g.entries[1]).toMatchObject({ label: 'a', sessionCount: 5, pinned: false })  // label 保留
    expect(g.totalSessions).toBe(5)  // 重登记替换会话数（幂等更新非累计）

    g = togglePin(g.entries, '/w/a')
    expect(g.entries[0]).toMatchObject({ path: '/w/a', pinned: true })  // pin 置顶
    g = togglePin(g.entries, '/w/a')
    expect(g.entries[0].path).toBe('/w/b')  // 取消 pin 回原序
  })
})
