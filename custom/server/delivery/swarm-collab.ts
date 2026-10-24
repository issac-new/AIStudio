// overlay[delivery]: 多 Agent 群体协作读数纯函数（2026-10-24 群体协作评测基准吸收轮）。
// 源文口径（银翼AI评测室《多 Agent 群体协作的评测基准设计方法》）四维度：
//   通信拓扑与信息流效能 / 混合动机场景 / 信用分配与帕累托 / 社会动力学与拜占庭容错。
// 本模块只观测换算，不进任何门禁判据（spec 2026-10-24-swarm-eval-benchmark-absorption.md D2）。
// 口径诚实降档（D3-D8）：成本=消息字符代理（token 依赖 run-trace span，挂账）；意图保真=锚点口径；
//   criticality=观察口径（非实验性消融）；Shapley=任务粒度观察联盟近似；回音壁=既有判词换算。
// 数据源（全部既有产物，零新增埋点）：
//   scenario.log 派发行/真值行 · compensation-ledger.tsv（复用 interventions 解析）·
//   issues.log · uat-verdicts.jsonl（复用 interventions 解析）· release-gate.jsonl。

/** 派发行轻量结构（scenario.log：`[mux HH:MM:SS] [sender] 派发 ($eventId): @target:matrix.test 正文`） */
export interface DispatchLine {
  ts: string
  sender: string
  eventId: string
  target: string
  text: string
  chars: number
  taskId: string | null
  moduleSlug: string | null
}

/** issues.log 轻量行（`ISSUE|key|owner|desc`） */
export interface IssueLite {
  key: string
  owner: string
  desc: string
}

export interface AgentCredit {
  agent: string
  /** 该账号代演发出的派发行数（协调成本侧） */
  sentDispatches: number
  /** 派发给该 agent 的任务行数 */
  assignedDispatches: number
  /** issues.log 中 owner 归到该 agent 的问题单数（含任务 ID 形态 owner） */
  issuesOwned: number
  /** 被派发任务中拿到真值 ✓ 完成锚的数量 */
  completedAnchors: number
  /** 观察口径关键支撑度：其被派发任务完成率 − 其缺席任务完成率（无对照=null） */
  criticalityObserved: number | null
  /** 观察联盟边际均值（Shapley 任务粒度近似；无成对联盟=null） */
  shapleyProxy: number | null
}

export interface ParetoPoint {
  agent: string
  /** 成本代理：该 agent 牵涉的派发消息字符（发出+接收） */
  cost: number
  /** 收益：完成锚数量 */
  benefit: number
  /** 是否在非支配前沿（同成本无更高收益、同收益无更低成本者） */
  onFrontier: boolean
}

export interface SwarmCollabReadout {
  run: string
  generatedAt: string
  sources: string[]
  communication: {
    dispatchCount: number
    dispatchChars: number
    distinctSenders: number
    distinctTargets: number
    taskIds: string[]
    /** 通信开销比字符口径：每任务协作消息字符（MOR 代理；token 口径挂账） */
    morCharsPerTask: number | null
    morBasis: 'chars'
    intentFidelity: {
      /** 有派发行为的任务数（可判锚点） */
      anchoredTasks: number
      /** 派发行同时保住任务 ID+模块锚的任务数 */
      preserved: number
      rate: number | null
      basis: 'anchor'
    }
    deadlockSignals: {
      /** 回灌类代偿条数（互相等待未闭环的补登） */
      backfillCount: number
      /** 代偿中回灌占比（分母=台账总条数；无台账=null） */
      backfillRatio: number | null
      receiptMissing: number
      raciMissing: number
      nudgeCount: number
    }
  }
  credit: {
    agents: AgentCredit[]
    criticalityBasis: 'observed'
    shapleyBasis: 'task-coalition-proxy'
    /** 观察到的任务联盟数（assignee 集合去重） */
    coalitionsCovered: number
    /** 完成锚口径任务数/任务总数 */
    taskCompletion: { done: number; total: number }
  }
  pareto: {
    basis: 'chars'
    points: ParetoPoint[]
    frontierSize: number
  }
  social: {
    uat: { total: number; pass: number; conditional: number; reject: number }
    /** 无条件一致通过率（回音壁倾向度：越高越需警惕；打回是批判性在线的证据） */
    unconditionalPassRate: number | null
    /** G5 发布门最终判定 reject 计数 */
    gateRejects: number
    /** G5 打回类问题单计数（g5-ready-fail/g5-fail-settled；打回轮的完整史在 issues，release-gate.jsonl 只存终判） */
    gateFailIssues: number
    /** 流程拦截面：问题单发现总数（发现=被拦截，非漏网） */
    issuesCaught: number
    byzantine: { status: 'no_data'; note: string }
  }
}

