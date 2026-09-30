/**
 * 五流断点诊断（甲1，2026-09-30 调研落地）——组织五流（信息/决策/责任/资源/反馈）
 * 各配机检断点信号，聚合自 studio 自有数据面（派发台账/看板/升级域/qgate/能力台账）。
 *
 * 方法论：付聪《一个技术负责人，如何从"自己解决问题"升级到"让组织解决问题》第一节
 * ——"组织运行不顺不是因为人不努力，而是这五样东西在流转中出现了断点"。本模块把
 * 断点变成可对账的信号：每个信号标 severity 与证据源，源缺席如实 unknown 不编造。
 *
 * 阈值为 v1 校准值（阈值须按真实数据分布复调，不预设为永恒真理）：
 *   升级 pending>72h / 任务无人认领>72h / changes_requested 滞留>48h /
 *   语义上下文缺册率>20% 警 >50% 断 / 派发未送达率>30% 警 / in-flight≥5 过载。
 */
import {
  collectAssigneeStats, collectQgateRuns, collectSquadStats, dedupeDispatchEntries, deriveUsage,
  dispatchStats, kanbanDbFiles, openReadonly,
} from './governance-analytics'
import { loadCapabilityLedger } from './governance-ledger'
import { readDispatchLedger } from './dispatch-ledger'
import {
  listAll, recurrenceByScope, type RecurrenceGroup,
} from '../escalation/escalation-store'

export type FlowId = 'information' | 'decision' | 'responsibility' | 'resource' | 'feedback'

export interface OrgSignal {
  id: string
  severity: 'ok' | 'warn' | 'alert' | 'unknown'
  /** 人读值（如 "3/12"、"2 件"）。 */
  value: string
  /** 断点/健康描述（一句话，说清"缺什么、卡在哪"）。 */
  detail: string
  /** 证据源（数据来自哪个面）。 */
  evidence: string
}

export interface FlowDiagnosis {
  flow: FlowId
  title: string
  /** 该流的本体一句话（对齐文章第一节定义）。 */
  essence: string
  signals: OrgSignal[]
}

export interface ImprovementCandidate {
  tool: string
  incidents: number
  unattributed: number
  gaps: string[]
  /** 机制改进方向（gap→动作映射，方向性建议非结论）。 */
  direction: string
  lastAt: number
}

export interface OrgDiagnosisReport {
  generatedAt: number
  flows: FlowDiagnosis[]
  /** 人工介入趋势（以升级请求为代理信号——文章第九节自检的硬指标面）。 */
  manualIntervention: { last7d: number; last30d: number; totalDecided: number }
  unattributed: Array<{ escalationId: string; fromAgent: string; tool: string; decidedAt: number; verdict: string }>
  improvementCandidates: ImprovementCandidate[]
  /** 各源条目数（信号透明度：哪个源贡献了几条）。 */
  sources: Record<string, number>
}

const GAP_DIRECTIONS: Record<string, string> = {
  information: '信息没到达执行者——补派单语义上下文/授权要素完备性（甲3 面），让机制先于提问把信息给到',
  authority: '权限规则没前置——把这次升级的 scope 沉淀为 402 规则（批准即学习），下次免升级',
  capability: '能力不在位——能力台账核对该单元 maturity 与主承载认定，考虑培训/换承载/降档',
  resource: '资源没跟上——查 SLO 预算与三账资源账，调配或调预算档',
  feedback: '结果没回到系统——补门禁打回闭环与结案归因纪律，让同类信号前置暴露',
}

function sev(ok: boolean, warnThreshold: number, alertThreshold: number, ratio: number | null): OrgSignal['severity'] {
  if (ratio === null) return 'unknown'
  if (ratio >= alertThreshold) return 'alert'
  if (ratio >= warnThreshold) return 'warn'
  return 'ok'
}

interface KanbanAgingRow { unclaimedOld: number; unclaimedTotal: number; crOld: number; crTotal: number }

