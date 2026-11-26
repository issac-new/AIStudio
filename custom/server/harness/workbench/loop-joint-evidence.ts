// overlay/custom/server/harness/workbench/loop-joint-evidence.ts
// 后继轨迹联合判定（2026-11-26 可信 RSI 正文级吸收轮）。
//
// 出处：《Trustworthy Recursive Self-Improvement in the Era of Large Models》（arXiv 2610.35193v1）
//   · §7.2（p46-47）：后继序列保留失败分支，逐个版本评估，不只看终点；
//   · §7.3（p48-49）：联合判定＝每个评估点上全部必需要求都成立，中间任一代不满足，
//     首末两代达标也不算；证据不全的联合评估标为「未评估」；
//   · §7.3（p47）、§3.3.3（p20）：评估器变更后，对同一批冻结快照重评才恢复可比；
//   · §5.3.4（p34）、§8.2.3（p52）：回滚要到达派生物，区分只清源头与源头加后代一起清。
//
// 三条纪律：
//   ① 只读诊断，不改晋级判定，不加门码（2026-11-01 机制扩展停止裁定）；
//   ② 三个角色里「未评估」是一等结论——缺证据不按通过算；
//   ③ 评估条件缺指纹按无法比较处理，不按相同。
import { composedVariant } from './loop-core'
import type { ComponentEntry } from './component-library'
import type {
  BehaviorContrast, Champion, EvaluatorChange, EvaluatorDriftAudit, EvaluatorFingerprint, EvolutionSurface, ProbeMetrics,
  Proposal, RollbackResidueAudit, RollbackResidueRow, SuccessorStep, SurfaceKey, TrajectoryAudit, TrajectoryCellStatus,
  TrajectoryFirstHit, TrajectoryReport, TrustRole,
} from './types'

/** 三个分析角色（综述表 3）：互补，不是改进流程的三个阶段。 */
export const TRUST_ROLES: readonly TrustRole[] = ['improvement_validity', 'constraint_preservation', 'effective_oversight']

export const TRUST_ROLE_LABELS: Record<TrustRole, string> = {
  improvement_validity: '改进有效性',
  constraint_preservation: '约束保持',
  effective_oversight: '有效监督',
}

export interface SuccessorMark {
  proposalId: string
  promotedAt: string
  rolledBack: boolean
}

/**
 * 某面的全部后继：现存冠军 ＋ 已回滚的提案。
 * 回滚实现会删掉冠军记录，所以已回滚的后继只能从提案的晋级记录恢复；两类来源按提案号去重。
 */
export function successorMarks(surfaceKey: SurfaceKey, proposals: Proposal[], champions: Champion[]): SuccessorMark[] {
  const marks: SuccessorMark[] = []
  const seen = new Set<string>()
  for (const c of champions) {
    if (c.surfaceKey !== surfaceKey) continue
    marks.push({ proposalId: c.proposalId, promotedAt: c.promotedAt, rolledBack: c.rolledBack === true })
    seen.add(c.proposalId)
  }
  for (const p of proposals) {
    if (p.surfaceKey !== surfaceKey || p.status !== 'rolled_back' || !p.promotion || seen.has(p.id)) continue
    marks.push({ proposalId: p.id, promotedAt: p.promotion.at, rolledBack: true })
    seen.add(p.id)
  }
  return marks.sort((a, b) =>
    a.promotedAt < b.promotedAt ? -1 : a.promotedAt > b.promotedAt ? 1 : a.proposalId < b.proposalId ? -1 : a.proposalId > b.proposalId ? 1 : 0,
  )
}

interface SuccessorEvidence {
  evidence: ProbeMetrics
  contrast: BehaviorContrast | null
}

/** 被组合选中的那次已记录探测；没有选中候选或没有证据时为 null。 */
function evidenceOf(p: Proposal | undefined): SuccessorEvidence | null {
  if (!p) return null
  const selected = composedVariant(p)
  const probe = selected ? p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded') : undefined
  if (!probe?.evidence) return null
  return { evidence: probe.evidence, contrast: probe.contrast ?? null }
}

