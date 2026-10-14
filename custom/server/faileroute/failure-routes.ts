// overlay[faileroute] 失败路由显式表（2026-10-14 阿里调研轮 E 项）。
//
// 语义：把失败三档回退（调研正本 §1-3：测试挂→原地修；方向错→带证据回上游
// 重做；反复不收敛→人闸）从散件升为一张显式路由表：失败类型→回退点→携带物。
// 既有件对位（表内 existingAnchor）：原地修=熔断指纹自动复位（run19 首验）；
// 人闸=escalation 域（urgency 三档/幂等/裁决）；「不收敛」判据=goalbudget 域
// 三维触顶（步数/token/时限）；缺陷循环=defect-loop。缺的中间档（方向错→回
// 上游重调研）在本表成显式规则，供派单/缺陷循环消费。
//
// 定位：本表是声明式决策面——出「路由决定+卡标注文本」，不自动改派（改行为
// 必须过人，G 闸哲学；消费方=缺陷循环/巡检标注/人工改派裁决的提示行）。

export type FailureClass =
  | 'test_fail'        // 测试未过（验证不通过）
  | 'direction_wrong'  // 方案方向错（评审/裁决认定）
  | 'budget_exhausted' // 预算触顶（goalbudget 步数/token/时限任一）
  | 'non_convergent'   // 反复尝试不收敛（同错重试≥阈值）
  | 'stall_timeout'    // 停滞超时（卡 blocked-stale / gate-stuck 检测器命中）

export type RouteAction =
  | 'in_place_fix'       // 原地修：回原会话/原卡继续
  | 'upstream_redispatch'// 回上游：带失败证据回调研/方案段重做
  | 'human_gate'         // 人闸：升级人工裁决（escalation）

export interface RouteRule {
  failureClass: FailureClass
  action: RouteAction
  /** 回退点（人话：回到哪里继续） */
  fallbackTo: string
  /** 携带物（下一手必须带上的东西） */
  carry: string[]
  rationale: string
  /** 本仓既有件锚（对账用） */
  existingAnchor: string
}

export const ROUTE_TABLE: Record<FailureClass, RouteRule> = {
  test_fail: {
    failureClass: 'test_fail',
    action: 'in_place_fix',
    fallbackTo: '原会话/原修复卡继续修复',
    carry: ['失败断言原文', '复现命令', '本卡历史尝试'],
    rationale: '测试挂优先原地修——上下文还在，回上游反而丢证据',
    existingAnchor: '熔断指纹自动复位（run19 2026-10-14 首验）+ 缺陷修复卡链',
  },
  direction_wrong: {
    failureClass: 'direction_wrong',
    action: 'upstream_redispatch',
    fallbackTo: '回调研/方案段重新探索（不回实现段）',
    carry: ['失败证据', '方向错在哪的裁决/评审结论', '已排除的路径清单'],
    rationale: '方向错时继续修是烧 token——带失败证据回上游重做，避免同坑重踩',
    existingAnchor: '人工改派裁决（run19 卡 t_f7276cc1 先例）；本表把该档升为显式规则',
  },
  budget_exhausted: {
    failureClass: 'budget_exhausted',
    action: 'human_gate',
    fallbackTo: '升级人工裁决（escalation），人或加预算或改派或放弃',
    carry: ['触顶维度与余量', '已完成部分', '继续的预期收益'],
    rationale: '预算触顶不是失败是资源决策——只有人能决定追加还是止损',
    existingAnchor: 'goalbudget 域三维触顶（步数/token/时限）+ escalation 域',
  },
  non_convergent: {
    failureClass: 'non_convergent',
    action: 'human_gate',
    fallbackTo: '升级人工裁决（escalation），请人补判断',
    carry: ['同错重试次数与指纹', '全部已试方案', '失败证据汇总'],
    rationale: '反复不收敛说明问题定义可能有误——人补判断比再试一轮便宜',
    existingAnchor: 'escalation 域（urgency 三档/幂等 escalationId/一次定音裁决）',
  },
  stall_timeout: {
    failureClass: 'stall_timeout',
    action: 'human_gate',
    fallbackTo: '升级人工/监督处置（先定性停摆还是等待，再决定回退档）',
    carry: ['停滞时长与最后推进时刻', '会话健康证据', '在等谁（依赖/裁决/审批）'],
    rationale: '停滞先定性再路由——run19 教训：评审争议与死等表现相同，误路由会烧时间',
    existingAnchor: 'clusterinspector 检测器（blocked-stale/gate-stuck）+ supervisor 催办链',
  },
}

export interface RouteDecision {
  rule: RouteRule
  /** 覆盖原因（如 test_fail 重试≥N 次升人闸）；无覆盖为空 */
  overrideReason?: string
  /** 卡标注文本（消费方拼进卡 body/备注） */
  hintLine: string
}

export const DEFAULT_MAX_IN_PLACE_ATTEMPTS = 3

/**
 * 路由解析：表为主，重试计数覆盖为辅——test_fail 在同卡已尝试 ≥maxAttempts 次
 * 仍失败时升 non_convergent 语义（人闸），防原地修死循环。
 */
export function resolveRoute(
  failureClass: FailureClass,
  opts: { attempts?: number; maxAttempts?: number } = {},
): RouteDecision {
  const base = ROUTE_TABLE[failureClass]
  if (!base) throw new Error(`未知失败类型：${failureClass}`)
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_IN_PLACE_ATTEMPTS
  if (failureClass === 'test_fail' && (opts.attempts ?? 0) >= maxAttempts) {
    const escalated = ROUTE_TABLE.non_convergent
    return {
      rule: escalated,
      overrideReason: `test_fail 已尝试 ${opts.attempts} 次（≥${maxAttempts}），升档为反复不收敛`,
      hintLine: hintLineFor(escalated, `升档依据：test_fail 已尝试 ${opts.attempts} 次`),
    }
  }
  return { rule: base, hintLine: hintLineFor(base) }
}

export function hintLineFor(rule: RouteRule, suffix?: string): string {
  const parts = [
    `失败路由：${rule.failureClass} → ${actionLabel(rule.action)}（${rule.fallbackTo}）`,
    `携带：${rule.carry.join('、')}`,
    `依据：${rule.rationale}`,
  ]
  if (suffix) parts.push(suffix)
  return parts.join('；')
}

export function actionLabel(action: RouteAction): string {
  if (action === 'in_place_fix') return '原地修'
  if (action === 'upstream_redispatch') return '带证据回上游'
  return '人闸（升级人工裁决）'
}

export const FAILURE_CLASSES: readonly FailureClass[] = [
  'test_fail', 'direction_wrong', 'budget_exhausted', 'non_convergent', 'stall_timeout',
]
