/**
 * 审批域 REST（/api/approval/*）——第一批吸收 #4。
 *
 * POST /api/approval/candidates  { tool, argv }        → 五档宽度候选（candidates[0] 窄默认）
 * POST /api/approval/evaluate    { tool, argv[, agentId, sessionId] } → 求值预演（deny→ask→allow→default）
 * POST /api/approval/decide      { decision, call, candidate }  → 八态决策；批准即学习落规则
 * GET  /api/approval/rules                              → 规则三列表 + defaultMode（按归属过滤）
 * DELETE /api/approval/rules/{index}                    → 手工摘除规则（审计口；下标按可见集）
 *
 * 归属与权限（X2）：调用方身份取 ctx.state.user（上游 requireUserJwt 写入的
 * AuthenticatedUser：{ id, username, role }）注入域层归属谓词——学习规则记 owner，
 * 求值只看自己的规则（super_admin 例外，见 makeOwnershipPredicate）；
 * execpolicy_amendment 改全局 defaultMode 须 super_admin（上游 requireSuperAdmin 同判据；
 * requireAdmin 对 admin|super_admin 恒过 = 无隔离意义，不用）。
 * 读删同归属（X2 收口）：list/decide 回包只回可见规则（本人+无主+super_admin 全量），
 * DELETE 的 index 与 GET /rules 的可见集同下标空间（只滤 list 不改 delete 下标会删错行）；
 * 无主与他人规则仅 super_admin 可摘（摘全局策略同 setDefaultMode 管理闸）。
 *
 * 挂载：B 类 patch 402 在 bootstrap/routes.ts（与 380 zcode-engine 同款模式）。
 */
import type { Context } from 'koa'
import Router from '@koa/router'
import {
  APPROVAL_DECISIONS, APPROVAL_SCOPES, buildScopeCandidates, evaluate,
  isApprovalDecision, makeOwnershipPredicate, ruleFromDecision, domainOf,
  canRemoveRule, ruleVisibleTo,
  type ApprovalCaller, type ApprovalDecision, type ApprovalRule, type ScopeCandidate, type ToolCallRequest,
} from './approval-domain'
import { getApprovalRuleStore } from './approval-store'

const router = new Router({ prefix: '/api/approval' })

/** 调用方身份（X2）：上游 requireUserJwt 写入 ctx.state.user；未启用鉴权的部署为 undefined。 */
function callerOf(ctx: Context): ApprovalCaller | null {
  const user = (ctx.state as { user?: ApprovalCaller } | undefined)?.user
  return user ?? null
}

/** 可见规则集（X2 读归属）：本人 + 无主 + super_admin 全量。GET /rules、decide 回包与 DELETE 下标同源。 */
function visibleRulesOf(rules: readonly ApprovalRule[], caller: ApprovalCaller | null): ApprovalRule[] {
  return rules.filter((r) => ruleVisibleTo(caller, r))
}

function parseCall(body: Record<string, unknown> | undefined): ToolCallRequest | null {
  const tool = body?.tool
  const argv = body?.argv
  if (typeof tool !== 'string' || tool.length === 0) return null
  if (argv !== undefined && !Array.isArray(argv)) return null
  return {
    tool,
    argv: Array.isArray(argv) ? argv.map(String) : [],
    agentId: typeof body?.agentId === 'string' ? body.agentId : undefined,
    sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
  }
}

router.get('/rules', async (ctx) => {
  const store = getApprovalRuleStore()
  // X2 读归属：只回调用方可见规则（他人规则不可读），下标空间与 DELETE /rules/:index 同源。
  ctx.body = { defaultMode: store.defaultMode(), rules: visibleRulesOf(store.list(), callerOf(ctx)) }
})

router.post('/candidates', async (ctx) => {
  const call = parseCall(ctx.request.body)
  if (!call) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'tool 必填，argv 须为字符串数组' }
    return
  }
  ctx.body = { ok: true, candidates: buildScopeCandidates(call), domain: domainOf(call.tool) }
})

router.post('/evaluate', async (ctx) => {
  const call = parseCall(ctx.request.body)
  if (!call) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'tool 必填' }
    return
  }
  const store = getApprovalRuleStore()
  // 归属谓词按调用方身份注入（X2）：只见自己的规则 + 无主规则（super_admin 全见）。
  ctx.body = { ok: true, verdict: evaluate(call, store.list(), store.defaultMode(), makeOwnershipPredicate(callerOf(ctx))) }
})

