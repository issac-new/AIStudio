// overlay/harness/workbench：多目标演化（Harmony Harness 吸收轮 2026-11-03）。
//
// 论文《Harmony Harness: Multi-Objective Self-Evolution of Agent Harnesses》（arXiv 2610.15150）
// 的核心不是「再加一个奖励项」，而是**分解**：把目标空间用一组权重向量切成 N 个子问题，
// 每个子问题维护一个代表解，用加权 Tchebycheff 打分
//   score_i = max_k( w_ik * |f_k - ideal_k| )
// 因为取最大项，每个子问题始终盯住自己那一侧欠得最多的目标，不会出现「这边涨一点那边掉一点、
// 总分持平就停下」。多样性也由构造保证：每个代表解被保留的理由只有一条——它对应一个不同的偏好。
//
// 论文同时给了两条负面结论，直接影响本仓设计：
//   ① 接受规则只读优化集反馈必被刷（其失败案例：功能不降就收 → 演化集 100/100/100，代码实际不安全）；
//   ② 结构距离类多样性指标只能当监测、不能当优化目标（代码距离与目标空间距离相关 +0.030，
//      且任何改文本的算子都能把它刷高）。忠实度量要比较行为（通过模式/工具轨迹）。
//
// 本模块只做纯函数：读既有读数（passAt1/成本/安全读数/留出读数），不写盘不跑模型。

export interface ObjectivePoint {
  variantId: string
  label: string
  /** 目标 1：质量（passAt1）。 */
  quality: number
  /** 目标 2：经济性（成本，越低越好；内部按 1 - 归一化成本 转为越大越好）。 */
  costUsd: number
  /** 目标 3：安全（可选；来自安全类基准的独立读数，缺席则退化为双目标）。 */
  safety: number | null
}

export interface SubproblemReport {
  /** 权重向量（quality, economy, safety）；和恒为 1。 */
  weights: { quality: number; economy: number; safety: number }
  representative: { variantId: string; label: string; score: number } | null
}

export interface SearchReport {
  /** 参与分解的候选数（读数不全的被排除，见 excluded）。 */
  eligible: number
  excluded: Array<{ variantId: string; label: string; reason: string }>
  objectives: string[]
  /** 理想点（各目标历史最好值）。 */
  ideal: { quality: number; economy: number; safety: number | null }
  subproblems: SubproblemReport[]
  /** 三目标（或双目标）互不支配集合。 */
  frontier: string[]
  note: string
}

/** 默认子问题数：论文 SecRepoBench 用 5，BaxBench 用 10；本仓候选通常 ≤5，取 5。 */
export const DEFAULT_SUBPROBLEMS = 5

/**
 * 权重向量生成（单纯形格点，和为 1）：
 * 双目标 → 均匀分布 k 个；三目标 → 按最大余数法均匀铺 n 个点（够用即可，不追求均匀设计）。
 */
export function weightVectors(n: number, dims: 2 | 3): Array<{ quality: number; economy: number; safety: number }> {
  const k = Math.max(1, Math.trunc(n))
  const out: Array<{ quality: number; economy: number; safety: number }> = []
  if (dims === 2) {
    for (let i = 0; i < k; i += 1) {
      const t = k === 1 ? 0.5 : i / (k - 1)
      out.push({ quality: Number(t.toFixed(4)), economy: Number((1 - t).toFixed(4)), safety: 0 })
    }
    return out
  }
  // 三目标：沿 quality 与 safety 两个方向铺格点，economy 取剩余
  const steps = Math.max(1, Math.ceil(Math.sqrt(k)))
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const q = (i + 0.5) / steps
      const s = (j + 0.5) / steps
      if (q + s > 1) continue
      out.push({
        quality: Number(q.toFixed(4)),
        economy: Number((1 - q - s).toFixed(4)),
        safety: Number(s.toFixed(4)),
      })
    }
  }
  return out.slice(0, Math.max(k, 1))
}

function norm(v: number, min: number, max: number): number {
  return max > min ? (v - min) / (max - min) : 1
}

/**
 * 加权 Tchebycheff：返回「离理想点最远的那一维权重差距」。
 * 分数越小越好；ideal 为该目标见过的历史最好值（越大越好，成本已翻转）。
 */