interface Cell {
  status: TrajectoryCellStatus
  reason: string
}

const pass = (reason: string): Cell => ({ status: 'pass', reason })
const fail = (reason: string): Cell => ({ status: 'fail', reason })
const unevaluated = (reason: string): Cell => ({ status: 'not_evaluated', reason })

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

/**
 * 改进有效性（综述 §3）：被采纳的修改是否站得住、是否有独立读数。
 * 通过要求独立留出集读数未低于基线；只有演化集读数的后继按未评估计。
 */
function validityCell(p: Proposal | undefined, rolledBack: boolean, rollbackReason: string | null): Cell {
  if (rolledBack) return fail(`已回滚：${rollbackReason?.trim() || '未写原因'}。被采纳的修改没有站住`)
  if (!p) return unevaluated('提案记录缺失')
  const ev = evidenceOf(p)
  if (!ev) return unevaluated('没有已记录的探测证据')
  const { evidence, contrast } = ev
  if (evidence.riskVeto) return fail('评测判定风险否决')
  if (contrast?.quality === 'regressed') {
    return fail(`质量判定为退化${contrast.reasons.length > 0 ? `（${contrast.reasons[0].slice(0, 80)}）` : ''}`)
  }
  const regFailed = evidence.regression?.failed ?? 0
  if (regFailed > 0) return fail(`回归样本库 ${regFailed} 项失败（共 ${evidence.regression?.total ?? '?'} 项）`)

  const delta = contrast?.passAt1Delta ?? null
  const noise = p.noise?.delta ?? null
  const base = p.baseline?.passAt1 ?? null
  const heldout = p.heldout?.passRate ?? null
  if (heldout != null && base != null && noise != null && heldout < base - noise) {
    return fail(`留出集通过率 ${pct(heldout)} 低于基线 ${pct(base)} 超出噪声带，增益没有迁移到独立数据`)
  }
  if (delta != null && noise != null && delta < -noise) {
    return fail(`通过率下降 ${pct(-delta)}，超出噪声带`)
  }
  if (heldout == null) return unevaluated('晋级只有演化集读数，没有独立留出集读数')
  if (noise == null || base == null) return unevaluated('有留出集读数，但噪声带或基线读数缺失，无法判断增益是否迁移')
  if (delta != null && delta > noise) {
    return pass(`通过率增益 ${pct(delta)} 超出噪声带，留出集读数 ${pct(heldout)} 未低于基线 ${pct(base)}`)
  }
  return pass(`留出集读数 ${pct(heldout)} 未低于基线 ${pct(base)}；通过率没有超出噪声带的变化${delta != null ? `（增益 ${pct(delta)}）` : ''}`)
}

/**
 * 约束保持（综述 §4、§5 的更新层）：行为约束与安全读数是否仍满足。
 * 证据来自人工记录的约束断言与评测集的安全读数；两者都没有时按未评估计。
 */
function constraintCell(p: Proposal | undefined): Cell {
  if (!p) return unevaluated('提案记录缺失')
  const evidence = evidenceOf(p)?.evidence ?? null
  const fails: string[] = []
  if (evidence?.riskVeto) fails.push('评测判定风险否决')
  const checks = p.constraints?.checks ?? []
  const failedIds = checks.filter((c) => c.status === 'fail').map((c) => c.id)
  if (failedIds.length > 0) fails.push(`约束断言失败：${failedIds.slice(0, 3).join('、')}${failedIds.length > 3 ? ` 等 ${failedIds.length} 项` : ''}`)
  const candidate = evidence?.safetyRate ?? null
  const base = p.baseline?.safetyRate ?? null
  if (candidate != null && base != null && candidate < base) fails.push(`安全读数由 ${pct(base)} 降到 ${pct(candidate)}`)
  if (fails.length > 0) return fail(fails.join('；'))

  const passed = checks.filter((c) => c.status === 'pass').length
  const parts: string[] = []
  if (passed > 0) parts.push(`${passed} 项约束断言通过`)
  if (candidate != null && base != null) parts.push(`安全读数 ${pct(candidate)} 未低于基线 ${pct(base)}`)
  if (parts.length > 0) return pass(parts.join('；'))
  if (checks.length > 0) return unevaluated(`约束断言全部无法判定（${checks.length} 项），也没有可比较的安全读数`)
  return unevaluated('未记录约束断言，也没有可比较的安全读数')
}

