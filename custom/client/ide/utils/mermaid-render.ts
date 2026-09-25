// overlay：mermaid 渲染策略（dsh-TUI §四 P2 吸收，矩阵 §3.8 dsh P2）。
//
// dsh 语义（mermaid 渲染：web SVG 形态+降级语义）：mermaid 图渲染成 SVG（web 形态），
// 渲染失败/开关关闭→**降级源码**（回退代码块展示，内容不丢——codex 渲染分项开关
// 同族）。衔接 render-options.ts（渲染开关）：本层=渲染决策（SVG/降级）纯函数。
export type MermaidMode = 'svg' | 'fallback-source'

export interface MermaidFacts {
  /** 渲染开关（render-options mermaid 档）。 */
  enabled: boolean
  /** 代码块内容。 */
  code: string
  /** 渲染尝试结果（null=未试；false=渲染失败→降级）。 */
  renderOk: boolean | null
}

export interface MermaidDecision {
  mode: MermaidMode
  detail: string
}

/** mermaid 块→渲染决策（开关关/渲染败→降级源码；三态语义）。 */
export function mermaidDecision(facts: MermaidFacts): MermaidDecision {
  if (!facts.enabled) {
    return { mode: 'fallback-source', detail: '渲染开关关闭：降级源码（内容不丢）' }
  }
  if (facts.renderOk === false) {
    return { mode: 'fallback-source', detail: '渲染失败：降级源码（SVG 渲染出错保内容）' }
  }
  return { mode: 'svg', detail: 'SVG 渲染（web 形态）' }
}

/** 渲染结果摘要（降级计数——面板显示渲染健康度）。 */
export function renderSummary(facts: readonly MermaidFacts[]): { svg: number; fallback: number } {
  let svg = 0, fallback = 0
  for (const f of facts) {
    const d = mermaidDecision(f)
    if (d.mode === 'svg') svg += 1
    else fallback += 1
  }
  return { svg, fallback }
}
