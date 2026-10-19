// mermaid-brand 客户端分段器测试（spec 项5）：围栏切分/未闭合回吐/viewBox 高度估算。
import { describe, expect, it } from 'vitest'
import { brandedFrameHeight, splitMermaidSegments } from '../mermaid-brand'

describe('splitMermaidSegments', () => {
  it('md/mermaid/md 三段切分', () => {
    const md = '# 标题\n\n```mermaid\nflowchart LR\n  A-->B\n```\n\n尾段\n'
    const segs = splitMermaidSegments(md)
    expect(segs.map((s) => s.kind)).toEqual(['md', 'mermaid', 'md'])
    expect(segs[1].text).toBe('flowchart LR\n  A-->B')
    expect(segs[2].text).toBe('\n尾段\n')
  })

  it('多个 mermaid 块保序', () => {
    const md = '```mermaid\nflowchart LR\n A-->B\n```\n中\n```mermaid\nsequenceDiagram\n A->>B: x\n```\n'
    const segs = splitMermaidSegments(md)
    expect(segs.map((s) => s.kind)).toEqual(['mermaid', 'md', 'mermaid'])
  })

  it('未闭合围栏回吐为 markdown（不丢内容）', () => {
    const md = '前文\n```mermaid\nflowchart LR\n  A-->B\n'
    const segs = splitMermaidSegments(md)
    expect(segs).toHaveLength(1)
    expect(segs[0].kind).toBe('md')
    expect(segs[0].text).toContain('```mermaid')
    expect(segs[0].text).toContain('A-->B')
  })

  it('~~~ 围栏同样识别', () => {
    const segs = splitMermaidSegments('~~~mermaid\nflowchart LR\n A-->B\n~~~\n')
    expect(segs.map((s) => s.kind)).toEqual(['mermaid'])
  })

  it('非 mermaid 围栏不动', () => {
    const segs = splitMermaidSegments('```ts\nconst a = 1\n```\n')
    expect(segs.map((s) => s.kind)).toEqual(['md'])
  })
})

describe('brandedFrameHeight', () => {
  it('viewBox 高度 + 96，上下限夹紧', () => {
    expect(brandedFrameHeight('<svg viewBox="0 0 200 100">')).toBe(196)
    expect(brandedFrameHeight('<svg viewBox="0 0 200 10">')).toBe(160)
    expect(brandedFrameHeight('<svg viewBox="0 0 200 5000">')).toBe(1200)
    expect(brandedFrameHeight('没有 svg')).toBe(336)
  })
})
