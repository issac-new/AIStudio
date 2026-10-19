// overlay/custom/server/matrix/__tests__/admin-service.test.ts
// 建号端点守门（2026-10-06 产品缺陷修复）：v1/register 是共享密钥端点（nonce+mac），
// 仅带 Bearer 必 400——历史上建号从未真成功（govprobe/r31probe 复现：roster 已提交
// 而 synapse 无此号）。本文件钉死正道 = PUT v2/users（admin-token create-or-update）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'admin-service.ts'), 'utf-8')

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
beforeEach(() => { fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch) })
afterEach(() => { vi.unstubAllGlobals() })

const { createMatrixUser, setMatrixUserActive, uploadMatrixMedia, assignDefaultAvatar } = await import('../admin-service')

describe('admin-service 建号/停用（synapse admin API 正道）', () => {
  it('createMatrixUser = PUT /_synapse/admin/v2/users/<encoded>（create-or-update，幂等）', async () => {
    const ok = await createMatrixUser('@zhang:matrix.test', 'Pw1!', 'tok', 'http://127.0.0.1:8008', '张三')
    expect(ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8008/_synapse/admin/v2/users/%40zhang%3Amatrix.test')
    expect(init.method).toBe('PUT')
    expect(String(init.body)).toContain('"password":"Pw1!"')
    expect(String(init.body)).toContain('"deactivated":false')
    expect(String(init.body)).toContain('"displayname":"张三"')
  })

  it('停用 = POST /_synapse/admin/v1/deactivate/<encoded>（对真实账号 200 实锚）', async () => {
    const ok = await setMatrixUserActive('@zhang:matrix.test', false, 'tok', 'http://127.0.0.1:8008')
    expect(ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8008/_synapse/admin/v1/deactivate/%40zhang%3Amatrix.test')
    expect(init.method).toBe('POST')
  })

  it('绊线：admin-service 源码禁回退 v1/register（共享密钥端点，Bearer 必 400）', () => {
    expect(src).not.toContain('/_synapse/admin/v1/register')
  })
})

describe('admin-service 默认头像落位（2026-10-19 群聊身份标识轮，spec D-3/D-4）', () => {
  it('uploadMatrixMedia = POST /_matrix/media/v3/upload（Bearer + content-type）→ content_uri', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ content_uri: 'mxc://matrix.test/abc' }) } as Response)
    const mxc = await uploadMatrixMedia(Buffer.from('png-bytes'), 'image/png', 'a.png', 'tok', 'http://127.0.0.1:8008')
    expect(mxc).toBe('mxc://matrix.test/abc')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8008/_matrix/media/v3/upload?filename=a.png')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png')
  })

  it('uploadMatrixMedia 非 2xx / 缺 content_uri → null（best-effort 不抛）', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    expect(await uploadMatrixMedia(Buffer.from('x'), 'image/png', 'a.png', 'tok', 'http://127.0.0.1:8008')).toBeNull()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    expect(await uploadMatrixMedia(Buffer.from('x'), 'image/png', 'a.png', 'tok', 'http://127.0.0.1:8008')).toBeNull()
  })

  it('assignDefaultAvatar 两步：上传 → v2 PUT 仅 avatar_url 一字段', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content_uri: 'mxc://matrix.test/abc' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    const ok = await assignDefaultAvatar({
      userId: '@zhang:matrix.test', kind: 'human', adminToken: 'tok',
      homeserverUrl: 'http://127.0.0.1:8008', displayName: '张三',
    })
    expect(ok).toBe(true)
    const [putUrl, putInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(putUrl).toBe('http://127.0.0.1:8008/_synapse/admin/v2/users/%40zhang%3Amatrix.test')
    expect(putInit.method).toBe('PUT')
    // 仅 avatar_url——不触密码/停用态（omitted 字段语义）
    expect(String(putInit.body)).toBe('{"avatar_url":"mxc://matrix.test/abc"}')
  })

  it('assignDefaultAvatar 上传失败即止（不再 PUT），返回 false', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    const ok = await assignDefaultAvatar({
      userId: '@zhang-agent:matrix.test', kind: 'agent', adminToken: 'tok',
      homeserverUrl: 'http://127.0.0.1:8008',
    })
    expect(ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('agent 款上传文件名带 kind 标记（人类/AI 两种 PNG 可在媒体库区分）', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content_uri: 'mxc://matrix.test/xyz' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    await assignDefaultAvatar({
      userId: '@zhang-agent:matrix.test', kind: 'agent', adminToken: 'tok',
      homeserverUrl: 'http://127.0.0.1:8008',
    })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('filename=default-avatar-agent-zhang-agent.png')
  })
})