export function tchebycheff(
  point: { quality: number; economy: number; safety: number | null },
  weights: { quality: number; economy: number; safety: number },
  ideal: { quality: number; economy: number; safety: number | null },
): number {
  const gaps: number[] = [weights.quality * Math.abs(ideal.quality - point.quality) * 100]
  gaps.push(weights.economy * Math.abs(ideal.economy - point.economy) * 100)
  if (point.safety != null && ideal.safety != null && weights.safety > 0) {
    gaps.push(weights.safety * Math.abs(ideal.safety - point.safety) * 100)
  }
  return Number(Math.max(...gaps).toFixed(4))
}

/** 从提案读数取点；读数不全（无 passAt1 或无成本）的候选被排除并说明。 */
export function objectivePointsOf(proposal: {
  variants: Array<{ id: string; label?: string }>
  probes: Array<{ variantId: string; status: string; evidence?: { passAt1: number | null; costUsd: number | null } | null }>
}): { points: ObjectivePoint[]; excluded: SearchReport['excluded'] } {
  const points: ObjectivePoint[] = []
  const excluded: SearchReport['excluded'] = []
  for (const v of proposal.variants) {
    const probe = proposal.probes.find((p) => p.variantId === v.id && p.status === 'recorded')
    const ev = probe?.evidence
    const label = v.label ?? v.id
    if (!ev || typeof ev.passAt1 !== 'number' || !Number.isFinite(ev.passAt1)) {
      excluded.push({ variantId: v.id, label, reason: '缺少真实通过率读数' })
      continue
    }
    if (typeof ev.costUsd !== 'number' || !Number.isFinite(ev.costUsd)) {
      excluded.push({ variantId: v.id, label, reason: '缺少成本读数' })
      continue
    }
    const rawSafety = (ev as unknown as { safetyRate?: number | null }).safetyRate
    const safety = typeof rawSafety === 'number' && Number.isFinite(rawSafety) ? rawSafety : null
    points.push({ variantId: v.id, label, quality: ev.passAt1, costUsd: ev.costUsd, safety })
  }
  return { points, excluded }
}

/** 两个点是否互不支配（三目标；safety 为 null 时只比两目标）。 */
export function nonDominated(points: ObjectivePoint[]): string[] {
  const mins = points.map((p) => p.costUsd)
  const costMin = Math.min(...mins)
  const costMax = Math.max(...mins)
  const econ = (p: ObjectivePoint) => 1 - norm(p.costUsd, costMin, costMax)
  const better = (a: ObjectivePoint, b: ObjectivePoint): boolean => {
    const ge = a.quality >= b.quality && econ(a) >= econ(b) && (a.safety == null || b.safety == null || a.safety >= b.safety)
    const gt = a.quality > b.quality || econ(a) > econ(b) || (a.safety != null && b.safety != null && a.safety > b.safety)
    return ge && gt
  }
  return points
    .filter((p) => !points.some((o) => o !== p && better(o, p)))
    .map((p) => p.variantId)
}

/**
 * 分解搜索报告（论文主算法的本仓最小实现）：
 * 理想点 = 各目标历史最好值；每个权重子问题取 Tchebycheff 最小的代表解。
 * 只出报告不改裁决——晋级仍由 gate 决定（避免「代表解」被误读成「可自动上线」）。
 */
export function decomposeSearch(points: ObjectivePoint[], subproblems = DEFAULT_SUBPROBLEMS): SearchReport {
  if (points.length === 0) {
    return {
      eligible: 0,
      excluded: [],
      objectives: ['quality', 'economy'],
      ideal: { quality: 0, economy: 0, safety: null },
      subproblems: [],
      frontier: [],
      note: '无可用读数：不给分解结论（缺证据不猜）',
    }
  }
  const hasSafety = points.some((p) => p.safety != null)
  const costMin = Math.min(...points.map((p) => p.costUsd))
  const costMax = Math.max(...points.map((p) => p.costUsd))
  const ideal = {
    quality: Math.max(...points.map((p) => p.quality)),
    economy: Math.max(...points.map((p) => 1 - norm(p.costUsd, costMin, costMax))),
    safety: hasSafety ? Math.max(...points.map((p) => p.safety ?? 0)) : null,
  }
  const dims: 2 | 3 = hasSafety ? 3 : 2
  const vectors = weightVectors(subproblems, dims)
  const subs: SubproblemReport[] = vectors.map((w) => {
    let best: { variantId: string; label: string; score: number } | null = null
    for (const p of points) {
      const score = tchebycheff(
        { quality: p.quality, economy: 1 - norm(p.costUsd, costMin, costMax), safety: p.safety },
        w,
        ideal,
      )
      if (!best || score < best.score) best = { variantId: p.variantId, label: p.label, score }
    }
    return { weights: w, representative: best }
  })
  const frontier = nonDominated(points)
  return {
    eligible: points.length,
    excluded: [],
    objectives: hasSafety ? ['quality', 'economy', 'safety'] : ['quality', 'economy'],
    ideal,
    subproblems: subs,
    frontier,
    note: hasSafety
      ? '三目标分解（质量/经济/安全）：每个子问题一个代表解，多样性由偏好差异保证；只呈现搜索结构，不代表可上线'
      : '双目标分解（质量/经济）：安全读数缺席时退化为双目标，不猜安全值',
  }
}

