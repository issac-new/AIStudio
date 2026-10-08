// overlay/custom/server/incident/incident-report.ts
// 事故报告汇编器（2026-10-08 六文调研轮 A+B）：把散在七八个存储里的运行数据，
// 按 arXiv 2609.24515 三类 17 要素一键汇编。每要素独立降级——缺席如实标 absent
// 并注明原因，绝不造数（红线：不编造）。
//
// B（自治度对账）核心命题："设计态 ≠ 运行态"——出事那一步实际有多大的权，
// 和配置表上写的不一样。理论面从配置域拼合（权限模式/Goal 自主档/审批规则面），
// 实际面从运行轨迹取（审批实际触发次数/自动通过抽检/错误工具结局），
// 偏差即黄条。已知边界：会话级权限模式引擎通道未开（permmodes v4 缺口，
// permission-modes.ts 注释记档），理论面按可得的配置面拼合并如实注记。
import {
  INCIDENT_CATEGORIES, INCIDENT_ELEMENT_TITLES,
  type AutonomyDivergence, type AutonomyFace, type AutonomyReconciliation,
  type IncidentCategory, type IncidentElement, type IncidentElementKey, type IncidentReport,
} from './incident-types'
import {
  findFirstDb, readApprovalWindow, readIdentitySnapshot,
  readMemoryAudit, readSessionMessages, readSessionOverview, readToolAuditWindow,
  readTraceSummary, readWorkflowEvidence,
  type ApprovalWindow, type IdentitySnapshot, type MemoryAuditWindow,
  type SessionMessages, type ToolAuditWindow, type TraceSummary, type WorkflowEvidence,
} from './incident-sources'
import { ladderForProfile, LADDER_LEVEL_TITLES } from '../autonomyladder/autonomy-ladder'

export interface IncidentOpts {
  dbPath?: string
  traceDir?: string
  ekkoDb?: string
  now?: number
}

function el(
  key: IncidentElementKey, category: IncidentCategory,
  status: IncidentElement['status'], summary: string, sources: string[],
  note?: string, detail?: unknown,
): IncidentElement {
  return { key, title: INCIDENT_ELEMENT_TITLES[key], category, status, summary, sources, note, detail }
}

/** 外部数据读取面（测试注入点：全部可替换）。 */
export interface IncidentSourceBundle {
  dbFile: string | null
  overview: ReturnType<typeof readSessionOverview>
  messages: SessionMessages | null
  trace: TraceSummary | null
  toolAudit: ToolAuditWindow
  approvals: ApprovalWindow
  identity: IdentitySnapshot
  memory: MemoryAuditWindow | null
  workflow: WorkflowEvidence | null
}

export function loadSources(sessionId: string, opts: IncidentOpts = {}): IncidentSourceBundle {
  const dbFile = findFirstDb(opts.dbPath)
  const overview = dbFile ? readSessionOverview(dbFile, sessionId) : null
  const messages = dbFile ? readSessionMessages(dbFile, sessionId) : null
  const trace = readTraceSummary(opts.traceDir, sessionId)
  const toolAudit = readToolAuditWindow()
  const approvals = readApprovalWindow()
  const profileNames = [overview?.profile].filter((p): p is string => Boolean(p && p.trim()))
  const identity = readIdentitySnapshot(profileNames)
  const memory = readMemoryAudit(opts.ekkoDb, sessionId)
  const workflow = dbFile ? readWorkflowEvidence(dbFile, sessionId) : null
  return { dbFile, overview, messages, trace, toolAudit, approvals, identity, memory, workflow }
}

// ---------- B：自治度对账 ----------

