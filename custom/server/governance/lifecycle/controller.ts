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
import type { Context } from 'koa'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { isValidRun, safeRunDir, simRootOrNull } from '../../simcenter/observer-root'
import { fail, ok, bodyOf } from '../../lib/http'
import { checkBreaker, initialBreaker, tripBreaker, type GateBreakerState } from './breaker'
import { judgeRequirementFreeze } from './requirements'
import {
  buildAcTrace, collectBindings, parseAcceptanceCriteria,
  CASE_STATUSES, type CaseStatus,
} from './ac-trace'
import {
  judgeStageChain, toChainResponse, STAGE_KEY_NAMES, type StageKeyName, type StageKeyVerifyDeps,
} from '../../handoff/stage-keys'
import { combinedGateVerdict, coveredAcs, gateVerdictOfText, uatVerdictFor, type GateVerdict } from './verdict'
import { atomicWriteJson } from '../../lib/fs-store'

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
  atomicWriteJson(file, doc, { indent: 1 })
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

function badRequest(ctx: Context, error: string): void {
  fail(ctx, 400, error)
}

/** 产物路径围栏：相对 root 解析后必须仍在 root 内（防目录穿越；越界返回 null）。 */
function withinRoot(base: string, rel: string): string | null {
  const target = resolve(base, rel)
  if (target === base) return null
  return target.startsWith(base + sep) ? target : null
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
    ctx.body = judgeRequirementFreeze(b.doc)
  })

  // AC 追溯（四性四格收敛批 C1）：形式判据之外的追溯判据——每条 AC 是否被用例证明、
  // 用例是否真跑过、跑过是否过关。绑定只认显式标记，不猜语义（猜出来的覆盖等于造假）。
  // 入参：{ doc, sources?: [{file, content}], results?: { 用例标识: pass|fail|skipped|missing|unknown } }
  router.post('/lifecycle/ac-trace', (ctx) => {
    const b = bodyOf<{ doc?: unknown; sources?: unknown; results?: unknown }>(ctx)
    if (typeof b.doc !== 'string' || !b.doc.trim()) return badRequest(ctx, 'doc 必填（需求书全文）')

    const sources: Array<{ file: string; content: string }> = []
    if (b.sources !== undefined) {
      if (!Array.isArray(b.sources)) return badRequest(ctx, 'sources 必须是数组')
      for (const raw of b.sources) {
        const s = raw as { file?: unknown; content?: unknown } | null
        if (typeof s?.file !== 'string' || !s.file.trim() || typeof s.content !== 'string') {
          return badRequest(ctx, 'sources 每项须为 { file: string, content: string }')
        }
        sources.push({ file: s.file, content: s.content })
      }
    }

    const results: Record<string, CaseStatus> = {}
    if (b.results !== undefined) {
      if (typeof b.results !== 'object' || b.results === null || Array.isArray(b.results)) {
        return badRequest(ctx, 'results 必须是 { 用例标识: 状态 } 对象')
      }
      for (const [k, v] of Object.entries(b.results as Record<string, unknown>)) {
        if (typeof v !== 'string' || !(CASE_STATUSES as readonly string[]).includes(v)) {
          return badRequest(ctx, `results[${k}] 状态非法（须为 ${CASE_STATUSES.join('|')}）`)
        }
        results[k] = v as CaseStatus
      }
    }

    const acs = parseAcceptanceCriteria(b.doc)
    if (acs.length === 0) return badRequest(ctx, 'doc 中未解析到 AC 条目（行首形态：- **AC-1** ...）')
    const trace = buildAcTrace(acs, collectBindings(sources), results)
    ok(ctx, { acTotal: acs.length, ...trace })
  })

  // 阶段交接键校验（四性四格收敛批 C4）：把「上游已达、下游没收到」从事后审计改成
  // 入口拒绝。root/gitRepo 给了才做 IO 核验（产物存在/哈希一致/提交锚点可解析）；
  // 不给只做结构校验，并在响应里 ioChecked=false 如实标注（弱保证不冒充强保证）。
  router.post('/lifecycle/stage-keys/verify', (ctx) => {
    const b = bodyOf<{ keys?: unknown; required?: unknown; root?: unknown; gitRepo?: unknown }>(ctx)
    if (!Array.isArray(b.keys)) return badRequest(ctx, 'keys 必填（阶段键数组）')
    if (b.keys.length > 32) return badRequest(ctx, 'keys 最多 32 项')

    let required: readonly StageKeyName[] = STAGE_KEY_NAMES
    if (b.required !== undefined) {
      if (!Array.isArray(b.required) || b.required.length === 0
        || !b.required.every((s) => typeof s === 'string' && (STAGE_KEY_NAMES as readonly string[]).includes(s))) {
        return badRequest(ctx, `required 非法（须为 ${STAGE_KEY_NAMES.join('|')} 的非空子集）`)
      }
      required = b.required as StageKeyName[]
    }

    let root: string | null = null
    if (b.root !== undefined) {
      if (typeof b.root !== 'string' || !isAbsolute(b.root)) return badRequest(ctx, 'root 必须是绝对路径')
      root = resolve(b.root)
      if (!existsSync(root)) return badRequest(ctx, 'root 不存在')
    }
    let gitRepo: string | null = null
    if (b.gitRepo !== undefined) {
      if (typeof b.gitRepo !== 'string' || !isAbsolute(b.gitRepo)) return badRequest(ctx, 'gitRepo 必须是绝对路径')
      gitRepo = resolve(b.gitRepo)
      if (!existsSync(gitRepo)) return badRequest(ctx, 'gitRepo 不存在')
    }

    const deps: StageKeyVerifyDeps = {}
    if (root) {
      const base = root
      // 先用路径围栏拦越界项并 400 点名，再进校验——不把越界误报成「产物缺失」。
      for (const raw of b.keys) {
        const arts = (raw as { artifacts?: unknown } | null)?.artifacts
        if (!Array.isArray(arts)) continue
        for (const a of arts) {
          const p = (a as { path?: unknown } | null)?.path
          if (typeof p === 'string' && withinRoot(base, p) === null) {
            return badRequest(ctx, `产物路径越界：${p}（须在 root 内）`)
          }
        }
      }
      deps.fileExists = (p: string) => {
        const t = withinRoot(base, p)
        return t !== null && existsSync(t)
      }
      deps.sha256Of = (p: string) => {
        const t = withinRoot(base, p)
        if (t === null) return null
        try {
          return createHash('sha256').update(readFileSync(t)).digest('hex')
        } catch {
          return null
        }
      }
    }
    if (gitRepo) {
      const repo = gitRepo
      deps.resolveCommit = (c: string) => {
        try {
          execFileSync('git', ['-C', repo, 'cat-file', '-e', `${c}^{commit}`], { stdio: 'ignore', timeout: 5000 })
          return true
        } catch {
          return false
        }
      }
    }

    const report = judgeStageChain(b.keys, required, deps)
    ok(ctx, {
      ioChecked: Boolean(root || gitRepo),
      fileChecked: Boolean(root),
      commitChecked: Boolean(gitRepo),
      ...toChainResponse(report),
    })
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
    if (!simRootOrNull()) { fail(ctx, 503, 'SIM_ROOT 未配置（fail-closed）'); return }
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
      fail(ctx, 503, (e as Error).message)
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
      fail(ctx, 503, (e as Error).message)
    }
  })
}
