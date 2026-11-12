// golden-gate.ts — G4 黄金集门检正身（spec 2026-11-06-eval-golden-gate）。
//
// 语义：P2P 底座读数——黄金集 30 例配模范材料判分，全应 PASS；未达标=裁判误杀
// 属预期（未校准），读数落档记缺口不阻断（Rubric Loop 校准批收敛后升硬判据）。
// 材料单一事实源=GOLDEN_MATERIALS（与例题同文件），调用方不可传材料绕过（D4）。
// stabilityRetest=2 常态化：首轮即产出同输入重复判定读数，为校准轮备料。
import { GOLDEN_MATERIALS, GOLDEN_NEGATIVE_MATERIALS, GOLDEN_SET_NAME, assertGoldenMaterials, assertGoldenNegatives, buildGoldenSetInput, buildGoldenTasks } from './golden-set'
import { attemptPassed } from './aggregate'
import { judgeAttempt } from './judge'
import { createSet, getSet, listSets } from './store'
import { runReplayEval } from './runner'
import { loadEvalConfig, type EvalRun, type EvalTask } from './types'

export interface GoldenGateBuckets { positive: number; ambiguous: number; adversarial: number }

export interface GoldenGateCalibration {
  /** 正例通过且负例不通过才算一条 f2p 样本成立。 */
  f2pPassed: number
  f2pTotal: number
  /** 现有 P2P 运行中各例是否通过（每例全部复测轮次都过才算过）。 */
  p2pPassed: number
  p2pTotal: number
  failed: Array<{ taskId: string; reason: string }>
  calibrated: boolean
  decision: 'calibrated' | 'uncalibrated'
}

export interface GoldenGateOptions {
  /** 增跑负例 F2P 校准（默认 false，避免每次门检翻倍判分成本）。 */
  calibrate?: boolean
  /** 校准未达标时 ok:false（默认 false=观察态；也可用 GOLDEN_GATE_ENFORCE=1）。 */
  enforce?: boolean
}

export interface GoldenGateResult {
  ok: boolean
  problems?: string[]
  runId?: string
  /** 三桶 PASS 计数（期望 10/10/10）。 */
  buckets?: GoldenGateBuckets
  /** 未达标例（taskId → 差在哪条 rubric 的聚合诊断，供校准轮定位）。 */
  mismatch?: string[]
  /** F2P 校准读数；未请求校准时不出现。 */
  calibration?: GoldenGateCalibration
  /** 是否按 enforce 口径判定。 */
  enforced?: boolean
  /** P2P 语义标注：材料全模范，判 FAIL 即误杀。 */
  semantics: 'p2p'
}

function bucketOf(task: EvalTask): keyof GoldenGateBuckets {
  if (task.id.startsWith('gp-')) return 'positive'
  if (task.id.startsWith('ga-adv-')) return 'adversarial'
  return 'ambiguous'
}

/** 复用/建黄金集 → 材料构造样本 → runReplayEval(stabilityRetest:2) → 三桶聚合。
 * deps 可选注入（守门测试 stub ask 用；生产缺省走 loadEvalConfig 真判分）。 */
