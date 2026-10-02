/**
 * 驾驭工程 B3：L1-L5 成熟度自检（量化版，呼应信通院报告对 L1-L5 的关键批评）。
 *
 * 报告批评：L1-L5 分级缺量化口径（失败率/MTTR/越权拦截率/成本任务/人工介入率/
 * 审计完整率），只能当自检清单不能当认证分。本模块的产品化回应：
 *   - 每级达成项必须带证据（哪条指标/哪个源支撑），evidence 引用实收数字
 *   - 量化指标从既有函数取数（dispatch-ledger/governance-audit/cost-accounts/
 *     capability-catalog/approval rules/qgate），全部 fail-soft
 *   - 数据缺就标 unavailable（value=null + note），禁止编造或插值
 *   - 输出自检清单而非打分——响应 meta 注明「自检清单非认证」
 *
 * 级别语义（报告四大职能/八原语/成熟度的对照，定义静态化在此单一事实源）：
 *   L1 工具接入 / L2 运行底座 / L3 治理闭环 / L4 协同自治 / L5 规模生产
 */
import { auditLog } from '../governance/governance-audit'
import { readDispatchLedger, type DispatchLedgerEntry } from '../governance/dispatch-ledger'
import { dispatchStats } from '../governance/governance-analytics'
import { listFreezeWindows, listRequests } from '../governance/change-governance-store'
import { collectCapabilityCatalog } from './capability-catalog'
import { collectCostAccounts, isHumanInterventionEvent } from './cost-accounts'
import { countApprovalRules, countGatePacks } from './primitives'

// ── 类型 ───────────────────────────────────────────────────────────

export interface MaturityInputs {
  days: number
  /** 能力目录（B1）；null=目录不可用 */
  capability: { total: number; bySource: Record<string, number> } | null
  sessionsCount: number | null
  /** 派发台账（窗口内）；null=台账不可用 */
  dispatch: { dispatched: number; deliveredRate: number | null; failedRate: number | null } | null
  /** 窗口内人工干预事件数；null=审计源全缺 */
  interventionsCount: number | null
  /** 四源中在档源数（0-4）；null=探测失败 */
  auditSourcesAvailable: number | null
  tokenTotal: number | null
  tasksDoneInWindow: number | null
  approvalRulesCount: number | null
  changeRequestsCount: number | null
  freezeWindowsTotal: number | null
  gatePacksCount: number | null
  reworkHours: number | null
}

export interface MaturityMetric {
  key: string
  /** null=unavailable（数据缺，不造数） */
  value: number | null
  unit: string
  source: string
  note?: string
}

export interface MaturityItem {
  title: string
  /** true=达成 / false=未达成 / null=数据缺席无法判定 */
  passed: boolean | null
  evidence: string
  /** 关联量化指标 key（可选） */
  metric?: string
}

export interface MaturityLevel {
  level: number
  key: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  name: string
  /** true=全项达成 / false=有项未达成 / null=有项无法判定且无未达成 */
  achieved: boolean | null
  items: MaturityItem[]
}

export interface MaturityReport {
  days: number
  levels: MaturityLevel[]
  metrics: MaturityMetric[]
  meta: {
    note: string
    levelsNote: string
  }
}

// ── 纯函数：自检判定 ───────────────────────────────────────────────

function div(a: number | null, b: number | null): number | null {
  return a != null && b != null && b > 0 ? a / b : null
}

function pct(v: number | null): string {
  return v == null ? 'n/a' : `${Math.round(v * 1000) / 10}%`
}

/**
 * L1-L5 自检（纯函数，输入全量 MaturityInputs；无 IO）。
 * 判定纪律：指标缺数 → passed=null（无法判定），不许借 0 值凑通过。
 */
