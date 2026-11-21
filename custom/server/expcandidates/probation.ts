// overlay[expcandidates/probation]（批一 b 变更 3）：试用期生命周期——惰性结算。
//
// 语义：候选批准即进 probation 观察窗（windowTasks 任务窗口/minSamples 决断样本，
// 缺省 20/5）；到期由下一次派单触发结算（挂 dispatchColumnTransition 入口——不新增
// watcher，机制预算纪律，spec 决策 1），判据=注入对照双比例 z 检验（α=0.05 单侧
// 只测劣化，20 窗口小样本下比例差噪声大，spec 决策 4）：
//   显著劣化 → retired（verdict=probation_regression，历史保留 probation.stats）；
//   未劣化（含改善——改善转正不设统计门，保守方向）→ approved（verdict=promoted）；
//   决断样本不足（处置组或基线任一侧 <minSamples）→ 首次 probation_extended（窗口
//   延长一次，不结算），二次仍不足 effect_unknown（结算终态，挂人工，不再自动判）。
// 窗口语义：窗口计数只决定「何时到期可判」（带 taskId 曝光 ≥ windowTasks 触发）；
// 判读本身用全部可归因数据（延长窗口后旧数据不丢——数据越多检验越稳，且留痕账
// 有 cap 200 天然有界）。
// 幂等有界：settledAt 已落不再结算；单次派单最多结算 PROBATION_SETTLE_BATCH_LIMIT
// 条（防长尾板阻塞派发）。
//
// workbench 联动（spec 决策 5，默认关）：退役候选带 sourceProposalId 且
// HARNESS2_AUTO_ROLLBACK=1 时调 rollbackProposal——数据面（退役/不注入）自动、文件面
// （回滚写盘）显式；rollback 走动态 import（workbench 服面重且反向依赖 exp-store，
// 拉进静态图成环风险＋派发热路径加载整服面；且只在真退役＋门开才加载）。
import { listInjectionLog, readExpStore, writeExpStore } from './exp-store'
import { buildEffectReport, readBoardTaskFacts } from './effect-report'
import type { ExpCandidate, ExpInjectionRecord, ProbationStats, ProbationVerdict } from './exp-types'

/** 单侧 α=0.05 临界值（z ≤ -1.6449 即显著劣化）。 */
export const Z_ALPHA_ONE_SIDED_0_05 = 1.6449

/** 单次派单结算上限（有界）。 */
export const PROBATION_SETTLE_BATCH_LIMIT = 10

/** 回滚注入面（测试替身用；缺省动态 import workbench rollbackProposal）。 */
export type ProbationRollbackFn = (proposalId: string, reason: string) => Promise<void>

async function defaultRollback(proposalId: string, reason: string): Promise<void> {
  const { rollbackProposal } = await import('../harness/workbench/service')
  await rollbackProposal(proposalId, { actor: 'agnes-probation', reason })
}

/** 双比例 z 检验（合并方差）：x1/n1=处置组（注入） successes/decided，x0/n0=基线
 *  （同列未注入）。返回 z 值；任一侧零样本或合并比例退化（0/1，检验无定义）→
 *  null 不猜数。 */
export function twoProportionZ(x1: number, n1: number, x0: number, n0: number): number | null {
  if (n1 <= 0 || n0 <= 0) return null
  const pooled = (x1 + x0) / (n1 + n0)
  if (pooled <= 0 || pooled >= 1) return null
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n0))
  if (se <= 0) return null
  return (x1 / n1 - x0 / n0) / se
}

/** 单条结算结果（观测面：REST/测试断言消费）。 */
export interface ProbationSettleResult {
  candidateId: string
  verdict: ProbationVerdict
  /** 结算后候选状态：retired/approved；extended/unknown 保持 probation。 */
  status: ExpCandidate['status']
  /** 本窗口内带 taskId 的曝光数（到期判定计数）。 */
  dueInjections: number
  stats?: ProbationStats
  /** 回滚联动观测：called=已调；skipped=门关/无源提案；failed=调用失败（fail-soft）。 */
  rollback?: 'called' | 'skipped' | 'failed'
}

const nowIso = (): string => new Date().toISOString()

const kindOf = (r: ExpInjectionRecord): string => r.kind ?? 'exp'

/** 候选本窗口（extendedAt ?? startedAt 起）带 taskId 的 exp 路曝光数。 */
function windowInjections(candidate: ExpCandidate, log: ExpInjectionRecord[]): number {
  const probation = candidate.probation
  if (!probation) return 0
  const since = Date.parse(probation.extendedAt ?? probation.startedAt)
  return log.filter((r) =>
    kindOf(r) === 'exp' && r.taskId?.trim() && r.ids.includes(candidate.id) && r.at >= since,
  ).length
}

/**
 * 惰性结算主入口（dispatchColumnTransition 调用；幂等有界，fail-soft 由调用方包）。
 * 无到期条目时零板库读、零写入。板库 home 可覆写（测试注入）；rollback 可注入替身。
 */
