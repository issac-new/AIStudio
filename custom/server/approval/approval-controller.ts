/**
 * 审批域 REST（/api/approval/*）——第一批吸收 #4。
 *
 * POST /api/approval/candidates  { tool, argv }        → 五档宽度候选（candidates[0] 窄默认）
 * POST /api/approval/evaluate    { tool, argv[, agentId, sessionId] } → 求值预演（deny→ask→allow→default）
 * POST /api/approval/decide      { decision, call, candidate }  → 八态决策；批准即学习落规则
 * GET  /api/approval/rules                              → 规则三列表 + defaultMode
 * DELETE /api/approval/rules/{index}                    → 手工摘除规则（审计口）
 *
 * 挂载：B 类 patch 402 在 bootstrap/routes.ts（与 380 zcode-engine 同款模式）。
 */
import Router from '@koa/router'
import {
  APPROVAL_DECISIONS, APPROVAL_SCOPES, buildScopeCandidates, evaluate,
  isApprovalDecision, ruleFromDecision, domainOf,
  type ApprovalDecision, type ScopeCandidate, type ToolCallRequest,
} from './approval-domain'
import { getApprovalRuleStore } from './approval-store'

const router = new Router({ prefix: '/api/approval' })

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
  ctx.body = { defaultMode: store.defaultMode(), rules: store.list() }
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
  ctx.body = { ok: true, verdict: evaluate(call, store.list(), store.defaultMode()) }
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

  // execpolicy_amendment：策略级学习（allow 幅度改默认；deny 幅度由调用方经 rules 管理）。
  if (decision === 'execpolicy_amendment') {
    const mode = body.defaultMode
    if (mode !== 'allow' && mode !== 'ask' && mode !== 'deny') {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'execpolicy_amendment 须携带 defaultMode（allow|ask|deny）' }
      return
    }
    store.setDefaultMode(mode, decision)
    ctx.body = { ok: true, decision, learned: 'defaultMode', defaultMode: store.defaultMode(), rules: store.list() }
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

  const learned = ruleFromDecision(decision as ApprovalDecision, call, candidate, now)
  if (learned) store.addRule(learned)
  ctx.body = {
    ok: true,
    decision,
    learnedRule: learned,
    candidates: buildScopeCandidates(call),
    rules: store.list(),
  }
})

router.delete('/rules/:index', async (ctx) => {
  const store = getApprovalRuleStore()
  const cur = store.load()
  const idx = Number(ctx.params.index)
  if (!Number.isInteger(idx) || idx < 0 || idx >= cur.rules.length) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '规则序号越界' }
    return
  }
  const removed = cur.rules.splice(idx, 1)[0]
  store.save(cur)
  ctx.body = { ok: true, removed }
})

export const approvalRoutes = router