/**
 * 有效监督（综述 §6 的更新层）：批准可追溯，且该版本可被撤回。
 * 这是结构检查：有批准留痕，并且没写盘或留有可恢复的快照；回滚效果不在这里实测。
 */
function oversightCell(p: Proposal | undefined, rolledBack: boolean): Cell {
  const promotion = p?.promotion
  if (!promotion) return unevaluated('没有晋级记录')
  const approval = p?.approval
  const reviewed = approval?.decision === 'approved' && approval.actor.trim().length > 0 && approval.at.length > 0
  if (!reviewed) return fail('没有可追溯的批准记录（批准人或批准时刻缺失）')
  const hasSnapshot = (promotion.backupPath ?? '') !== '' || (p?.targetPath != null && p?.base != null)
  if (promotion.applied === true && !hasSnapshot) return fail('已写盘但没有可恢复的快照，回滚到不了这个版本')
  const how = promotion.applied !== true ? '未写盘，只动冠军指针' : (promotion.backupPath ?? '') !== '' ? '写盘前留有快照' : '留有基线快照'
  const rolled = rolledBack && p?.rollback ? `；该版本已被 ${p.rollback.actor} 回滚` : ''
  return pass(`结构检查：批准人 ${approval.actor}，${how}${rolled}。回滚效果未在这里实测`)
}

/** 一个后继在三个角色上的定态。 */
export function successorStep(p: Proposal | undefined, mark: SuccessorMark, round: number): SuccessorStep {
  const cells = {} as Record<TrustRole, TrajectoryCellStatus>
  const reasons = {} as Record<TrustRole, string>
  const put = (role: TrustRole, cell: Cell): void => {
    cells[role] = cell.status
    reasons[role] = cell.reason
  }
  put('improvement_validity', validityCell(p, mark.rolledBack, p?.rollback?.reason ?? null))
  put('constraint_preservation', constraintCell(p))
  put('effective_oversight', oversightCell(p, mark.rolledBack))
  return {
    round,
    proposalId: mark.proposalId,
    promotedAt: mark.promotedAt,
    rolledBack: mark.rolledBack,
    rollbackReason: p?.rollback?.reason ?? null,
    cells,
    reasons,
  }
}

/**
 * 轨迹联合判定：任一后继在任一角色上不满足即不通过；没有不满足但有未评估即未评估；
 * 三个角色在全部后继上都有满足的读数才通过。没有后继时按未评估计。
 */