router.post('/decide', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const call = parseCall(body.call as Record<string, unknown> | undefined)
  const decision = body.decision
  if (!call || !isApprovalDecision(decision)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: `decision 须为八态之一（${APPROVAL_DECISIONS.join('/')}）且 call.tool 必填` }
    return
  }
  if (decision === 'pending' || decision === 'hard_blocked') {
    ctx.status = 422
    ctx.body = { ok: false, detail: 'pending/hard_blocked 是状态非可提交决策' }
    return
  }
  const store = getApprovalRuleStore()
  const now = Date.now()
  // 归属身份（X2）：只认认证主体（body 自报身份不可信），读删与学习同源取用。
  const caller = callerOf(ctx)

  // execpolicy_amendment：策略级学习（allow 幅度改默认；deny 幅度由调用方经 rules 管理）。
  if (decision === 'execpolicy_amendment') {
    // 全局默认档是全员生效的策略（X2）：须认证主体 + 管理权限，普通登录用户不得全局改档。
    // 无身份也拒绝（G5 fail-closed）：全局策略变更不依赖「挂载序在 authMiddleware 之后」
    // 的隐式保证；无身份部署（单用户信任模型）改默认档须显式登录或直接改档文件。
    if (!caller || caller.role !== 'super_admin') {
      ctx.status = 403
      ctx.body = { ok: false, detail: '改全局默认档须 super_admin 权限' }
      return
    }
    const mode = body.defaultMode
    if (mode !== 'allow' && mode !== 'ask' && mode !== 'deny') {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'execpolicy_amendment 须携带 defaultMode（allow|ask|deny）' }
      return
    }
    store.setDefaultMode(mode, decision)
    ctx.body = { ok: true, decision, learned: 'defaultMode', defaultMode: store.defaultMode(), rules: visibleRulesOf(store.list(), caller) }
    return
  }

  // 宽度档：approved_scoped/denied_for_session 需要 candidate；缺省取窄默认（candidates[0]）。
  let candidate: ScopeCandidate | undefined
  const rawCandidate = body.candidate as Record<string, unknown> | undefined
  if (rawCandidate && typeof rawCandidate.scope === 'string' && (APPROVAL_SCOPES as readonly string[]).includes(rawCandidate.scope)) {
    candidate = {
      scope: rawCandidate.scope as ScopeCandidate['scope'],
      tool: typeof rawCandidate.tool === 'string' ? rawCandidate.tool : call.tool,
      argvPrefix: typeof rawCandidate.argvPrefix === 'string' ? rawCandidate.argvPrefix : undefined,
      label: typeof rawCandidate.label === 'string' ? rawCandidate.label : '',
    }
  } else {
    candidate = buildScopeCandidates(call)[0]
  }

  // 学习规则记 owner（X2）：归属以认证主体为准，body 自报身份不可信。
  const learned = ruleFromDecision(decision as ApprovalDecision, call, candidate, now, caller?.username)
  if (learned) store.addRule(learned)
  ctx.body = {
    ok: true,
    decision,
    learnedRule: learned,
    candidates: buildScopeCandidates(call),
    rules: visibleRulesOf(store.list(), caller),
  }
})

router.delete('/rules/:index', async (ctx) => {
  const store = getApprovalRuleStore()
  const caller = callerOf(ctx)
  // X2 读删同源：下标按 GET /rules 的可见集计（只滤 list 不改 delete 下标会删错行），
  // 可见集外的下标一律 404（他人规则连位置都不可知，枚举安全）。
  const visible = visibleRulesOf(store.list(), caller)
  const idx = Number(ctx.params.index)
  if (!Number.isInteger(idx) || idx < 0 || idx >= visible.length) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '规则序号越界' }
    return
  }
  const target = visible[idx]
  // 摘除权（X2）：本人规则可摘；无主（旧档/人工置入的全局策略）与他人规则仅 super_admin
  // 可摘——摘全局策略同 setDefaultMode 管理闸。
  if (!canRemoveRule(caller, target)) {
    ctx.status = 403
    ctx.body = { ok: false, detail: '仅规则属主或 super_admin 可删除' }
    return
  }
  const cur = store.load()
  // 可见集元素与全量集同引用，按身份定位真实下标（可见下标 ≠ 全量下标，直接 splice 会删错行）。
  const at = cur.rules.indexOf(target)
  if (at < 0) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '规则序号越界' }
    return
  }
  const removed = cur.rules.splice(at, 1)[0]
  store.save(cur)
  ctx.body = { ok: true, removed }
})

export const approvalRoutes = router