export function assessMaturity(inputs: MaturityInputs): MaturityReport {
  const { capability, dispatch, sessionsCount, interventionsCount, auditSourcesAvailable, tokenTotal, tasksDoneInWindow } = inputs

  // ── 量化指标（报告点名的口径，能取则取、缺则 unavailable） ──
  const humanInterventionRate = div(interventionsCount, dispatch?.dispatched ?? null)
  const auditCompleteness = auditSourcesAvailable != null ? auditSourcesAvailable / 4 : null
  const costPerTask = div(tokenTotal, tasksDoneInWindow)
  const dispatchFailureRate = dispatch?.failedRate ?? null

  const metrics: MaturityMetric[] = [
    {
      key: 'human-intervention-rate', value: humanInterventionRate, unit: 'ratio',
      source: '人工干预事件数（audit approvals/升级裁决类）÷ 派发数（dispatch-ledger）',
      note: dispatch == null || dispatch.dispatched === 0 ? '派发台账无窗口内在档数据，无法计算（不造数）' : undefined,
    },
    {
      key: 'audit-completeness', value: auditCompleteness, unit: 'ratio',
      source: '审计四源在档源数 ÷ 4（governance-audit sources）',
      note: auditCompleteness == null ? '审计源探测失败，无法计算' : undefined,
    },
    {
      key: 'cost-per-task', value: costPerTask, unit: 'tokens/task',
      source: 'token 合计（sessions token 列）÷ 窗口 done 任务数（kanban）',
      note: costPerTask == null ? 'token 或 done 任务数据缺席（分母为 0 同样无意义），不造数' : undefined,
    },
    {
      key: 'dispatch-failure-rate', value: dispatchFailureRate, unit: 'ratio',
      source: '派发未送达且非延期数 ÷ 派发数（dispatchStats：dispatched-delivered-deferred）',
      note: dispatchFailureRate == null ? '派发台账无数据，无法计算' : undefined,
    },
    {
      key: 'mttr', value: null, unit: 'minutes',
      source: '（暂无在档恢复时间数据源——kanban 无 blocked 起止史、dispatch 无失败恢复留痕）',
      note: 'unavailable：现有事实源不含故障恢复时间，不造数（报告批评的口径缺口如实呈现）',
    },
  ]

  const item = (title: string, passed: boolean | null, evidence: string, metric?: string): MaturityItem =>
    ({ title, passed, evidence, metric })

  // ── L1 工具接入 ──
  const mcpCount = capability?.bySource.mcpcatalog ?? null
  const l1: MaturityLevel = {
    level: 1, key: 'L1', name: '工具接入',
    achieved: null, items: [
      item(
        '能力目录有条目（三系登记在册）',
        capability != null ? capability.total > 0 : null,
        capability == null ? '能力目录不可用，无法判定' : `能力目录 ${capability.total} 条（mcpcatalog ${capability.bySource.mcpcatalog ?? 0} / extmarket ${capability.bySource.extmarket ?? 0} / registry-admin ${capability.bySource['registry-admin'] ?? 0}）`,
      ),
      item(
        'MCP 工具接入在档',
        mcpCount != null ? mcpCount > 0 : null,
        mcpCount == null ? 'mcpcatalog 系不可用，无法判定' : `mcpconfig 配置在档 ${mcpCount} 条`,
      ),
    ],
  }

  // ── L2 运行底座 ──
  const l2: MaturityLevel = {
    level: 2, key: 'L2', name: '运行底座',
    achieved: null, items: [
      item('会话在档', sessionsCount != null ? sessionsCount > 0 : null, sessionsCount == null ? 'hermes-web-ui.db 不可用，无法判定' : `sessions 表 ${sessionsCount} 条`),
      item('派发台账在记', dispatch != null ? dispatch.dispatched > 0 : null, dispatch == null ? 'dispatch-ledger 不可用，无法判定' : `窗口内派发 ${dispatch.dispatched} 条`),
    ],
  }

  // ── L3 治理闭环 ──
  const l3: MaturityLevel = {
    level: 3, key: 'L3', name: '治理闭环',
    achieved: null, items: [
      item('审批规则在档', inputs.approvalRulesCount != null ? inputs.approvalRulesCount > 0 : null, inputs.approvalRulesCount == null ? 'approval rules.json 不可读，无法判定' : `审批规则 ${inputs.approvalRulesCount} 条`),
      item('变更治理流程启用', inputs.changeRequestsCount != null ? inputs.changeRequestsCount > 0 : null, inputs.changeRequestsCount == null ? 'change-governance.db 不可读，无法判定' : `变更单 ${inputs.changeRequestsCount} 笔`),
      item('冻结窗口配置', inputs.freezeWindowsTotal != null ? inputs.freezeWindowsTotal > 0 : null, inputs.freezeWindowsTotal == null ? 'change-governance.db 不可读，无法判定' : `冻结窗口 ${inputs.freezeWindowsTotal} 个`),
      item(
        '审计完整率 ≥ 50%（≥2/4 源在档）',
        auditCompleteness != null ? auditCompleteness >= 0.5 : null,
        auditCompleteness == null ? '审计源探测失败，无法判定' : `在档 ${inputs.auditSourcesAvailable}/4 源（完整率 ${pct(auditCompleteness)}）`,
        'audit-completeness',
      ),
    ],
  }

  // ── L4 协同自治 ──
  const l4: MaturityLevel = {
    level: 4, key: 'L4', name: '协同自治',
    achieved: null, items: [
      item(
        '人工介入率有数且 ≤ 30%',
        humanInterventionRate != null ? humanInterventionRate <= 0.3 : null,
        humanInterventionRate == null ? '派发或干预数据缺席，无法判定（不造数）' : `窗口内干预 ${interventionsCount} 次 / 派发 ${dispatch?.dispatched} 次 = ${pct(humanInterventionRate)}`,
        'human-intervention-rate',
      ),
      item(
        '派发成功率有数且 ≥ 80%',
        dispatch?.deliveredRate != null ? dispatch.deliveredRate >= 0.8 : null,
        dispatch?.deliveredRate == null ? '派发台账无数据，无法判定' : `送达率 ${pct(dispatch.deliveredRate)}（queued/coalesced 计送达）`,
      ),
    ],
  }

  // ── L5 规模生产 ──
  const l5: MaturityLevel = {
    level: 5, key: 'L5', name: '规模生产',
    achieved: null, items: [
      item(
        '审计完整率 100%（四源全在档）',
        auditCompleteness != null ? auditCompleteness >= 1 : null,
        auditCompleteness == null ? '审计源探测失败，无法判定' : `在档 ${inputs.auditSourcesAvailable}/4 源`,
        'audit-completeness',
      ),
      item(
        '单位任务成本有数（可记账）',
        costPerTask != null ? true : null,
        costPerTask == null ? 'token 或 done 任务数据缺席，无法判定（不造数）' : `${Math.round(tokenTotal ?? 0)} tokens / ${tasksDoneInWindow} done 任务 ≈ ${Math.round(costPerTask)} tokens/task`,
        'cost-per-task',
      ),
      item('评估门禁包在档', inputs.gatePacksCount != null ? inputs.gatePacksCount > 0 : null, inputs.gatePacksCount == null ? 'gate-packs 目录不可读，无法判定' : `qgate 门禁包 ${inputs.gatePacksCount} 个`),
    ],
  }

  const levels = [l1, l2, l3, l4, l5].map((lv) => {
    const hasFalse = lv.items.some((i) => i.passed === false)
    const allTrue = lv.items.every((i) => i.passed === true)
    return { ...lv, achieved: hasFalse ? false : allTrue ? true : null }
  })

  return {
    days: inputs.days,
    levels,
    metrics,
    meta: {
      note: '自检清单非认证：本报告是达成项证据清单（可对账到源），不是成熟度认证分',
      levelsNote: 'L1 工具接入 / L2 运行底座 / L3 治理闭环 / L4 协同自治 / L5 规模生产（信通院《驾驭工程》分级语义）',
    },
  }
}

