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
//
// 归属模型（X2）：规则带 owner（学习者用户名）+ 上下文绑定（sessionId/agentId）。
// 求值时 scopeVisible 判上下文、ownership 谓词判用户（调用方由 controller 从
// ctx.state.user 注入）。读删同归属：list 只回可见规则（ruleVisibleTo），delete
// 下标按可见集计、摘除权本人/super_admin（canRemoveRule）。旧档兼容与残余风险：
//   - 缺 owner 的旧规则按无主=全局可见处理（最小惊讶：升级不使既有规则失效）；
//     残余风险：旧档跨用户共享，多用户部署应重建规则或人工置 owner。
//   - 缺绑定字段的旧 agent/session 规则保持升级前宽语义；现存 session 档只有
//     denied_for_session 的 deny（过宽=过度拒绝，方向安全）。
//   - defaultMode 是全局策略，改档须管理权限（approval-controller 校验 super_admin）。

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
  /** 归属用户名（X2：写入时记录当前用户）；缺省 = 旧档/无主规则（全局可见，见 makeOwnershipPredicate）。 */
  owner?: string
  /** scope='session' 的绑定会话（X2：会话档规则只在其会话上下文可见）；旧档缺省不绑定（兼容旧行为）。 */
  sessionId?: string
  /** scope='agent' 的绑定 agent（X2，同 sessionId 语义）。 */
  agentId?: string
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
  // 上下文绑定判定（X2）：agent/session 档规则只在其记录的上下文内可见，不再
  // 「调用带个 sessionId 就全局可见」。旧档（无绑定字段）保持升级前语义——现存
  // session 档只有 denied_for_session 落的 deny（过宽方向即过度拒绝，安全），
  // 升级不误伤既有审批；残余风险见模块头注释。
  if (rule.scope === 'global') return true
  if (rule.scope === 'agent') return !!call.agentId && (rule.agentId == null || rule.agentId === call.agentId)
  return !!call.sessionId && (rule.sessionId == null || rule.sessionId === call.sessionId)
}

// 作用域携带：agent/session 档规则把归属写进 argvPrefix 之外的扩展位会复杂化匹配；
// 简化契约：agent/session 档规则的 tool 字段不变，上下文绑定经 sessionId/agentId 字段
// （scopeVisible 判定），用户归属经 owner 字段（注入谓词判定，见 makeOwnershipPredicate）。
export type ScopeOwnershipPredicate = (rule: ApprovalRule, call: ToolCallRequest) => boolean

/**
 * 缺省谓词（X2）：只认无主规则——带 owner 的规则须显式注入调用方身份谓词才参与求值。
 * 例外 fail-closed（G4）：带 owner 的 deny 不随缺省谓词隐藏——未注入身份的 evaluate()
 * 调用方静默丢弃它等于拒绝面失效（过宽=放行破坏性调用），故按 deny 仍生效并告警；
 * allow/ask 仍隐藏（隐藏不放大权限，方向安全）。
 */
const defaultOwnership: ScopeOwnershipPredicate = (rule) => {
  if (rule.owner == null) return true
  if (rule.list === 'deny') {
    console.warn(`[approval-domain] evaluate() 未注入调用方身份，带 owner（${rule.owner}）的 deny 规则按拒绝生效（fail-closed）`)
    return true
  }
  return false
}

/**
 * 调用方身份（X2）：controller 从 ctx.state.user 注入（上游 requireUserJwt 写入的
 * AuthenticatedUser 形态：{ id, username, role }，role ∈ super_admin|admin）。
 */
export interface ApprovalCaller {
  username?: string
  role?: string
}

/**
 * 归属谓词（X2）：规则对调用方可见当且仅当——
 *   - 调用方无身份（未启用鉴权的单用户部署）→ 全可见；
 *   - 无主规则（owner 缺省：旧档/人工置入的全局策略）→ 可见（最小惊讶：升级不使
 *     既有规则失效；残余风险：旧档跨用户共享，多用户部署建议重建规则）；
 *   - rule.owner === 调用方用户名 → 可见；
 *   - 调用方 super_admin → 可见（管理面跨用户审计）；
 *   - 其余（他人规则）→ 不可见。
 */