function theoreticalFace(bundle: IncidentSourceBundle, sessionId: string): AutonomyFace {
  const sources: string[] = []
  const facts: string[] = []
  // 配置面 0（H2 起最高优先）：自治阶梯配置（BCG 洞察/辅助/自动执行 + 人工确认点清单）
  let ladderNote: string | undefined
  try {
    // 动态 import 防循环依赖；fail-soft（配置域故障不拖垮报告）
    const ladder = ladderForProfile(bundle.overview?.profile ?? '')
    if (ladder) {
      sources.push('~/.hermes-web-ui/autonomy-ladder/ladder.json')
      facts.push(`自治阶梯=${ladder.level}（${LADDER_LEVEL_TITLES[ladder.level]}）`)
      if (ladder.approvalPoints.length > 0) facts.push(`人工确认点 ${ladder.approvalPoints.length} 个：${ladder.approvalPoints.slice(0, 5).join('、')}`)
      facts.push(`允许的最高风险档=${ladder.maxRiskTier}`)
    }
  } catch { ladderNote = '自治阶梯配置读取失败（按缺席处理）' }
  // 配置面 1：agentidentity 声明的工具白名单（空=未声明，不等于无限制——域内口径）
  for (const m of bundle.identity.matched) {
    sources.push('agent-identity/identities.json')
    facts.push(m.toolAllowlist.length > 0
      ? `身份 ${m.name} 声明工具白名单 ${m.toolAllowlist.length} 项`
      : `身份 ${m.name} 未声明工具白名单（≠无限制）`)
  }
  // 配置面 2：审批体系在档决策模式（approve/once/always/deny 的历史面即授权宽度的运行痕迹）
  if (bundle.approvals.entries > 0) {
    sources.push('~/.hermes-web-ui/approvals/history.json')
    const always = bundle.approvals.byDecision['always'] ?? 0
    const deny = bundle.approvals.byDecision['deny'] ?? 0
    if (always > 0) facts.push(`历史审批中 ${always} 条 always（批准即学习，同类不再问人）`)
    if (deny > 0) facts.push(`历史审批中 ${deny} 条 deny（明确拒绝面）`)
    if (always === 0 && deny === 0) facts.push('历史审批无 always/deny——授权宽度未扩展，逐次审批面为主')
  }
  // 已知缺口如实注记（permmodes v4 通道未开——理论面不完整，不装完整）
  const note = ladderNote ?? '会话级权限模式（permmodes 七档）引擎通道未开（v4 缺口，permission-modes.ts 记档）；自治阶梯为配置呈现面（执行拦截是 H3 待接轮）——理论面按自治阶梯+身份白名单+审批历史拼合'
  if (facts.length === 0) return { sources, facts: ['无任何配置面证据（身份未注册、审批历史为空、无自治阶梯配置）'], status: 'absent', note }
  return { sources, facts, status: facts.length >= 2 ? 'collected' : 'partial', note }
}

function effectiveFace(bundle: IncidentSourceBundle, sessionId: string): AutonomyFace {
  const sources: string[] = []
  const facts: string[] = []
  if (bundle.trace) {
    sources.push(bundle.trace.file)
    const toolCalls = bundle.trace.toolCalls.length
    const errors = bundle.trace.errorSpans.length
    facts.push(`轨迹中实际执行工具调用 ${toolCalls} 次，其中失败 ${errors} 次`)
    const names = Object.keys(bundle.trace.toolArgKeys)
    if (names.length > 0) facts.push(`实际触达的工具种类：${names.slice(0, 12).join('、')}${names.length > 12 ? ' 等' : ''}`)
    if (bundle.trace.subagents.length > 0) facts.push(`实际派生子 Agent ${bundle.trace.subagents.length} 个（${bundle.trace.subagents.map((s) => s.label).slice(0, 6).join('、')}）`)
  }
  if (bundle.messages) {
    sources.push('hermes-web-ui.db/messages')
    const humanTurns = bundle.messages.byRole['user'] ?? 0
    facts.push(`会话中人介入 ${humanTurns} 轮 / 消息总计 ${bundle.messages.total} 条`)
  }
  if (bundle.approvals.entries > 0) {
    sources.push('~/.hermes-web-ui/approvals/history.json')
    facts.push(`审批窗口内人工裁决 ${bundle.approvals.entries} 条（窗口=最近 ${Math.min(200, bundle.approvals.entries)} 条，未按 session 绑定）`)
  }
  if (facts.length === 0) return { sources, facts: ['无运行轨迹证据（trace 文件与消息表均缺席）'], status: 'absent', note: 'run-trace 插件未开启或 session 无消息落库' }
  return { sources, facts, status: 'collected' }
}