/**
 * 增益保留率（论文 headline 指标）：换分布后还留住多少演化增益。
 *   evolveGain  = passAt1 − 演化集基线
 *   heldoutGain = 留出集读数 − 留出集基线
 *   retention   = heldoutGain / evolveGain（evolveGain ≤ 0 时不下结论）
 * 任一基线缺失 → 返回 null 并说明（本仓留出集基线通常需评测方回填，缺就不给数）。
 */
export function gainRetention(input: {
  passAt1: number | null
  baselinePassAt1: number | null
  heldoutPassRate: number | null
  heldoutBaselinePassRate: number | null
}): { evolveGain: number | null; heldoutGain: number | null; retention: number | null; verdict: string } {
  const { passAt1, baselinePassAt1, heldoutPassRate, heldoutBaselinePassRate } = input
  if (passAt1 == null || baselinePassAt1 == null) {
    return { evolveGain: null, heldoutGain: null, retention: null, verdict: '演化集增益无法计算（缺通过率或基线）' }
  }
  const evolveGain = Number((passAt1 - baselinePassAt1).toFixed(4))
  if (heldoutPassRate == null || heldoutBaselinePassRate == null) {
    return { evolveGain, heldoutGain: null, retention: null, verdict: '留出集增益无法计算（缺留出读数或留出基线）——不猜保留率' }
  }
  const heldoutGain = Number((heldoutPassRate - heldoutBaselinePassRate).toFixed(4))
  if (evolveGain <= 0) {
    return { evolveGain, heldoutGain, retention: null, verdict: '演化集本身无增益，保留率无意义' }
  }
  const retention = Number((heldoutGain / evolveGain).toFixed(4))
  const verdict =
    retention >= 0.5
      ? `保留率 ${(retention * 100).toFixed(0)}%：换分布后仍留住一半以上增益`
      : retention >= 0.3
        ? `保留率 ${(retention * 100).toFixed(0)}%：换分布后增益明显缩水`
        : `保留率 ${(retention * 100).toFixed(0)}%：增益基本没留住（论文口径：<30% 视为未迁移）`
  return { evolveGain, heldoutGain, retention, verdict }
}

/**
 * 行为多样性诊断（**监测用，禁止当优化目标**）：
 * 论文实测结构距离与目标空间距离相关仅 +0.030，且任何改文本的算子都能刷高。
 * 本函数按行集合 Jaccard 距离给出均值与最近邻距离——与论文同一诊断口径，
 * 结论只用于「是不是所有候选都挤在一起」的观察，不参与任何门禁。
 */
export function behavioralDiversity(contents: string[]): {
  n: number
  meanDistance: number | null
  nearestNeighborDistance: number | null
  note: string
} {
  const sets = contents
    .filter((c) => typeof c === 'string' && c.trim().length > 0)
    .map((c) => new Set(c.split('\n').map((l) => l.trim()).filter(Boolean)))
  const n = sets.length
  const note = '结构/文本距离只能当监测：与目标空间相关性极低且可被改写刷高；忠实度量需比较行为（通过模式/工具轨迹）'
  if (n < 2) return { n, meanDistance: null, nearestNeighborDistance: null, note }
  const dist = (a: Set<string>, b: Set<string>): number => {
    let inter = 0
    for (const x of a) if (b.has(x)) inter += 1
    const union = a.size + b.size - inter
    return union === 0 ? 0 : 1 - inter / union
  }
  let sum = 0
  let pairs = 0
  const nn: number[] = []
  for (let i = 0; i < n; i += 1) {
    let best = Infinity
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue
      const d = dist(sets[i], sets[j])
      sum += d
      pairs += 1
      if (d < best) best = d
    }
    if (Number.isFinite(best)) nn.push(best)
  }
  return {
    n,
    meanDistance: pairs > 0 ? Number((sum / pairs).toFixed(4)) : null,
    nearestNeighborDistance: nn.length ? Number((nn.reduce((a, b) => a + b, 0) / nn.length).toFixed(4)) : null,
    note,
  }
}
