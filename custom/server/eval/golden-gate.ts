// golden-gate.ts — G4 黄金集门检正身（spec 2026-11-06-eval-golden-gate）。
//
// 语义：P2P 底座读数——黄金集 30 例配模范材料判分，全应 PASS；未达标=裁判误杀
// 属预期（未校准），读数落档记缺口不阻断（Rubric Loop 校准批收敛后升硬判据）。
// 材料单一事实源=GOLDEN_MATERIALS（与例题同文件），调用方不可传材料绕过（D4）。
// stabilityRetest=2 常态化：首轮即产出同输入重复判定读数，为校准轮备料。
import { GOLDEN_MATERIALS, GOLDEN_SET_NAME, assertGoldenMaterials, buildGoldenSetInput, buildGoldenTasks } from './golden-set'
import { attemptPassed } from './aggregate'
import { createSet, getSet, listSets } from './store'
import { runReplayEval } from './runner'
import type { EvalRun, EvalTask } from './types'

export interface GoldenGateBuckets { positive: number; ambiguous: number; adversarial: number }

export interface GoldenGateResult {
  ok: boolean
  problems?: string[]
  runId?: string
  /** 三桶 PASS 计数（期望 10/10/10）。 */
  buckets?: GoldenGateBuckets
  /** 未达标例（taskId → 差在哪条 rubric 的聚合诊断，供校准轮定位）。 */
  mismatch?: string[]
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
): Promise<GoldenGateResult> {
  const tasks = buildGoldenTasks()
  const problems = assertGoldenMaterials(tasks)
  if (problems.length > 0) return { ok: false, problems, semantics: 'p2p' }   // 资产失配 fail-closed，不跑

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

  const { loadEvalConfig } = await import('./types')
  const { outcomeContext } = await import('./routes/shared')
  const result = await runReplayEval(
    { setId, samples, stabilityRetest: 2, note: 'golden-gate', actor: 'golden-gate' },
    {
      outcomeCtx: deps?.outcomeCtx ?? outcomeContext(),
      ...(deps?.judge ? { judge: deps.judge } : { judge: { config: loadEvalConfig() } }),
      ...(deps?.now ? { now: deps.now } : {}),
    },
  )
  if (!result.ok) return { ok: false, problems: 'problems' in result ? result.problems : ['重放执行失败'], semantics: 'p2p' }

  const run: EvalRun = result.run
  const buckets: GoldenGateBuckets = { positive: 0, ambiguous: 0, adversarial: 0 }
  const mismatch: string[] = []
  for (const attempt of run.attempts) {
    const task = set.tasks.find((t) => t.id === attempt.taskId)
    if (!task) continue
    if (attemptPassed(task, attempt)) buckets[bucketOf(task)]++
    else mismatch.push(attempt.taskId)
  }
  return { ok: true, runId: run.id, buckets, mismatch, semantics: 'p2p' }
}