export function trajectoryAudit(surfaceKey: SurfaceKey, proposals: Proposal[], champions: Champion[]): TrajectoryAudit {
  const byId = new Map(proposals.map((p) => [p.id, p]))
  const marks = successorMarks(surfaceKey, proposals, champions)
  const steps = marks.map((m, idx) => successorStep(byId.get(m.proposalId), m, idx + 1))

  const roleCounts = {} as TrajectoryAudit['roleCounts']
  for (const role of TRUST_ROLES) roleCounts[role] = { pass: 0, fail: 0, not_evaluated: 0 }
  let firstFail: TrajectoryFirstHit | null = null
  let firstUnevaluated: TrajectoryFirstHit | null = null
  for (const s of steps) {
    for (const role of TRUST_ROLES) {
      roleCounts[role][s.cells[role]] += 1
      const hit: TrajectoryFirstHit = { round: s.round, proposalId: s.proposalId, role, reason: s.reasons[role] }
      if (s.cells[role] === 'fail' && !firstFail) firstFail = hit
      if (s.cells[role] === 'not_evaluated' && !firstUnevaluated) firstUnevaluated = hit
    }
  }

  let verdict: TrajectoryAudit['verdict']
  let note: string
  if (steps.length === 0) {
    verdict = 'not_evaluated'
    note = '该面还没有后继，没有可判定的轨迹'
  } else if (firstFail) {
    verdict = 'fail'
    note = `第 ${firstFail.round} 个后继（${firstFail.proposalId}）在「${TRUST_ROLE_LABELS[firstFail.role]}」上不满足：${firstFail.reason}。按联合判定的口径，整条轨迹不通过；首末两代达标不能抵消中间版本的不满足`
  } else if (firstUnevaluated) {
    verdict = 'not_evaluated'
    note = `没有不满足的版本，但第 ${firstUnevaluated.round} 个后继（${firstUnevaluated.proposalId}）在「${TRUST_ROLE_LABELS[firstUnevaluated.role]}」上没有可判定的证据：${firstUnevaluated.reason}。证据不全的轨迹按未评估计，不按通过计`
  } else {
    verdict = 'pass'
    note = `${steps.length} 个后继在三个角色上都有满足的读数。结论只覆盖已记录的证据`
  }

  const evaluatorDriftOf = evaluatorDrift(marks.map((m, idx) => ({
    round: idx + 1,
    evaluator: evidenceOf(byId.get(m.proposalId))?.evidence.evaluator ?? null,
  })))
  return { surfaceKey, steps, roleCounts, verdict, firstFail, firstUnevaluated, evaluatorDrift: evaluatorDriftOf, note }
}

function judgeKey(judge: NonNullable<EvaluatorFingerprint['judge']>): string {
  return JSON.stringify([[...judge.models].sort(), judge.backend, judge.tauYes, judge.tauNo])
}

/** 相邻后继之间的评估条件变更（同一面内比较；不同面用不同评测集，不跨面合并）。 */
export function evaluatorDrift(steps: Array<{ round: number; evaluator?: EvaluatorFingerprint | null }>): EvaluatorDriftAudit {
  const changes: EvaluatorChange[] = []
  const unknownPairs: EvaluatorDriftAudit['unknownPairs'] = []
  let compared = 0
  for (let i = 1; i < steps.length; i += 1) {
    const a = steps[i - 1]
    const b = steps[i]
    if (!a.evaluator || !b.evaluator) {
      unknownPairs.push({ fromRound: a.round, toRound: b.round, fields: ['evaluator'] })
      continue
    }
    const fields: string[] = []
    const missing: string[] = []
    if (a.evaluator.setHash == null || b.evaluator.setHash == null) missing.push('setHash')
    else if (a.evaluator.setHash !== b.evaluator.setHash) fields.push('setHash')
    const revisionA = a.evaluator.setRevision ?? null
    const revisionB = b.evaluator.setRevision ?? null
    if (revisionA == null || revisionB == null) missing.push('setRevision')
    else if (revisionA !== revisionB) fields.push('setRevision')
    const judgeA = a.evaluator.judge ?? null
    const judgeB = b.evaluator.judge ?? null
    if (!judgeA || !judgeB) missing.push('judge')
    else if (judgeKey(judgeA) !== judgeKey(judgeB)) fields.push('judge')
    // 有字段真比过（不论是否变更）就计入已比较；一个字段都没比上的只记无法比较。
    if (fields.length > 0) {
      changes.push({ fromRound: a.round, toRound: b.round, fields, from: a.evaluator, to: b.evaluator })
      compared += 1
    } else if (missing.length < 3) {
      compared += 1
    }
    if (fields.length === 0 && missing.length > 0) {
      unknownPairs.push({ fromRound: a.round, toRound: b.round, fields: missing })
    }
  }

  const pairs = Math.max(0, steps.length - 1)
  let verdict: EvaluatorDriftAudit['verdict']
  let note: string
  if (pairs === 0) {
    verdict = 'insufficient'
    note = `后继只有 ${steps.length} 个，没有相邻版本可比`
  } else if (changes.length > 0) {
    verdict = 'changed'
    const where = changes.map((c) => `第 ${c.fromRound}→${c.toRound} 个（${c.fields.join('、')}）`).join('；')
    note = `${changes.length} 处相邻后继之间评估条件变了：${where}。变更两侧的通过率不能直接比较；要对同一批冻结快照用两版评估器重评才恢复可比`
  } else if (compared === 0) {
    verdict = 'unknown'
    note = `${pairs} 对相邻后继都无法比较：探针没有带出试卷或裁判指纹。无法比较不等于没有变更`
  } else if (unknownPairs.length > 0) {
    verdict = 'unknown'
    note = `${compared} 对相邻后继的评估条件指纹一致，另有 ${unknownPairs.length} 对缺指纹无法比较`
  } else {
    verdict = 'stable'
    note = `${compared} 对相邻后继的评估条件指纹一致`
  }
  return { pairs, compared, changes, unknownPairs, changed: changes.length, unknown: unknownPairs.length, verdict, note }
}

