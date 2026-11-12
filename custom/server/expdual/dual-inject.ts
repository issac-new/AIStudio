// overlay[expdual] 分通道注入面（TTSE Select/Injection 的本仓实现）。
//
// 纪律与 exp-inject 同源：默认关闭（EXP_DUAL_INJECT=1 才注入）；渲染只带规则正文，
// 不带 id/计数/时刻（防被当作本轮实测凭据）；FACT 与 TIP 独立编号（各自从 1 起），
// 让「环境认识」和「条件技巧」在简报里不混成一段。fail-soft：任何异常返回空块。
import { scopeAllows, type ScopeFilter } from '../expcandidates/scope-match'
import { DEFAULT_TOP_K, MAX_TOP_K, type DualRule, type DualStoreShape } from './dual-types'
import { jaccard, tokenSet } from './dual-text'
import { readDualStore } from './dual-store'

export interface DualSelectOptions extends ScopeFilter {
  /** 当前任务语境（任务标题）；缺省按证据计数排序（不造召回）。 */
  query?: string
  kFact?: number
  kTip?: number
}

export interface DualSelection {
  facts: DualRule[]
  tips: DualRule[]
}

export function dualInjectionEnabled(): boolean {
  return process.env.EXP_DUAL_INJECT?.trim() === '1'
}

function clampK(value: number | undefined): number {
  const n = Number.isFinite(value) ? Number(value) : DEFAULT_TOP_K
  return Math.max(1, Math.min(MAX_TOP_K, Math.trunc(n)))
}

/** 选取：命中率看词面相似度，无语境时按证据计数（论文的 top-K 与本仓的"不造召回"折中）。 */
export function selectDualRules(store: DualStoreShape, opts: DualSelectOptions = {}): DualSelection {
  const filter: ScopeFilter = {
    ...(opts.column ? { column: opts.column } : {}),
    ...(opts.specialist ? { specialist: opts.specialist } : {}),
  }
  const query = String(opts.query ?? '').trim()
  const queryTokens = query ? tokenSet(query) : null
  const active = store.rules.filter((r) => r.status === 'active' && scopeAllows(r.scope, filter))
  const rank = (a: DualRule, b: DualRule): number => {
    if (queryTokens) {
      const diff = jaccard(queryTokens, tokenSet(a.text)) - jaccard(queryTokens, tokenSet(b.text))
      if (diff !== 0) return -diff
    }
    if (a.count !== b.count) return b.count - a.count
    return a.seq - b.seq
  }
  const facts = active.filter((r) => r.channel === 'fact').sort(rank).slice(0, clampK(opts.kFact))
  const tips = active.filter((r) => r.channel === 'tip').sort(rank).slice(0, clampK(opts.kTip))
  return { facts, tips }
}

/** 渲染：两块分开、通道内独立编号；无内容不出现空标题。 */
export function renderDualTrackBlock(selection: DualSelection): string[] {
  const lines: string[] = []
  if (selection.facts.length > 0) {
    lines.push('【环境事实】已核对的环境认识（与本任务无关可忽略）：')
    selection.facts.forEach((r, i) => lines.push(`F${i + 1}. ${r.text}`))
  }
  if (selection.tips.length > 0) {
    lines.push('【条件技巧】条件不成立时不要套用：')
    selection.tips.forEach((r, i) => lines.push(`T${i + 1}. ${r.text}`))
  }
  return lines
}

/** 派单侧读取面（column-dispatch 消费）：默认关/无规则/存储异常→空数组。 */
export function dualTrackLinesForDispatch(opts: DualSelectOptions = {}): string[] {
  try {
    if (!dualInjectionEnabled()) return []
    const store = readDualStore()
    const selection = selectDualRules(store, opts)
    return renderDualTrackBlock(selection)
  } catch {
    return []
  }
}
