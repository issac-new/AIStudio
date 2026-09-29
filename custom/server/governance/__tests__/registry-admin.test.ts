// overlay/custom/server/governance/__tests__/registry-admin.test.ts
// P6-P8 守门：注册表读写+保存即提交（R13）/建号 roster 追加/离职三步原子序。
// git 与 admin-service 全 mock——断言调用序与 payload，不触真仓。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const execMock = vi.fn(async () => ({ stdout: 'abc1234\n' }))
vi.mock('node:child_process', () => ({ execFile: (...a: unknown[]) => {
  void execMock(a[0], a[1])
  const cb = a[a.length - 1]
  if (typeof cb === 'function') cb(null, { stdout: 'abc1234\n' })
} }))
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (p: string) => {
    if (p.includes('roster')) return '# roster\n\n| 账号 | AI 助理账号 | 角色 |\n| --- | --- | --- |\n| @admin:matrix.test | — | 管理员 |\n'
    return ''
  }),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}))
const createMock = vi.fn(async () => ({ userId: '', created: true }))
const deactivateMock = vi.fn(async () => true)
vi.mock('../../matrix/admin-service', () => ({
  createMatrixUser: (...a: unknown[]) => createMock(...a),
  setMatrixUserActive: (...a: unknown[]) => deactivateMock(...a),
}))
vi.mock('../governance-controller', () => ({ repoRoot: () => '/tmp/fake-repo' }))

import { readRegistry, writeRegistry, provisionMatrixAccount, offboardAccount, appendTableRow } from '../registry-admin'

beforeEach(() => { execMock.mockClear(); createMock.mockClear(); deactivateMock.mockClear() })

describe('registry-admin（P6-P8）', () => {
  it('保存即提交：write → git add <path> → git commit（R13 链）', async () => {
    const r = await writeRegistry('org', '# org', '组织关系更新', 'tester')
    expect(r.commit).toBe('abc1234')
    const calls = execMock.mock.calls.map((c: unknown[]) => (c[1] as string[]).join(' '))
    expect(calls.some((s: string) => s.includes('add docs/admin/org.md'))).toBe(true)
    expect(calls.some((s: string) => s.includes('commit'))).toBe(true)
  })

  it('readRegistry 返回 markdown+commit', async () => {
    const r = await readRegistry('roster')
    expect(r.commit).toBe('abc1234')
    expect(r.markdown).toContain('@admin:matrix.test')
  })

  it('建号：synapse 双账号 + roster 追加行 + 提交', async () => {
    const r = await provisionMatrixAccount({ localName: 'zhang', role: '研发', password: 'Pw1!', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' })
    expect(r.created).toEqual(['@zhang:matrix.test', '@zhang-agent:matrix.test'])
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(r.rosterCommit).toBe('abc1234')
  })

  it('离职三步：移交工单提交 → 停用双号 → 审计留痕提交', async () => {
    const r = await offboardAccount({ localName: 'zhang', handoverTo: 'chen', taskIds: ['t_1', 't_2'], reason: '转岗', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' })
    expect(deactivateMock).toHaveBeenCalledTimes(2)
    expect(r.deactivated).toHaveLength(2)
    const commits = execMock.mock.calls.filter((c: unknown[]) => (c[1] as string[]).join(' ').includes('commit')).length
    expect(commits).toBeGreaterThanOrEqual(2) // ①移交工单 + ③审计留痕 两笔提交
  })

  it('appendTableRow 追加到表末行后', () => {
    const md = '# t\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n尾部段'
    const out = appendTableRow(md, ['3', '4'])
    expect(out).toContain('| 3 | 4 |')
    expect(out.indexOf('| 3 | 4 |')).toBeGreaterThan(out.indexOf('| 1 | 2 |'))
    expect(out.indexOf('| 3 | 4 |')).toBeLessThan(out.indexOf('尾部段'))
  })
})
