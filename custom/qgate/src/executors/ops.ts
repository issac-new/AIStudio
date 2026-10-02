// ops executor（v0.3 R4，上游 L4 运营门族本地方言）。
//   metrics          —— 观察指标文件 × thresholds {name:{min,max}}；缺失/非数值 → error
//   budget           —— 声明文件算术：上游预算 ≥ Σ(timeout×(retries+1))；重试预算 >20% → FAIL
//   rerun            —— 幂等重跑证据文件：同 seed ≥2 次、输出 sha256 一致、策略必填、复式恒等式
//   trace-continuity —— 声明调用对 × 观察 span：missing-link / trace-id-discontinuity /
//                          span-id-mismatch / W3C traceparent 校验
//   resilience       —— 故障演练观察：恢复时长 / 终态 / 信号齐全 / 演练时效（maxAgeDays）
//   topology         —— 声明式拓扑 R1-R4：故障域分散 / 副本阈值按 stateModel / 一阶割集 / leader 租约
// 纪律：文件缺失/畸形/数值非法 → error（INCONCLUSIVE）；违规 → FAIL 点名（上游同款违规码）。

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'

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

  return done('error', `unknown ops mode: ${String(executor.mode)}`)
}
