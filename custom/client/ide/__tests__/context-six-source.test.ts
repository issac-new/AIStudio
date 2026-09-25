// 六源网格守门（minimax 六段：四段映射估算诚实/span 精确升级/恒等面）。
import { describe, it, expect } from 'vitest'
import { fromFourSegments, fromSpans } from '../utils/context-six-source'

describe('六源网格（minimax /context 语义）', () => {
  it('四段映射估算态：三源拆分系统桶+残差归 OTHER+恒等', () => {
    const b = fromFourSegments({ user: 100, assistant: 200, tool: 50, system: 300 }, 700)
    expect(b.sources).toHaveLength(6)
    expect(b.sources.find((e) => e.key === 'messages')!.tokens).toBe(300)
    expect(b.sources.find((e) => e.key === 'tools')!.tokens).toBe(50)
    expect(b.sources.find((e) => e.key === 'systemPrompt')!.tokens).toBe(100)  // 300/3
    expect(b.sources.every((e) => e.isEstimate)).toBe(true)  // 估算态全标注
    expect(b.identity.delta).toBe(0)  // 残差归 OTHER 后恒等
  })

  it('span 精确版：isEstimate=false；恒等强制', () => {
    const b = fromSpans({ systemPrompt: 100, memory: 50, tools: 60, skills: 40, messages: 300, other: 10 })
    expect(b.sources.every((e) => e.isEstimate)).toBe(false)
    expect(b.identity).toEqual({ sumTokens: 560, surfaceTokens: 560, delta: 0 })
  })
})
