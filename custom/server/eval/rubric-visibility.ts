// overlay/eval 域：隐藏断言的可见性投影（2026-10-30 HelixHarness 吸收轮）。
//
// 源手法：其 bench 的 hidden-tests.patch 只在工作流跑完后注入，执行期 Agent 看不到测试。
// 回放判分模型下没有"执行期"，等价物是：隐藏断言随集入库、只在服务端判分时参与，
// **任何对外 API 面都不出现**（集详情/导出/修订历史），并把条数以 hiddenAssertionCount
// 明示——透明披露"存在隐藏检查"，不泄露内容。
//
// 判分口径不在此处改变：aggregate/attemptPassed 直接读存储里的全量 rubric。
import type { EvalSet, EvalTask } from './types'

export interface PublicTaskView extends EvalTask {
  /** 隐藏断言条数（只暴露数量，不暴露内容）。 */
  hiddenAssertionCount: number
}

export interface PublicSetView extends Omit<EvalSet, 'tasks'> {
  tasks: PublicTaskView[]
}

export function publicTaskView(task: EvalTask): PublicTaskView {
  const rubric = Array.isArray(task.rubric) ? task.rubric : []
  const visible = rubric.filter((a) => a?.hidden !== true)
  return { ...task, rubric: visible, hiddenAssertionCount: rubric.length - visible.length }
}

export function publicSetView(set: EvalSet): PublicSetView {
  return { ...set, tasks: (set.tasks ?? []).map(publicTaskView) }
}
