// overlay[expdual] 分通道注入面（TTSE Select/Injection 的本仓实现）。
//
// 纪律与 exp-inject 同源：默认关闭（EXP_DUAL_INJECT=1 才注入）；渲染只带规则正文，
// 不带 id/计数/时刻（防被当作本轮实测凭据）；FACT 与 TIP 独立编号（各自从 1 起），
// 让「环境认识」和「条件技巧」在简报里不混成一段。fail-soft：任何异常返回空块。
import { scopeAllows, type ScopeFilter } from '../expcandidates/scope-match'
import { recordInjection } from '../expcandidates/exp-store'
import { injectionRunLabel } from '../expcandidates/exp-inject'
import { DEFAULT_TOP_K, MAX_TOP_K, type DualRule, type DualStoreShape } from './dual-types'
import { bigramSimilarity } from '../eval/vectorizer'
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

/** 选取：相似度用 eval 域特征哈希 bigram 余弦（仓内真向量基线单一事实源，收尾批升级——
 * 词面 Jaccard 对「同义不同词序/部分词重叠」弱）；无语境时按证据计数（不造召回）。 */
export function selectDualRules(store: DualStoreShape, opts: DualSelectOptions = {}): DualSelection {
  const filter: ScopeFilter = {
    ...(opts.column ? { column: opts.column } : {}),
    ...(opts.specialist ? { specialist: opts.specialist } : {}),
  }
  const query = String(opts.query ?? '').trim()
  const active = store.rules.filter((r) => r.status === 'active' && scopeAllows(r.scope, filter))
  const rank = (a: DualRule, b: DualRule): number => {
    if (query) {
      const diff = bigramSimilarity(query, a.text) - bigramSimilarity(query, b.text)
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
  return dualTrackInjectionForDispatch(opts).lines
}

/** 派单注入＋留痕面（批一 b 变更 4）：「返回记录＋正文」接口——选择 dual 规则渲染
 *  正文，同时把被注入规则 ids 落进 expcandidates 留痕账（kind='dual'，taskId 到场
 *  才落——效果归因 join 键；taskId 缺席零留痕，向后兼容）。留痕 fail-soft：账写坏
 *  不阻断注入行（与 exp 路同纪律）。旧 dualTrackLinesForDispatch 保留为薄包装。 */
export function dualTrackInjectionForDispatch(
  opts: DualSelectOptions & { taskId?: string } = {},
): { lines: string[]; ruleIds: string[] } {
  try {
    if (!dualInjectionEnabled()) return { lines: [], ruleIds: [] }
    const store = readDualStore()
    const selection = selectDualRules(store, opts)
    const lines = renderDualTrackBlock(selection)
    const ruleIds = [...selection.facts, ...selection.tips].map((r) => r.id)
    const taskId = opts.taskId?.trim()
    if (lines.length && ruleIds.length && taskId) {
      try {
        recordInjection(ruleIds, injectionRunLabel(), undefined, taskId, {
          kind: 'dual',
          ...(opts.column ? { column: opts.column } : {}),
          ...(opts.specialist ? { specialist: opts.specialist } : {}),
        })
      } catch { /* 留痕 fail-soft：不阻断注入行 */ }
    }
    return { lines, ruleIds }
  } catch {
    return { lines: [], ruleIds: [] }
  }
}
