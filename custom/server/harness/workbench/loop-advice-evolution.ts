// 文件职责：全历史注入/删除模板/进化报告/退役候选（自 loop-advice.ts 纯移动，行为不变）。
import { composedVariant } from './loop-core'
import { rsiConfig } from './loop-config'
import type { RsiConfig } from './loop-config'
import { pruneSignal, stallDetection } from './loop-advice-hypothesis'
import { verificationTierOf } from './loop-advice-tier'
import type {
  BehaviorContrast, Champion, ClassAttribution, EditClass, EvolutionReport, EvolutionRound, EvolutionSurface, ProbeMetrics,
  Proposal, ProposalStatus, RetirementCandidate, SurfaceKey,
} from './types'

// ---- D7/D10（2026-10-31 RSI P2 批）：提案端全历史注入＋删除提案模板 ----

export interface EvolutionHistoryEntry {
  kind: 'adopted' | 'rejected' | 'rolled_back'
  proposalId: string
  title: string
  /** adopted=冠军轮次与增益；rejected=裁决理由；rolled_back=回滚理由。 */
  detail: string
}

/**
 * D7 提案端全历史注入（DGM/ADAS 档案思想在起草侧的消费面）：
 * 该面全部已采纳冠军（含增益）、被拒（含裁决理由）与回滚（含回滚理由）提案
 * 一次性喂给起草器——失败假设禁止换皮重提（升 RRSI P2 的事前版，此前只有
 * Jaccard 事后警告）；低分祖先常是垫脚石，可显式改造而非回避。
 */
export function proposerEvolutionHistory(
  proposals: Proposal[],
  champions: Champion[],
  surfaceKey: SurfaceKey,
): { entries: EvolutionHistoryEntry[]; summary: string } {
  const mine = proposals.filter((p) => p.surfaceKey === surfaceKey)
  const champs = champions
    .filter((c) => c.surfaceKey === surfaceKey)
    .sort((a, b) => (a.promotedAt < b.promotedAt ? -1 : 1))
  const champProposal = new Map(champs.map((c) => [c.proposalId, c]))
  const entries: EvolutionHistoryEntry[] = []
  let round = 0
  for (const c of champs) {
    round += 1
    const proposal = mine.find((p) => p.id === c.proposalId)
    const rolled = proposal?.rollback != null || c.rolledBack === true
    const selected = proposal ? composedVariant(proposal) : null
    const probe = selected
      ? proposal!.probes.find((x) => x.variantId === selected.id && x.status === 'recorded')
      : undefined
    const delta = probe?.contrast?.passAt1Delta
    entries.push({
      kind: rolled ? 'rolled_back' : 'adopted',
      proposalId: c.proposalId,
      title: proposal?.title ?? c.label,
      detail: rolled
        ? `第 ${round} 轮冠军后回滚${proposal?.rollback?.reason ? `（${proposal.rollback.reason.slice(0, 120)}）` : ''}`
        : `第 ${round} 轮冠军${delta != null ? `（pass@1 Δ${(delta * 100).toFixed(1)}pp）` : ''}`,
    })
  }
  for (const p of mine) {
    if (champProposal.has(p.id)) continue
    if (p.status === 'rejected') {
      entries.push({
        kind: 'rejected',
        proposalId: p.id,
        title: p.title,
        detail: `裁决驳回${p.approval?.note ? `（${p.approval.note.slice(0, 120)}）` : ''}`,
      })
    } else if (p.status === 'rolled_back') {
      entries.push({
        kind: 'rolled_back',
        proposalId: p.id,
        title: p.title,
        detail: `回滚${p.rollback?.reason ? `（${p.rollback.reason.slice(0, 120)}）` : ''}`,
      })
    }
  }
  const adopted = champs.filter((c) => {
    const proposal = mine.find((p) => p.id === c.proposalId)
    return !(proposal?.rollback != null || c.rolledBack === true)
  }).length
  const summary = `已采纳 ${adopted} 轮 / 回滚 ${entries.filter((e) => e.kind === 'rolled_back').length} / 拒绝 ${entries.filter((e) => e.kind === 'rejected').length}（提案总数 ${mine.length}）`
  return { entries, summary }
}

