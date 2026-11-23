// overlay/custom/server/harness/workbench/loop-theory.ts
// RSI 数学诊断（2026-11-23 吸收轮；来源《RSI 递归自我改进原理与公式推导详解：
// 从改进系统到改进改进者》青稞AI，正文级提取 MathJax 公式）。
//
// 三个读数对应原文三条结论，全部只读、不改晋级判定、不加门码
// （遵守 2026-11-01「机制扩展停止」裁定）：
//   ① 固定改进器在收缩假设下收益几何衰减（原文 §1.3：|Δ_t| ≤ γ^t(1+γ)|J(S_0)−J(S*)|）。
//      衰减到噪声带即到顶——突破封顶只能换改进器 U（元改进），继续打磨同一产物是白费。
//   ② 多候选择优是带噪声的最大值选择（原文 §4.1：E[J(a*)] = E[Ĵ(a*)] − E[ε(a*)]）。
//      池越大越容易选中「误差恰好为正」的幸运儿，评估误差不随候选变多而摊薄。
//   ③ 代理分与真实读数会背离（原文 §4.2：73.8% KernelBench / 46.8% ALE-Bench 的
//      代理提升未转化为真实目标）。连续两轮「代理涨、真实不动或跌」即过拟合倾向。
//
// 纪律：缺数据返回 null 并写明缺口，不猜；留出缺口混有分布迁移，不宣称为纯选择偏差。
import type {
  CeilingSignal,
  Champion,
  DecayAudit,
  DecayClass,
  EvolutionSurface,
  Proposal,
  ProxyDivergenceAudit,
  RsiTheoryReport,
  SelectionBiasAudit,
} from './types'

/** 标准正态 CDF（Abramowitz–Stegun 7.1.26 的 erf 近似，最大误差 1.5e-7）。 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

const maxZCache = new Map<number, number>()

/**
 * k 个独立标准正态变量的最大值期望 E[max(Z_1..Z_k)]。
 * 原文未给闭式，这里按 E[max] = ∫_0^∞ [1 − Φ(t)^k − Φ(−t)^k] dt 做定步长 Simpson
 * （步长 0.005、上限 10，误差远小于诊断所需精度）。k=2 的解析值 1/√π≈0.56419 由测试锁定。
 */
export function expectedMaxZ(k: number): number {
  const n = Math.floor(k)
  if (!Number.isFinite(n) || n <= 1) return 0
  const hit = maxZCache.get(n)
  if (hit != null) return hit
  const STEP = 0.005
  const LIMIT = 10
  const steps = Math.round(LIMIT / STEP)
  let sum = 0
  for (let i = 0; i <= steps; i += 1) {
    const t = i * STEP
    const p = normalCdf(t)
    const q = normalCdf(-t)
    const f = 1 - Math.pow(p, n) - Math.pow(q, n)
    const w = i === 0 || i === steps ? 1 : i % 2 === 0 ? 2 : 4
    sum += w * f
  }
  const value = (sum * STEP) / 3
  maxZCache.set(n, value)
  return value
}

// ---------------------------------------------------------------------------
// ① 选择偏差（原文 §4.1）
// ---------------------------------------------------------------------------

export interface SelectionBiasInput {
  /** 同一轮各候选的演化集读数（通常为 pass@1）；null/非有限值剔除。 */
  scores: Array<number | null | undefined>
  /** 调用方显式提供的单次读数噪声 σ；缺省不算期望乐观值（不把半极差硬当 σ）。 */
  sigma?: number | null
  /** 本仓噪声带 δ（半极差标定），用于「间隔落在噪声带内」与留出缺口阈值。 */
  noiseDelta?: number | null
  /** 密封留出集读数（选中候选）；与池内最优之差即可测的乐观缺口。 */
  heldoutPassRate?: number | null
}

