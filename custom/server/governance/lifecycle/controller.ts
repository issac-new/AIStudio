/**
 * 生命周期判定 REST（融合批一）——挂 /api/governance/lifecycle/*（经
 * governance-controller 注册，零新补丁；registerDomainAudit 同款装配模式）。
 *
 * 端点（执法链 fail-closed：字段缺失/非法 400，不静默兜底）：
 *   POST /lifecycle/gate-verdict      { gate, roomText?, cardText? } → 判词（双源保守合并）
 *   POST /lifecycle/requirement-judge { doc }                        → G1 四要素
 *   POST /lifecycle/uat-verdict       { body, ac }                   → 逐 AC 判词
 *   POST /lifecycle/uat-coverage      { body, acList }               → 覆盖缺号清单
 *   GET  /lifecycle/breaker?run=&gate=                    → 熔断状态
 *   POST /lifecycle/breaker/trip { run, gate, unpassedRounds, sig }  → 记轮+签名
 *   POST /lifecycle/breaker/check { run, gate, sig, override? }      → 判定+留痕副作用
 *
 * 熔断持久化：<SIM_ROOT>/runs/<run>/governance/breaker.json（原子写）；判定副作用
 * （gate-breaker-tripped/reset/override* 问题单、GATE-BREAKER-REVIEW approved 事件）
 * 由本服务落 evidence/issues.log 与 approved.events——导演侧退役对应本地记账。
 * SIM_ROOT 解析正身=simcenter/observer-root（delivery 等消费域同款装配）。
 */
import type Router from '@koa/router'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isValidRun, safeRunDir, simRootOrNull } from '../../simcenter/observer-root'
import { checkBreaker, initialBreaker, tripBreaker, type GateBreakerState } from './breaker'
import { judgeRequirementFreeze } from './requirements'
import { combinedGateVerdict, coveredAcs, gateVerdictOfText, uatVerdictFor, type GateVerdict } from './verdict'

const GATE_RE = /^[A-Z][A-Z0-9-]{1,30}$/

function breakerFile(run: string): string | null {
  const root = simRootOrNull()
  if (!root) return null
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  return resolve(runDir, 'governance', 'breaker.json')
}

function readBreaker(run: string, gate: string): { file: string; state: GateBreakerState } | null {
  const file = breakerFile(run)
  if (!file || !existsSync(file)) return null
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, GateBreakerState>
    return { file, state: doc[gate] ?? initialBreaker() }
  } catch {
    return null
  }
}

function writeBreaker(run: string, gate: string, state: GateBreakerState): void {
  const file = breakerFile(run)
  if (!file) throw new Error('SIM_ROOT 未配置或 run 非法')
  mkdirSync(resolve(file, '..'), { recursive: true })
  let doc: Record<string, GateBreakerState> = {}
  try { doc = JSON.parse(readFileSync(file, 'utf8')) } catch { /* 首写/坏档重建 */ }
  doc[gate] = state
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(doc, null, 1))
  renameSync(tmp, file)
}

/** 留痕副作用落 run 证据面（issues.log 幂等面由判定语义保证：tripped 只 firstLog 落一次）。 */
function recordEffects(run: string, lines: { issues?: string[]; approved?: string[] }): void {
  const root = simRootOrNull()
  if (!root) throw new Error('SIM_ROOT 未配置')
  const runDir = safeRunDir(root, run)
  if (!runDir) throw new Error('run 非法')
  const evid = resolve(runDir, 'evidence')
  mkdirSync(evid, { recursive: true })
  if (lines.issues?.length) {
    appendFileSync(resolve(evid, 'issues.log'), lines.issues.map((l) => `${l}\n`).join(''), 'utf-8')
  }
  if (lines.approved?.length) {
    appendFileSync(resolve(evid, 'approved.events'), lines.approved.map((l) => `${l}\n`).join(''), 'utf-8')
  }
}

function badRequest(ctx: { status: number; body: unknown }, error: string): void {
  ctx.status = 400
  ctx.body = { ok: false, error }
}

