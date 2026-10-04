// overlay/custom/server/harness/eval-layers.ts
// 驾驭工程 B5：四层评估读模型（2026-10-04 九源调研落地项②）。
//
// 出处：《Harness、Loop Engineering、Graph Engineering：如何选择，如何评估》
// （智趣AI 笔记 2026-08-27）——"评估不能只看最后一篇文章"：结果质量/执行质量/
// 资源效率/治理质量四层各用不同证据；"不能用单一完成率代替四层证据"。
// 产品化定位：把既有仪表（派发台账/成本账/审计）按四层归位，并把文中给出的
// 五个治理量化口径（重复副作用率/恢复成功率/人工接管率/路由违约率/预算停止
// 准确率）作为 gap 指标显式立账——口径原文入 definition，数据未采不造数
// （与 maturity.ts 同一纪律：value=null 标 unavailable）。
import { auditLog } from '../governance/governance-audit'
import { readDispatchLedger, type DispatchLedgerEntry } from '../governance/dispatch-ledger'
import { dispatchStats } from '../governance/governance-analytics'
import { collectCostAccounts, isHumanInterventionEvent } from './cost-accounts'
import { collectGovernanceMetrics } from './gov-metrics'

export type EvalLayerKey = 'result' | 'execution' | 'resource' | 'governance'

export interface EvalMetric {
  key: string
  /** instrumented=既有仪表可取数 / gap=口径已立、数据未采（不造数） */
  status: 'instrumented' | 'gap'
  value: number | null
  unit: string
  source: string
  /** gap 指标的计算口径（调研源原文口径的忠实转写，前端本地化展示） */
  definition?: string
  note?: string
}

export interface EvalLayer {
  key: EvalLayerKey
  metrics: EvalMetric[]
}

export interface EvalLayersInputs {
  days: number
  dispatch: { dispatched: number; deliveredRate: number | null; failedRate: number | null } | null
  tokenTotal: number | null
  /** P6a：优先 ≤24h 完成子集口径（全量 p95 被长周期挂板项拉失义） */
  waitP95Seconds: number | null
  /** 全量口径（长周期含入）；null=账缺 */
  waitP95SecondsAll: number | null
  /** 超 24h 完成的长周期条数（口径分层的透明度字段） */
  waitOverDayCount: number | null
  reworkHours: number | null
  interventionsCount: number | null
  /** P6b（2026-10-04 九源轮）：三可算治理指标（gov-metrics 采集；null=账本缺席/分母为 0） */
  routeViolation?: { value: number | null; numerator: number; denominator: number; note: string } | null
  recoverySuccess?: { value: number | null; numerator: number; denominator: number; note: string } | null
  humanTakeover?: { value: number | null; numerator: number; denominator: number; note: string } | null
  /** 两个仍 gap 指标的采集点缺口说明（loop 侧加账后接入） */
  duplicateSideEffectGapReason?: string
  budgetStopGapReason?: string
}

export interface EvalLayersReport {
  layers: EvalLayer[]
  counts: { instrumented: number; gap: number }
  meta: {
    note: string
    source: string
    gapNote: string
  }
}

/** 五个治理量化口径（源文原文口径；gap 指标的单一事实源在此，UI 与审计共用）。 */
export const GOVERNANCE_METRIC_DEFINITIONS: Record<string, string> = {
  duplicateSideEffectRate: '重复执行的外部动作数 / 外部动作总数（按幂等键去重，未知状态不能直接算成功）',
  recoverySuccessRate: '未产生重复副作用且达到目标状态的恢复运行数 / 进入恢复流程的运行数（单独记录仍需人工确认的 unknown）',
  humanTakeoverRate: '进入 Human Gate 的运行数 / 进入不可判定或高风险状态的运行数（固定人工门触发条件和统计窗口）',
  routeViolationRate: '触发未声明边的次数 / 总边选择次数（包括绕过 Hard Constraint 的路径）',
  budgetStopAccuracy: '按约定停止或转移的预算耗尽运行数 / 预算耗尽运行总数（记录停止原因和预算版本）',
}