async function kanbanAging(now: number): Promise<KanbanAgingRow> {
  const out: KanbanAgingRow = { unclaimedOld: 0, unclaimedTotal: 0, crOld: 0, crTotal: 0 }
  for (const file of kanbanDbFiles()) {
    let db
    try {
      db = await openReadonly(file)
    } catch { continue }
    try {
      const rows = db.prepare(
        "SELECT assignee, status, created_at FROM tasks WHERE status NOT IN ('done','archived')",
      ).all() as unknown as Array<{ assignee: string | null; status: string; created_at: number }>
      for (const r of rows) {
        const ageH = (now / 1000 - (r.created_at ?? 0)) / 3600
        if (r.assignee === null || !r.assignee.trim()) {
          out.unclaimedTotal += 1
          if (ageH > 72) out.unclaimedOld += 1
        }
        if (r.status === 'changes_requested') {
          out.crTotal += 1
          if (ageH > 48) out.crOld += 1
        }
      }
    } catch { /* 单库读失败跳过（诚实降级） */ }
    finally { try { db.close() } catch { /* 已关 */ } }
  }
  return out
}

/** 五流断点诊断主入口（只读聚合，任何单源故障不拖垮整体——逐信号 unknown 降级）。 */
export async function orgDiagnosis(opts: { now?: number } = {}): Promise<OrgDiagnosisReport> {
  const now = opts.now ?? Date.now()
  const sources: Record<string, number> = {}

  // ---- 数据面实取（各源独立 try，缺席记 0 条不编造） ----
  const ledgerRes = loadCapabilityLedger()
  const ledger = ledgerRes.doc
  sources['capability-ledger'] = ledger?.units?.length ?? 0

  const rawLedger = readDispatchLedger(400)
  sources['dispatch-ledger'] = rawLedger.length
  const dedup = dedupeDispatchEntries(rawLedger)
  const stats = dispatchStats(dedup)

  const columnEntries = dedup.filter((e) => e.kind === 'column' && e.specialist)
  const ledgerUnitIds = new Set((ledger?.units ?? []).map((u) => u.id))
  const semanticMissing = columnEntries.filter((e) => !ledgerUnitIds.has(e.specialist as string))

  let unmappedCount = 0
  try {
    const [assigneeStats, squadStats] = await Promise.all([collectAssigneeStats(), collectSquadStats()])
    const usage = deriveUsage(ledger ?? { version: 1, reviewedAt: '', domains: [], capabilities: [], units: [] }, assigneeStats, squadStats, { dispatchEntries: dedup, now })
    unmappedCount = usage.unmappedAssignees.length
  } catch { /* usage 聚合失败保持 0，信号侧 unknown */ }

  const escalations = listAll()
  sources['escalation'] = escalations.length
  const pending = escalations.filter((e) => e.state === 'pending')
  const decided = escalations.filter((e) => e.state !== 'pending')
  const pendingOld = pending.filter((e) => now - e.at > 72 * 3600 * 1000)
  const unattr = decided.filter((e) => !e.attribution)
  const decided7d = decided.filter((e) => now - e.at < 7 * 86400 * 1000)
  const decided30d = decided.filter((e) => now - e.at < 30 * 86400 * 1000)

  const aging = await kanbanAging(now).catch(() => ({ unclaimedOld: 0, unclaimedTotal: 0, crOld: 0, crTotal: 0 }) as KanbanAgingRow)
  sources['kanban-tasks'] = aging.unclaimedTotal + aging.crTotal

  const assigneeInFlight = new Map<string, number>()
  try {
    const assigneeStats = await collectAssigneeStats()
    for (const [name, s] of assigneeStats) {
      if (name !== '(未指派)' && s.inFlight >= 5) assigneeInFlight.set(name, s.inFlight)
    }
  } catch { /* 过载信号侧 unknown */ }

  const gates = collectQgateRuns()
  sources['qgate-runs'] = gates.runs

  const recurrence = recurrenceByScope()
  const recurrenceGroups = [...recurrence.values()].filter((g) => g.incidents >= 2)
  const mechanismBroken = recurrenceGroups.reduce((acc, g) => acc + Object.values(g.byGap).reduce((a, b) => a + (b ?? 0), 0), 0)

  // ---- 五流信号 ----
  const semMissingRate = columnEntries.length > 0 ? semanticMissing.length / columnEntries.length : null
  const deferredPlusFail = stats.dispatched > 0 ? (stats.deferred + stats.failed) / stats.dispatched : null

  const flows: FlowDiagnosis[] = [
    {
      flow: 'information',
      title: '信息流',
      essence: '谁掌握什么信息，信息能否准确、及时地到达需要它的人',
      signals: [
        {
          id: 'dispatch.semanticMissing',
          severity: semMissingRate === null ? 'unknown' : sev(false, 0.2, 0.5, semMissingRate),
          value: `${semanticMissing.length}/${columnEntries.length}`,
          detail: semMissingRate === null
            ? '无列编排派发记录，无法评估派单语义上下文覆盖'
            : `列编排派单中 specialist 不在能力台账的占比 ${(semMissingRate * 100).toFixed(0)}%——这些派单不带语义上下文块（agent 不知道自己的本体位置）`,
          evidence: 'dispatch-ledger × capability-ledger（近 400 条去重）',
        },
        {
          id: 'usage.unmappedAssignees',
          severity: unmappedCount === 0 ? 'ok' : unmappedCount <= 3 ? 'warn' : 'alert',
          value: `${unmappedCount} 人`,
          detail: unmappedCount === 0
            ? '活跃 assignee 均有台账档'
            : `活跃但台账无档的 assignee ${unmappedCount} 个——责任面（谁主责）对这些人是断的`,
          evidence: 'kanban assignee × capability-ledger',
        },
      ],
    },
    {
      flow: 'decision',
      title: '决策流',
      essence: '谁有权做决定，出现分歧时怎样形成结论',
      signals: [
        {
          id: 'escalation.pendingAging',
          // 超 72h 一件即 alert：每一件都是 agent 正被卡死等决定，不按件数降级。
          severity: pending.length === 0 ? 'unknown' : pendingOld.length === 0 ? 'ok' : 'alert',
          value: `${pendingOld.length}/${pending.length}`,
          detail: pending.length === 0
            ? '无待决升级（决策流当前无积压）'
            : `待决升级中 ${pendingOld.length} 件超 72h 未裁决${pendingOld.length > 0 ? '——agent 在等一个没来的决定' : ''}`,
          evidence: 'escalation 域 pending 队列',
        },
        {
          id: 'escalation.unattributed',
          severity: unattr.length === 0 ? (decided.length > 0 ? 'ok' : 'unknown') : unattr.length <= 2 ? 'warn' : 'alert',
          value: `${unattr.length}/${decided.length}`,
          detail: unattr.length === 0
            ? (decided.length > 0 ? '已裁决升级全部完成机制归因' : '尚无已裁决升级')
            : `已裁决升级 ${unattr.length} 件未做机制归因——"为什么原有机制没提前处理"没有答案，同类问题会再来`,
          evidence: 'escalation 域 attribution 字段',
        },
        {
          id: 'dispatch.undelivered',
          severity: deferredPlusFail === null ? 'unknown' : sev(false, 0.3, 0.6, deferredPlusFail),
          value: deferredPlusFail === null ? '—' : `${(deferredPlusFail * 100).toFixed(0)}%`,
          detail: deferredPlusFail === null
            ? '无派发记录，无法评估送达'
            : `派发未送达（deferred+失败）占比 ${(deferredPlusFail * 100).toFixed(0)}%——决定做了但没到达执行者`,
          evidence: 'dispatch-ledger 送达判定（queued/coalesced=送达）',
        },
      ],
    },
    {
      flow: 'responsibility',
      title: '责任流',
      essence: '谁对什么结果负责，出了问题应该由谁牵头处理',
      signals: [
        {
          id: 'task.unclaimedAging',
          severity: aging.unclaimedTotal === 0 ? 'unknown' : aging.unclaimedOld === 0 ? 'ok' : aging.unclaimedOld <= 3 ? 'warn' : 'alert',
          value: `${aging.unclaimedOld}/${aging.unclaimedTotal}`,
          detail: aging.unclaimedTotal === 0
            ? '无未指派在途任务'
            : `未指派在途任务 ${aging.unclaimedOld} 件超 72h 无人认领——任务安排了责任没落下去`,
          evidence: 'kanban tasks（root+boards，排除 done/archived）',
        },
        {
          id: 'task.changesRequestedAging',
          severity: aging.crTotal === 0 ? 'unknown' : aging.crOld === 0 ? 'ok' : aging.crOld <= 3 ? 'warn' : 'alert',
          value: `${aging.crOld}/${aging.crTotal}`,
          detail: aging.crTotal === 0
            ? '无 changes_requested 在途任务'
            : `changes_requested 滞留 ${aging.crOld} 件超 48h——打回之后没有人牵头接住`,
          evidence: 'kanban tasks（root+boards）',
        },
      ],
    },
    {
      flow: 'resource',
      title: '资源流',
      essence: '人、时间、预算和工具怎样配置',
      signals: [
        {
          id: 'assignee.overload',
          severity: assigneeInFlight.size === 0 ? 'ok' : assigneeInFlight.size <= 2 ? 'warn' : 'alert',
          value: `${assigneeInFlight.size} 人`,
          detail: assigneeInFlight.size === 0
            ? '无 in-flight≥5 的过载 assignee（阈值 v1 校准值）'
            : `in-flight≥5 的过载 assignee：${[...assigneeInFlight.entries()].map(([n, c]) => `${n}(${c})`).join('、')}——关键角色过载信号（三账资源账联动）`,
          evidence: 'kanban in-flight 统计（阈值 5 为 v1 校准值）',
        },
        {
          id: 'gate.failRate',
          severity: gates.runs === 0 ? 'unknown' : (gates.passRate ?? 0) >= 0.9 ? 'ok' : (gates.passRate ?? 0) >= 0.7 ? 'warn' : 'alert',
          value: gates.passRate === null ? '—' : `${(gates.passRate * 100).toFixed(0)}%`,
          detail: gates.runs === 0
            ? '无 qgate 运行记录'
            : `门禁通过率 ${(gates.passRate * 100).toFixed(0)}%（${gates.runs} 次运行）——fail 密集说明返工在消耗产能`,
          evidence: '.qgate/runs（gate.passRate 口径：NA 双侧剔除）',
        },
      ],
    },
    {
      flow: 'feedback',
      title: '反馈流',
      essence: '结果怎样被验证，经验和错误怎样回到系统中',
      signals: [
        {
          id: 'attribution.recurrence',
          severity: recurrenceGroups.length === 0 ? (decided.length > 0 ? 'ok' : 'unknown') : mechanismBroken > 0 ? 'alert' : 'warn',
          value: `${recurrenceGroups.length} 组`,
          detail: recurrenceGroups.length === 0
            ? (decided.length > 0 ? '无同类复发（每 scope 单发）' : '尚无已裁决升级，复发分析无样本')
            : `同类升级复发 ${recurrenceGroups.length} 组（按 scope.tool 聚合），其中归因为机制断点（gap≠none）${mechanismBroken} 件——"同样的问题下一次还需要亲自出来解决吗"答案是部分仍需要`,
          evidence: 'escalation 域 recurrenceByScope（incidents≥2）',
        },
        {
          id: 'gate.failNoFollowup',
          severity: aging.crTotal === 0 && gates.runs === 0 ? 'unknown' : aging.crOld === 0 ? 'ok' : 'warn',
          value: `${aging.crOld} 件`,
          detail: aging.crOld === 0
            ? '打回任务均在 48h 内有人接手（以 changes_requested 滞留为反馈闭环代理信号）'
            : `打回任务 ${aging.crOld} 件超 48h 无后续——验证信号发了，经验没回到系统`,
          evidence: 'kanban changes_requested 滞留（反馈闭环代理信号）',
        },
      ],
    },
  ]

  const improvementCandidates: ImprovementCandidate[] = recurrenceGroups
    .filter((g) => Object.values(g.byGap).some((n) => (n ?? 0) > 0) || g.unattributed > 0)
    .sort((a, b) => b.incidents - a.incidents)
    .map((g: RecurrenceGroup) => {
      const gaps = Object.entries(g.byGap).filter(([, n]) => (n ?? 0) > 0).map(([k]) => k)
      const primary = gaps[0]
      return {
        tool: g.tool,
        incidents: g.incidents,
        unattributed: g.unattributed,
        gaps,
        direction: primary
          ? GAP_DIRECTIONS[primary] ?? '复盘该 scope 的升级链，确定断点归因'
          : `该 scope ${g.unattributed} 件复发升级未归因——先补归因才知道机制缺哪块`,
        lastAt: g.lastAt,
      }
    })

  return {
    generatedAt: now,
    flows,
    manualIntervention: {
      last7d: decided7d.length,
      last30d: decided30d.length,
      totalDecided: decided.length,
    },
    unattributed: unattr.map((e) => ({
      escalationId: e.escalationId,
      fromAgent: e.fromAgent,
      tool: e.scope.tool,
      decidedAt: e.decision?.at ?? e.at,
      verdict: e.state,
    })),
    improvementCandidates,
    sources,
  }
}