export function registerLifecycleRoutes(router: Router): void {
  router.post('/lifecycle/gate-verdict', (ctx) => {
    const b = ctx.request.body as { gate?: unknown; roomText?: unknown; cardText?: unknown } | undefined
    const gate = typeof b?.gate === 'string' ? b.gate : ''
    if (!GATE_RE.test(gate)) return badRequest(ctx, 'gate 必填（大写字母/数字/连字符，如 READY-GATE）')
    const roomText = typeof b?.roomText === 'string' ? b.roomText : ''
    const cardText = typeof b?.cardText === 'string' ? b.cardText : ''
    if (!roomText && !cardText) return badRequest(ctx, 'roomText/cardText 至少一项非空')
    const room = gateVerdictOfText(gate, roomText)
    const card = gateVerdictOfText(gate, cardText)
    ctx.body = { ok: true, gate, room, card, verdict: combinedGateVerdict({ room, card }) satisfies GateVerdict }
  })

  router.post('/lifecycle/requirement-judge', (ctx) => {
    const b = ctx.request.body as { doc?: unknown } | undefined
    if (typeof b?.doc !== 'string' || !b.doc.trim()) return badRequest(ctx, 'doc 必填（需求书全文）')
    ctx.body = { ok: true, ...judgeRequirementFreeze(b.doc) }
  })

  router.post('/lifecycle/uat-verdict', (ctx) => {
    const b = ctx.request.body as { body?: unknown; ac?: unknown } | undefined
    if (typeof b?.body !== 'string') return badRequest(ctx, 'body 必填（UAT-EVIDENCE 正文）')
    if (typeof b?.ac !== 'string' || !/^AC-\d{1,3}$/.test(b.ac.trim())) return badRequest(ctx, 'ac 必填（形如 AC-1，编号 ≤3 位）')
    ctx.body = { ok: true, ac: b.ac.trim(), verdict: uatVerdictFor(b.body, b.ac.trim()) }
  })

  router.post('/lifecycle/uat-coverage', (ctx) => {
    const b = ctx.request.body as { body?: unknown; acList?: unknown } | undefined
    if (typeof b?.body !== 'string') return badRequest(ctx, 'body 必填（UAT-EVIDENCE 正文）')
    if (!Array.isArray(b?.acList) || b.acList.length === 0 || !b.acList.every((a) => typeof a === 'string' && /^AC-\d{1,3}$/.test(a))) {
      return badRequest(ctx, 'acList 必填（形如 ["AC-1",...]，非空）')
    }
    ctx.body = { ok: true, missing: coveredAcs(b.acList as string[], b.body) }
  })

  router.get('/lifecycle/breaker', (ctx) => {
    const run = String(ctx.query.run ?? '')
    const gate = String(ctx.query.gate ?? '')
    if (!isValidRun(run)) return badRequest(ctx, 'run 参数非法')
    if (!GATE_RE.test(gate)) return badRequest(ctx, 'gate 参数非法')
    if (!simRootOrNull()) { ctx.status = 503; ctx.body = { ok: false, error: 'SIM_ROOT 未配置（fail-closed）' }; return }
    const r = readBreaker(run, gate)
    ctx.body = { ok: true, run, gate, state: r?.state ?? initialBreaker(), exists: r != null }
  })

  router.post('/lifecycle/breaker/trip', (ctx) => {
    const b = ctx.request.body as { run?: unknown; gate?: unknown; unpassedRounds?: unknown; sig?: unknown } | undefined
    const run = typeof b?.run === 'string' ? b.run : ''
    const gate = typeof b?.gate === 'string' ? b.gate : ''
    if (!isValidRun(run)) return badRequest(ctx, 'run 参数非法')
    if (!GATE_RE.test(gate)) return badRequest(ctx, 'gate 参数非法')
    const rounds = Number(b?.unpassedRounds ?? 1)
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) return badRequest(ctx, 'unpassedRounds 须为 1-10 整数')
    const sig = typeof b?.sig === 'string' ? b.sig : ''
    if (!sig.trim()) return badRequest(ctx, 'sig 必填（证据签名）')
    try {
      const cur = readBreaker(run, gate)?.state ?? initialBreaker()
      const state = tripBreaker(cur, rounds, sig)
      writeBreaker(run, gate, state)
      ctx.body = { ok: true, run, gate, state }
    } catch (e) {
      ctx.status = 503
      ctx.body = { ok: false, error: (e as Error).message }
    }
  })

  router.post('/lifecycle/breaker/check', (ctx) => {
    const b = ctx.request.body as {
      run?: unknown; gate?: unknown; sig?: unknown
      overrideFlag?: unknown; overrideReason?: unknown
      label?: unknown
    } | undefined
    const run = typeof b?.run === 'string' ? b.run : ''
    const gate = typeof b?.gate === 'string' ? b.gate : ''
    const label = typeof b?.label === 'string' && b.label ? b.label : gate
    if (!isValidRun(run)) return badRequest(ctx, 'run 参数非法')
    if (!GATE_RE.test(gate)) return badRequest(ctx, 'gate 参数非法')
    const sig = typeof b?.sig === 'string' ? b.sig : ''
    if (!sig.trim()) return badRequest(ctx, 'sig 必填（证据签名）')
    const override = b?.overrideFlag === true
      ? { flag: true, reason: typeof b?.overrideReason === 'string' ? b.overrideReason : '' }
      : undefined
    try {
      const cur = readBreaker(run, gate)?.state ?? initialBreaker()
      const decision = checkBreaker(cur, sig, override)
      const issues: string[] = []
      const approved: string[] = []
      if (decision.action === 'reset') {
        issues.push(`ISSUE|gate-breaker-reset|director|${label} ${decision.reason}`)
      } else if (decision.action === 'override') {
        issues.push(`ISSUE|gate-breaker-override|director|${label} 熔断复议放行：${decision.reason}`)
        approved.push(`humangate:${gate.toLowerCase()} GATE-BREAKER-REVIEW director-human ${Math.floor(Date.now() / 1000)} reason=${decision.reason}`)
      } else if (decision.action === 'override-refused') {
        issues.push(`ISSUE|gate-breaker-override-refused|director|${label} 复议缺 GATE_BREAKER_REASON（须记原因+变化证据），拒绝放行`)
      } else if (decision.action === 'block' && decision.firstLog) {
        issues.push(`ISSUE|gate-breaker-tripped|director|${label} ${decision.reason}`)
      }
      if (decision.action !== 'allow') {
        writeBreaker(run, gate, decision.state)
        recordEffects(run, { issues, approved })
      }
      ctx.body = { ok: true, run, gate, ...decision, effects: { issues, approved } }
    } catch (e) {
      ctx.status = 503
      ctx.body = { ok: false, error: (e as Error).message }
    }
  })
}
