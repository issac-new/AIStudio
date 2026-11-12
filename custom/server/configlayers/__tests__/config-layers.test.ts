// 配置层叠加守门（codex：8 层覆盖序/per-key origins/debug 视图）。
import { describe, it, expect } from 'vitest'
import { debugConfigView, overlayConfig } from '../config-layers'

describe('8 层叠加（codex per-key origins）', () => {
  it('高层覆盖低层；origin 记最后赋值层', () => {
    const cfg = overlayConfig({
      defaults: { timeout: 1000, model: 'default-m' },
      project: { timeout: 2000 },
      env: { timeout: 3000, extra: 'e' },
    })
    expect(cfg.values.timeout).toBe(3000)
    expect(cfg.origins.timeout).toBe('env')
    expect(cfg.origins.model).toBe('defaults')
    expect(cfg.origins.extra).toBe('env')
  })

  it('cli-flag 最高；undefined 不覆盖；debug 视图排序', () => {
    const cfg = overlayConfig({
      global: { a: 1, b: 2 },
      'cli-flag': { a: 9, c: undefined },
    })
    expect(cfg.values).toEqual({ a: 9, b: 2 })
    expect(debugConfigView(cfg)).toEqual([
      { key: 'a', value: 9, origin: 'cli-flag' },
      { key: 'b', value: 2, origin: 'global' },
    ])
    expect(overlayConfig({}).values).toEqual({})
  })
})