/** 任务 ID：AN-XXX 单段与 UC-RFD-001 多段两种形态（实测 run22 派发行） */
const TASK_ID_RE = /\b(?:AN|UC|RFD)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/
const MODULE_SLUG_RE = /\b(?:csw)-[a-z0-9-]+\b/
const DISPATCH_RE = /^\[mux \d{2}:\d{2}:\d{2}\] \[([\w.-]+)\] 派发 \(\$(\S+)\): @([\w.-]+):matrix\.test\s+(.*)$/

/** scenario.log → 派发行（坏行跳过；正文截 2000 字符防单行爆内存） */
export function parseScenarioDispatches(text: string): DispatchLine[] {
  const out: DispatchLine[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const m = DISPATCH_RE.exec(line)
    if (!m) continue
    const body = m[4].slice(0, 2000)
    out.push({
      ts: '', sender: m[1], eventId: m[2], target: m[3], text: body,
      chars: line.length,
      taskId: TASK_ID_RE.exec(body)?.[0] ?? null,
      moduleSlug: MODULE_SLUG_RE.exec(body)?.[0] ?? null,
    })
  }
  return out
}

/** issues.log → 轻量行（`ISSUE|key|owner|desc`；列数不足跳过） */
export function parseIssuesLog(text: string): IssueLite[] {
  const out: IssueLite[] = []
  for (const raw of text.split('\n')) {
    const t = raw.trim()
    if (!t.startsWith('ISSUE|')) continue
    const cols = t.split('|')
    if (cols.length < 3) continue
    out.push({ key: cols[1], owner: cols[2], desc: (cols[3] ?? '').slice(0, 300) })
  }
  return out
}

/** scenario.log → 拿到真值 ✓ 完成锚的任务 ID 集合（`[真值] …<任务ID>… ✓` 行） */
export function completedTaskIds(text: string): Set<string> {
  const done = new Set<string>()
  for (const raw of text.split('\n')) {
    if (!raw.includes('真值') || !raw.includes('✓')) continue
    for (const id of raw.match(new RegExp(TASK_ID_RE.source, 'g')) ?? []) done.add(id)
  }
  return done
}

function rate(numer: number, denom: number): number | null {
  return denom > 0 ? numer / denom : null
}

/** 非支配前沿标记（成本越小、收益越好；被任何点支配=离前沿） */
export function markParetoFrontier(points: Array<Omit<ParetoPoint, 'onFrontier'>>): ParetoPoint[] {
  return points.map(p => ({
    ...p,
    onFrontier: !points.some(q => q !== p && q.cost <= p.cost && q.benefit >= p.benefit && (q.cost < p.cost || q.benefit > p.benefit)),
  }))
}

export interface SwarmCollabInput {
  run: string
  scenarioLog: string | null
  /** parseLedgerTsv 已解析的台账行（compensation-ledger.tsv） */
  ledgerRows: Array<{ id: string; ts: string; type: string; defect: string; detail: string }>
  issuesLog: string | null
  uatVerdicts: Array<{ ac: string; verdict: string }>
  gateDecisions: Array<{ decision: string }>
}