function reconcile(theoretical: AutonomyFace, effective: AutonomyFace, bundle: IncidentSourceBundle): AutonomyDivergence[] {
  const out: AutonomyDivergence[] = []
  // 偏差 0（H2 阶梯对账）：配置面限 insight/assist，轨迹面却深度自主执行
  try {
    const ladder = ladderForProfile(bundle.overview?.profile ?? '')
    if (ladder && ladder.level !== 'auto' && bundle.trace && bundle.trace.toolCalls.length > 10) {
      out.push({
        finding: `自治阶梯配置=${ladder.level}（应有${ladder.level === 'insight' ? '人工决策' : '人工确认关键步'}），但轨迹实际执行工具调用 ${bundle.trace.toolCalls.length} 次（深度自主形态）——配置未被执行面约束（H3 拦截通道未接的现实证据）`,
        severity: 'warn',
        evidence: ['~/.hermes-web-ui/autonomy-ladder/ladder.json', bundle.trace.file],
      })
    }
  } catch { /* 配置域故障不影响其余对账 */ }
  // 偏差 1：声明了工具白名单，但轨迹里出现了白名单外的工具
  const allow = new Set(bundle.identity.matched.flatMap((m) => m.toolAllowlist))
  if (allow.size > 0 && bundle.trace) {
    const outside = [...new Set(bundle.trace.toolCalls.map((t) => t.name))].filter((n) => !allow.has(n))
    if (outside.length > 0) {
      out.push({
        finding: `轨迹中出现白名单外的工具调用：${outside.join('、')}——设计态白名单未约束住运行态`,
        severity: 'warn',
        evidence: [bundle.trace.file],
      })
    }
  }
  // 偏差 2：审批历史全是 always（授权宽度全开），但事故轨迹中有失败的高风险面
  const always = bundle.approvals.byDecision['always'] ?? 0
  if (bundle.approvals.entries > 0 && always / bundle.approvals.entries > 0.8 && bundle.trace && bundle.trace.errorSpans.length > 0) {
    out.push({
      finding: `授权宽度面 ${always}/${bundle.approvals.entries} 为 always（>80% 批准即学习），叠加 ${bundle.trace.errorSpans.length} 次工具失败——高自主+高失败组合，建议收窄 always 面`,
      severity: 'warn',
      evidence: ['~/.hermes-web-ui/approvals/history.json', bundle.trace.file],
    })
  }
  // 偏差 3：理论面缺席但运行面很活跃——自治度事实上由运行面单独决定
  if (theoretical.status === 'absent' && effective.status === 'collected') {
    out.push({
      finding: '无配置面证据但运行面活跃——Agent 的自治度事实上由运行时单独决定，设计态零约束记录',
      severity: 'warn',
      evidence: effective.sources,
    })
  }
  if (out.length === 0) {
    out.push({ finding: '配置面与运行面未发现显性偏差（含理论面部分覆盖情形，结论强度受配置面缺口限制）', severity: 'info', evidence: [...theoretical.sources, ...effective.sources] })
  }
  return out
}

// ---------- 17 要素汇编 ----------