/** 纯组装：四层分类 + instrumented/gap 立账（不 IO；collect 与 build 分离便于测试）。 */
export function buildEvalLayers(inputs: EvalLayersInputs): EvalLayersReport {
  const layers: EvalLayer[] = [
    {
      key: 'result',
      metrics: [
        {
          key: 'dispatchDeliveredRate',
          status: 'instrumented',
          value: inputs.dispatch?.deliveredRate ?? null,
          unit: 'ratio',
          source: 'governance/dispatch-ledger（窗口内派发送达率）',
          note: inputs.dispatch ? `窗口 ${inputs.days} 天 · ${inputs.dispatch.dispatched} 次派发` : '台账不可用',
        },
        {
          key: 'dispatchFailedRate',
          status: 'instrumented',
          value: inputs.dispatch?.failedRate ?? null,
          unit: 'ratio',
          source: 'governance/dispatch-ledger（派发失败率=送达与延后之外）',
        },
        {
          key: 'escapedDefectRate',
          status: 'gap',
          value: null,
          unit: 'ratio',
          source: 'V5 全流程方案长线累积项（口径已立数据未采）',
          definition: '逃逸到发布后的缺陷 / 发布前已知缺陷（G5 准出闸的对照指标）',
        },
      ],
    },
    {
      key: 'execution',
      metrics: [
        {
          key: 'routeViolationRate',
          status: inputs.routeViolation ? 'instrumented' : 'gap',
          value: inputs.routeViolation?.value ?? null,
          unit: 'ratio',
          source: inputs.routeViolation ? 'harness/gov-metrics（loop graph_events 聚合）' : 'loop 引擎事件日志（账本缺席）',
          definition: GOVERNANCE_METRIC_DEFINITIONS.routeViolationRate,
          note: inputs.routeViolation?.note,
        },
        {
          key: 'budgetStopAccuracy',
          status: 'gap',
          value: null,
          unit: 'ratio',
          source: 'loop 引擎 BudgetGuard',
          definition: GOVERNANCE_METRIC_DEFINITIONS.budgetStopAccuracy,
          note: inputs.budgetStopGapReason,
        },
      ],
    },
    {
      key: 'resource',
      metrics: [
        {
          key: 'tokenTotal',
          status: 'instrumented',
          value: inputs.tokenTotal,
          unit: 'tokens',
          source: 'harness/cost-accounts token 账',
          note: inputs.tokenTotal == null ? 'token 账不可用' : `窗口 ${inputs.days} 天`,
        },
        {
          key: 'waitP95Seconds',
          status: 'instrumented',
          value: inputs.waitP95Seconds,
          unit: 's',
          source: 'harness/cost-accounts 等待时延账（≤24h 完成子集 p95；长周期项另列）',
          note: inputs.waitOverDayCount != null ? `超 24h 长周期 ${inputs.waitOverDayCount} 条不计入（全量 p95=${inputs.waitP95SecondsAll ?? '—'}s）` : undefined,
        },
        {
          key: 'reworkHours',
          status: 'instrumented',
          value: inputs.reworkHours,
          unit: 'h',
          source: 'harness/cost-accounts 故障返工账',
        },
      ],
    },
    {
      key: 'governance',
      metrics: [
        {
          key: 'humanInterventions',
          status: 'instrumented',
          value: inputs.interventionsCount,
          unit: 'count',
          source: 'governance-audit（isHumanInterventionEvent 窗口计数）',
          note: inputs.interventionsCount == null ? '审计源缺席' : `窗口 ${inputs.days} 天`,
        },
        {
          key: 'duplicateSideEffectRate',
          status: 'gap',
          value: null,
          unit: 'ratio',
          source: 'loop 事件日志 eid 幂等去重',
          definition: GOVERNANCE_METRIC_DEFINITIONS.duplicateSideEffectRate,
          note: inputs.duplicateSideEffectGapReason,
        },
        {
          key: 'recoverySuccessRate',
          status: inputs.recoverySuccess ? 'instrumented' : 'gap',
          value: inputs.recoverySuccess?.value ?? null,
          unit: 'ratio',
          source: inputs.recoverySuccess ? 'harness/gov-metrics（中断 run 终态聚合）' : 'loop checkpoint/session-resume（账本缺席）',
          definition: GOVERNANCE_METRIC_DEFINITIONS.recoverySuccessRate,
          note: inputs.recoverySuccess?.note,
        },
        {
          key: 'humanTakeoverRate',
          status: inputs.humanTakeover ? 'instrumented' : 'gap',
          value: inputs.humanTakeover?.value ?? null,
          unit: 'ratio',
          source: inputs.humanTakeover ? 'harness/gov-metrics（审批台账 human/auto_pass）' : '审批收件箱（台账缺席）',
          definition: GOVERNANCE_METRIC_DEFINITIONS.humanTakeoverRate,
          note: inputs.humanTakeover?.note,
        },
      ],
    },
  ]
  const all = layers.flatMap((l) => l.metrics)
  return {
    layers,
    counts: {
      instrumented: all.filter((m) => m.status === 'instrumented').length,
      gap: all.filter((m) => m.status === 'gap').length,
    },
    meta: {
      note: '四层评估：结果是否可用 / 执行是否遵守契约 / 资源是否受控 / 治理是否能解释和恢复——不能只用单一完成率。',
      source: 'Harness·Loop·Graph 选型文（2026-08-27）四层评估框架 + 五治理指标口径',
      gapNote: 'gap=口径已立、数据未采；不造数不插值，采纳后按 definition 采集。',
    },
  }
}

