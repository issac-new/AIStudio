// overlay/eval 域：评测集校准合同（2026-10-30 HelixHarness 吸收轮）。
//
// 源问题：AIStudio 的评测集建好后可直接跑，没有任何一步证明「这套 rubric 真的能区分
// 做砸的证据与做对的证据」。其 bench 的做法是 F2P/P2P 校准：F2P 要求基线失败、解法通过；
// P2P 要求两侧都通过（证明判据没过严）。本模块把这套合同移植到回放判分模型上。
//
// 诚实边界（写进类型注释与 spec，禁止对外声称等价 SWE-bench）：
//   回放模型不执行被测代码，这里的校准是**证据级**的——证明「给定一条失败证据与一条
//   通过证据，本集 rubric + 裁判管线能给出相反结论」。它不能证明被测 agent 在新任务上
//   一定失败/通过，只证明判据有区分力、不是恒真或恒假。
//
// 绑定与失效：校准结果带 setHash（= 集 contentHash）。改题/回流/扩答后 contentHash 变，
// 校准自动失效，必须重跑（runner 在正式运行前校验）。
import { createHash } from 'node:crypto'
import { attemptPassed } from './aggregate'
import type { Attempt, EvalClarification, EvalSet, EvalTask, Evidence } from './types'

export type CalibrationKind = 'f2p' | 'p2p'

export interface CalibrationSample {
  taskId: string
  /** f2p（缺省）=基线与解法应相反；p2p=两侧都应通过（防误杀）。 */
  kind?: CalibrationKind
  /** 代表「改前 / 做砸」状态的证据。 */
  baseline: Evidence
  /** 代表「改后 / 做对」状态的证据。 */
  solution: Evidence
}

/** 判分注入：调用方负责把 evidence 走完整判分管线（含 outcome 校验），返回 Attempt。 */
export type CalibrationJudge = (task: EvalTask, evidence: Evidence) => Attempt | Promise<Attempt>

export interface CalibrationOutcome {
  taskId: string
  kind: CalibrationKind
  baselinePassed: boolean
  solutionPassed: boolean
  ok: boolean
  reason?: string
}

export interface SetCalibration {
  calibrated: boolean
  calibratedAt: number
  /** 校准时集的 contentHash；与当前 contentHash 不符即失效。 */
  setHash: string
  samples: number
  f2p: CalibrationOutcome[]
  p2p: CalibrationOutcome[]
  reasons: string[]
  /** 口径说明（如：含 outcome 校验器的任务在离线校准中跳过终态校验）。 */
  notes: string[]
  /**
   * 校准时澄清事实的指纹（2026-10-30）。集 contentHash 只覆盖 tasks，澄清变更不会
   * 改 setHash——用本字段单独判失效（存量校准无此字段时不做该维校验）。
   */
  clarificationsHash?: string
}

/** 澄清事实指纹：按 question/answer 排序后哈希（顺序不改变语义）。 */
export function hashClarifications(clarifications: EvalClarification[] | undefined): string {
  const list = (clarifications ?? [])
    .map((c) => ({ q: c?.question ?? '', a: c?.answer ?? '' }))
    .sort((x, y) => (x.q + '\u0000' + x.a).localeCompare(y.q + '\u0000' + y.a))
  return createHash('sha1').update(JSON.stringify(list), 'utf8').digest('hex')
}

/**
 * 执行校准。判定：
 *   f2p：baseline 判不通过 **且** solution 判通过 → 判据有区分力；
 *   p2p：baseline 与 solution 都判通过 → 判据不过严（不误杀已通过的行为）。
 * 校准通过的最低条件：至少一条 f2p 样本、且全部样本满足各自期望、无解析失败。
 */
