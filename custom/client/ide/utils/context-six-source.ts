// overlay：上下文六源网格（minimax /context 六段吸收，zcode §七 #6 G4 待排期项）。
//
// minimax 语义（/context 六段网格）：SYSTEM_PROMPT / MEMORY / TOOLS / SKILLS /
// MESSAGES / OTHER 六源构成视图。hermes 前端可见数据收敛为四段（contextBreakdown.ts），
// 本模块=**六源 schema + 映射层**：四段→六源归并规则 + 估算诚实标注（isEstimate）；
// 服务端 span（hermes-agent 侧产）到位后走 fromSpans 精确版——本层是升级接口面。
export type SixSourceKey = 'systemPrompt' | 'memory' | 'tools' | 'skills' | 'messages' | 'other'

export interface SixSourceEntry {
  key: SixSourceKey
  tokens: number
  pct: number
  /** 估算标注（前端推算桶拆分=估算；span 精确值=实测）。 */
  isEstimate: boolean
}

export interface SixSourceBreakdown {
  sources: SixSourceEntry[]
  /** 恒等面（六源之和=总量；估算态允许偏差记 delta）。 */
  identity: { sumTokens: number; surfaceTokens: number; delta: number }
}

/**
 * 四段→六源映射（估算态，isEstimate=true）：
 * - tool 段→TOOLS；user+assistant→MESSAGES；
 * - system 段=不可见注入合计（系统提示词/技能/记忆/工具 schema）——拆不开时按
 *   三源均分并整体标注估算（诚实：宁可粗，不虚报细）；残差→OTHER。
 */
export function fromFourSegments(
  four: { user: number; assistant: number; tool: number; system: number },
  surfaceTokens: number,
): SixSourceBreakdown {
  const perSource = Math.round(four.system / 3)
  const sources: SixSourceEntry[] = [
    { key: 'systemPrompt', tokens: perSource, pct: 0, isEstimate: true },
    { key: 'memory', tokens: perSource, pct: 0, isEstimate: true },
    { key: 'tools', tokens: four.tool, pct: 0, isEstimate: true },
    { key: 'skills', tokens: four.system - perSource * 2, pct: 0, isEstimate: true },
    { key: 'messages', tokens: four.user + four.assistant, pct: 0, isEstimate: true },
    { key: 'other', tokens: 0, pct: 0, isEstimate: true },
  ]
  const sum = sources.reduce((s, e) => s + e.tokens, 0)
  // 残差（surface - Σ）归 OTHER（估算桶尾）。
  const residual = Math.max(0, surfaceTokens - sum)
  sources.find((e) => e.key === 'other')!.tokens = residual
  const total = sum + residual
  sources.forEach((e) => {
    e.pct = total > 0 ? Math.round((e.tokens / total) * 1000) / 10 : 0
  })
  return { sources, identity: { sumTokens: total, surfaceTokens, delta: surfaceTokens - total } }
}

/** 精确版升级接口（服务端 span 到位后调用——恒等校验在此强制）。 */
export function fromSpans(spans: Record<SixSourceKey, number>): SixSourceBreakdown {
  const total = Object.values(spans).reduce((s, n) => s + n, 0)
  const sources: SixSourceEntry[] = (Object.keys(spans) as SixSourceKey[])
    .map((key) => ({
      key,
      tokens: spans[key],
      pct: total > 0 ? Math.round((spans[key] / total) * 1000) / 10 : 0,
      isEstimate: false,
    }))
  return { sources, identity: { sumTokens: total, surfaceTokens: total, delta: 0 } }
}
