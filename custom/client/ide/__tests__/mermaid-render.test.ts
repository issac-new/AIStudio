// mermaid 渲染策略守门（dsh：SVG 形态/开关降级/渲染败降级/摘要）。
import { describe, it, expect } from 'vitest'
import { mermaidDecision, renderSummary } from '../utils/mermaid-render'

describe('mermaid 渲染决策（dsh 语义）', () => {
  it('开关开+渲染成功→svg；开关关/渲染败→降级源码', () => {
    expect(mermaidDecision({ enabled: true, code: 'graph', renderOk: null }).mode).toBe('svg')
    expect(mermaidDecision({ enabled: true, code: 'graph', renderOk: true }).mode).toBe('svg')
    expect(mermaidDecision({ enabled: false, code: 'graph', renderOk: true })).toMatchObject({ mode: 'fallback-source' })
    expect(mermaidDecision({ enabled: true, code: 'graph', renderOk: false }).detail).toContain('渲染失败')
  })

  it('渲染摘要计数', () => {
    const s = renderSummary([
      { enabled: true, code: 'a', renderOk: null },
      { enabled: true, code: 'b', renderOk: false },
      { enabled: false, code: 'c', renderOk: true },
    ])
    expect(s).toEqual({ svg: 1, fallback: 2 })
    expect(renderSummary([])).toEqual({ svg: 0, fallback: 0 })
  })
})