export function selectionBiasAudit(input: SelectionBiasInput): SelectionBiasAudit {
  const scores = input.scores
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => b - a)
  const poolSize = scores.length
  const empty: SelectionBiasAudit = {
    poolSize,
    best: null,
    runnerUp: null,
    gap: null,
    expectedOptimismZ: null,
    expectedOptimism: null,
    adjustedBest: null,
    realizedGap: null,
    verdict: 'insufficient',
    note: '没有可用的演化集读数：选择偏差无从计算（不猜）',
  }
  if (poolSize === 0) return empty
  const best = scores[0]
  const runnerUp = poolSize > 1 ? scores[1] : null
  const gap = runnerUp == null ? null : Number((best - runnerUp).toFixed(6))
  const sigma = typeof input.sigma === 'number' && Number.isFinite(input.sigma) && input.sigma > 0 ? input.sigma : null
  const z = sigma != null ? expectedMaxZ(poolSize) : null
  const expectedOptimism = sigma != null && z != null ? Number((sigma * z).toFixed(6)) : null
  const adjustedBest = expectedOptimism != null ? Number((best - expectedOptimism).toFixed(6)) : null
  const noiseDelta =
    typeof input.noiseDelta === 'number' && Number.isFinite(input.noiseDelta) && input.noiseDelta >= 0 ? input.noiseDelta : null
  const heldout =
    typeof input.heldoutPassRate === 'number' && Number.isFinite(input.heldoutPassRate) ? input.heldoutPassRate : null
  const realizedGap = heldout != null ? Number((best - heldout).toFixed(6)) : null

  const base = { ...empty, poolSize, best, runnerUp, gap, expectedOptimismZ: z, expectedOptimism, adjustedBest, realizedGap }
  if (poolSize === 1) {
    return { ...base, verdict: 'single_candidate', note: '只有一个候选：不存在池内选择偏差（单候选的增益仍受留出/噪声门约束）' }
  }
  if (realizedGap != null) {
    if (realizedGap <= 0) {
      return {
        ...base,
        verdict: 'heldout_confirms',
        note: `池内最优 ${fmtPct(best)} 不高于留出 ${fmtPct(heldout as number)}：留出读数确认了选择（缺口 ${fmtPct(realizedGap)}）`,
      }
    }
    if (noiseDelta != null && realizedGap <= noiseDelta) {
      return {
        ...base,
        verdict: 'heldout_within_noise',
        note: `最优-留出缺口 ${fmtPct(realizedGap)} 落在噪声带 δ=${fmtPct(noiseDelta)} 内：不能把缺口当真实衰减`,
      }
    }
    return {
      ...base,
      verdict: 'heldout_gap',
      note: `最优-留出缺口 ${fmtPct(realizedGap)}（${poolSize} 候选择优）：含选择乐观与分布迁移两部分，不能当纯因果衰减${
        noiseDelta == null ? '；噪声带未标定，缺口显著性未知' : ''
      }`,
    }
  }
  if (expectedOptimism != null && gap != null && expectedOptimism > gap) {
    return {
      ...base,
      verdict: 'selection_dominated',
      note: `最优-次优间隔 ${fmtPct(gap)} 小于期望选择乐观 ${fmtPct(expectedOptimism)}（σ·E[max Z_${poolSize}]）：领先可能只是噪声`,
    }
  }
  if (noiseDelta != null && gap != null && gap <= noiseDelta) {
    return {
      ...base,
      verdict: 'top2_within_noise',
      note: `最优-次优间隔 ${fmtPct(gap)} 落在噪声带 δ=${fmtPct(noiseDelta)} 内：择优未区分候选；且无留出读数，增益未独立确认`,
    }
  }
  return {
    ...base,
    verdict: 'robust',
    note:
      gap == null
        ? '池内排序可读，但缺留出读数：增益仍未独立确认'
        : `最优-次优间隔 ${fmtPct(gap)} 超过噪声带，池内排序可区分；仍建议用留出读数确认`,
  }
}

// ---------------------------------------------------------------------------
// ② 收缩衰减（原文 §1.3 / §2.3）
// ---------------------------------------------------------------------------

export interface DecayRoundInput {
  round: number
  /** 该轮相对基线的通过率增量；null=无读数。 */
  delta: number | null
  /** 该轮噪声带 δ（未标定 null）。 */
  noiseDelta?: number | null
}

const GEOMETRIC_THRESHOLD = 0.5
const NO_DECAY_THRESHOLD = 0.85