export async function settleDueProbation(opts: {
  homeDir?: string
  rollback?: ProbationRollbackFn
} = {}): Promise<ProbationSettleResult[]> {
  const store = readExpStore()
  const log: ExpInjectionRecord[] = Array.isArray(store.injectionLog) ? store.injectionLog : []
  // 到期判定先行（纯账面）： settled（含 effect_unknown 人工接管态）不再自动结算
  const due = store.candidates
    .filter((c) => c.status === 'probation' && c.probation && !c.probation.settledAt)
    .map((c) => ({ candidate: c, injections: windowInjections(c, log) }))
    .filter((x) => x.injections >= (x.candidate.probation!.windowTasks))
    .sort((a, b) =>
      Date.parse(a.candidate.probation!.extendedAt ?? a.candidate.probation!.startedAt)
        - Date.parse(b.candidate.probation!.extendedAt ?? b.candidate.probation!.startedAt)
      || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, PROBATION_SETTLE_BATCH_LIMIT)
  if (due.length === 0) return []

  // 效果面（板库读一次，全部到期条目共用——effect-report 同口径投影）
  const facts = await readBoardTaskFacts(opts.homeDir)
  const injectedTaskIds = new Set(log.flatMap((r) => (r.taskId?.trim() ? [r.taskId.trim()] : [])))
  const baselineTasks = [...facts.statusOf.entries()]
    .filter(([taskId]) => !injectedTaskIds.has(taskId))
    .map(([taskId, status]) => ({ taskId, status, columns: [...(facts.columnsOf.get(taskId) ?? [])] }))
  const rows = buildEffectReport({
    records: log,
    taskStatusOf: (taskId) => facts.statusOf.get(taskId) ?? null,
    baselineTasks,
  })

  const rollbackFn = opts.rollback ?? defaultRollback
  const rollbackGateOn = process.env.HARNESS2_AUTO_ROLLBACK?.trim() === '1'
  const results: ProbationSettleResult[] = []
  for (const { candidate: dueCand, injections } of due) {
    const candidate = store.candidates.find((c) => c.id === dueCand.id)!
    const probation = candidate.probation!
    const row = rows.find((r) => r.kind === 'exp' && r.recordId === candidate.id)
    const success = row?.success ?? 0
    const failure = row?.failure ?? 0
    const unknown = row?.unknown ?? 0
    const n1 = success + failure
    const baselineTasksDecided = row?.baseline?.tasks ?? 0
    const stats: ProbationStats = {
      injections: row?.injections ?? 0,
      success, failure, unknown,
      ...(row?.baseline ? { baselineTasks: row.baseline.tasks, baselineSuccess: row.baseline.success } : {}),
    }

    let verdict: ProbationVerdict
    let status: ExpCandidate['status'] = 'probation'
    let rollback: ProbationSettleResult['rollback']
    const insufficient = n1 < probation.minSamples
      || !row?.baseline || baselineTasksDecided < probation.minSamples
    if (insufficient) {
      if (!probation.extendedAt) {
        // 首延：窗口从现在起重计（不结算；再一个窗口仍不足才挂人工）
        verdict = 'probation_extended'
        probation.extendedAt = nowIso()
      } else {
        verdict = 'effect_unknown'
        probation.settledAt = nowIso()
      }
    } else {
      const x0 = row!.baseline!.success
      const p1 = success / n1
      const p0 = x0 / baselineTasksDecided
      const z = twoProportionZ(success, n1, x0, baselineTasksDecided)
      stats.z = z
      if (z !== null && z <= -Z_ALPHA_ONE_SIDED_0_05 && p1 < p0) {
        // 显著劣化 → 退役（历史保留：probation/injectedRuns/injectionLog 均不动）
        verdict = 'probation_regression'
        status = 'retired'
        probation.settledAt = nowIso()
        if (candidate.sourceProposalId && rollbackGateOn) {
          try {
            await rollbackFn(candidate.sourceProposalId, `试用期劣化退役（probation_regression）：候选 ${candidate.id} z=${z.toFixed(3)}（${success}/${n1} vs 基线 ${x0}/${baselineTasksDecided}）`)
            rollback = 'called'
          } catch (err) {
            // 回滚失败不撤销退役（数据面自动、文件面显式各自负责；失败可见）
            console.warn(`[probation] rollbackProposal 失败（退役仍成立，fail-soft）：${err instanceof Error ? err.message : String(err)}`)
            rollback = 'failed'
          }
        } else {
          rollback = 'skipped'
        }
      } else {
        verdict = 'promoted'
        status = 'approved'
        probation.settledAt = nowIso()
      }
    }
    probation.verdict = verdict
    probation.stats = stats
    candidate.status = status
    candidate.updatedAt = nowIso()
    results.push({ candidateId: candidate.id, verdict, status, dueInjections: injections, stats, ...(rollback ? { rollback } : {}) })
  }
  writeExpStore(store)
  return results
}
