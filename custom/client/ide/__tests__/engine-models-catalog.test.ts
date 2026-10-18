// @vitest-environment jsdom
// IDE 模型目录取源守门（2026-10-18 用户裁定）：
// 优先 Ycode/ZCode 实际配置（服务端 zcode.groups），其次 IDE 独立目录，
// 最后才回落 Hermes 目录；Zcode groups 的 label 一并投影给选择器。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetch = vi.hoisted(() => vi.fn())
vi.mock('../utils/auth-fetch', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))

import { engineDefaultModel, fetchEngineCatalog } from '../utils/engine-models'

function reply(body: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: async () => body }
}

beforeEach(() => { authFetch.mockReset() })

describe('fetchEngineCatalog 取源优先级', () => {
  it('有 zcode.groups + zcode.default（新服务端）→ 用 Ycode 配置（含 label），independent=true', async () => {
    authFetch.mockResolvedValue(reply({
      config: { providers: [{ providerId: 'ide-only', models: [{ modelId: 'x' }] }] },
      zcode: {
        groups: [{ provider: 'builtin:bigmodel', label: 'BigModel', models: [{ id: 'GLM-5.3' }, { id: 'glm-5.3-flash', reasoningLevels: ['low'] }] }],
        default: { provider: 'builtin:bigmodel', model: 'GLM-5.3' },
      },
    }))
    const c = await fetchEngineCatalog()
    expect(c.source).toBe('zcode')
    expect(c.independent).toBe(true)
    expect(c.groups).toEqual([
      { provider: 'builtin:bigmodel', label: 'BigModel', models: [{ id: 'GLM-5.3' }, { id: 'glm-5.3-flash', reasoningLevels: ['low'] }] },
    ])
  })

  it('旧后端：zcode.groups 非空但无 zcode.default → 不采信，回落独立目录（版本判据）', async () => {
    authFetch.mockResolvedValue(reply({
      config: { providers: [{ providerId: 'seed-provider', models: [{ modelId: 'fresh' }] }] },
      zcode: { groups: [{ provider: 'stale', label: 'Stale', models: [{ id: 'old', reasoningLevels: ['low'] }] }] },
    }))
    const c = await fetchEngineCatalog()
    expect(c.source).toBe('independent')
    expect(c.groups[0]).toMatchObject({ provider: 'seed-provider' })
  })

  it('中间版本后端：有 default 但目录无思考档位 → 不采信，回落独立目录（档位判据）', async () => {
    authFetch.mockResolvedValue(reply({
      config: { providers: [{ providerId: 'seed-provider', models: [{ modelId: 'fresh', reasoningLevels: ['low', 'high'] }] }] },
      zcode: {
        groups: [{ provider: 'half-new', label: 'HalfNew', models: [{ id: 'm' }] }],
        default: { provider: 'half-new', model: 'm' },
      },
    }))
    const c = await fetchEngineCatalog()
    expect(c.source).toBe('independent')
    expect(c.groups[0]).toMatchObject({ provider: 'seed-provider' })
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

  it('默认模型：zcode.default 优先；旧后端回落 config.defaultModel（providerId/modelId）', async () => {
    authFetch.mockResolvedValue(reply({
      config: { providers: [{ providerId: 'ide-only', models: [{ modelId: 'x' }] }], defaultModel: { providerId: 'ide-only', modelId: 'x' } },
      zcode: {
        groups: [{ provider: 'builtin:bigmodel', models: [{ id: 'GLM-5.3-Flash', reasoningLevels: ['low', 'high'] }] }],
        default: { provider: 'builtin:bigmodel', model: 'GLM-5.3-Flash' },
      },
    }))
    const c = await fetchEngineCatalog()
    expect(c.defaultModel).toEqual({ provider: 'builtin:bigmodel', model: 'GLM-5.3-Flash' })

    authFetch.mockResolvedValue(reply({
      config: { providers: [{ providerId: 'ide-only', models: [{ modelId: 'x' }] }], defaultModel: { providerId: 'ide-only', modelId: 'x' } },
      zcode: { groups: [] },
    }))
    const legacy = await fetchEngineCatalog()
    expect(legacy.defaultModel).toEqual({ provider: 'ide-only', model: 'x' })
  })
})

describe('engineDefaultModel（默认选择）', () => {
  const groups = [
    { provider: 'p0', label: 'p0', models: [] as Array<{ id: string }> },
    { provider: 'p1', label: 'p1', models: [{ id: 'a' }, { id: 'b' }] },
  ]
  it('服务端 default 在目录内 → 用它；不在目录内 → 首个有模型组的首模型', () => {
    expect(engineDefaultModel({ groups, independent: true, source: 'zcode', defaultModel: { provider: 'p1', model: 'b' } }))
      .toEqual({ provider: 'p1', model: 'b' })
    expect(engineDefaultModel({ groups, independent: true, source: 'zcode', defaultModel: { provider: 'p1', model: 'gone' } }))
      .toEqual({ provider: 'p1', model: 'a' })
  })

  it('空目录 → null', () => {
    expect(engineDefaultModel(null)).toBeNull()
    expect(engineDefaultModel({ groups: [], independent: false, source: 'hermes' })).toBeNull()
  })
})