export function decayAudit(rounds: DecayRoundInput[]): DecayAudit {
  const ordered = rounds.slice().sort((a, b) => a.round - b.round)
  const gains: Array<{ delta: number; noiseDelta: number | null }> = []
  let excludedNonPositive = 0
  for (const r of ordered) {
    if (typeof r.delta !== 'number' || !Number.isFinite(r.delta)) continue
    if (r.delta > 0) {
      gains.push({
        delta: r.delta,
        noiseDelta:
          typeof r.noiseDelta === 'number' && Number.isFinite(r.noiseDelta) && r.noiseDelta >= 0 ? r.noiseDelta : null,
      })
    } else {
      excludedNonPositive += 1
    }
  }
  const n = gains.length
  if (n < 3) {
    return {
      rounds: n,
      excludedNonPositive,
      gamma: null,
      r2: null,
      lastGain: n > 0 ? gains[n - 1].delta : null,
      predictedNextGain: null,
      classification: 'insufficient',
      ceiling: 'unknown',
      note: `正增益轮只有 ${n} 轮（至少 3 轮才估 γ）：本轮不下衰减结论${excludedNonPositive > 0 ? `；另有 ${excludedNonPositive} 轮非正增益已剔除` : ''}`,
    }
  }
  const d = gains.map((g) => g.delta)
  let num = 0
  let den = 0
  for (let i = 1; i < n; i += 1) {
    num += d[i] * d[i - 1]
    den += d[i - 1] * d[i - 1]
  }
  const gamma = den > 0 ? num / den : null
  let r2: number | null = null
  if (gamma != null) {
    let sse = 0
    let sst = 0
    for (let i = 1; i < n; i += 1) {
      const pred = gamma * d[i - 1]
      sse += (d[i] - pred) * (d[i] - pred)
      sst += d[i] * d[i]
    }
    r2 = sst > 0 ? 1 - sse / sst : null
  }
  const last = gains[n - 1]
  const predictedNextGain = gamma != null ? Number((gamma * last.delta).toFixed(6)) : null
  const classification: DecayClass =
    gamma == null ? 'insufficient' : gamma < GEOMETRIC_THRESHOLD ? 'geometric_decay' : gamma < NO_DECAY_THRESHOLD ? 'moderate_decay' : 'no_decay'
  let ceiling: CeilingSignal = 'unknown'
  if (last.noiseDelta != null) {
    if (last.delta <= last.noiseDelta) ceiling = 'reached'
    else if (predictedNextGain != null && predictedNextGain <= last.noiseDelta) ceiling = 'near'
    else ceiling = 'not_reached'
  } else if (gamma != null && gamma < GEOMETRIC_THRESHOLD) {
    ceiling = 'near'
  }
  const parts: string[] = []
  if (gamma != null) parts.push(`γ̂=${gamma.toFixed(3)}（${n} 个正增益轮）`)
  if (predictedNextGain != null) parts.push(`下一轮增益估计 ${fmtPct(predictedNextGain)}`)
  if (ceiling === 'reached') parts.push('已到噪声带：继续打磨同一产物收益不抵噪声，应改改进器 U（元改进）')
  else if (ceiling === 'near') parts.push('接近封顶：下一轮或落进噪声带，建议准备元改进提案')
  else if (ceiling === 'not_reached') parts.push('尚未到顶：同一改进器仍有空间')
  else parts.push('噪声带未标定：到顶判断留空（不猜）')
  if (excludedNonPositive > 0) parts.push(`${excludedNonPositive} 轮非正增益已剔除，γ 估计偏乐观`)
  if (r2 != null && r2 < 0.5) parts.push(`拟合偏弱（R²=${r2.toFixed(2)}），γ 只作参考`)
  if (gamma != null && gamma > 1) parts.push('γ>1：增益未衰减（噪声或真实 RSI），本轮不下结论')
  return {
    rounds: n,
    excludedNonPositive,
    gamma: gamma != null ? Number(gamma.toFixed(6)) : null,
    r2: r2 != null ? Number(r2.toFixed(6)) : null,
    lastGain: last.delta,
    predictedNextGain,
    classification,
    ceiling,
    note: parts.join('；'),
  }
}

// ---------------------------------------------------------------------------
// ③ 代理-真实背离（原文 §4.2）
// ---------------------------------------------------------------------------

export interface ProxyRoundInput {
  /** 演化集（代理）增量；null=无读数。 */
  proxyDelta: number | null
  /** 留出集（真实）增量；null=无读数。 */
  realizedDelta: number | null
}

export function proxyDivergence(rows: ProxyRoundInput[]): ProxyDivergenceAudit {
  const usable = rows.filter(
    (r): r is { proxyDelta: number; realizedDelta: number } =>
      typeof r.proxyDelta === 'number' &&
      Number.isFinite(r.proxyDelta) &&
      typeof r.realizedDelta === 'number' &&
      Number.isFinite(r.realizedDelta),
  )
  const rounds = usable.length
  if (rounds < 2) {
    return {
      rounds,
      divergingRounds: usable.filter((r) => r.proxyDelta > 0 && r.realizedDelta <= 0).length,
      streak: 0,
      verdict: 'insufficient',
      note: `代理与留出双读数只有 ${rounds} 轮（至少 2 轮才看背离）`,
    }
  }
  const isDiverging = (r: { proxyDelta: number; realizedDelta: number }): boolean => r.proxyDelta > 0 && r.realizedDelta <= 0
  const divergingRounds = usable.filter(isDiverging).length
  let streak = 0
  for (let i = usable.length - 1; i >= 0; i -= 1) {
    if (isDiverging(usable[i])) streak += 1
    else break
  }
  const verdict: ProxyDivergenceAudit['verdict'] = streak >= 2 ? 'diverging' : streak === 1 ? 'watch' : 'none'
  const note =
    verdict === 'diverging'
      ? `连续 ${streak} 轮代理分上涨而留出读数不动或下跌：代理过拟合倾向（原文实证 73.8% KernelBench / 46.8% ALE-Bench 同型）`
      : verdict === 'watch'
        ? '最近一轮代理涨、留出不动或跌：单轮可能是噪声，连续两轮才判倾向'
        : `代理与留出同向或留出更好（${rounds} 轮，背离 ${divergingRounds} 轮）`
  return { rounds, divergingRounds, streak, verdict, note }
}