/** 四维度读数总装（纯函数；输入缺席组如实 null/0，不编造） */
export function swarmCollabOf(input: SwarmCollabInput): SwarmCollabReadout {
  const dispatches = input.scenarioLog != null ? parseScenarioDispatches(input.scenarioLog) : []
  const issues = input.issuesLog != null ? parseIssuesLog(input.issuesLog) : []
  const done = input.scenarioLog != null ? completedTaskIds(input.scenarioLog) : new Set<string>()

  // ── 维度一：通信拓扑与信息流效能 ──
  const taskIds = [...new Set(dispatches.map(d => d.taskId).filter((t): t is string => !!t))]
  const senders = new Set(dispatches.map(d => d.sender))
  const targets = new Set(dispatches.map(d => d.target))
  const dispatchChars = dispatches.reduce((s, d) => s + d.chars, 0)
  const anchoredTasks = taskIds.filter(id => dispatches.some(d => d.taskId === id))
  const preserved = anchoredTasks.filter(id =>
    dispatches.some(d => d.taskId === id && d.moduleSlug != null && d.text.includes(id)),
  )
  const backfills = input.ledgerRows.filter(r => r.type === 'dispatch-preset' && r.detail.trim().startsWith('backfill'))
  const nudges = input.ledgerRows.filter(r => r.type === 'nudge')

  // ── 维度三（信用）任务事实表：assignee（派发 target 去 -agent 后缀）→ 任务完成 ──
  interface TaskFact { id: string; assignees: Set<string>; done: boolean }
  const taskFacts: TaskFact[] = taskIds.map(id => ({
    id,
    assignees: new Set(dispatches.filter(d => d.taskId === id).map(d => d.target.replace(/-agent$/, ''))),
    done: done.has(id),
  }))
  const completionRate = (subset: TaskFact[]) => (subset.length ? subset.filter(t => t.done).length / subset.length : null)

  // 观察口径 criticality：其参与任务完成率 − 其缺席任务完成率（两侧都需有样本）
  // Shapley 近似：观察联盟边际均值——对每个含 i 的观察联盟 S，找同任务域里 i 缺席的对照联盟
  const agentsOf = (cond: (t: TaskFact) => boolean) =>
    new Set(taskFacts.filter(cond).flatMap(t => [...t.assignees]))
  const allAgents = new Set<string>([
    ...dispatches.map(d => d.sender),
    ...[...targets].map(t => t.replace(/-agent$/, '')),
  ])
  const agents: AgentCredit[] = [...allAgents].sort().map(agent => {
    const mine = taskFacts.filter(t => t.assignees.has(agent))
    const others = taskFacts.filter(t => !t.assignees.has(agent))
    const mineRate = completionRate(mine)
    const othersRate = completionRate(others)
    // 边际对照：agent 参与的联盟完成率 − 同批任务里它缺席时的完成率（逐任务成对才有效样本）
    const paired = mine.length > 0 && others.length > 0
    return {
      agent,
      sentDispatches: dispatches.filter(d => d.sender === agent).length,
      assignedDispatches: dispatches.filter(d => d.target.replace(/-agent$/, '') === agent).length,
      issuesOwned: issues.filter(i => i.owner === agent || i.owner === `${agent}-agent`).length,
      completedAnchors: mine.filter(t => t.done).length,
      criticalityObserved: paired && mineRate != null && othersRate != null ? mineRate - othersRate : null,
      shapleyProxy: paired && mineRate != null && othersRate != null ? mineRate - othersRate : null,
    }
  })

  // ── 维度三（帕累托）：成本=牵涉消息字符，收益=完成锚 ──
  const rawPoints = [...allAgents].sort().map(agent => {
    const involved = dispatches.filter(
      d => d.sender === agent || d.target.replace(/-agent$/, '') === agent,
    )
    return {
      agent,
      cost: involved.reduce((s, d) => s + d.chars, 0),
      benefit: taskFacts.filter(t => t.assignees.has(agent) && t.done).length,
    }
  })
  const points = markParetoFrontier(rawPoints)

  // ── 维度四：社会动力学 ──
  const uat = input.uatVerdicts
  const pass = uat.filter(v => v.verdict === 'pass').length
  const conditional = uat.filter(v => v.verdict === 'conditional').length
  const reject = uat.filter(v => v.verdict === 'reject').length

  return {
    run: input.run,
    generatedAt: new Date().toISOString(),
    sources: [],
    communication: {
      dispatchCount: dispatches.length,
      dispatchChars,
      distinctSenders: senders.size,
      distinctTargets: targets.size,
      taskIds,
      morCharsPerTask: rate(dispatchChars, taskIds.length),
      morBasis: 'chars',
      intentFidelity: {
        anchoredTasks: anchoredTasks.length,
        preserved: preserved.length,
        rate: rate(preserved.length, anchoredTasks.length),
        basis: 'anchor',
      },
      deadlockSignals: {
        backfillCount: backfills.length,
        backfillRatio: rate(backfills.length, input.ledgerRows.length),
        receiptMissing: issues.filter(i => i.key === 'receipt-missing').length,
        raciMissing: issues.filter(i => i.key === 'raci-dispatch-missing' || i.key === 'raci-not-structured').length,
        nudgeCount: nudges.length,
      },
    },
    credit: {
      agents,
      criticalityBasis: 'observed',
      shapleyBasis: 'task-coalition-proxy',
      coalitionsCovered: new Set(taskFacts.map(t => [...t.assignees].sort().join('+'))).size,
      taskCompletion: { done: taskFacts.filter(t => t.done).length, total: taskFacts.length },
    },
    pareto: { basis: 'chars', points, frontierSize: points.filter(p => p.onFrontier).length },
    social: {
      uat: { total: uat.length, pass, conditional, reject },
      unconditionalPassRate: rate(pass, uat.length),
      gateRejects: input.gateDecisions.filter(g => g.decision === 'reject').length,
      gateFailIssues: issues.filter(i => i.key === 'g5-ready-fail' || i.key === 'g5-fail-settled').length,
      issuesCaught: issues.length,
      byzantine: { status: 'no_data', note: '行为级拜占庭注入需专门 run（spec D7 挂账）；本读数不造数' },
    },
  }
}