/** 窗口派发统计（与 maturity.ts windowDispatch 同法；独立复制避免跨模块私有依赖）。 */
function windowDispatch(days: number): EvalLayersInputs['dispatch'] {
  try {
    const sinceMs = Date.now() - days * 86400000
    const entries = readDispatchLedger(2000).filter((e: DispatchLedgerEntry) => e.ts >= sinceMs)
    if (entries.length === 0) return { dispatched: 0, deliveredRate: null, failedRate: null }
    const st = dispatchStats(entries)
    return {
      dispatched: st.dispatched,
      deliveredRate: st.deliveredRate,
      failedRate: st.dispatched > 0 ? (st.dispatched - st.delivered - st.deferred) / st.dispatched : null,
    }
  } catch {
    return null
  }
}

/** 采集（fail-soft：任一源缺席置 null，不阻断其余）。 */
export async function collectEvalLayersInputs(days = 7): Promise<EvalLayersInputs> {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 90)
  const [costs, audit] = await Promise.all([
    collectCostAccounts({ days: safeDays }).catch(() => null),
    auditLog({ limit: 500 }).catch(() => null),
  ])
  const tokenData = costs?.accounts.find((a) => a.key === 'token')?.data as { totalTokens: number | null } | undefined
  const waitData = costs?.accounts.find((a) => a.key === 'waitLatency')?.data as { p95Seconds: number | null; p95SecondsWithinDay?: number | null; overDayCount?: number | null } | undefined
  const reworkData = costs?.accounts.find((a) => a.key === 'rework')?.data as { reworkHours: number | null } | undefined
  let interventionsCount: number | null = null
  if (audit && audit.sources.some((s) => s.available)) {
    const sinceMs = Date.now() - safeDays * 86400000
    interventionsCount = audit.events.filter((e) => e.ts >= sinceMs && isHumanInterventionEvent(e)).length
  }
  const gov = collectGovernanceMetrics(safeDays)
  return {
    days: safeDays,
    dispatch: windowDispatch(safeDays),
    tokenTotal: tokenData?.totalTokens ?? null,
    waitP95Seconds: waitData?.p95SecondsWithinDay ?? waitData?.p95Seconds ?? null,
    waitP95SecondsAll: waitData?.p95Seconds ?? null,
    waitOverDayCount: typeof waitData?.overDayCount === 'number' ? waitData.overDayCount : null,
    reworkHours: reworkData?.reworkHours ?? null,
    interventionsCount,
    routeViolation: gov.routeViolationRate,
    recoverySuccess: gov.recoverySuccessRate,
    humanTakeover: gov.humanTakeoverRate,
    duplicateSideEffectGapReason: gov.duplicateSideEffectRate.gapReason,
    budgetStopGapReason: gov.budgetStopAccuracy.gapReason,
  }
}
