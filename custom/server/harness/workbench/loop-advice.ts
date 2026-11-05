// 改进闭环建议/泄漏/假设/停滞/进化报告（v0.4 第四批拆分，来自 loop-report）。
// 改进闭环晋级/报告层（v0.4 单文件体量治理：第三批拆分，来自 loop.ts，行为不变）。
// overlay/custom/server/harness/workbench/loop.ts
// 改进闭环的纯函数层：摘要、diff、无真值行为对比、晋级门禁。
// 这里不读盘、不写库，便于单测覆盖全部分支；副作用在 service/apply。
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gainRetention } from './multi-objective'
import { parseHookPolicy } from '../../goalbudget/stage-ladder'
import type {
  BehaviorContrast, Champion, EvolutionReport, EvolutionRound, EvolutionSurface, GateBlocker,
  ParetoPoint, ParetoReport, ParetoTier, ProbeMetrics, PromotionGateReport, Proposal,
  ProposalStatus, QualityVerdict, RegularizationDerived, RetirementCandidate, SurfaceKey, Variant,
} from './types'

import { attributeGain, candidateDiversity, composedVariant, diffSummary, matchAlwaysOn, probeCost, variantSetDigest } from './loop-core'
import type { PromotionGateInput } from './loop-core'

import { rsiConfig } from './loop-config'
import type { RsiConfig } from './loop-config'

export interface ArchiveSteppingStone {
  proposalId: string
  surfaceKey: SurfaceKey
  title: string
  hypothesis: string
  status: ProposalStatus
  /** 该提案全部已记录探测的最高 passAt1（无探测=null）。 */
  bestPassAt1: number | null
  /** 选中候选相对基线的 passAt1 差（无读数=null）。 */
  bestDelta: number | null
  updatedAt: string
}