export interface DeletionProposalDirective {
  /** pruneSignal 命中＝近窗全部提案零正增益——做减法优先。 */
  suggested: boolean
  windowProposals: Array<{ proposalId: string; title: string; bestDelta: number | null }>
  /** 删除型提案的起草模板（suggested=false 为 null）。 */
  scaffold: string | null
}

/**
 * D10 删除提案模板（RRSI 剪枝信号从 overview 提示升格为可执行提案模板）：
 * 近 n_prune 个提案全部已记录探测增益 ≤0 ⇒ 加法已到边际，起草器收到的不再是
 * 一句「优先做减法」，而是结构化的删除计划模板——每项须给段落锚点＋加入轮次
 * ＋零增益证据＋删除理由，且禁止新增机制段落（论文剪枝=directive 定位，
 * 是否执行仍走人提案＋晋级门）。
 */
export function deletionProposalTemplate(
  proposals: Proposal[],
  surfaceKey: SurfaceKey,
  cfg: RsiConfig = rsiConfig(),
): DeletionProposalDirective {
  const mine = proposals
    .filter((p) => p.surfaceKey === surfaceKey)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const recent = mine.slice(-cfg.pruneN)
  const windowProposals = recent.map((p) => {
    const deltas = p.probes
      .filter((x) => x.status === 'recorded' && x.contrast?.passAt1Delta != null)
      .map((x) => x.contrast!.passAt1Delta as number)
    return {
      proposalId: p.id,
      title: p.title,
      bestDelta: deltas.length > 0 ? Math.max(...deltas) : null,
    }
  })
  const suggested = pruneSignal(mine, cfg.pruneN)
  if (!suggested) return { suggested: false, windowProposals, scaffold: null }
  const evidenceLines = windowProposals
    .map((w) => `- ${w.proposalId}「${w.title}」最佳增益 ${w.bestDelta != null ? `${(w.bestDelta * 100).toFixed(1)}pp` : '无读数'}`)
    .join('\n')
  const scaffold = [
    '【删除型提案模板（做减法优先）】近窗提案零正增益证据：',
    evidenceLines,
    '请起草一个删除计划而非新增机制：逐段审读基线文件，列出可整体删除或合并的机制段落。',
    'section 每项格式：「段落锚点（标题或首行摘要）｜加入来源（proposal id 或「基线原生」）｜零增益/负增益证据｜删除理由」。',
    '纪律：不新增任何机制段落；删除后须保证文件结构完整；对「可能有用但无证据」的段落标 [待证] 而非直接删。',
  ].join('\n')
  return { suggested: true, windowProposals, scaffold }
}

// ---- 进化报告（overview 的 evolution 段；论文图 6 曲线与去向计数的本仓形态） ----

function selectedEvidenceOf(p: Proposal): { evidence: ProbeMetrics; contrast: BehaviorContrast | null } | null {
  const selected = composedVariant(p)
  if (!selected) return null
  const probe = p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded')
  if (!probe?.evidence) return null
  return { evidence: probe.evidence, contrast: probe.contrast ?? null }
}

// ---- W2（2026-11-05 四篇论文吸收）：编辑类别归因与跷跷板检测 ----

/**
 * 按 invariant/domain 聚合已采纳轮的增益、成本与回归失败数。
 * 跷跷板判据：同一面上相邻两个已采纳轮分属 invariant 与 domain，且增益符号相反——
 * 一类涨、一类跌，说明两类改动在互相抵消，正是 Harness² 要求分层优化的场景。
 * 只统计未回滚轮；缺读数如实排除，不补零。
 */
