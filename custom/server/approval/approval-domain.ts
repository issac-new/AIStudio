// overlay/approval 域：审批宽度候选五档 + 决策八态 + 求值序（第一批吸收 #4，minimax+codex 合并批）。
//
// 吸收锚点（docs/upstream-analysis/minimax-code.md §2.3）：
// - candidateScopes 五档（permission/src/types.ts:170-195）：narrow（Codex 式 argv 精确
//   前缀）/byFirstWord/byArgvPrefix2/byDomain/wholeTool；candidates[0] 恒为窄默认
//   （后向兼容：旧 UI 只取第一个=最窄）。
// - 决策态：ApprovedForSession/ExecpolicyAmendment 等（spec §1.2 #4 八态，见下）。
// - 求值序（engine.ts 三步决策流）：硬拒绝（deny）→ 允许快路径（allow）→ 兜底 ask；
//   本域 evalRule 语义为 deny→ask→allow（deny 永远最先判）。
//
// 本文件为纯函数域（无 IO）；存储见 approval-store.ts，REST 见 approval-controller.ts。
// 「批准即学习」：approved_scoped / execpolicy_amendment 决策按所选宽度落 allow 规则。

export const APPROVAL_SCOPES = ['narrow', 'byFirstWord', 'byArgvPrefix2', 'byDomain', 'wholeTool'] as const
export type ApprovalScope = (typeof APPROVAL_SCOPES)[number]

/** 决策八态（冻结词汇表；持久化按字面值）。 */
export const APPROVAL_DECISIONS = [
  'pending',               // 待裁决
  'approved_once',         // 仅本次放行（不学习）
  'approved_for_session',  // 本会话内同调用放行（不落盘）
  'approved_scoped',       // 按所选宽度落 allow 规则（批准即学习）
  'execpolicy_amendment',  // 批准并改默认模式（策略级学习）
  'denied_once',           // 本次拒绝
  'denied_for_session',    // 本会话内拒绝
  'hard_blocked',          // 灾难性终局拒绝（bypass 也不放行；对齐 minimax HARD_BLOCKED）
] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

export type RuleList = 'allow' | 'deny' | 'ask'
export type RuleScope = 'global' | 'agent' | 'session'

export interface ApprovalRule {
  list: RuleList
  scope: RuleScope
  /** 匹配目标：工具名（wholeTool）或域键（byDomain 档，配 matchDomain=true 跨工具）。 */
  tool: string
  /** 可选 argv 前缀（narrow/byFirstWord/byArgvPrefix2 档落规则时携带）。 */
  argvPrefix?: string
  /** byDomain 学习的规则为 true：按域键跨工具匹配；wholeTool 规则精确匹配单工具。 */
  matchDomain?: boolean
  /** 产生本规则的决策态（审计：规则从哪来）。 */
  learnedFrom: ApprovalDecision
  createdAt: number
}

export interface ToolCallRequest {
  tool: string
  argv: string[]
  /** agent/会话上下文（作用域求值用）。 */
  agentId?: string
  sessionId?: string
}

export interface ScopeCandidate {
  scope: ApprovalScope
  /** 该档的匹配键（落规则时的 tool/argvPrefix）。 */
  tool: string
  /** 可选 argv 前缀（narrow/byFirstWord/byArgvPrefix2 档落规则时携带）。 */
  argvPrefix?: string
  /** byDomain 档为 true：跨工具按域匹配。 */
  matchDomain?: boolean
  label: string
}

/** 从一次工具调用生成五档宽度候选；candidates[0] 恒为窄默认（minimax 后向兼容约束）。 */
export function buildScopeCandidates(call: ToolCallRequest): ScopeCandidate[] {
  const argv0 = call.argv[0] ?? ''
  const argv1 = call.argv[1] ?? ''
  const out: ScopeCandidate[] = [
    { scope: 'narrow', tool: call.tool, argvPrefix: call.argv.join(' '), label: '本次完整命令' },
  ]
  if (argv0) {
    out.push({ scope: 'byFirstWord', tool: call.tool, argvPrefix: argv0, label: `首词 ${argv0}` })
  }
  if (argv0 && argv1) {
    out.push({ scope: 'byArgvPrefix2', tool: call.tool, argvPrefix: `${argv0} ${argv1}`, label: `前两词 ${argv0} ${argv1}` })
  }
  const domain = domainOf(call.tool)
  out.push({ scope: 'byDomain', tool: domain, matchDomain: true, label: `${domain} 域` })
  out.push({ scope: 'wholeTool', tool: call.tool, label: `${call.tool} 全部` })
  return out
}

