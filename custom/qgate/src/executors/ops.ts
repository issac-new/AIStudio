// ops executor（v0.3 R4 + R8 门类补齐，上游运营/治理门族本地方言）。
//   metrics          —— 观察指标文件 × thresholds {name:{min,max}}；缺失/非数值 → error
//   budget           —— 声明文件算术：上游预算 ≥ Σ(timeout×(retries+1))；重试预算 >20% → FAIL
//   rerun            —— 幂等重跑证据文件：同 seed ≥2 次、输出 sha256 一致、策略必填、复式恒等式
//   trace-continuity —— 声明调用对 × 观察 span：missing-link / trace-id-discontinuity /
//                          span-id-mismatch / W3C traceparent 校验
//   resilience       —— 故障演练观察：恢复时长 / 终态 / 信号齐全 / 演练时效（maxAgeDays）
//   topology         —— 声明式拓扑 R1-R4：故障域分散 / 副本阈值按 stateModel / 一阶割集 / leader 租约
//   conventions（R8）—— 约定对齐：include 正则 × paths glob 扫描命中（上游 convention-alignment）
//   consistency（R8）—— 数据一致性五类型：zero-sum(BigInt)/append-only/reconciliation/dlq/audit-chain(内核重算)
//   configuration（R8）—— 多环境配置 flatten 逐键比对 + allowedDifferences + 秘密键明文
//   documentation（R8）—— 四角色文档制品：存在非空 + 版本一致 + requiredTopics 在文
//   symbols（R8）     —— 符号接地：静态 import 三分类（项目内/依赖/内置），未解析与悬空成员 → FAIL
// 纪律：文件缺失/畸形/数值非法 → error（INCONCLUSIVE）；违规 → FAIL 点名（上游同款违规码）。

import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { globMatch } from '../core/impact.js'

/** 工作区文件清单（深度 ≤8，跳 node_modules/.git/dist；conventions/symbols 共用）。 */
function listWorkspaceFilesSafe(workspace: string, limit = 5000): string[] {
  const out: string[] = []
  const visit = (dir: string, depth: number): void => {
    if (depth > 8 || out.length >= limit) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      // 扫描面跳过：依赖/版本库/构建产物/门数据，以及 .claude（worktree 残根——
      // symbol-grounding 主树首跑逮住 2782 条残根误报后加入）
      if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.qgate' || name === '.claude' || name === '.wxwork') continue
      if (out.length >= limit) return
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) visit(full, depth + 1)
      else out.push(relative(workspace, full))
    }
  }
  visit(workspace, 0)
  return out.sort()
}

const globSafe = (pattern: string, path: string): boolean => globMatch(pattern, path)

export interface OpsExecutorInput {
  runId: string
  gateId: string
  workspace: string
  commit?: string
}