export function classAttributionOf(
  surfaces: EvolutionSurface[],
  proposals: Proposal[],
): { rows: ClassAttribution[]; seesawSuspected: boolean } {
  const byId = new Map(proposals.map((p) => [p.id, p]))
  const buckets = new Map<EditClass | 'undeclared', { deltas: number[]; costs: number[]; regressed: number; rounds: number }>()
  let seesawSuspected = false
  for (const surface of surfaces) {
    const live = surface.timeline.filter((r) => !r.rolledBack)
    for (let i = 0; i < live.length; i += 1) {
      const round = live[i]
      const proposal = byId.get(round.proposalId)
      const cls: EditClass | 'undeclared' = proposal?.editClass ?? 'undeclared'
      const slot = buckets.get(cls) ?? { deltas: [], costs: [], regressed: 0, rounds: 0 }
      slot.rounds += 1
      if (round.passAt1Delta != null) slot.deltas.push(round.passAt1Delta)
      const prevRound = i > 0 ? live[i - 1] : null
      if (prevRound && prevRound.costUsd != null && prevRound.costUsd !== 0 && round.costUsd != null) {
        slot.costs.push((round.costUsd - prevRound.costUsd) / prevRound.costUsd)
      }
      const evidence = proposal ? selectedEvidenceOf(proposal) : null
      slot.regressed += evidence?.evidence.regression?.failed ?? 0
      buckets.set(cls, slot)

      if (i > 0) {
        const prevProposal = byId.get(prevRound!.proposalId)
        const prevCls = prevProposal?.editClass ?? null
        const pair = new Set<EditClass | null>([prevCls, proposal?.editClass ?? null])
        const d0 = prevRound!.passAt1Delta
        const d1 = round.passAt1Delta
        if (d0 != null && d1 != null && d0 !== 0 && d1 !== 0
          && Math.sign(d0) !== Math.sign(d1)
          && pair.has('invariant') && pair.has('domain')) {
          seesawSuspected = true
        }
      }
    }
  }
  const order: Array<EditClass | 'undeclared'> = ['invariant', 'domain', 'mixed', 'undeclared']
  const rows: ClassAttribution[] = order
    .filter((k) => buckets.has(k))
    .map((k) => {
      const slot = buckets.get(k)!
      return {
        editClass: k,
        rounds: slot.rounds,
        meanDelta: slot.deltas.length > 0 ? slot.deltas.reduce((a, b) => a + b, 0) / slot.deltas.length : null,
        meanCostPct: slot.costs.length > 0 ? slot.costs.reduce((a, b) => a + b, 0) / slot.costs.length : null,
        regressedTasks: slot.regressed,
      }
    })
  return { rows, seesawSuspected }
}

export function evolutionSurfaceReport(
  surfaceKey: SurfaceKey,
  proposals: Proposal[],
  champions: Champion[],
  cfg: RsiConfig,
): EvolutionSurface {
  const mine = proposals.filter((p) => p.surfaceKey === surfaceKey)
  const champChain = champions
    .filter((c) => c.surfaceKey === surfaceKey)
    .sort((a, b) => (a.promotedAt < b.promotedAt ? -1 : 1))
  const byId = new Map(mine.map((p) => [p.id, p]))
  const timeline: EvolutionRound[] = champChain.map((c, idx) => {
    const p = byId.get(c.proposalId)
    const ev = p ? selectedEvidenceOf(p) : null
    return {
      round: idx + 1,
      proposalId: c.proposalId,
      variantLabel: c.label,
      promotedAt: c.promotedAt,
      rolledBack: c.rolledBack === true,
      passAt1: ev?.evidence.passAt1 ?? null,
      tokens: ev?.evidence.tokens ?? null,
      costUsd: ev?.evidence.costUsd ?? null,
      noiseDelta: p?.noise?.delta ?? null,
      passAt1Delta: ev?.contrast?.passAt1Delta ?? null,
      verificationTier: p?.promotion?.verificationTier ?? (p ? verificationTierOf(p) : 'none'),
    }
  })
  const openStatuses: ProposalStatus[] = ['draft', 'submitted', 'approved', 'probing', 'composed']
  return {
    surfaceKey,
    rounds: champions.filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack).length,
    proposalsTotal: mine.length,
    promoted: mine.filter((p) => p.status === 'promoted').length,
    rejected: mine.filter((p) => p.status === 'rejected').length,
    rolledBack: mine.filter((p) => p.status === 'rolled_back').length,
    open: mine.filter((p) => openStatuses.includes(p.status)).length,
    failedProbes: mine.reduce((n, p) => n + p.probes.filter((x) => x.status === 'failed').length, 0),
    stalled: stallDetection(mine, cfg.stallWindow),
    pruneSuggested: pruneSignal(mine, cfg.pruneN),
    weakVerificationStreak: (() => {
      const live = timeline.filter((r) => !r.rolledBack)
      let streak = 0
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const tier = live[i].verificationTier ?? 'none'
        if (tier === 'judge' || tier === 'none') streak += 1
        else break
      }
      return streak
    })(),
    timeline,
  }
}