export async function goldenGateCheck(
  deps?: Partial<Parameters<typeof runReplayEval>[1]> & Pick<Parameters<typeof runReplayEval>[1], 'outcomeCtx'>,
  options: GoldenGateOptions = {},
): Promise<GoldenGateResult> {
  const calibrate = options.calibrate ?? process.env.GOLDEN_GATE_CALIBRATE === '1'
  const enforce = options.enforce ?? process.env.GOLDEN_GATE_ENFORCE === '1'
  if (enforce && !calibrate) {
    return { ok: false, problems: ['GOLDEN_GATE_ENFORCE=1 需要同时开启 calibrate（否则没有校准读数可判）'], semantics: 'p2p', enforced: true }
  }
  const tasks = buildGoldenTasks()
  const problems = assertGoldenMaterials(tasks)
  if (problems.length > 0) return { ok: false, problems, semantics: 'p2p' }   // 资产失配 fail-closed，不跑
  if (calibrate) {
    const negativeProblems = assertGoldenNegatives(tasks)
    if (negativeProblems.length > 0) return { ok: false, problems: negativeProblems, semantics: 'p2p' }
  }

  const existing = listSets().find((s) => s.name === GOLDEN_SET_NAME)
  let setId = existing?.id
  if (!setId) {
    const created = createSet(buildGoldenSetInput(), 'golden-gate')
    if (!created.ok) return { ok: false, problems: 'problems' in created ? created.problems : ['黄金集创建失败'], semantics: 'p2p' }
    setId = created.set.id
  }
  const set = getSet(setId)
  if (!set) return { ok: false, problems: [`黄金集失踪：${setId}`], semantics: 'p2p' }

  const samples: Record<string, { evidence: { transcript: string } }[]> = {}
  for (const t of set.tasks) {
    const material = GOLDEN_MATERIALS[t.id]
    if (material === undefined) return { ok: false, problems: [`集内任务缺材料：${t.id}`], semantics: 'p2p' }
    samples[t.id] = [{ evidence: { transcript: material } }]
  }

  const { outcomeContext } = await import('./routes/shared')
  const judgeDeps = deps?.judge ?? { config: loadEvalConfig() }
  const nowFn = deps?.now ?? Date.now
  const result = await runReplayEval(
    { setId, samples, stabilityRetest: 2, note: 'golden-gate', actor: 'golden-gate', skipAutoReflow: true },
    {
      outcomeCtx: deps?.outcomeCtx ?? outcomeContext(),
      judge: judgeDeps,
      ...(deps?.now ? { now: deps.now } : {}),
    },
  )
  if (!result.ok) return { ok: false, problems: 'problems' in result ? result.problems : ['重放执行失败'], semantics: 'p2p' }

  const run: EvalRun = result.run
  const buckets: GoldenGateBuckets = { positive: 0, ambiguous: 0, adversarial: 0 }
  const mismatch: string[] = []
  const p2pPass = new Map<string, boolean>()
  for (const attempt of run.attempts) {
    const task = set.tasks.find((t) => t.id === attempt.taskId)
    if (!task) continue
    const passed = attemptPassed(task, attempt)
    if (passed) buckets[bucketOf(task)]++
    else mismatch.push(attempt.taskId)
    const prev = p2pPass.get(task.id)
    p2pPass.set(task.id, prev === undefined ? passed : prev && passed)
  }

  let calibration: GoldenGateCalibration | undefined
  if (calibrate) {
    let f2pPassed = 0
    const failed: Array<{ taskId: string; reason: string }> = []
    for (const task of set.tasks) {
      const negative = GOLDEN_NEGATIVE_MATERIALS[task.id]
      if (!negative) {
        failed.push({ taskId: task.id, reason: '缺负例材料' })
        continue
      }
      try {
        const judged = await judgeAttempt(task, { transcript: negative }, judgeDeps, {})
        const attempt = {
          taskId: task.id,
          sampleIdx: 1,
          verdicts: judged.verdicts,
          ...(task.outcome
            ? { outcome: { verifier: task.outcome.verifier, ok: true, detail: 'calibration: 终态校验跳过' } }
            : {}),
          judgeMeta: judged.judgeMeta,
          judgedAt: nowFn(),
        }
        const negativePassed = attemptPassed(task, attempt)
        const positivePassed = p2pPass.get(task.id) === true
        if (!negativePassed && positivePassed) {
          f2pPassed += 1
        } else {
          failed.push({
            taskId: task.id,
            reason: negativePassed
              ? '负例被判通过（判据无区分力）'
              : '正例未通过（P2P 误杀，无法配对）',
          })
        }
      } catch (e) {
        failed.push({ taskId: task.id, reason: `负例判分失败：${(e as Error).message}` })
      }
    }
    const p2pPassed = [...p2pPass.values()].filter(Boolean).length
    const total = set.tasks.length
    calibration = {
      f2pPassed,
      f2pTotal: total,
      p2pPassed,
      p2pTotal: total,
      failed,
      calibrated: f2pPassed === total && p2pPassed === total,
      decision: f2pPassed === total && p2pPassed === total ? 'calibrated' : 'uncalibrated',
    }
  }

  const enforced = enforce
  if (enforce && calibration && !calibration.calibrated) {
    return {
      ok: false,
      problems: calibration.failed.map((f) => `${f.taskId}：${f.reason}`),
      runId: run.id,
      buckets,
      mismatch,
      calibration,
      enforced,
      semantics: 'p2p',
    }
  }
  return {
    ok: true,
    runId: run.id,
    buckets,
    mismatch,
    ...(calibration ? { calibration } : {}),
    ...(enforced ? { enforced } : {}),
    semantics: 'p2p',
  }
}