export function makeOwnershipPredicate(caller: ApprovalCaller | null | undefined): ScopeOwnershipPredicate {
  if (!caller?.username) return () => true
  return (rule) => rule.owner == null || rule.owner === caller.username || caller.role === 'super_admin'
}

/** 归属可见性（X2）：list/delete 无调用上下文时的归属判定（与谓词同一实现；call 面不参与归属）。 */
export function ruleVisibleTo(caller: ApprovalCaller | null | undefined, rule: ApprovalRule): boolean {
  return makeOwnershipPredicate(caller)(rule, { tool: '', argv: [] })
}

/**
 * 可删性（X2 读删收口）：本人规则可删；无主（旧档/人工置入的全局策略）与他人规则仅
 * super_admin 可删——摘全局策略同 setDefaultMode 管理闸，普通登录用户不得摘全局
 * deny/allow。未启用鉴权（调用方无身份，与 makeOwnershipPredicate 同判据）→ 可删。
 */
export function canRemoveRule(caller: ApprovalCaller | null | undefined, rule: ApprovalRule): boolean {
  // 无身份分支（G5 显式化）：无身份部署 = 单用户信任模型（全可删，与
  // makeOwnershipPredicate(null) 全可见同判据）；生产挂载序保证 approval 路由在
  // authMiddleware 之后、caller 恒有身份，此分支只覆盖未启用鉴权的部署——该依赖即
  // 挂载序，若路由前移须同步收紧此分支（见 approval-controller 头注释）。
  if (!caller?.username) return true
  return rule.owner === caller.username || caller.role === 'super_admin'
}

// cc 2.1.281 概念吸收（专有许可只搬概念）：递归删除的目标含命令替换/反引号时，
// 目标不可静态判定——任何 allow 规则都不得放行，强制 ask（"allow 规则不吞不可静态
// 判定的破坏性命令"）。deny 仍最优先。
const _RECURSIVE_DELETE_RE = /\b(rm\s+(-[a-z]*[rf][a-z]*\s+)+|rmdir\s+\/s|Remove-Item\s+.*)/i
const _CMD_SUBSTITUTION_RE = /\$\(|`/

export function hardAskOverride(call: ToolCallRequest): boolean {
  if (!/terminal|bash|shell|exec/i.test(call.tool)) return false
  const argv = call.argv.join(' ')
  return _RECURSIVE_DELETE_RE.test(argv) && _CMD_SUBSTITUTION_RE.test(argv)
}

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
  if (hardAskOverride(call)) return { list: 'ask' } // 不可静态判定的递归删除：allow 也不放行
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
  owner?: string,
): ApprovalRule | null {
  const ownership = owner ? { owner } : {}
  if (decision === 'approved_scoped') {
    return { list: 'allow', scope: 'global', tool: candidate.tool, argvPrefix: candidate.argvPrefix,
             matchDomain: candidate.matchDomain, ...ownership, learnedFrom: decision, createdAt: now }
  }
  if (decision === 'denied_for_session') {
    // 会话档拒绝：记 session 档 deny 并绑定会话（X2：只在该会话上下文可见，不再全局生效）。
    return { list: 'deny', scope: 'session', tool: candidate.tool, argvPrefix: candidate.argvPrefix,
             ...ownership, ...(call.sessionId ? { sessionId: call.sessionId } : {}),
             learnedFrom: decision, createdAt: now }
  }
  if (decision === 'denied_once' || decision === 'approved_once' || decision === 'approved_for_session') {
    return null // 不学习
  }
  return null
}

export function isApprovalDecision(v: unknown): v is ApprovalDecision {
  return typeof v === 'string' && (APPROVAL_DECISIONS as readonly string[]).includes(v)
}
