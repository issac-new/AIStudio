// custom/server/outcome/state-machine.ts
// Outcome 状态机与重开语义（spec §3.2：draft→active→observing→settled；
// draft/active/observing→cancelled 须理由；settled/cancelled 为终态）。
// 纯函数：无 IO、无时间依赖——时间戳与事件落账由控制器注入（Task 4+）；
// 本模块只裁决迁移合法性，observing→settled 的签署语义归结算端点。
import type { OutcomeContract, OutcomeStatus } from './types'
import { validateContractInput } from './validate'

/** 观察迁移守卫入参（简报逐字）：allTasksTerminal 服务 active→observing，
 *  reason 服务 →cancelled；trim 后空串视为缺省。 */
export interface TransitionGuardsInput {
  /** 根任务及全部同 outcome 子任务是否已终结（spec §3.2 进入 observing 的核验前提）。 */
  allTasksTerminal: boolean
  /** 取消理由；→cancelled 必填非空。 */
  reason?: string
}

/** 错误码：tasks_unfinished/needs_settlement/settled_terminal 简报逐字；
 *  其余为必要补充（illegal_transition=迁移表外，invalid_contract=合同未过
 *  Task 1 校验，reason_required=取消缺理由，cancelled_terminal=终态与 settled 对称）。 */
export type TransitionErrorCode =
  | 'illegal_transition'
  | 'invalid_contract'
  | 'tasks_unfinished'
  | 'reason_required'
  | 'needs_settlement'
  | 'settled_terminal'
  | 'cancelled_terminal'

export type TransitionResult =
  | { ok: true }
  | { ok: false; problems: string[]; code?: TransitionErrorCode }

/** 迁移表（spec §3.2 生命周期图）：仅这些 from→to 边合法；
 *  observing→settled 在表内但仅经结算端点（needs_settlement）；settled/cancelled 无出边。 */
const LEGAL_EDGES = new Set([
  'draft->active',
  'active->observing',
  'observing->settled',
  'draft->cancelled',
  'active->cancelled',
  'observing->cancelled',
])

/** 状态迁移守卫：裁决 (contract.status → to) 是否放行。
 *  guards 缺省按 fail-closed 处理（allTasksTerminal 视为 false、reason 视为空），
 *  宁可拒合法边也不放行非法边。 */
export function transitionGuards(
  contract: OutcomeContract,
  to: OutcomeStatus,
  guards: TransitionGuardsInput,
): TransitionResult {
  const from = contract?.status
  if (!from) return { ok: false, problems: ['contract 缺失或无 status'], code: 'illegal_transition' }

  // 终态先于迁移表判定：settled 无任何出边（简报逐字 code；重开走 applyReopen）；
  // cancelled 同为终态（spec §3.2 图上只有入边）。
  if (from === 'settled')
    return {
      ok: false,
      problems: ['settled 为终态、无出边；重开走 applyReopen'],
      code: 'settled_terminal',
    }
  if (from === 'cancelled')
    return { ok: false, problems: ['cancelled 为终态、无出边'], code: 'cancelled_terminal' }

  const edge = `${from}->${to}`
  if (!(LEGAL_EDGES as Set<string>).has(edge))
    return {
      ok: false,
      problems: [
        `非法迁移 ${edge}（迁移表：draft→active、active→observing、observing→settled 仅经结算端点、draft/active/observing→cancelled）`,
      ],
      code: 'illegal_transition',
    }

  const g = guards ?? { allTasksTerminal: false }

  if (edge === 'draft->active') {
    // 合同完整性守卫复用 Task 1 校验器（单一事实源），problems 原样透传；
    // separationNotice 是人判提示、不阻断（validate.ts 契约）。
    const v = validateContractInput(contract)
    if (v.problems.length) return { ok: false, problems: v.problems, code: 'invalid_contract' }
    return { ok: true }
  }

  if (edge === 'active->observing') {
    if (!g.allTasksTerminal)
      return {
        ok: false,
        problems: ['根任务及全部同 outcome 子任务未全部终结，不得进入 observing'],
        code: 'tasks_unfinished',
      }
    return { ok: true }
  }

  if (edge === 'observing->settled')
    return {
      ok: false,
      problems: ['observing→settled 仅经结算端点签署（verdict 独立裁决），状态机不直接迁移'],
      code: 'needs_settlement',
    }

  // 剩余合法边全是 →cancelled：reason 非空（trim 后计；spec §3.2「须理由与责任人」，
  // 责任人由控制器从登录态取，纯函数不接身份入参）。
  const reason = typeof g.reason === 'string' ? g.reason.trim() : ''
  if (!reason)
    return { ok: false, problems: ['取消必须携带非空 reason'], code: 'reason_required' }
  return { ok: true }
}

export interface ReopenResult {
  contract: OutcomeContract
  /** 被取代结算 id（简报裁决：供控制器写 settlement_superseded 事件）。
   *  空串=本次重开无被取代结算（observing 期重开且从未结算），控制器据此跳过该事件。 */
  supersededSettlementId: string
}

/** 重开语义（spec §3.2：根任务重开或工程验收被撤销→outcome 退回 active、
 *  旧结算标 superseded）：仅 settled/observing 生效；非重开态返回 null。
 *  纯函数：不改 version（重开不是合同语义变更，spec §4.1）、不改 updatedAt
 *  （时间戳由调用方注入）；latestSettlementId 由控制器查事件账后传入。 */
export function applyReopen(
  contract: OutcomeContract,
  latestSettlementId: string,
): ReopenResult | null {
  if (contract?.status !== 'settled' && contract?.status !== 'observing') return null
  return {
    contract: { ...contract, status: 'active' },
    supersededSettlementId: latestSettlementId,
  }
}