export function evolutionReport(
  surfaceKeys: SurfaceKey[],
  proposals: Proposal[],
  champions: Champion[],
  cfg: RsiConfig = rsiConfig(),
): EvolutionReport {
  const surfaces = surfaceKeys
    .map((key) => evolutionSurfaceReport(key, proposals, champions, cfg))
    .filter((s) => s.proposalsTotal > 0 || s.rounds > 0)
  const exercised = new Set(proposals.map((p) => p.surfaceKey))
  const attribution = classAttributionOf(surfaces, proposals)
  return {
    config: {
      horizon: cfg.horizon, bMin: cfg.bMin, bMax: cfg.bMax, stallWindow: cfg.stallWindow,
      pruneN: cfg.pruneN, beta0: cfg.beta0, beta1PerPoint: cfg.beta1PerPoint, requireNoise: cfg.requireNoise,
    },
    surfaces,
    unexercised: surfaceKeys.filter((key) => !exercised.has(key)),
    healthWarnings: surfaces
      .filter((s) => s.weakVerificationStreak >= 3)
      .map((s) => ({ surfaceKey: s.surfaceKey, code: 'weak_verification_streak' as const, streak: s.weakVerificationStreak })),
    familyGains: [], // service 层 overview 后处理补（loop 纯函数层拿不到 EvalSet.family）
    retirementCandidates: retirementCandidates(surfaces),
    classAttribution: attribution.rows,
    seesawSuspected: attribution.seesawSuspected,
  }
}

// ---- 冠军退役候选（2026-10-23 挂账清偿 G4，腾讯文误区九「拆墙」侧）----
// 语义：时间线上「采纳时增益 ≤0 且相对前一轮变贵」的冠军轮，且其后 ≥minRoundsSince
// 个已采纳轮未被回滚纠正——当年加的控制如今只在花线，值得人复核是否拆除。
// advisory：零增益可能是守卫在起作用，不自动回滚不硬拦；缺读数如实 null。

export const RETIREMENT_MIN_ROUNDS_SINCE = 2

export function retirementCandidates(
  surfaces: EvolutionSurface[],
  minRoundsSince: number = RETIREMENT_MIN_ROUNDS_SINCE,
): RetirementCandidate[] {
  const out: RetirementCandidate[] = []
  for (const s of surfaces) {
    const live = s.timeline.filter((r) => !r.rolledBack)
    for (let i = 0; i < live.length; i += 1) {
      const r = live[i]
      if (r.passAt1Delta == null || r.passAt1Delta > 0) continue
      const prev = i > 0 ? live[i - 1] : null
      const pct = (a: number | null, b: number | null): number | null =>
        a == null || b == null || a === 0 ? null : (b - a) / a
      const costDeltaPct = prev ? pct(prev.costUsd, r.costUsd) : null
      const tokenDeltaPct = prev ? pct(prev.tokens, r.tokens) : null
      const pricier = (costDeltaPct ?? 0) > 0 || (costDeltaPct == null && (tokenDeltaPct ?? 0) > 0)
      if (!pricier) continue
      const roundsSince = live.length - (i + 1)
      if (roundsSince < minRoundsSince) continue
      out.push({
        surfaceKey: s.surfaceKey,
        round: r.round,
        proposalId: r.proposalId,
        variantLabel: r.variantLabel,
        passAt1Delta: r.passAt1Delta,
        costDeltaPct: costDeltaPct == null ? null : Number(costDeltaPct.toFixed(3)),
        tokenDeltaPct: tokenDeltaPct == null ? null : Number(tokenDeltaPct.toFixed(3)),
        roundsSince,
      })
    }
  }
  return out
}