export async function calibrateSet(
  set: EvalSet,
  samples: CalibrationSample[],
  judge: CalibrationJudge,
  opts: { now?: number; minF2P?: number } = {},
): Promise<SetCalibration> {
  const now = opts.now ?? Date.now()
  const minF2P = Math.max(1, opts.minF2P ?? 1)
  const reasons: string[] = []
  const notes: string[] = []
  const f2p: CalibrationOutcome[] = []
  const p2p: CalibrationOutcome[] = []

  if (!Array.isArray(samples) || samples.length === 0) {
    reasons.push('校准样本为空：至少需要 1 条「基线失败→解法通过」样本')
  }

  for (const sample of samples ?? []) {
    const task = set.tasks.find((t) => t.id === sample?.taskId)
    if (!task) {
      reasons.push(`样本引用了不存在的任务：${sample?.taskId ?? '(空)'}`)
      continue
    }
    const kind: CalibrationKind = sample.kind === 'p2p' ? 'p2p' : 'f2p'
    let baselinePassed = false
    let solutionPassed = false
    try {
      baselinePassed = attemptPassed(task, await judge(task, sample.baseline ?? {}))
      solutionPassed = attemptPassed(task, await judge(task, sample.solution ?? {}))
    } catch (e) {
      const reason = `任务 ${task.id} 判分失败：${(e as Error).message}`
      reasons.push(reason)
      ;(kind === 'f2p' ? f2p : p2p).push({
        taskId: task.id,
        kind,
        baselinePassed: false,
        solutionPassed: false,
        ok: false,
        reason,
      })
      continue
    }

    if (kind === 'p2p') {
      const ok = baselinePassed && solutionPassed
      const reason = ok
        ? undefined
        : `p2p 期望两侧都通过（基线=${baselinePassed ? '通过' : '不通过'}，解法=${solutionPassed ? '通过' : '不通过'}）——判据过严或证据不达标`
      p2p.push({ taskId: task.id, kind, baselinePassed, solutionPassed, ok, ...(reason ? { reason } : {}) })
      if (!ok && reason) reasons.push(`任务 ${task.id}：${reason}`)
      continue
    }

    const ok = !baselinePassed && solutionPassed
    const reason = ok
      ? undefined
      : `f2p 期望基线不通过且解法通过（基线=${baselinePassed ? '通过' : '不通过'}，解法=${solutionPassed ? '通过' : '不通过'}）——rubric 无区分力或证据不达标`
    f2p.push({ taskId: task.id, kind, baselinePassed, solutionPassed, ok, ...(reason ? { reason } : {}) })
    if (!ok && reason) reasons.push(`任务 ${task.id}：${reason}`)
  }

  if (f2p.length < minF2P) {
    reasons.push(`f2p 样本不足：至少 ${minF2P} 条（当前 ${f2p.length}）`)
  }
  const withOutcome = new Set(
    (samples ?? [])
      .map((s) => set.tasks.find((t) => t.id === s?.taskId))
      .filter((t): t is EvalTask => Boolean(t?.outcome))
      .map((t) => t.id),
  )
  if (withOutcome.size > 0) {
    notes.push(
      `含终态校验器的任务 ${withOutcome.size} 个：离线校准只验证 rubric 区分力，终态校验器需真实运行环境，不参与校准`,
    )
  }

  return {
    calibrated: reasons.length === 0,
    calibratedAt: now,
    setHash: set.contentHash,
    samples: Array.isArray(samples) ? samples.length : 0,
    f2p,
    p2p,
    reasons,
    notes,
    clarificationsHash: hashClarifications(set.clarifications),
  }
}

/**
 * 正式运行前的校准准入（runner 调用）。
 * 语义：
 *   - 集声明 requireCalibration 且无校准记录 → 拒绝（新集必须自证判据有区分力）；
 *   - 有记录但未通过 → 拒绝；
 *   - 有记录但集的 contentHash 已变 → 拒绝（改题后必须重新校准）；
 *   - 未声明 requireCalibration 且无记录 → 放行（存量集向后兼容，不制造大面积红）。
 */
export function calibrationProblemsForRun(set: EvalSet): string[] {
  const cal = set.calibration
  if (!cal) {
    return set.requireCalibration ? ['评测集尚未校准：先用基线/解法两条证据跑 POST /api/eval/sets/:id/calibrate'] : []
  }
  const problems: string[] = []
  if (!cal.calibrated) {
    problems.push(`评测集校准未通过：${cal.reasons.join('；') || '原因未记录'}`)
  }
  if (cal.setHash !== set.contentHash) {
    problems.push('评测集内容已变更（contentHash 不一致）：校准失效，须重新校准后再跑')
  }
  if (cal.clarificationsHash !== undefined && cal.clarificationsHash !== hashClarifications(set.clarifications)) {
    problems.push('集级澄清事实已变更：校准失效（澄清会改变裁判口径），须重新校准后再跑')
  }
  return problems
}