/**
 * 回滚残留：已回滚提案在组件库里留下多少条目，又被多少现存后继直接引用。
 * 组件库条目未传入时，条目数记 null——不按 0 计。
 */
export function rollbackResidue(input: { proposals: Proposal[]; libraryEntries?: ComponentEntry[] | null }): RollbackResidueAudit {
  const library = input.libraryEntries ?? null
  const rolled = input.proposals.filter((p) => p.status === 'rolled_back')
  const live = input.proposals.filter((p) => p.status === 'promoted')
  const rows: RollbackResidueRow[] = rolled
    .map((p) => {
      const entries = library ? library.filter((e) => e.evidence?.proposalId === p.id) : null
      const ids = new Set((entries ?? []).map((e) => e.id))
      const inheritedBy = ids.size > 0 ? live.filter((s) => (s.donorRefs ?? []).some((id) => ids.has(id))).map((s) => s.id) : []
      return {
        proposalId: p.id,
        title: p.title,
        rolledBackAt: p.rollback?.at ?? null,
        reason: p.rollback?.reason ?? null,
        componentEntries: entries ? entries.length : null,
        inheritedBy,
      }
    })
    .sort((a, b) => ((a.rolledBackAt ?? '') < (b.rolledBackAt ?? '') ? 1 : -1))
  const componentEntries = library ? rows.reduce((sum, r) => sum + (r.componentEntries ?? 0), 0) : null
  const inheritedBy = new Set(rows.flatMap((r) => r.inheritedBy)).size

  let note: string
  if (rolled.length === 0) note = '没有已回滚的提案'
  else if (!library) note = `${rolled.length} 个提案已回滚；组件库未接入，残留条目数未知`
  else if (componentEntries === 0) note = `${rolled.length} 个提案已回滚；组件库里没有来自它们的条目`
  else {
    note = `${rolled.length} 个提案已回滚；组件库里来自它们的条目 ${componentEntries} 个，直接引用这些条目的现存后继 ${inheritedBy} 个。回滚只退役经验并撤掉冠军指针，不动组件库条目`
  }
  return { rolledBack: rolled.length, rows, componentEntries, inheritedBy, libraryProvided: library != null, note }
}

/** 从既有台账装配轨迹诊断。纯读：不写盘，不改任何门禁输入。 */
export function buildTrajectoryReport(input: {
  surfaces: EvolutionSurface[]
  proposals: Proposal[]
  champions: Champion[]
  libraryEntries?: ComponentEntry[] | null
}): TrajectoryReport {
  return {
    surfaces: input.surfaces.map((s) => trajectoryAudit(s.surfaceKey, input.proposals, input.champions)),
    rollbackResidue: rollbackResidue({ proposals: input.proposals, libraryEntries: input.libraryEntries ?? null }),
    note:
      '只读诊断，不参与晋级判定：联合判定里任一后继任一角色不满足即不通过，证据不全按未评估计；' +
      '有效监督是结构检查（批准留痕与可恢复快照），回滚效果未实测；评估条件比较只在同一面的相邻后继之间做。',
  }
}
