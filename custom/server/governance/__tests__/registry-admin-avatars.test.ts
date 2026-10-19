// overlay/custom/server/governance/__tests__/registry-admin-avatars.test.ts
// 默认头像建号钩子 + 存量补发钉测（2026-10-19 群聊身份标识轮，spec D-3/D-7）：
// ① provisionMatrixAccount 建号成功后 best-effort 配头像，头像失败不抛不回滚
// ② backfillDefaultAvatars 默认只补「未停用且头像为空」，-agent 分流 AI 款
// 仓根用临时 git 仓（GOVERNANCE_REPO 注入），fetch 全程 mock——不触真实 synapse。
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const repo = mkdtempSync(join(tmpdir(), 'reg-avatar-'))

beforeAll(async () => {
  const git = (args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' })
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 't@t'])
  git(['config', 'user.name', 't'])
  mkdirSync(join(repo, 'docs/admin'), { recursive: true })
  writeFileSync(join(repo, 'docs/admin/roster.md'), '# roster\n\n| matrix 账号 | agent 账号 | 角色 |\n| --- | --- | --- |\n')
  git(['add', '-A'])
  git(['commit', '-m', 'seed'])
  process.env.GOVERNANCE_REPO = repo
})

afterAll(() => { rmSync(repo, { recursive: true, force: true }) })

const fetchMock = vi.fn()

function okJson(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response
}

const { provisionMatrixAccount, backfillDefaultAvatars, isAgentMatrixUser } = await import('../registry-admin')

describe('provisionMatrixAccount 默认头像钩子（spec D-3）', () => {
  it('建号+roster 成功后配双头像（人类款+agent 款），avatars 全 true', async () => {
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    fetchMock.mockReset()
    // 序列：建人类号、建 agent 号、人类头像上传、人类头像 PUT、agent 头像上传、agent 头像 PUT
    fetchMock
      .mockResolvedValueOnce(okJson({})) // createMatrixUser human
      .mockResolvedValueOnce(okJson({})) // createMatrixUser agent
      .mockResolvedValueOnce(okJson({ content_uri: 'mxc://matrix.test/h' }))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(okJson({ content_uri: 'mxc://matrix.test/a' }))
      .mockResolvedValueOnce(okJson({}))
    const r = await provisionMatrixAccount({
      localName: 'wangwu', role: '工程师', password: 'Pw1!',
      adminToken: 'tok', homeserverUrl: 'http://127.0.0.1:8008', displayName: '王五',
    })
    vi.unstubAllGlobals()
    expect(r.created).toEqual(['@wangwu:matrix.test', '@wangwu-agent:matrix.test'])
    expect(r.avatars).toEqual({ human: true, agent: true })
    expect(r.rosterCommit).toBeTruthy()
    // 头像 PUT 只写 avatar_url（第 4 调 = 人类头像 PUT）
    const put = fetchMock.mock.calls[3] as unknown as [string, RequestInit]
    expect(put[0]).toContain('/_synapse/admin/v2/users/%40wangwu%3Amatrix.test')
    expect(String(put[1].body)).toBe('{"avatar_url":"mxc://matrix.test/h"}')
  })

  it('头像上传失败 → 降级 false，不抛、roster 照常提交（化妆性属性不阻断建号语义）', async () => {
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(okJson({})) // createMatrixUser human
      .mockResolvedValueOnce(okJson({})) // createMatrixUser agent
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response) // 人类头像上传失败
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response) // agent 头像上传失败
    const r = await provisionMatrixAccount({
      localName: 'liuliu', role: '工程师', password: 'Pw1!',
      adminToken: 'tok', homeserverUrl: 'http://127.0.0.1:8008',
    })
    vi.unstubAllGlobals()
    expect(r.rosterCommit).toBeTruthy()
    expect(r.avatars).toEqual({ human: false, agent: false })
    expect(fetchMock).toHaveBeenCalledTimes(4) // 上传失败即止，无头像 PUT
  })
})

describe('backfillDefaultAvatars 存量补发（spec D-7）', () => {
  it('默认只补「未停用且头像为空」，-agent 分流 AI 款', async () => {
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(okJson({
        users: [
          { name: '@has:matrix.test', displayname: '已有头像', avatar_url: 'mxc://x/y', is_admin: false, deactivated: false },
          { name: '@free:matrix.test', displayname: null, avatar_url: null, is_admin: false, deactivated: false },
          { name: '@gone-agent:matrix.test', displayname: null, avatar_url: null, is_admin: false, deactivated: true },
        ],
        total: 3,
      }))
      .mockResolvedValueOnce(okJson({ content_uri: 'mxc://matrix.test/f' })) // @free 上传
      .mockResolvedValueOnce(okJson({})) // @free PUT
    const r = await backfillDefaultAvatars({ adminToken: 'tok', homeserverUrl: 'http://127.0.0.1:8008' })
    vi.unstubAllGlobals()
    expect(r.updated).toEqual(['@free:matrix.test'])
    expect(r.failed).toEqual([])
    // 只处理 1 个目标：1 次列表 + 1 上传 + 1 PUT
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [listUrl] = fetchMock.mock.calls[0] as unknown as [string]
    expect(listUrl).toContain('/_synapse/admin/v2/users?from=0&limit=100&guests=false')
  })

  it('显式 userIds 只处理指定账号（覆盖语义，无视已有头像）', async () => {
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(okJson({ content_uri: 'mxc://matrix.test/e' }))
      .mockResolvedValueOnce(okJson({}))
    const r = await backfillDefaultAvatars({
      adminToken: 'tok', homeserverUrl: 'http://127.0.0.1:8008',
      userIds: ['@force-agent:matrix.test'],
    })
    vi.unstubAllGlobals()
    expect(r.updated).toEqual(['@force-agent:matrix.test'])
    const [upUrl] = fetchMock.mock.calls[0] as unknown as [string]
    expect(upUrl).toContain('filename=default-avatar-agent-force-agent.png')
  })

  it('列表失败显式抛错（不静默空成功——防假成功语义同建号）', async () => {
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    await expect(backfillDefaultAvatars({ adminToken: 'tok', homeserverUrl: 'http://127.0.0.1:8008' }))
      .rejects.toThrow('listMatrixUsers 失败')
    vi.unstubAllGlobals()
  })
})

describe('isAgentMatrixUser —— 命名约定服务端正本', () => {
  it('-agent 后缀判定（大小写不敏感、非后缀不误判）', () => {
    expect(isAgentMatrixUser('@wangwu-agent:matrix.test')).toBe(true)
    expect(isAgentMatrixUser('@WANGWU-AGENT:matrix.test')).toBe(true)
    expect(isAgentMatrixUser('@agent:matrix.test')).toBe(false)
    expect(isAgentMatrixUser('@wangwu-agents:matrix.test')).toBe(false)
    expect(isAgentMatrixUser('@wangwu:matrix.test')).toBe(false)
  })
})
