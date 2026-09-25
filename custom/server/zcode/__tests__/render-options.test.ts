// 渲染分项开关守门（codex §四 P0：独立开关/回退源码/坏配置回默认）。
import { describe, it, expect } from 'vitest'
import { DEFAULT_RENDER_OPTIONS, decisionFor, normalizeRenderOptions, planRender } from '../render-options'

describe('渲染分项开关（独立回退源码）', () => {
  it('三类独立开关；关=回退源码（内容不丢）', () => {
    const plans = planRender(DEFAULT_RENDER_OPTIONS)
    expect(plans.map((p) => p.decision)).toEqual(['render', 'render', 'render'])
    const off = planRender({ mermaid: true, math: false, tables: true })
    expect(off.find((p) => p.kind === 'math')!.decision).toBe('fallback-source')
    expect(decisionFor({ mermaid: false, math: false, tables: false }, 'mermaid')).toBe('fallback-source')
  })

  it('坏配置回默认（不拖垮渲染）', () => {
    expect(normalizeRenderOptions({ mermaid: 'yes', math: 0, tables: null })).toEqual(DEFAULT_RENDER_OPTIONS)
    expect(normalizeRenderOptions(undefined)).toEqual(DEFAULT_RENDER_OPTIONS)
    expect(normalizeRenderOptions({ math: false }).math).toBe(false)
  })
})
