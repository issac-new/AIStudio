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

const { createMatrixUser, setMatrixUserActive } = await import('../admin-service')

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
