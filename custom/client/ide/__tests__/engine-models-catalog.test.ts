// @vitest-environment jsdom
// IDE 模型目录取源守门（2026-10-18 用户裁定）：
// 优先 Ycode/ZCode 实际配置（服务端 zcode.groups），其次 IDE 独立目录，
// 最后才回落 Hermes 目录；Zcode groups 的 label 一并投影给选择器。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetch = vi.hoisted(() => vi.fn())
vi.mock('../utils/auth-fetch', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))

import { fetchEngineCatalog } from '../utils/engine-models'

function reply(body: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: async () => body }
}

beforeEach(() => { authFetch.mockReset() })

describe('fetchEngineCatalog 取源优先级', () => {
  it('有 zcode.groups → 用 Ycode 配置（含 label），independent=true', async () => {
    authFetch.mockResolvedValue(reply({
      config: { providers: [{ providerId: 'ide-only', models: [{ modelId: 'x' }] }] },
      zcode: { groups: [{ provider: 'builtin:bigmodel', label: 'BigModel', models: [{ id: 'GLM-5.3' }, { id: 'glm-5.3-flash', reasoningLevels: ['low'] }] }] },
    }))
    const c = await fetchEngineCatalog()
    expect(c.source).toBe('zcode')
    expect(c.independent).toBe(true)
    expect(c.groups).toEqual([
      { provider: 'builtin:bigmodel', label: 'BigModel', models: [{ id: 'GLM-5.3' }, { id: 'glm-5.3-flash', reasoningLevels: ['low'] }] },
    ])
  })

  it('无 zcode.groups → 用 IDE 独立目录', async () => {
    authFetch.mockResolvedValue(reply({
      config: { providers: [{ providerId: 'ide-only', models: [{ modelId: 'x' }] }] },
      zcode: { groups: [] },
    }))
    const c = await fetchEngineCatalog()
    expect(c.source).toBe('independent')
    expect(c.groups[0]).toMatchObject({ provider: 'ide-only', label: 'ide-only' })
  })

  it('两源皆空 → source=hermes（选择器回落 appStore，不空白）', async () => {
    authFetch.mockResolvedValue(reply({ config: { providers: [] }, zcode: { groups: [] } }))
    const c = await fetchEngineCatalog()
    expect(c.source).toBe('hermes')
    expect(c.independent).toBe(false)
    expect(c.groups).toEqual([])
  })
})