// ---------------------------------------------------------------------------
// 报告装配
// ---------------------------------------------------------------------------

const SELECTION_AUDIT_LIMIT = 20

/**
 * 从既有工作台账本装配理论诊断。纯读：不写盘、不改任何门禁输入。
 * 选择偏差按「池内最大读数当选中者」计算（与 compose 默认择优一致）；
 * 人工指定非最优候选时，读数只作参考。
 */
export function buildTheoryReport(input: { surfaces: EvolutionSurface[]; proposals: Proposal[]; champions: Champion[] }): RsiTheoryReport {
  const surfaces = input.surfaces.map((s) => ({
    surfaceKey: s.surfaceKey,
    decay: decayAudit(
      s.timeline.map((r) => ({ round: r.round, delta: r.passAt1Delta, noiseDelta: r.noiseDelta })),
    ),
  }))
  const byId = new Map(input.proposals.map((p) => [p.id, p]))
  const proxyRows: ProxyRoundInput[] = []
  for (const c of input.champions.slice().sort((a, b) => (a.promotedAt < b.promotedAt ? -1 : 1))) {
    if (c.rolledBack) continue
    const p = byId.get(c.proposalId)
    if (!p) continue
    const probe = p.probes.find((x) => x.variantId === c.variantId && x.status === 'recorded')
    const proxyDelta = probe?.contrast?.passAt1Delta ?? null
    const heldoutBaseline = probe?.evidence?.heldoutBaselinePassRate ?? null
    const heldout = p.heldout?.passRate ?? null
    proxyRows.push({
      proxyDelta,
      realizedDelta: heldout != null && heldoutBaseline != null ? heldout - heldoutBaseline : null,
    })
  }
  const selectionBias = input.proposals
    .map((p) => {
      const scored = p.probes.filter((x) => x.status === 'recorded' && typeof x.evidence?.passAt1 === 'number')
      // 同一提案里不同评测集的读数不可比：取出现最多的 setId 分组，其余不混入（测试锁定）。
      const bySet = new Map<string, number>()
      for (const probe of scored) {
        const setId = probe.evidence?.setId ?? ''
        bySet.set(setId, (bySet.get(setId) ?? 0) + 1)
      }
      let chosenSet = ''
      let chosenCount = -1
      for (const [setId, count] of bySet) {
        if (count > chosenCount) {
          chosenSet = setId
          chosenCount = count
        }
      }
      const scores = scored
        .filter((x) => (x.evidence?.setId ?? '') === chosenSet)
        .map((x) => x.evidence!.passAt1)
      return { p, scores }
    })
    .filter((x) => x.scores.length >= 2)
    .sort((a, b) => (a.p.updatedAt < b.p.updatedAt ? 1 : -1))
    .slice(0, SELECTION_AUDIT_LIMIT)
    .map(({ p, scores }) => ({
      proposalId: p.id,
      surfaceKey: p.surfaceKey,
      audit: selectionBiasAudit({
        scores,
        noiseDelta: p.noise?.delta ?? null,
        heldoutPassRate: p.heldout?.passRate ?? null,
      }),
    }))
  return {
    surfaces,
    proxyDivergence: proxyDivergence(proxyRows),
    selectionBias,
    note:
      '三项均为只读诊断，不参与 ok/blockers 判定：γ 只取正增益轮（回退轮剔除并计数）；' +
      '选择偏差的「最优-留出缺口」混有分布迁移，不能当纯因果衰减；' +
      '同一提案内跨评测集读数不混用（取众数集合）；' +
      '可学习性奖励 r=1−p 未落地（仓内无任务级难度历史）——见 spec 2026-11-23-rsi-recursive-theory 挂账。',
  }
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}pp`
}

