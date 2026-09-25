// overlay[zcode] P1：渲染分项开关（codex §四 P0 吸收，矩阵 §3.8 codex 行）。
//
// codex 语义（§四 P0 行 1）：mermaid/math/tables 等富渲染**独立开关**，关闭时回退
// 源码（防渲染器缺陷吞内容——"独立回退源码"保信息不丢）。Ycode 形状：渲染选项
// 纯域（开关状态→每类 render|fallback 决策），渲染器层按决策执行；服务端只管
// 决策面与默认值（默认全开=渲染优先，回退是降级不是常态）。
export interface RenderOptions {
  mermaid: boolean
  math: boolean
  tables: boolean
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = { mermaid: true, math: true, tables: true }

export type RenderDecision = 'render' | 'fallback-source'

export interface RenderPlan {
  kind: 'mermaid' | 'math' | 'tables'
  decision: RenderDecision
}

/**
 * 决策：开关开=render；关=fallback-source（回退源码展示，内容永不丢）。
 * 未知块类型（如普通代码块）不在此列——它们天然源码展示。
 */
export function planRender(options: RenderOptions): RenderPlan[] {
  return (['mermaid', 'math', 'tables'] as const).map((kind) => ({
    kind,
    decision: options[kind] ? 'render' : 'fallback-source',
  }))
}

/** 块级决策（渲染器逐块查询）。 */
export function decisionFor(options: RenderOptions, kind: 'mermaid' | 'math' | 'tables'): RenderDecision {
  return options[kind] ? 'render' : 'fallback-source'
}

/** 选项归一（非布尔字段回默认——坏配置不拖垮渲染）。 */
export function normalizeRenderOptions(raw: unknown): RenderOptions {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    mermaid: typeof r.mermaid === 'boolean' ? r.mermaid : true,
    math: typeof r.math === 'boolean' ? r.math : true,
    tables: typeof r.tables === 'boolean' ? r.tables : true,
  }
}