export function proposalArchive(
  proposals: Proposal[],
  surfaceKey?: SurfaceKey,
): ArchiveSteppingStone[] {
  return proposals
    .filter((p) => (p.status === 'rejected' || p.status === 'rolled_back')
      && (!surfaceKey || p.surfaceKey === surfaceKey))
    .map((p) => {
      const selected = composedVariant(p)
      const recorded = selected
        ? p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded' && x.evidence)
        : undefined
      const deltas = p.probes
        .filter((x) => x.status === 'recorded' && x.evidence?.passAt1 != null && p.baseline?.passAt1 != null)
        .map((x) => (x.evidence!.passAt1 as number) - (p.baseline!.passAt1 as number))
      return {
        proposalId: p.id,
        surfaceKey: p.surfaceKey,
        title: p.title,
        hypothesis: p.hypothesis,
        status: p.status,
        bestPassAt1: recorded?.evidence?.passAt1 ?? null,
        bestDelta: deltas.length > 0 ? Math.max(...deltas) : null,
        updatedAt: p.updatedAt,
      }
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/** 论文退火编辑预算：b_t = ⌈b_min + (b_max−b_min)·½(1+cos(πt/T))⌉；t≥T 后恒为 b_min。 */
export function annealedEditBudget(t: number, cfg: RsiConfig = rsiConfig()): number {
  const round = Math.max(0, Math.trunc(t))
  if (round >= cfg.horizon) return cfg.bMin
  const value = cfg.bMin + (cfg.bMax - cfg.bMin) * 0.5 * (1 + Math.cos((Math.PI * round) / cfg.horizon))
  return Math.max(cfg.bMin, Math.min(cfg.bMax, Math.ceil(value)))
}

/** 论文轮次 t：该面已被采纳的轮数（未回滚冠军数；回滚=这轮没发生）。 */
export function surfaceRound(champions: Champion[], surfaceKey: SurfaceKey): number {
  return champions.filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack).length
}

// ---- 泄漏批评者（S1）：评测前读 diff，拒绝携带评测集特化内容 ----

export interface LeakageSetLike {
  id: string
  tasks: Array<{ id: string; problem?: string; expectedBehavior?: string; rubric?: Array<{ text?: string }> }>
}

export type LeakageKind = 'task_id' | 'assertion_text' | 'reference' | 'problem'

export interface LeakageFinding {
  kind: LeakageKind
  /** 命中的评测集内容（长文本截断呈现）。 */
  needle: string
  /** 命中位置（候选标签/文件路径）。 */
  where: string
}

const LEAK_MIN_TASK_ID_LEN = 6
/** 文本针最小信息量：拉丁字符计 1、CJK 字符计 1.5（中文信息密度高，12 字已足够特化）。 */
const LEAK_MIN_TEXT_WEIGHT = 16
const LEAK_MAX_FINDINGS = 20

function textWeight(text: string): number {
  let w = 0
  for (const ch of text) w += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1.5 : 1
  return w
}

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 确定性泄漏扫描（论文 critic 是 LLM 读 diff；本仓映射为可解释的子串扫描）：
 * 候选内容/路径中出现评测集任务 id、断言文本、参照答案、题干 → 泄漏。
 * 泛化性提示词/工具改进不会命中；转述式泄漏检测不到（如实标注为局限）。
 */
export function findBenchmarkLeakage(
  parts: Array<{ where: string; content: string }>,
  set: LeakageSetLike | null | undefined,
): LeakageFinding[] {
  if (!set) return []
  const needles: Array<{ needle: string; kind: LeakageKind }> = []
  for (const task of set.tasks ?? []) {
    if (task.id && task.id.trim().length >= LEAK_MIN_TASK_ID_LEN) needles.push({ needle: task.id.trim(), kind: 'task_id' })
    const addText = (raw: string | undefined, kind: LeakageKind): void => {
      const text = (raw ?? '').trim()
      if (text && textWeight(text) >= LEAK_MIN_TEXT_WEIGHT) needles.push({ needle: text, kind })
    }
    addText(task.problem, 'problem')
    addText(task.expectedBehavior, 'reference')
    for (const a of task.rubric ?? []) addText(a.text, 'assertion_text')
  }
  const findings: LeakageFinding[] = []
  for (const part of parts ?? []) {
    const body = String(part.content ?? '')
    if (!body) continue
    for (const { needle, kind } of needles) {
      if (body.includes(needle)) {
        findings.push({ kind, needle: clip(needle), where: part.where })
        if (findings.length >= LEAK_MAX_FINDINGS) return findings
      }
    }
  }
  return findings
}

export function leakageBlockers(findings: LeakageFinding[]): GateBlocker[] {
  const zh: Record<LeakageKind, string> = {
    task_id: '评测任务 ID',
    assertion_text: '评测断言原文',
    reference: '评测参照答案',
    problem: '评测题干原文',
  }
  return findings.map((f) => ({
    code: 'benchmark_leakage',
    message: `候选携带${zh[f.kind]}（${f.where}：「${f.needle}」）——这是 benchmark 特化而非通用改进（RRSI 泄漏批评者）`,
  }))
}

// ---- 历史证据表（P2）：失败假设不复提 ----

/** 词面相似度：拉丁词（≥2 字符）+ CJK 字符 bigram 的 Jaccard。 */
export function hypothesisSimilarity(a: string, b: string): number {
  const ta = hypothesisTokens(a)
  const tb = hypothesisTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : inter / union
}

function hypothesisTokens(s: string): Set<string> {
  const norm = String(s ?? '').toLowerCase()
  const tokens = new Set<string>()
  for (const w of norm.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (/[a-z0-9]/.test(w) && w.length >= 2) tokens.add(w)
  }
  const cjkSegments = norm.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const seg of cjkSegments) {
    for (let i = 0; i + 1 < seg.length; i += 1) tokens.add(seg.slice(i, i + 2))
  }
  return tokens
}

export const HYPOTHESIS_RETRY_THRESHOLD = 0.6

/** 同面历史失败假设（rejected/rolled_back）中与当前假设词面高度相似者。 */
export function hypothesisRetries(
  proposals: Proposal[],
  surfaceKey: SurfaceKey,
  currentProposalId: string,
  hypothesis: string,
  threshold: number = HYPOTHESIS_RETRY_THRESHOLD,
): RegularizationDerived['hypothesisRetry'] {
  return proposals
    .filter((p) => p.surfaceKey === surfaceKey && p.id !== currentProposalId
      && (p.status === 'rejected' || p.status === 'rolled_back'))
    .map((p) => ({ p, similarity: hypothesisSimilarity(hypothesis, p.hypothesis) }))
    .filter((x) => x.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map((x) => ({ proposalId: x.p.id, title: x.p.title, status: x.p.status, similarity: Number(x.similarity.toFixed(2)) }))
}

// ---- 停滞探测（P3）与剪枝信号（S4） ----

/** 最近 stallWindow 个提案均未被采纳（promoted 且未回滚才算采纳）→ 停滞。 */
export function stallDetection(surfaceProposals: Proposal[], stallWindow: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  if (sorted.length < stallWindow) return false
  const recent = sorted.slice(-stallWindow)
  return recent.every((p) => p.status !== 'promoted')
}

/** 最近 pruneN 个提案的全部已记录探测中，最大通过率增量 ≤0 → 该面建议做减法提案。 */
export function pruneSignal(surfaceProposals: Proposal[], pruneN: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const recent = sorted.slice(-pruneN)
  const deltas: number[] = []
  for (const p of recent) {
    for (const probe of p.probes) {
      if (probe.status === 'recorded' && probe.contrast?.passAt1Delta != null) {
        deltas.push(probe.contrast.passAt1Delta)
      }
    }
  }
  return deltas.length > 0 && Math.max(...deltas) <= 0
}

// ---- R12a（2026-10-31 首批执行）：验证信号分级（验证层级理论 arXiv 2607.07663） ----

export type VerificationTier = 'command' | 'heldout' | 'regression' | 'judge' | 'none'

const TIER_ORDER: Record<VerificationTier, number> = { command: 4, heldout: 3, regression: 2, judge: 1, none: 0 }

/**
 * 从提案的探测证据推导本次晋级实际用到的最强验证层：
 * command（命令式验收器运行）> heldout（密封留出，R6 后接）> regression（普通 eval 回归）> judge（LLM 判分主导）> none。
 * 依据：改进强度与验证信号强度绑定（2607.07663）——面板须显式区分，弱层连续晋级是进化健康度信号。
 */
export function verificationTierOf(proposal: Proposal): VerificationTier {
  const selected = composedVariant(proposal)
  if (!selected) return 'none'
  const probe = proposal.probes.find((x) => x.variantId === selected.id && x.status === 'recorded' && x.evidence)
  const ev = probe?.evidence
  if (!ev) return 'none'
  const tiers: VerificationTier[] = []
  if (ev.regression != null) {
    // 回归运行含命令式验收器（eval 侧 outcome command 类型）则升 command 层；
    // ProbeMetrics 无该直读位——以 regression 存在为 regression 层，command 层由
    // heldout/command 专用证据位判定（R6 落地后 heldout 进位）。
    tiers.push('regression')
  }
  if (ev.heldout != null) tiers.push('heldout')
  // 判分主导＝无回归/留出硬证据而 judgeOnline（LLM 判分参与）
  if (tiers.length === 0 && ev.judgeOnline) tiers.push('judge')
  if (tiers.length === 0) tiers.push('none')
  return tiers.sort((a, b) => TIER_ORDER[b] - TIER_ORDER[a])[0]
}

export function tierAtLeast(tier: VerificationTier, floor: VerificationTier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[floor]
}

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

// =====================================================================================
// HarnessPro 帕累托三档选拔纯函数层（2026-10-23 吸收轮）
// 论文 arXiv 2610.26770：淘汰帕累托劣势候选（花钱更多、分还更低），Lite（省钱）/
// Medium（均衡）/Heavy（高性能）三档代表沿性能-成本前沿保留。权重为本仓实例化
// （论文未公开公式细节，spec 决策记录标注）；全部无副作用，单测覆盖全分支。
// =====================================================================================