// ── 输入收集（控制器用；逐源 fail-soft） ──────────────────────────

function windowDispatch(days: number): MaturityInputs['dispatch'] {
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

export async function collectMaturityInputs(days = 7): Promise<MaturityInputs> {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 90)

  const [catalog, costs, audit] = await Promise.all([
    collectCapabilityCatalog().catch(() => null),
    collectCostAccounts({ days: safeDays }).catch(() => null),
    auditLog({ limit: 500 }).catch(() => null),
  ])

  const capability = catalog
    ? { total: catalog.gapSummary.totalEntries, bySource: Object.fromEntries(Object.entries(catalog.gapSummary.bySource).map(([k, v]) => [k, v.total])) }
    : null

  const tokenAccount = costs?.accounts.find((a) => a.key === 'token')
  const tokenData = tokenAccount?.data as { sessionsCount: number | null; totalTokens: number | null } | undefined
  const waitAccount = costs?.accounts.find((a) => a.key === 'waitLatency')
  const waitData = waitAccount?.data as { tasksDone: number | null } | undefined
  const interventions = costs?.accounts.find((a) => a.key === 'humanIntervention')
  const interventionData = interventions?.data as { events: number | null } | undefined
  // 干预计数在 maturity 里独立于账目口径重算（同一 auditLog 窗口，同谓词）：
  // 成本账缺账时（collectCostAccounts 整体异常）audit 直查兜底
  let interventionsCount: number | null = interventionData?.events ?? null
  if (interventionsCount == null && audit) {
    const anyAvailable = audit.sources.some((s) => s.available)
    const sinceMs = Date.now() - safeDays * 86400000
    interventionsCount = anyAvailable ? audit.events.filter((e) => e.ts >= sinceMs && isHumanInterventionEvent(e)).length : null
  }
  // 审计完整率同样独立探测（不依赖成本账成功与否）
  const auditSourcesAvailable = audit ? audit.sources.filter((s) => s.available).length : null

  let approvalRules: number | null = null
  try { approvalRules = countApprovalRules() } catch { approvalRules = null }
  let changeRequestsCount: number | null = null
  try { changeRequestsCount = listRequests({}).length } catch { changeRequestsCount = null }
  let freezeWindowsTotal: number | null = null
  try { freezeWindowsTotal = listFreezeWindows().length } catch { freezeWindowsTotal = null }
  let gatePacks: number | null = null
  try { gatePacks = countGatePacks() } catch { gatePacks = null }

  return {
    days: safeDays,
    capability,
    sessionsCount: tokenData?.sessionsCount ?? null,
    dispatch: windowDispatch(safeDays),
    interventionsCount,
    auditSourcesAvailable,
    tokenTotal: tokenData?.totalTokens ?? null,
    tasksDoneInWindow: waitData?.tasksDone ?? null,
    approvalRulesCount: approvalRules,
    changeRequestsCount,
    freezeWindowsTotal,
    gatePacksCount: gatePacks,
    reworkHours: (costs?.accounts.find((a) => a.key === 'rework')?.data as { reworkHours: number | null } | undefined)?.reworkHours ?? null,
  }
}
