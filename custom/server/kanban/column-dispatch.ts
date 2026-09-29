// overlay/kanban 域：列编排执行半环（routa §七#2 COLUMN_TRANSITION→编排派发，矩阵 §3.6 P0 收尾件）。
//
// 语义：列流转（from,to）→ 匹配器（column-automation.ts）→ 每 step 一条派单
// （复用 P3 MentionDispatchService 单 pending 槽+围栏+outcome 词表）。step 的
// specialist/role 组装成派单文本（简报式：列编排语义+step 职责）。
// 派单服务须为共享单例（engine-controller getMentionDispatch，P-A(b)）：pending 槽是
// 实例级状态，各建实例会与 /mention REST 双槽并存、同 (workspace,zcode) 双跑——跨调用
// 幂等只在同一实例内成立，本层不自建实例（旧注释称「pending 槽兜底」但每次 new，
// 跨调用幂等并不成立，此处如实更正）。
// 同 provider 多步合并进单 run 按序执行（单 pending 槽语义）：派单文本把多步按序
// 显式列出并注明「按序执行」；跨 run 的串行依赖 run 完成信号（未接），不宣称逐 run 有序。
// 事件自动触发（kanban 399 column_transition 事件→本执行链）依赖 loop/kanban
// 跨进程通道列后续；本层给手动/REST 触发面（运维可预演/补触发），执行语义与
// 自动面同源（同一 dispatchColumnTransition 入口）。
import { matchColumnTransition, isSafeStep, type ColumnTransitionTrigger, type AutomationStep } from './column-automation'
import { MentionDispatchService, type MentionOutcome } from '../zcode/mention-dispatch'
import { checkDispatchBudget } from '../governance/governance-budget'
import { loadActionContracts } from '../governance/governance-ledger'
import { appendDispatchOutcome } from '../governance/dispatch-ledger'

export interface ColumnDispatchResult {
  triggers: ColumnTransitionTrigger[]
  outcomes: MentionOutcome[]
}

/** 配置/校验错误（≠引擎不可达）：REST 侧按 400 配置错误回报，不谎报 engine_unreachable。 */
export class ColumnDispatchConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ColumnDispatchConfigError'
  }
}

/**
 * 派单文本（P-D(a)①）：多步按序显式列出并注明「按序执行」——同 provider 多步会合并进
 * 单 run（单 pending 槽），run 里看到的是完整步骤序而非孤零零一步。
 * autoAdvanceOnSuccess 只表达进列意图，话术不承诺自动进列（P-D(e)：完成后由人工/
 * 编排推进列，与 squad-protocol「done 是人类的动作」同一交付边界）。
 */
/**
 * 交付契约块（4A 治理层第三期·派发负载契约化）：从 action-contracts.yaml 取
 * column.dispatch 契约，拼进派单文本尾部——本机派发不再是裸文本任务传递，完成
 * 回执的判定词表与失败词表随负载下发。契约注册表缺席时回落内置短句（fail-soft，
 * 不阻断派发）。文本拼接值全部来自受守门的注册表（id/version 冻结词表），非用户输入。
 */
function contractFooter(): string {
  const res = loadActionContracts()
  const c = res.doc?.contracts.find((x) => x.id === 'column.dispatch')
  if (!c) return '交付契约：完成回执须含结构化判定（verdict），词面相似不构成判定依据。'
  return [
    `交付契约（action-contracts:${c.id} v${c.version}）：`,
    `完成回执须含结构化 verdict（六态：pass/fail/conditional/inconclusive/waived/not_applicable，语义见 runtime/governance/metrics.yaml；词面相似不构成判定依据）。`,
    `失败按冻结错误词表报告：${c.errors.join(' / ')}。`,
  ].join('')
}

function stepBrief(trigger: ColumnTransitionTrigger, steps: AutomationStep[], index: number): string {
  const lines = steps.map((s, i) => `  ${i + 1}. ${s.id}（${s.role}${s.specialist ? ` / ${s.specialist}` : ''}）`)
  return [
    `[kanban:${trigger.column}] 列编排（时机 ${trigger.matchedTiming}）共 ${steps.length} 步，按序执行：`,
    ...lines,
    `本次派发第 ${index + 1} 步：${steps[index].id}${trigger.autoAdvanceOnSuccess ? '（全部步骤完成后由人工/编排推进列）' : ''}。`,
    `请按职责处理列 ${trigger.column} 的当前任务。`,
    contractFooter(),
  ].join('\n')
}

/**
 * 执行列流转编排：每 step 一条派单到 provider agent（zcode 引擎）；派单返回的
 * outcome 全量收集（P-D(c)：不再 `const [outcome]` 丢弃多余 mention 的结果）。
 * step 字段校验（P-D(d)）：拼文本前先过词表/字符集校验——provider/role 直接拼进
 * 文本即 mention/指令注入面；违规抛 ColumnDispatchConfigError（fail fast，不半途
 * 执行一半步骤）。
 */
export async function dispatchColumnTransition(
  service: MentionDispatchService,
  params: { from: string | null; to: string; workspacePath: string },
): Promise<ColumnDispatchResult> {
  const triggers = matchColumnTransition(params.from, params.to)
  for (const trigger of triggers) {
    for (const step of trigger.steps) {
      if (!isSafeStep(step)) {
        throw new ColumnDispatchConfigError(
          `列 ${trigger.column} step ${step.id || '?'} 配置非法（provider 限 zcode 词表；id/role/specialist 限 [A-Za-z0-9._-] 且 ≤64 字符）`,
        )
      }
      // SLO 错误预算闸（4A 治理层 ③）：GOVERNANCE_SLO_BUDGET=enforce 时 core 档
      // 预算耗尽抛 BudgetExhaustedError 拒绝派发；warn（默认）日志放行并记档。
      await checkDispatchBudget(step.specialist || step.id)
    }
  }
  const outcomes: MentionOutcome[] = []
  for (const trigger of triggers) {
    for (const [index, step] of trigger.steps.entries()) {
      // step→agent 派单：provider 已过词表校验才拼进目标 token；简报文本同理。
      const text = `@${step.provider} ${stepBrief(trigger, trigger.steps, index)}`
      const stepOutcomes = await service.dispatch({ workspacePath: params.workspacePath, text })
      outcomes.push(...stepOutcomes)
      // 派发结果台账（4A 第三期）：column 条目归因到 specialist/role/列，同 commandId
      // 与引擎单例落的 mention 条目去重（统计面优先取本条目）。
      for (const o of stepOutcomes) {
        appendDispatchOutcome({
          kind: 'column', target: step.provider, specialist: step.specialist || undefined,
          role: step.role || undefined, column: trigger.column, reason: o.reason,
          commandId: o.commandId, sessionId: o.sessionId, workspaceId: o.workspaceId,
          detail: o.detail?.slice(0, 200),
        })
      }
    }
  }
  return { triggers, outcomes }
}