export function buildIncidentReport(sessionId: string, opts: IncidentOpts = {}): IncidentReport {
  const bundle = loadSources(sessionId, opts)
  const generatedAt = opts.now ?? Date.now()
  const elements: IncidentElement[] = []
  const dbLabel = bundle.dbFile ?? '(未找到 hermes-web-ui.db)'

  // ---- 轨迹类 ----
  if (bundle.messages) {
    elements.push(el('message_history', 'trajectory', 'collected',
      `共 ${bundle.messages.total} 条消息（user ${bundle.messages.byRole['user'] ?? 0}/assistant ${bundle.messages.byRole['assistant'] ?? 0}/tool ${bundle.messages.byRole['tool'] ?? 0}），跨时 ${spanMs(bundle.messages.firstTs, bundle.messages.lastTs)}`,
      [`${dbLabel}#messages`], undefined,
      { total: bundle.messages.total, byRole: bundle.messages.byRole, preview: bundle.messages.rows.slice(0, 10) }))
  } else {
    elements.push(el('message_history', 'trajectory', 'absent', '消息历史未采集', [dbLabel],
      'messages 表无此 session 行，或主库文件未找到'))
  }

  if (bundle.messages && bundle.messages.reasoningTurns > 0) {
    elements.push(el('reasoning_tokens', 'trajectory', 'collected',
      `${bundle.messages.reasoningTurns} 轮带推理记录（reasoning 字段）；轨迹侧 LLM 调用 ${bundle.trace?.llmCalls ?? 0} 次`,
      [`${dbLabel}#messages.reasoning`, bundle.trace ? `${bundle.trace.file}#llm_span` : ''].filter(Boolean)))
  } else {
    elements.push(el('reasoning_tokens', 'trajectory', 'absent', '无推理过程记录', [dbLabel],
      '模型未暴露推理 tokens，或该会话无 reasoning 落库（论文亦承认：推理 tokens 现实中未必可得）'))
  }

  // 数据来源：从轨迹工具入参键推断外部触达面（URL/文件路径类参数键）
  const sourceTools = bundle.trace
    ? Object.entries(bundle.trace.toolArgKeys).filter(([n]) => /^(browser_|read_file|memory_|web|fetch|search)/.test(n))
    : []
  if (bundle.trace && sourceTools.length > 0) {
    elements.push(el('data_sources', 'trajectory', 'partial',
      `轨迹显示触达外部数据面：${sourceTools.map(([n]) => n).join('、')}；具体 URL/版本未逐条快照`,
      [`${bundle.trace.file}#tool_span.args`], '上下文只留压缩边界快照（chat_compression_snapshots），整份 prompt 逐次快照未采集——论文指出的 Context 易失性问题'))
  } else {
    elements.push(el('data_sources', 'trajectory', 'absent', '外部数据来源未采集', [bundle.trace ? bundle.trace.file : '(trace 缺席)'],
      '无轨迹证据，或该 run 未触达外部数据工具'))
  }

  const memNote = bundle.memory
    ? { file: bundle.memory.file, events: bundle.memory.events, forSession: bundle.memory.forSession, byType: bundle.memory.byType }
    : null
  if (bundle.trace && bundle.trace.toolCalls.length > 0) {
    elements.push(el('data_read_write', 'trajectory', bundle.memory ? 'collected' : 'partial',
      `工具读写面：${bundle.trace.toolCalls.length} 次调用${memNote ? `；记忆审计事件 ${memNote.events} 条（本 session ${memNote.forSession} 条）` : '；记忆审计缺席'}`,
      [`${bundle.trace.file}#tool_span`, ...(memNote ? [`${memNote.file}#memory_audit_events`] : [])],
      memNote ? undefined : 'ekko.db 未找到（记忆审计事件缺席），读写面仅有轨迹工具调用',
      { toolCalls: bundle.trace.toolCalls.slice(0, 50), memoryAudit: memNote }))
  } else {
    elements.push(el('data_read_write', 'trajectory', 'absent', '数据读写未采集', [dbLabel], '无轨迹与记忆审计证据'))
  }

  // ---- 自治度（理论/实际——B 的两要素位） ----
  const theoretical = theoreticalFace(bundle, sessionId)
  const effective = effectiveFace(bundle, sessionId)
  elements.push(el('theoretical_autonomy', 'trajectory', theoretical.status,
    theoretical.facts.join('；'), theoretical.sources, theoretical.note, { facts: theoretical.facts }))
  elements.push(el('effective_autonomy', 'trajectory', effective.status,
    effective.facts.join('；'), effective.sources, effective.note, { facts: effective.facts }))

  // ---- 能力与权限类 ----
  const idCount = bundle.identity.count
  if (idCount > 0) {
    elements.push(el('trust_boundaries', 'capability', 'collected',
      `身份册在档 ${idCount} 个（${Object.entries(bundle.identity.byKind).map(([k, v]) => `${k} ${v}`).join('、')}）；写入门管辖 memory/skills 子系统写入`,
      ['agent-identity/identities.json', 'hermes write-gate (SUBSYSTEMS: memory/skills)'],
      undefined, { byKind: bundle.identity.byKind, matched: bundle.identity.matched.length }))
  } else {
    elements.push(el('trust_boundaries', 'capability', 'absent', '身份册为空——信任边界未显式声明', ['agent-identity/identities.json'],
      'agentidentity 无档：所有组件按隐式信任运行'))
  }

  const declaredTools = bundle.identity.matched.flatMap((m) => m.toolAllowlist)
  if (declaredTools.length > 0) {
    elements.push(el('available_tools', 'capability', 'collected',
      `声明的可用工具 ${declaredTools.length} 项（来自 ${bundle.identity.matched.length} 个匹配身份）`,
      ['agent-identity/identities.json#toolAllowlist'], undefined, { tools: declaredTools }))
  } else if (bundle.trace) {
    elements.push(el('available_tools', 'capability', 'partial',
      `无声明白名单；引擎工具注册表约 25+ 内置工具（files/terminal/browser/plan/delegate/memory/skills/mcp 等），本 run 实际暴露不可考`,
      ['ekko-agent/src/tools/*（注册表）'], '设计面工具清单未随 run 快照——论文 Available Tools 与 Effective Tool Use 需成对记录，现仅有实际面'))
  } else {
    elements.push(el('available_tools', 'capability', 'absent', '可用工具面未采集', [], '无身份档亦无轨迹'))
  }

  if (bundle.trace && bundle.trace.toolCalls.length > 0) {
    const byName: Record<string, number> = {}
    for (const t of bundle.trace.toolCalls) byName[t.name] = (byName[t.name] ?? 0) + 1
    // H1 语义层：前 8 条业务动作短语（人话先行；坐标级/未留痕的如实标注语义鸿沟）
    const semanticLines = bundle.trace.toolCalls
      .filter((t) => t.semantic)
      .slice(0, 8)
      .map((t) => t.semantic!.phrase)
    elements.push(el('effective_tool_use', 'capability', 'collected',
      `实际调用 ${bundle.trace.toolCalls.length} 次，覆盖 ${Object.keys(byName).length} 种工具：${Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}×${c}`).join('、')}` +
      (semanticLines.length > 0 ? `；业务语义：${[...new Set(semanticLines)].slice(0, 5).join('、')}` : ''),
      [`${bundle.trace.file}#tool_span`, 'tool-exec-audit（全局窗口，未按 session 绑定）'],
      bundle.toolAudit.entries > 0 ? undefined : '工具执行审计账缺席（tool-exec.jsonl 未生成）',
      { byName, semanticLines: [...new Set(semanticLines)], auditEntries: bundle.toolAudit.entries, auditErrors: bundle.toolAudit.errors.slice(0, 10) }))
  } else {
    elements.push(el('effective_tool_use', 'capability', 'absent', '实际工具调用未采集', [], '无轨迹证据'))
  }

  const osTools = bundle.trace ? bundle.trace.toolCalls.filter((t) => /^(terminal_exec|code_exec|write_file)/.test(t.name)) : []
  if (osTools.length > 0) {
    elements.push(el('os_interactions', 'capability', 'collected',
      `底层系统操作 ${osTools.length} 次（terminal/code_exec/write_file 族），失败 ${osTools.filter((t) => t.status === 'error').length} 次`,
      [`${bundle.trace.file}#tool_span`, `${dbLabel}#workspace_run_changes`],
      'workspace 文件变更逐 run 落档（workspace_run_changes）；shell 命令全文在消息表 tool 行',
      { count: osTools.length, errors: osTools.filter((t) => t.status === 'error').length }))
  } else {
    elements.push(el('os_interactions', 'capability', 'absent', '无底层系统操作记录', [`${dbLabel}#workspace_run_changes`], '本 run 无 terminal/code_exec/write_file 调用，或轨迹缺席'))
  }

  if (bundle.identity.matched.length > 0) {
    elements.push(el('agent_identity', 'capability', 'collected',
      `匹配到 ${bundle.identity.matched.length} 个在册身份：${bundle.identity.matched.map((m) => `${m.name}(${m.kind}，责任人 ${m.owner})`).join('；')}`,
      ['agent-identity/identities.json'], undefined, { matched: bundle.identity.matched }))
  } else if (idCount > 0) {
    elements.push(el('agent_identity', 'capability', 'partial',
      `身份册有 ${idCount} 档但无本会话 profile 匹配项——运行身份未注册`,
      ['agent-identity/identities.json'], 'profile 与身份册名字对不上，按"未注册身份运行"处理（不编造归属）'))
  } else {
    elements.push(el('agent_identity', 'capability', 'absent', '运行身份未注册', ['agent-identity/identities.json'], '身份册为空'))
  }

  const chains = bundle.identity.delegationChains
  if (chains.some((c) => c.edges.length > 0)) {
    elements.push(el('delegation_chain', 'capability', 'collected',
      chains.map((c) => `身份 ${c.from} 的有效委托 ${c.edges.length} 条（${c.edges.map((e) => `${e.from}→${e.to}：${e.scope}`).join('；')}）`).join('；'),
      ['agent-identity/identities.json#delegations'], undefined, { chains }))
  } else {
    elements.push(el('delegation_chain', 'capability', 'absent', '无委托记录（Human→Agent→Sub-Agent→Tool 链未在身份册登记）', ['agent-identity/identities.json'],
      '身份册委托面为空；轨迹侧 subagent_span 可见派生关系但不构成授权链（派生≠授权——论文 Identity/Delegation 分立要点）'))
  }

  const credTotal = bundle.identity.matched.reduce((s, m) => s + m.credentials.length, 0)
  if (credTotal > 0) {
    elements.push(el('auth_credentials', 'capability', 'collected',
      `在册凭证 ${credTotal} 条（仅标识/类型/状态——指纹级，无密钥原文）`,
      ['agent-identity/identities.json#credentials'], undefined,
      { credentials: bundle.identity.matched.flatMap((m) => m.credentials.map((c) => ({ holder: m.name, ...c }))) }))
  } else {
    elements.push(el('auth_credentials', 'capability', 'absent', '无凭证记录', ['agent-identity/identities.json'],
      '论文建议存凭证标识/签发方/权限范围/指纹而非密钥原文——现无任何凭证登记面'))
  }

  // ---- 编排类 ----
  if (bundle.workflow) {
    elements.push(el('design_topology', 'orchestration', 'collected',
      `设计快照 ${bundle.workflow.designNodes} 节点 / ${bundle.workflow.designEdges} 边（run ${bundle.workflow.runIds.join('、')}）`,
      [`${dbLabel}#workflow_runs.snapshot_*_json`], undefined,
      { nodes: bundle.workflow.designNodes, edges: bundle.workflow.designEdges, runIds: bundle.workflow.runIds }))
  } else {
    elements.push(el('design_topology', 'orchestration', 'absent', '无工作流设计快照', [`${dbLabel}#workflow_runs`],
      '本 session 未关联 workflow run（单聊/自由运行形态）——设计态拓扑不可考'))
  }

  if (bundle.trace && bundle.trace.subagents.length > 0) {
    elements.push(el('runtime_topology', 'orchestration', 'collected',
      `运行时实际拓扑：根 + ${bundle.trace.subagents.length} 个子 Agent（${bundle.trace.subagents.map((s) => `${s.label}[${s.status}]`).join('、')}）`,
      [`${bundle.trace.file}#subagent_span`, ...(bundle.workflow ? [`${dbLabel}#workflow_run_node_sessions`] : [])],
      undefined, { subagents: bundle.trace.subagents }))
  } else if (bundle.workflow && bundle.workflow.executedNodes.length > 0) {
    elements.push(el('runtime_topology', 'orchestration', 'collected',
      `实际执行 ${bundle.workflow.executedNodes.length} 个节点会话、${bundle.workflow.edgeDecisions.length} 次路由裁决`,
      [`${dbLabel}#workflow_run_node_sessions`, `${dbLabel}#workflow_run_edge_evaluations`],
      undefined, { executedNodes: bundle.workflow.executedNodes, edgeDecisions: bundle.workflow.edgeDecisions.slice(0, 30) }))
  } else {
    elements.push(el('runtime_topology', 'orchestration', 'absent', '运行时拓扑未采集', [`${dbLabel}#workflow_run_node_sessions`],
      '无子 Agent 派生亦无 workflow 节点会话——单 Agent 形态'))
  }

  elements.push(el('orchestration_protocol', 'orchestration',
    bundle.workflow || (bundle.trace && bundle.trace.subagents.length > 0) ? 'partial' : 'absent',
    bundle.workflow
      ? `编排协议=workflow 引擎（节点会话+边路由裁决落档）；子 Agent 派生经 delegate_task 工具`
      : (bundle.trace && bundle.trace.subagents.length > 0)
        ? '编排协议=delegate_task 工具派生（无 workflow 引擎参与）'
        : '无编排行为',
    [`${dbLabel}#gc_execution_queue`, `${dbLabel}#gc_message_routing_decisions`],
    '群聊编排（routing mode/confidence/loop 检测）仅在 gc 域落档，本报告未拉群聊面（session→room 映射未采集）'))

  const delegateCalls = bundle.messages ? (bundle.messages.toolNameCounts['delegate_task'] ?? 0) : 0
  if (bundle.messages && delegateCalls > 0) {
    elements.push(el('communication_logs', 'orchestration', 'collected',
      `Agent 间通信可见面：delegate_task 调用 ${delegateCalls} 次；消息表含完整 tool 行`,
      [`${dbLabel}#messages(role=tool)`, `${dbLabel}#gc_messages`],
      'gc_messages（群聊全量通信）未拉取——session→room 映射未采集',
      { delegateCalls }))
  } else {
    elements.push(el('communication_logs', 'orchestration', 'absent', '无 Agent 间通信记录', [`${dbLabel}#gc_messages`],
      '本 run 无委托调用，或为单 Agent 形态'))
  }

  // ---- B 对账 ----
  const divergences = reconcile(theoretical, effective, bundle)
  const autonomy: AutonomyReconciliation = {
    theoretical, effective, divergences,
    note: '理论面/实际面各按可得证据拼合；黄条=finding 含 warn 的偏差项，须人工复核',
  }

  const coverage = {
    collected: elements.filter((e) => e.status === 'collected').length,
    partial: elements.filter((e) => e.status === 'partial').length,
    absent: elements.filter((e) => e.status === 'absent').length,
    total: elements.length,
  }
  return {
    sessionId,
    generatedAt,
    subject: {
      title: bundle.overview?.title,
      createdAt: bundle.overview?.createdAt,
      messages: bundle.messages?.total,
      dbFile: bundle.dbFile ?? undefined,
      traceFile: bundle.trace?.file,
    },
    elements,
    autonomy,
    coverage,
  }
}

function spanMs(first: number | null, last: number | null): string {
  if (first == null || last == null || last < first) return '(时间不可考)'
  const s = Math.round((last - first) / 1000)
  if (s < 90) return `${s} 秒`
  if (s < 5400) return `${Math.round(s / 60)} 分钟`
  return `${(s / 3600).toFixed(1)} 小时`
}

export { INCIDENT_CATEGORIES }