/** 工具域归类（byDomain 档匹配键；web 系在 search 系之前判——web_search 属 web 不属 read）。 */
export function domainOf(tool: string): string {
  if (/terminal|bash|shell|exec/i.test(tool)) return 'terminal'
  if (/write|patch|edit/i.test(tool)) return 'edit'
  if (/web|fetch|browser/i.test(tool)) return 'web'
  if (/read|grep|glob|search/i.test(tool)) return 'read'
  return tool.split(/[._-]/)[0] || tool
}

function ruleMatches(rule: ApprovalRule, call: ToolCallRequest): boolean {
  if (rule.matchDomain) {
    if (call.tool !== rule.tool && domainOf(call.tool) !== rule.tool) return false
  } else if (rule.tool !== call.tool) {
    return false
  }
  if (!rule.argvPrefix) return true // wholeTool / byDomain 档
  return call.argv.join(' ').startsWith(rule.argvPrefix)
}

function scopeVisible(rule: ApprovalRule, call: ToolCallRequest): boolean {
  // 归属绑定判定归注入谓词（见 ScopeOwnershipPredicate），这里只看上下文存在性。
  if (rule.scope === 'global') return true
  if (rule.scope === 'agent') return !!call.agentId
  return !!call.sessionId
}

// 作用域携带：agent/session 档规则把归属写进 argvPrefix 之外的扩展位会复杂化匹配；
// 简化契约：agent/session 档规则的 tool 字段不变，归属判定经 store 侧 ownership 字段
// （见 approval-store.ts 的 ownedBy）；域层经注入谓词判可见性。
export type ScopeOwnershipPredicate = (rule: ApprovalRule, call: ToolCallRequest) => boolean

const defaultOwnership: ScopeOwnershipPredicate = () => true

export type Verdict = { list: RuleList; rule?: ApprovalRule } | { list: 'default'; mode: DefaultMode }

export type DefaultMode = 'ask' | 'deny' | 'allow'

/**
 * 求值序（minimax engine.ts 三步决策流移植）：deny 最先 → allow 次之 → ask 兜底；
 * 无命中回落 defaultMode。作用域内 deny 优先于一切 allow（安全序不可配置）。
 */
export function evaluate(
  call: ToolCallRequest,
  rules: readonly ApprovalRule[],
  defaultMode: DefaultMode = 'ask',
  ownership: ScopeOwnershipPredicate = defaultOwnership,
): Verdict {
  const visible = rules.filter((r) => scopeVisible(r, call) && ownership(r, call) && ruleMatches(r, call))
  const denied = visible.find((r) => r.list === 'deny')
  if (denied) return { list: 'deny', rule: denied }
  const allowed = visible.find((r) => r.list === 'allow')
  if (allowed) return { list: 'allow', rule: allowed }
  const asked = visible.find((r) => r.list === 'ask')
  if (asked) return { list: 'ask', rule: asked }
  return { list: 'default', mode: defaultMode }
}

/** 决策 → 规则学习映射：哪些决策态落什么规则（「批准即学习」核心表）。 */
export function ruleFromDecision(
  decision: ApprovalDecision,
  call: ToolCallRequest,
  candidate: ScopeCandidate,
  now: number,
): ApprovalRule | null {
  if (decision === 'approved_scoped') {
    return { list: 'allow', scope: 'global', tool: candidate.tool, argvPrefix: candidate.argvPrefix,
             matchDomain: candidate.matchDomain, learnedFrom: decision, createdAt: now }
  }
  if (decision === 'denied_for_session') {
    // 会话档拒绝：记 session 档 deny（store 侧补 ownership）。
    return { list: 'deny', scope: 'session', tool: candidate.tool, argvPrefix: candidate.argvPrefix, learnedFrom: decision, createdAt: now }
  }
  if (decision === 'denied_once' || decision === 'approved_once' || decision === 'approved_for_session') {
    return null // 不学习
  }
  return null
}

export function isApprovalDecision(v: unknown): v is ApprovalDecision {
  return typeof v === 'string' && (APPROVAL_DECISIONS as readonly string[]).includes(v)
}