function readJson(file: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

const TRACEPARENT_RE = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/

export function runOpsExecutor(executor: ExecutorSpec, input: OpsExecutorInput): Evidence {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-ops`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'spec-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const done = (result: Evidence['result'], summary: string, paths?: string[]): Evidence => {
    ev.result = result
    ev.execution = result === 'error' ? 'wired' : 'exercised'
    ev.summary = summary.slice(0, 400)
    if (paths) ev.provenance.affectedPaths = paths.slice(0, 100)
    ev.provenance.endedAt = Date.now()
    return ev
  }
  const rel = (p: string | undefined): string | undefined => (p ? join(input.workspace, p) : undefined)
  const loadRel = (p: string | undefined, what: string): { value: Record<string, unknown> } | { error: string } => {
    const f = rel(p)
    if (!f) return { error: `${what} requires a file path` }
    if (!existsSync(f)) return { error: `${what} file missing: ${p}` }
    const r = readJson(f)
    if ('error' in r) return { error: `${what} malformed: ${r.error}` }
    return { value: r.value as Record<string, unknown> }
  }

  if (executor.mode === 'metrics') {
    const o = loadRel(executor.observedFile, 'metrics')
    if ('error' in o) return done('error', o.error)
    const metrics = o.value.metrics
    if (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics)) return done('error', 'observation lacks metrics object')
    const thresholds = executor.thresholds ?? {}
    if (Object.keys(thresholds).length === 0) return done('error', 'metrics requires thresholds{}')
    const violations: string[] = []
    const seen: string[] = []
    for (const [name, th] of Object.entries(thresholds)) {
      const v = (metrics as Record<string, unknown>)[name]
      if (typeof v !== 'number' || !Number.isFinite(v)) return done('error', `metric ${name} missing or non-numeric (got ${JSON.stringify(v)})`)
      seen.push(`${name}=${v}`)
      if (th.min !== undefined && v < th.min) violations.push(`${name}=${v} < min ${th.min}`)
      if (th.max !== undefined && v > th.max) violations.push(`${name}=${v} > max ${th.max}`)
    }
    if (violations.length > 0) return done('fail', `threshold violations: ${violations.join(' | ')}`, violations)
    return done('pass', `metrics within thresholds: ${seen.join(', ')}`)
  }

  if (executor.mode === 'budget') {
    const d = loadRel(executor.dataFile ?? executor.observedFile, 'budget')
    if ('error' in d) return done('error', d.error)
    const hops = Array.isArray(d.value.hops) ? d.value.hops.filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null) : undefined
    const budgets = typeof d.value.budgets === 'object' && d.value.budgets !== null ? (d.value.budgets as Record<string, unknown>) : undefined
    if (!hops || !budgets) return done('error', 'budget file lacks hops[]/budgets{}')
    const problems: string[] = []
    const perCaller = new Map<string, number>()
    let retryTotal = 0
    let timeoutTotal = 0
    for (const [i, h] of hops.entries()) {
      const caller = String(h.caller)
      const timeoutMs = h.timeoutMs
      const retries = h.retries ?? 0
      if (typeof timeoutMs !== 'number' || timeoutMs <= 0) return done('error', `hops[${i}] timeoutMs invalid`)
      if (typeof retries !== 'number' || !Number.isInteger(retries) || retries < 0 || retries > 10) return done('error', `hops[${i}] retries invalid (0..10)`)
      const cost = timeoutMs * (retries + 1)
      perCaller.set(caller, (perCaller.get(caller) ?? 0) + cost)
      timeoutTotal += timeoutMs
      retryTotal += timeoutMs * retries
    }
    for (const [caller, need] of perCaller) {
      const budget = budgets[caller]
      if (budget === undefined) { problems.push(`missingCallerBudget: ${caller} (Σ${need}ms, no budget declared)`); continue }
      if (typeof budget !== 'number') return done('error', `budget for ${caller} non-numeric`)
      if (budget < need) problems.push(`budgetExceeded: ${caller} budget ${budget}ms < Σ timeout×(retries+1) ${need}ms`)
    }
    if (timeoutTotal > 0 && retryTotal / timeoutTotal > 0.2) {
      problems.push(`retryBudgetExceeded: retry overhead ${(retryTotal / timeoutTotal * 100).toFixed(0)}% > 20% of Σtimeout`)
    }
    if (problems.length > 0) return done('fail', `budget violations: ${problems.join(' | ')}`, problems)
    return done('pass', `budgets sound: ${hops.length} hops, ${perCaller.size} callers, retry overhead ${(timeoutTotal > 0 ? (retryTotal / timeoutTotal * 100).toFixed(0) : 0)}%`)
  }

  if (executor.mode === 'rerun') {
    const d = loadRel(executor.dataFile ?? executor.observedFile, 'rerun')
    if ('error' in d) return done('error', d.error)
    const jobs = Array.isArray(d.value.jobs) ? d.value.jobs.filter((j): j is Record<string, unknown> => typeof j === 'object' && j !== null) : undefined
    if (!jobs) return done('error', 'rerun file lacks jobs[]')
    const problems: string[] = []
    for (const [i, j] of jobs.entries()) {
      const id = typeof j.id === 'string' ? j.id : `job[${i}]`
      if (typeof j.idempotencyKeyStrategy !== 'string' || j.idempotencyKeyStrategy.length === 0) {
        return done('error', `${id}: idempotencyKeyStrategy must be declared`)
      }
      const runs = Array.isArray(j.runs) ? j.runs : []
      if (runs.length < 2) return done('error', `${id}: needs ≥2 runs for idempotency evidence (got ${runs.length})`)
      const seeds = new Set(runs.map((r) => String((r as Record<string, unknown>).seed)))
      if (seeds.size !== 1) return done('error', `${id}: runs must share one seed (got ${[...seeds].join(',')})`)
      const shas = runs.map((r) => String((r as Record<string, unknown>).sha256))
      if (new Set(shas).size > 1) problems.push(`${id}: outputDivergence ${shas.map((s) => s.slice(0, 8)).join('≠')}`)
      const de = j.doubleEntry as Record<string, unknown> | undefined
      if (de) {
        const debit = de.debit
        const credit = de.credit
        if (typeof debit !== 'number' || typeof credit !== 'number') return done('error', `${id}: doubleEntry must be {debit,credit} numbers`)
        if (debit !== credit) problems.push(`${id}: unbalancedDoubleEntry debit ${debit} ≠ credit ${credit}`)
      }
    }
    if (problems.length > 0) return done('fail', `rerun violations: ${problems.join(' | ')}`, problems)
    return done('pass', `idempotency proven: ${jobs.length} job(s) rerun with identical outputs`)
  }

  if (executor.mode === 'trace-continuity') {
    const o = loadRel(executor.observedFile, 'trace-continuity')
    if ('error' in o) return done('error', o.error)
    const links = Array.isArray(o.value.links) ? o.value.links.filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null) : undefined
    if (!links) return done('error', 'observation lacks links[]')
    const pairs = executor.pairs ?? []
    if (pairs.length === 0) return done('error', 'trace-continuity requires pairs[] [[caller,callee],…]')
    const spanOf = (l: Record<string, unknown>, key: string): Record<string, unknown> | undefined => {
      const s = l[key]
      return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : undefined
    }
    const problems: string[] = []
    const linkFor = (caller: string, callee: string) => links.find((l) => String(l.caller) === caller && String(l.callee) === callee)
    for (const [caller, callee] of pairs) {
      const l = linkFor(caller, callee)
      if (!l) { problems.push(`missing-link: ${caller}→${callee}`); continue }
      const cs = spanOf(l, 'callerSpan')
      const ns = spanOf(l, 'calleeSpan')
      if (!cs || !ns) { problems.push(`missing-link: ${caller}→${callee} lacks span pair`); continue }
      if (cs.traceId !== ns.traceId) problems.push(`trace-id-discontinuity: ${caller}→${callee} (${String(cs.traceId)} ≠ ${String(ns.traceId)})`)
      if (ns.parentSpanId !== undefined && cs.spanId !== undefined && ns.parentSpanId !== cs.spanId) {
        problems.push(`span-id-mismatch: ${caller}→${callee} (parentSpanId ${String(ns.parentSpanId)} ≠ spanId ${String(cs.spanId)})`)
      }
      const tp = l.traceparent
      if (tp !== undefined) {
        if (!TRACEPARENT_RE.test(String(tp))) problems.push(`traceparent-format: ${caller}→${callee} not W3C`)
        else {
          const traceId = String(tp).split('-')[1]
          if (String(cs.traceId) !== traceId) problems.push(`traceparent-mismatch: ${caller}→${callee} traceId ≠ header`)
        }
      }
    }
    const declared = new Set(pairs.map(([a, b]) => `${a}→${b}`))
    const extra = links.filter((l) => !declared.has(`${String(l.caller)}→${String(l.callee)}`)).map((l) => `${String(l.caller)}→${String(l.callee)}`)
    if (problems.length > 0) return done('fail', `trace continuity violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${pairs.length} declared links continuous${extra.length ? ` (${extra.length} extra observed, audit-only)` : ''}`)
  }

  if (executor.mode === 'resilience') {
    const o = loadRel(executor.observedFile, 'resilience')
    if ('error' in o) return done('error', o.error)
    const drills = Array.isArray(o.value.drills) ? o.value.drills.filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null) : undefined
    if (!drills) return done('error', 'observation lacks drills[]')
    if (drills.length === 0) return done('error', 'at least one drill required')
    const problems: string[] = []
    const requiredSignals = executor.requiredSignals ?? ['log', 'metric', 'trace', 'alert']
    const now = Date.now()
    for (const [i, d] of drills.entries()) {
      const fault = String(d.fault ?? `drill[${i}]`)
      const recoveryMs = d.recoveryMs
      if (typeof recoveryMs !== 'number') return done('error', `${fault}: recoveryMs missing`)
      if (executor.maxRecoveryMs !== undefined && recoveryMs > executor.maxRecoveryMs) {
        problems.push(`${fault}: recovery ${recoveryMs}ms > max ${executor.maxRecoveryMs}ms`)
      }
      if (d.finalState === undefined) return done('error', `${fault}: finalState missing`)
      if (typeof d.observedAt === 'string') {
        const at = Date.parse(d.observedAt)
        if (!Number.isFinite(at)) return done('error', `${fault}: observedAt unparseable`)
        if (executor.maxAgeDays !== undefined && now - at > executor.maxAgeDays * 86_400_000) {
          problems.push(`${fault}: drill stale (observedAt ${d.observedAt} older than ${executor.maxAgeDays}d)`)
        }
      }
      const signals = typeof d.signals === 'object' && d.signals !== null ? (d.signals as Record<string, unknown>) : undefined
      if (!signals) return done('error', `${fault}: signals{log,metric,trace,alert} missing`)
      for (const s of requiredSignals) {
        if (signals[s] !== true) problems.push(`${fault}: signal ${s} missing`)
      }
    }
    if (problems.length > 0) return done('fail', `resilience violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${drills.length} drill(s) recovered within budget with signals {${requiredSignals.join(',')}}`)
  }

  if (executor.mode === 'topology') {
    const d = loadRel(executor.dataFile ?? executor.observedFile, 'topology')
    if ('error' in d) return done('error', d.error)
    const services = Array.isArray(d.value.services) ? d.value.services.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null) : undefined
    if (!services) return done('error', 'topology file lacks services[]')
    const byId = new Map<string, Record<string, unknown>>()
    for (const [i, s] of services.entries()) {
      const id = typeof s.id === 'string' ? s.id : `svc[${i}]`
      if (byId.has(id)) return done('error', `duplicate service id ${id}`)
      byId.set(id, s)
    }
    const critical = Array.isArray(d.value.critical) ? (d.value.critical as unknown[]).filter((c): c is string => typeof c === 'string') : [...byId.keys()]
    const problems: string[] = []
    // R1 关键服务/依赖故障域分散 ≥2
    const domainKey = (s: Record<string, unknown>): string | undefined => {
      const fd = s.failureDomain
      if (typeof fd !== 'object' || fd === null) return undefined
      const r = (fd as Record<string, unknown>).region
      const z = (fd as Record<string, unknown>).zone
      const h = (fd as Record<string, unknown>).host
      for (const v of [r, z, h]) if (typeof v === 'string' && v.length > 0) return v
      return undefined
    }
    const explicitUnavailable = d.value.domainVerification === 'unavailable'
    for (const id of critical) {
      const s = byId.get(id)
      if (!s) { problems.push(`R1: critical service ${id} not defined`); continue }
      const domains = new Set<string>()
      let anyDomain = false
      for (const [, dep] of byId) {
        if (domainKey(dep)) { anyDomain = true; domains.add(domainKey(dep)!) }
      }
      if (domainKey(s)) domains.add(domainKey(s)!)
      if (!anyDomain && !domainKey(s)) {
        if (!explicitUnavailable) problems.push(`R1: no failureDomain info and domainVerification:"unavailable" not declared`)
        continue
      }
      if (domains.size < 2) problems.push(`R1: critical ${id} spans ${domains.size} distinct failure domain(s) < 2`)
    }
    // R2 副本阈值按 stateModel
    for (const [id, s] of byId) {
      const replicas = s.replicas
      const stateModel = typeof s.stateModel === 'string' ? s.stateModel : 'stateless'
      if (typeof replicas !== 'number' || !Number.isInteger(replicas) || replicas < 1) return done('error', `${id}: replicas invalid`)
      const f = typeof s.byzantineTolerance === 'number' ? s.byzantineTolerance : undefined
      let min: number
      switch (stateModel) {
        case 'stateless': min = 2; break
        case 'consensus': if (replicas % 2 !== 1) problems.push(`R2: consensus ${id} replicas ${replicas} must be odd`); min = 3; break
        case 'standby': min = 3; break
        case 'byzantine': min = f !== undefined ? 3 * f + 1 : 4; break
        default: return done('error', `${id}: unknown stateModel ${stateModel}`)
      }
      if (replicas < min) problems.push(`R2: ${stateModel} ${id} replicas ${replicas} < ${min}`)
    }
    // R3 一阶最小割集：单副本服务 / 单域集中 / 单实例依赖边（计数报告）
    let singleReplica = 0
    let singleDomain = 0
    for (const [id, s] of byId) {
      if (s.replicas === 1) singleReplica++
      const dk = domainKey(s)
      if (dk && [...byId.values()].filter((x) => domainKey(x) === dk).length === 1) singleDomain++
    }
    const deps = Array.isArray(d.value.dependencies) ? d.value.dependencies.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []
    const fanIn = new Map<string, number>()
    for (const dep of deps) fanIn.set(String(dep.to), (fanIn.get(String(dep.to)) ?? 0) + 1)
    const singleInstanceDeps = [...fanIn.entries()].filter(([to]) => byId.get(to)?.replicas === 1).map(([to]) => to)
    // R4 leader 语义须 transientLeadership + leaderLeaseSec（对称角色无 leader 者豁免）
    for (const [id, s] of byId) {
      const roles = s.roles
      const hasLeader = Array.isArray(roles) && roles.every((r) => typeof r === 'string') && (roles as string[]).includes('leader')
      if (!hasLeader) continue
      if (s.transientLeadership !== true || typeof s.leaderLeaseSec !== 'number') {
        problems.push(`R4: leader role on ${id} requires transientLeadership:true + leaderLeaseSec`)
      }
    }
    if (problems.length > 0) return done('fail', `topology violations: ${problems.join(' | ')}`, problems)
    const cut = `single-replica svc=${singleReplica}, single-domain concentrations=${singleDomain}, single-instance dependency targets=${singleInstanceDeps.length}`
    return done('pass', `topology R1-R4 sound (${byId.size} services; first-order cuts: ${cut})`)
  }

  // ── R8 门类补齐（上游 convention-alignment/consistency/configuration/documentation/symbol-grounding） ──

  if (executor.mode === 'conventions') {
    // 约定对齐：conventions.json 规则（include 正则 + paths glob + severity）扫描命中即报。
    const d = loadRel(executor.dataFile ?? executor.observedFile, 'conventions')
    if ('error' in d) return done('error', d.error)
    const rules = Array.isArray(d.value.rules) ? d.value.rules.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null) : undefined
    if (!rules || rules.length === 0) return done('error', 'conventions file lacks rules[]')
    const problems: string[] = []
    const files = listWorkspaceFilesSafe(input.workspace)
    for (const [i, r] of rules.entries()) {
      const id = typeof r.id === 'string' ? r.id : `rule[${i}]`
      const include = typeof r.include === 'string' ? r.include : null
      if (!include) return done('error', `${id}: include regex required`)
      const paths = Array.isArray(r.paths) ? (r.paths as unknown[]).filter((p): p is string => typeof p === 'string') : ['**/*']
      const severity = r.severity === 'fail' ? 'fail' : 'warn'
      let re: RegExp
      try {
        re = new RegExp(include, 'u')
      } catch (e) {
        return done('error', `${id}: include regex invalid: ${(e as Error).message}`)
      }
      let hits = 0
      for (const rel of files) {
        if (!paths.some((p) => globSafe(p, rel))) continue
        let content: string
        try {
          content = readFileSync(join(input.workspace, rel), 'utf8')
        } catch {
          continue
        }
        const m = re.exec(content)
        if (m) {
          hits++
          if (severity === 'fail') problems.push(`${id}: /${include}/ hits ${rel}${m.index !== undefined ? `:${1 + content.slice(0, m.index).split('\n').length - 1}` : ''}`)
        }
      }
      if (severity === 'fail' && hits > 0) continue
      if (severity === 'warn' && hits > 0) problems.push(`${id}(warn): /${include}/ hits ${hits} file(s)`)
    }
    if (problems.length > 0) {
      const hard = problems.filter((p) => !p.includes('(warn)'))
      if (hard.length > 0) return done('fail', `convention violations (${hard.length}): ${hard.slice(0, 6).join(' | ')}`, hard)
      return done('fail', `convention findings (warn-severity): ${problems.slice(0, 6).join(' | ')}`, problems)
    }
    return done('pass', `${rules.length} convention rules clean over ${files.length} files`)
  }

  if (executor.mode === 'consistency') {
    // 数据一致性五类型（上游 consistency 本地方言；一次一门类型，多类型用多 executor 声明）。
    const d = loadRel(executor.dataFile ?? executor.observedFile, 'consistency')
    if ('error' in d) return done('error', d.error)
    const kind = typeof d.value.kind === 'string' ? d.value.kind : null
    if (!kind) return done('error', 'consistency file lacks kind (zero-sum|append-only|reconciliation|dlq|audit-chain)')
    if (kind === 'zero-sum') {
      const entries = Array.isArray(d.value.entries) ? d.value.entries.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : undefined
      if (!entries) return done('error', 'zero-sum lacks entries[]')
      let debit = 0n
      let credit = 0n
      for (const [i, e] of entries.entries()) {
        const side = e.side
        const amount = e.amount
        if ((side !== 'debit' && side !== 'credit') || typeof amount !== 'number' || !Number.isInteger(amount)) {
          return done('error', `entries[${i}]: side must be debit|credit and amount an integer (cents; BigInt 精度纪律)`)
        }
        if (side === 'debit') debit += BigInt(amount)
        else credit += BigInt(amount)
      }
      if (debit !== credit) return done('fail', `zero-sum broken: debit ${debit} ≠ credit ${credit}`)
      return done('pass', `zero-sum holds: ${entries.length} entries, both sides ${debit}`)
    }
    if (kind === 'append-only') {
      const ops = Array.isArray(d.value.operations) ? d.value.operations.filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null) : undefined
      if (!ops) return done('error', 'append-only lacks operations[]')
      const sourceType = typeof d.value.sourceType === 'string' ? d.value.sourceType : 'runtime-observed'
      const accepted = Array.isArray(d.value.acceptedSourceTypes) ? (d.value.acceptedSourceTypes as unknown[]).filter((s): s is string => typeof s === 'string') : ['runtime-observed', 'observed']
      if (!accepted.includes(sourceType)) return done('error', `sourceType ${sourceType} not in acceptedSourceTypes (evidence too weak)`)
      const mutations = ops.filter((o) => o.op === 'update' || o.op === 'delete').map((o) => `${String(o.op)} ${String(o.id ?? '?')}`)
      if (mutations.length > 0) return done('fail', `append-only violated: ${mutations.length} mutation(s): ${mutations.slice(0, 6).join(', ')}`, mutations)
      return done('pass', `append-only holds: ${ops.length} operations, zero mutations`)
    }
    if (kind === 'reconciliation') {
      const breaks = Array.isArray(d.value.breaks) ? d.value.breaks.filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null) : undefined
      if (!breaks) return done('error', 'reconciliation lacks breaks[]')
      const slaHours = typeof d.value.breakSlaHours === 'number' ? d.value.breakSlaHours : 24
      const now = typeof d.value.now === 'number' ? d.value.now : Date.now()
      let p0 = 0
      let p1 = 0
      let p2 = 0
      const overdue: string[] = []
      for (const b of breaks) {
        const since = typeof b.since === 'number' ? b.since : null
        if (since === null) return done('error', 'reconciliation break lacks since (epoch ms)')
        const ageH = (now - since) / 3_600_000
        const id = String(b.id ?? '?')
        if (ageH > slaHours) overdue.push(`${id} (${ageH.toFixed(1)}h > SLA ${slaHours}h)`)
        if (ageH >= slaHours) p0++
        else if (ageH >= slaHours / 2) p1++
        else p2++
      }
      if (overdue.length > 0) return done('fail', `reconciliation SLA breaches: ${overdue.slice(0, 6).join(' | ')}`, overdue)
      return done('pass', `reconciliation within SLA: ${breaks.length} break(s) (p0=${p0} p1=${p1} p2=${p2}, SLA ${slaHours}h)`)
    }
    if (kind === 'dlq') {
      const dlq = Array.isArray(d.value.entries) ? d.value.entries.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : undefined
      if (!dlq) return done('error', 'dlq lacks entries[]')
      const problems: string[] = []
      for (const [i, e] of dlq.entries()) {
        const id = String(e.id ?? `entry[${i}]`)
        const drops = e.silentDrops
        const retries = e.retries
        const poisonResolved = e.poisonResolved
        if (typeof drops === 'number' && drops > 0) problems.push(`${id}: ${drops} silent drop(s)`)
        if (typeof retries === 'number' && retries > (typeof d.value.maxRetries === 'number' ? d.value.maxRetries : 5)) problems.push(`${id}: over-retry (${retries})`)
        if (poisonResolved === false) problems.push(`${id}: poison message unresolved (drill not passed)`)
      }
      if (problems.length > 0) return done('fail', `dlq violations: ${problems.join(' | ')}`, problems)
      return done('pass', `dlq clean: ${dlq.length} entr(y/ies), no silent drops / over-retries / unresolved poison`)
    }
    if (kind === 'audit-chain') {
      const chain = Array.isArray(d.value.chain) ? d.value.chain.filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null) : undefined
      if (!chain || chain.length === 0) return done('error', 'audit-chain lacks chain[]')
      // 内核重算哈希链（ADR-0007：可纯算术复核的判定收归内核）
      const problems: string[] = []
      let prev = 'genesis'
      for (const [i, c] of chain.entries()) {
        const seq = c.seq
        const actor = typeof c.actor === 'string' ? c.actor : null
        const action = typeof c.action === 'string' ? c.action : null
        const claimed = typeof c.sha256 === 'string' ? c.sha256 : null
        if (typeof seq !== 'number' || !Number.isInteger(seq) || seq !== i + 1) { problems.push(`chain[${i}]: seq must be ${i + 1}`); continue }
        if (!actor || !action) { problems.push(`chain[${i}]: actor/action required`); continue }
        const computed = createHash('sha256').update(`${prev}:${seq}:${actor}:${action}`).digest('hex')
        if (claimed !== computed) problems.push(`chain[${i}]: sha256 mismatch (claimed ${(claimed ?? '(none)').slice(0, 10)}…, computed ${computed.slice(0, 10)}…)`)
        prev = claimed ?? computed
      }
      if (problems.length > 0) return done('fail', `audit-chain broken: ${problems.slice(0, 6).join(' | ')}`, problems)
      return done('pass', `audit-chain verified: kernel recomputed ${chain.length} link(s), hash chain intact`)
    }
    return done('error', `unknown consistency kind: ${kind}`)
  }

  if (executor.mode === 'configuration') {
    // 多环境配置一致性：flatten 逐键比对 + allowedDifferences（* 段通配）+ 秘密键明文检测。
    const d = loadRel(executor.dataFile ?? executor.observedFile, 'configuration')
    if ('error' in d) return done('error', d.error)
    const environments = typeof d.value.environments === 'object' && d.value.environments !== null ? (d.value.environments as Record<string, unknown>) : null
    if (!environments || Object.keys(environments).length < 2) return done('error', 'configuration needs ≥2 environments {name: file}')
    const allowed = Array.isArray(d.value.allowedDifferences) ? (d.value.allowedDifferences as unknown[]).filter((a): a is string => typeof a === 'string') : []
    const flatten = (v: unknown, prefix: string, out: Map<string, unknown>): void => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) flatten(val, prefix ? `${prefix}.${k}` : k, out)
      } else {
        out.set(prefix, v)
      }
    }
    const envs = new Map<string, Map<string, unknown>>()
    for (const [name, rel0] of Object.entries(environments)) {
      if (typeof rel0 !== 'string') return done('error', `environment ${name}: path must be a string`)
      const f = rel(rel0)
      if (!f || !existsSync(f)) return done('error', `environment ${name}: file missing: ${rel0}`)
      const j = readJson(f)
      if ('error' in j) return done('error', `environment ${name}: malformed: ${j.error}`)
      const flat = new Map<string, unknown>()
      flatten(j.value, '', flat)
      envs.set(name, flat)
    }
    const [baseName, ...others] = [...envs.keys()]
    const base = envs.get(baseName)!
    const problems: string[] = []
    const segMatch = (pat: string, key: string): boolean => {
      const p = pat.replace(/^\//, '').split('.')
      const k = key.split('.')
      if (p.length > k.length) return false
      for (let i = 0; i < p.length; i++) if (p[i] !== '*' && p[i] !== k[i]) return false
      return true
    }
    for (const other of others) {
      const flat = envs.get(other)!
      for (const key of new Set([...base.keys(), ...flat.keys()])) {
        if (allowed.some((a) => segMatch(a, key))) continue
        const bv = base.get(key)
        const ov = flat.get(key)
        if (bv === undefined) { problems.push(`${other}: missing-key ${key}`); continue }
        if (ov === undefined) { problems.push(`${other}: missing-key ${key} (present in ${baseName})`); continue }
        if (typeof bv !== typeof ov) { problems.push(`${other}: type-mismatch ${key} (${typeof bv} vs ${typeof ov})`); continue }
        if (bv !== ov) {
          const secretish = /(secret|token|password|api[_-]?key|credential)/i.test(key)
          problems.push(secretish
            ? `${other}: undeclared-difference ${key} (values differ; redacted)`
            : `${other}: undeclared-difference ${key} (${JSON.stringify(bv)} vs ${JSON.stringify(ov)})`)
        }
      }
    }
    // 秘密键明文：值非 ref: 前缀即 FAIL（值本身不进证据）
    for (const [name, flat] of envs) {
      for (const [key, v] of flat) {
        if (!/(secret|token|password|api[_-]?key|credential)/i.test(key)) continue
        if (typeof v === 'string' && !v.startsWith('ref:')) problems.push(`${name}: literal-secret ${key} (value redacted; use ref: indirection)`)
      }
    }
    if (problems.length > 0) return done('fail', `configuration drift (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${envs.size} environments aligned (${base.size} keys, ${allowed.length} allowed difference patterns)`)
  }

  if (executor.mode === 'documentation') {
    // 四角色文档制品核验：存在非空 + 版本一致 + requiredTopics 在文。
    const d = loadRel(executor.dataFile ?? executor.observedFile, 'documentation')
    if ('error' in d) return done('error', d.error)
    const docs = Array.isArray(d.value.docs) ? d.value.docs.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : undefined
    if (!docs || docs.length === 0) return done('error', 'documentation file lacks docs[]')
    const problems: string[] = []
    for (const [i, doc] of docs.entries()) {
      const role = typeof doc.role === 'string' ? doc.role : `doc[${i}]`
      const path = typeof doc.path === 'string' ? doc.path : null
      if (!path) return done('error', `${role}: path required`)
      const f = rel(path)!
      if (!existsSync(f)) { problems.push(`${role}: file missing: ${path}`); continue }
      let content: string
      try {
        content = readFileSync(f, 'utf8')
      } catch {
        problems.push(`${role}: unreadable: ${path}`)
        continue
      }
      if (content.trim().length === 0) { problems.push(`${role}: empty file: ${path}`); continue }
      if (typeof doc.version === 'string' && !content.includes(doc.version)) problems.push(`${role}: version ${doc.version} not found in ${path}`)
      const topics = Array.isArray(doc.requiredTopics) ? (doc.requiredTopics as unknown[]).filter((t): t is string => typeof t === 'string') : []
      for (const t of topics) if (!content.includes(t)) problems.push(`${role}: requiredTopic "${t}" missing in ${path}`)
    }
    if (problems.length > 0) return done('fail', `documentation violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${docs.length} doc artifact(s) verified (exist, non-empty, version/topics honored)`)
  }

  if (executor.mode === 'symbols') {
    // 符号接地（上游 symbol-grounding 本地方言）：静态 import 三分类（项目内/依赖清单/内置），
    // 未解析说明符 → FAIL；相对导入的命名成员对账目标模块导出面（词法保守解析）。
    const changed = (executor.observedFile === undefined)
    const files = listWorkspaceFilesSafe(input.workspace).filter((f) => /\.(ts|tsx|js|mjs|vue)$/.test(f))
    const target = changed ? files : files // 全仓走读（增量面由 appliesWhen 承担）
    // 依赖清单来源：默认 workspace package.json；depsFile 可指向上游——符号链借用架构
    //（node_modules 实为上游树的链接）时声明的事实源在上游 package.json，借用必须显式指认；
    // 指认的清单缺失 → error（链接架构漂移是异常，不是"没有依赖"）
    let pkgDeps: Set<string> = new Set()
    const depsFile = executor.depsFile ?? 'package.json'
    const depsPath = join(input.workspace, depsFile)
    if (executor.depsFile && !existsSync(depsPath)) {
      return done('error', `depsFile missing: ${depsFile}（借用契约指认的上游依赖清单不存在——符号链架构漂移）`)
    }
    if (existsSync(depsPath)) {
      try {
        const j = JSON.parse(readFileSync(depsPath, 'utf8')) as Record<string, unknown>
        for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
          const deps = j[key]
          if (typeof deps === 'object' && deps !== null) for (const d of Object.keys(deps as Record<string, unknown>)) pkgDeps.add(d)
        }
      } catch { /* 清单坏 → 依赖集空，unresolved 会如实暴露 */ }
    }
    const NODE_BUILTINS = new Set(['assert', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'])
    const unresolved: string[] = []
    const unresolvedMember: string[] = []
    const exportsCache = new Map<string, Set<string>>()
    const exportsOf = (file: string): Set<string> | null => {
      const cached = exportsCache.get(file)
      if (cached) return cached
      let content: string
      try {
        content = readFileSync(join(input.workspace, file), 'utf8')
      } catch {
        return null
      }
      const names = new Set<string>()
      let m: RegExpExecArray | null
      // async 导出（export async function foo）与 type-only 列表导出（export type { A }）
      // 是两枚曾漏的形态——84 条成员悬空长尾的两枚根因（2026-10-02 分类定位）
      const re = /export\s+(?:declare\s+)?(?:async\s+)?(?:const\s+enum|const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g
      while ((m = re.exec(content)) !== null) names.add(m[1])
      const reDef = /export\s+default(?:\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*))?/
      const def = reDef.exec(content)
      if (def) names.add(def[1] ?? 'default')
      // <script setup> 的 .vue 隐式 default 导出（Vue 惯例：组件即 default，无显式语句）
      if (file.endsWith('.vue')) names.add('default')
      const reList = /export\s+(?:type\s+)?\{([^}]+)\}(?:\s*from\s*['"][^'"]+['"])?/g
      while ((m = reList.exec(content)) !== null) {
        for (const part of m[1].split(',')) {
          const seg = part.trim()
          if (!seg) continue
          const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(seg)
          names.add(asMatch ? asMatch[2] : seg.split(':')[0].trim())
        }
      }
      const reStar = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g
      exportsCache.set(file, names)
      // 再解析 * re-export（一层）
      while ((m = reStar.exec(content)) !== null) {
        const t = resolveSpecifier(file, m[1])
        if (t) for (const n of exportsOf(t) ?? []) names.add(n)
      }
      return names
    }
    // 裸说明符：@scope/name 取前两段，普通包取首段（scoped 包 split('/')[0] 只得 '@scope' 的正统坑）
    const bareOf = (spec: string): string =>
      spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    // 非代码资源 import（样式/字体/图像——合法语句，不属符号接地面）
    const ASSET_RE = /\.(scss|css|less|sass|styl|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp3|mp4|wav)$/
    const resolveSpecifier = (fromFile: string, spec: string, fromRoot = false): string | null => {
      if (!spec.startsWith('.')) return null
      if (ASSET_RE.test(spec)) return '__asset__'
      // fromFile 是 workspace 相对路径——先锚到绝对再展开候选，最后回相对比对；
      // fromRoot=true（alias 产物）：路径语义是仓根相对，不随引用者目录漂移
      const base = fromRoot ? join(input.workspace, spec) : join(input.workspace, fromFile, '..', spec)
      // TS NodeNext 惯例：import './x.js' 实指 x.ts——.js/.mjs/.cjs 结尾时同步试 TS 同名件
      const tsRemap = []
      if (/\.js$/.test(spec)) tsRemap.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`)
      if (/\.mjs$/.test(spec)) tsRemap.push(`${base.slice(0, -4)}.ts`)
      if (/\.cjs$/.test(spec)) tsRemap.push(`${base.slice(0, -4)}.ts`)
      for (const cand of [base, ...tsRemap, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.vue`, `${base}.json`, join(base, 'index.ts'), join(base, 'index.js')]) {
        const relc = relative(input.workspace, cand)
        if (files.includes(relc)) return relc
      }
      return null
    }
    const aliases = executor.aliases ?? {}
    const ignoredSpecifiers = executor.ignoredSpecifiers ?? []
    // applyAlias 返回 {spec, aliased}——aliased 产物是仓根相对路径（fromRoot 解析）
    const applyAlias = (spec: string): { spec: string; aliased: boolean } => {
      for (const [prefix, mapped] of Object.entries(aliases)) {
        if (spec.startsWith(prefix)) return { spec: mapped + spec.slice(prefix.length), aliased: true }
      }
      return { spec, aliased: false }
    }
    const isIgnored = (spec: string): boolean => ignoredSpecifiers.some((p) => spec === p || spec.startsWith(p))
    let importsChecked = 0
    for (const file of target) {
      let content: string
      try {
        content = readFileSync(join(input.workspace, file), 'utf8')
      } catch {
        continue
      }
      let m: RegExpExecArray | null
      // import 语句（含命名成员）；require('spec') 裸式
      const reImp = /^[ \t]*import\s+(?:type\s+)?(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|([\w$]+)|\*\s+as\s+[\w$]+)?\s*(?:from\s+)?['"]([^'"]+)['"]/gm
      while ((m = reImp.exec(content)) !== null) {
        const [, defaultBare, namedList, , spec0] = m
        if (spec0.startsWith('node:')) continue
        if (spec0.startsWith('/')) continue // 绝对路径=仓外引用（接地属目标仓）
        const { spec, aliased } = applyAlias(spec0)
        if (isIgnored(spec)) continue
        if (spec.startsWith('.')) {
          const t = resolveSpecifier(file, spec, aliased)
          if (!t) { unresolved.push(`${file}: '${spec}'`); continue }
          if (t === '__asset__') { importsChecked++; continue }
          const names = exportsOf(t)
          if (!names) continue // 目标不可词法解析（.vue 等）→ 不判成员
          for (const raw of (namedList ?? '').split(',')) {
            let seg = raw.trim()
            if (!seg) continue
            // 内联 type 修饰符（import { type X }）：类型成员不参与运行时导出面
            if (/^type\s+/.test(seg)) seg = seg.replace(/^type\s+/, '')
            const local = seg.split(/\s+as\s+/)[0].trim()
            if (local && local !== 'type' && !names.has(local)) unresolvedMember.push(`${file}: '${spec}' member ${local}`)
          }
          if (defaultBare && !names.has('default')) unresolvedMember.push(`${file}: '${spec}' default`)
          importsChecked++
          continue
        }
        if (NODE_BUILTINS.has(bareOf(spec))) continue
        if (pkgDeps.has(bareOf(spec))) { importsChecked++; continue }
        unresolved.push(`${file}: '${spec}'`)
      }
      // const/let 赋值形态与解构形态与 var 同为"赋值形态"（2026-10-02 审查批：旧式只给
      // var 配了变量名捕获，const x = require(...) 整行不匹配——未声明依赖经此逃过接地）。
      // 行首锚定保留（注释文本中的 require 不抓）。
      const reReq = /^[ \t]*(?:(?:const|let|var)\s+(?:[\w$]+|\{[^}]*\})\s*=\s*)?require\(\s*['"]([^'"]+)['"]\s*\)/gm
      while ((m = reReq.exec(content)) !== null) {
        const spec0 = m[1]
        if (spec0.startsWith('node:') || spec0.startsWith('.')) continue
        const { spec } = applyAlias(spec0)
        if (isIgnored(spec)) continue
        if (NODE_BUILTINS.has(bareOf(spec)) || pkgDeps.has(bareOf(spec))) continue
        unresolved.push(`${file}: '${spec}' (require)`)
      }
    }
    const problems = [...unresolved, ...unresolvedMember]
    if (problems.length > 0) return done('fail', `symbol grounding violations (${problems.length}): ${problems.slice(0, 8).join(' | ')}${problems.length > 8 ? ` …+${problems.length - 8}` : ''}`, problems)
    return done('pass', `all imports grounded across ${target.length} files (${importsChecked} resolvable imports; deps ${pkgDeps.size})`)
  }

  return done('error', `unknown ops mode: ${String(executor.mode)}`)
}
