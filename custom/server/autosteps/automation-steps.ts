// overlay/autosteps 域：列级 automation steps 编排（kanban 列编排半边，矩阵 §3.6 行 195 P0）。
//
// 现状：399 kanban 门禁四件套已落（门禁半边）；本层=**编排半边**——
// 列转移触发的步骤序列编排：
// - **列绑定**：每列可挂 steps（顺序执行）；
// - **失败策略**：fail-fast（任一步失败即停）/ continue（记录失败继续）；
// - **门禁前置**：步骤可要求 acceptance 已过（衔接 399 门禁）；
// - **执行计划**：onColumnEnter 产出步骤计划（执行副作用留调用方）。
export type FailurePolicy = 'fail-fast' | 'continue'

export interface AutomationStep {
  stepId: string
  command: string
  /** 要求 acceptance 门禁已过才执行。 */
  requiresGate: boolean
}

export interface ColumnAutomation {
  column: string
  steps: AutomationStep[]
  failurePolicy: FailurePolicy
}

export interface StepPlanItem {
  stepId: string
  command: string
  skipped: boolean
  skipReason?: string
}

export interface StepPlan {
  column: string
  items: StepPlanItem[]
}

/** 进列触发编排计划（gatePassed=399 acceptance 判定由调用方注入）。
 * 语义：门禁未过的 skip **不是失败**，不触发 fail-fast 即停；fail-fast 只对执行失败
 * （applyFailures 回放）即停。 */
export function onColumnEnter(
  automation: ColumnAutomation,
  gatePassed: boolean,
): StepPlan {
  const items: StepPlanItem[] = []
  let halted = false
  for (const step of automation.steps) {
    if (halted) {
      items.push({ stepId: step.stepId, command: step.command, skipped: true, skipReason: 'fail-fast 前序失败即停' })
      continue
    }
    if (step.requiresGate && !gatePassed) {
      items.push({ stepId: step.stepId, command: step.command, skipped: true, skipReason: 'acceptance 门禁未过' })
      continue
    }
    items.push({ stepId: step.stepId, command: step.command, skipped: false })
  }
  return { column: automation.column, items }
}

/** 步骤执行结果回放：fail-fast 下首个失败后全 skip（与计划面同一语义）。 */
export function applyFailures(plan: StepPlan, policy: FailurePolicy, failedIds: readonly string[]): StepPlan {
  const failed = new Set(failedIds)
  let halted = false
  return {
    ...plan,
    items: plan.items.map((it) => {
      if (halted) return { ...it, skipped: true, skipReason: 'fail-fast 前序失败即停' }
      if (!it.skipped && failed.has(it.stepId)) {
        if (policy === 'fail-fast') halted = true
        return { ...it, skipped: false }
      }
      return it
    }),
  }
}
