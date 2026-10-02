// behavior executor（v0.3 R2+R7，上游 behavior/journey/property/visual 本地方言）。
// 观察文件模式：同门先行 command executor 产观察 JSON，内核判定（runner 无权自判）。
//   mode=cases    —— 逐用例 expected vs observed.cases[].actual 深比较；支持 F2P/P2P 双版本基线
//                     （R7，上游 ADR-0008：f2p 基线必败+当前过=真修复；p2p 双版本过=无回归；
//                     六类违规全指名）；replayBaseline 归档基线内容绑定（哈希不符 FAIL）
//   mode=journey  —— 场景逐步骤比对：步骤序漂移（unexpectedSteps）+ 逐步骤 diff
//   mode=property —— 固定 seed 案例集上执行断言（eq/neq/le/lt/ge/gt + when 条件）与
//                     allowedTransitions 状态白名单，反例入证据（counterexamples）
//   mode=visual   —— actualFile vs baselineFile sha256 严格字节比对；声明容差时要求
//                     观察文件回报 diff 度量按阈值判定
// 纪律：观察文件缺失/畸形/用例 id 不齐 → error（INCONCLUSIVE）；差异/违规/反例 → FAIL 点名。

import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { jsonPointerDiff, evaluateAssertion, getPath, type AssertionSpec } from '../core/diff.js'

export interface BehaviorExecutorInput {
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

interface ObservedCase { id: string; actual: unknown }

function parseCases(value: unknown): ObservedCase[] | { error: string } {
  const v = value as Record<string, unknown>
  const list = Array.isArray(v.cases) ? v.cases : undefined
  if (!list) return { error: 'observation lacks cases[]' }
  const out: ObservedCase[] = []
  for (const [i, c] of list.entries()) {
    if (typeof c !== 'object' || c === null) return { error: `cases[${i}] not an object` }
    const rec = c as Record<string, unknown>
    if (typeof rec.id !== 'string' || rec.id.length === 0) return { error: `cases[${i}] lacks id` }
    if (!('actual' in rec)) return { error: `cases[${i}] (${rec.id}) lacks actual` }
    out.push({ id: rec.id, actual: rec.actual })
  }
  return out
}

function summarizeDiffs(diffs: ReturnType<typeof jsonPointerDiff>): string {
  return diffs.slice(0, 4).map((d) => `${d.pointer || '/'} ${d.kind}`).join(' | ') || '(empty)'
}

export function runBehaviorExecutor(executor: ExecutorSpec, input: BehaviorExecutorInput): Evidence {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-behavior`,
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

  if (executor.mode === 'cases') {
    const obsFile = rel(executor.observedFile)
    if (!obsFile) return done('error', 'behavior cases requires observedFile')
    if (!existsSync(obsFile)) return done('error', `observation missing: ${executor.observedFile} — declare a producing command executor in the same gate`)
    const obs = readJson(obsFile)
    if ('error' in obs) return done('error', `observation malformed: ${obs.error}`)
    const cases = parseCases(obs.value)
    if ('error' in cases) return done('error', `observation invalid: ${cases.error}`)
    const byId = new Map(cases.map((c) => [c.id, c]))

    // replay-baseline（R8，上游 replayBaseline 本地方言）：归档观察记录作期望基线。
    // 内容哈希绑定（不符 → FAIL，须显式重 pin）；当次观察 vs 基线逐用例比对。
    const rb = executor.replayBaseline
    if (rb) {
      const bl = rel(rb.file)
      if (!bl || !existsSync(bl)) return done('error', `replay baseline missing: ${rb.file}`)
      // existsSync 对目录也返回 true：readFileSync 指向目录抛 EISDIR，降级 error 证据而非炸整 run
      let blBuf: Buffer
      try {
        blBuf = readFileSync(bl)
      } catch (e) {
        return done('error', `replay baseline unreadable: ${rb.file} (${(e as Error).message})`)
      }
      const actual = createHash('sha256').update(blBuf).digest('hex')
      if (rb.contentSha256 && actual !== rb.contentSha256) {
        return done('fail', `replay-baseline-modified: ${rb.file} sha256 drifted from declared pin — re-pin explicitly`)
      }
      const b = readJson(bl)
      if ('error' in b) return done('error', `replay baseline malformed: ${b.error}`)
      const baselineCases = parseCases(b.value)
      if ('error' in baselineCases) return done('error', `replay baseline invalid: ${baselineCases.error}`)
      const problems: string[] = []
      for (const bc of baselineCases) {
        const cur = byId.get(bc.id)
        if (!cur) { problems.push(`${bc.id}: missing in current observation`); continue }
        const diffs = jsonPointerDiff(bc.actual, cur.actual)
        if (diffs.length > 0) problems.push(`${bc.id}: replay-drift ${summarizeDiffs(diffs)}`)
      }
      const extra = cases.filter((c) => !baselineCases.some((b2) => b2.id === c.id)).map((c) => c.id)
      if (extra.length > 0) problems.push(`extra cases vs baseline: ${extra.join(', ')}`)
      if (problems.length > 0) return done('fail', `replay drift (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
      return done('pass', `replay matches baseline: ${baselineCases.length} cases identical to ${rb.file}`)
    }

    // F2P/P2P 双版本基线审计（R7）：六类违规全指名，防伪修复/掩盖回归。
    const f2p = executor.f2p ?? []
    const p2p = executor.p2p ?? []
    if (f2p.length > 0 || p2p.length > 0) {
      const bl = rel(executor.baselineFile)
      if (!bl) return done('error', 'f2p/p2p requires baselineFile')
      if (!existsSync(bl)) return done('error', `baseline observation missing: ${executor.baselineFile}`)
      const b = readJson(bl)
      if ('error' in b) return done('error', `baseline malformed: ${b.error}`)
      const baselineCases = parseCases(b.value)
      if ('error' in baselineCases) return done('error', `baseline invalid: ${baselineCases.error}`)
      const baselineById = new Map(baselineCases.map((c) => [c.id, c]))
      const expectedById = new Map((executor.cases ?? []).map((c) => [c.id, c.expected]))
      const violations: string[] = []
      for (const id of f2p) {
        const exp = expectedById.get(id)
        const cur = byId.get(id)
        const base = baselineById.get(id)
        if (!cur) { violations.push(`f2p-missing-current: ${id}`); continue }
        if (!base) { violations.push(`f2p-missing-baseline: ${id}`); continue }
        const curOk = exp !== undefined && jsonPointerDiff(exp, cur.actual).length === 0
        const baseOk = exp !== undefined && jsonPointerDiff(exp, base.actual).length === 0
        if (baseOk) violations.push(`f2p-passing-on-baseline: ${id} (not a real fix target)`)
        if (!curOk) violations.push(`f2p-failing-current: ${id} (${summarizeDiffs(jsonPointerDiff(exp, cur.actual))})`)
      }
      for (const id of p2p) {
        const exp = expectedById.get(id)
        const cur = byId.get(id)
        const base = baselineById.get(id)
        if (!cur) { violations.push(`p2p-missing-current: ${id}`); continue }
        if (!base) { violations.push(`p2p-missing-baseline: ${id}`); continue }
        if (exp !== undefined && jsonPointerDiff(exp, base.actual).length > 0) violations.push(`p2p-baseline-failed: ${id} (regression was already there)`)
        if (exp !== undefined && jsonPointerDiff(exp, cur.actual).length > 0) violations.push(`p2p-current-failed: ${id} (${summarizeDiffs(jsonPointerDiff(exp, cur.actual))})`)
      }
      if (violations.length > 0) return done('fail', `f2p/p2p violations (${violations.length}): ${violations.slice(0, 6).join(' | ')}`, violations)
      return done('pass', `f2p/p2p clean: ${f2p.length} f2p + ${p2p.length} p2p honored (baseline ${executor.baselineFile})`, [...f2p, ...p2p])
    }

    // 常规用例比对
    const declared = executor.cases ?? []
    if (declared.length === 0) return done('error', 'behavior cases requires cases[] (or f2p/p2p + baselineFile)')
    const problems: string[] = []
    for (const c of declared) {
      const actual = byId.get(c.id)
      if (!actual) { problems.push(`${c.id}: missing observation`); continue }
      if (c.expected === undefined) continue
      const diffs = jsonPointerDiff(c.expected, actual.actual)
      if (diffs.length > 0) problems.push(`${c.id}: ${summarizeDiffs(diffs)}`)
    }
    const unexpectedObs = cases.filter((c) => !declared.some((d) => d.id === c.id)).map((c) => c.id)
    if (unexpectedObs.length > 0) problems.push(`unexpected observed cases: ${unexpectedObs.join(', ')}`)
    if (problems.length > 0) return done('fail', `case drift (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${declared.length} cases match expected`, declared.map((c) => c.id))
  }

  if (executor.mode === 'journey') {
    const obsFile = rel(executor.observedFile)
    if (!obsFile) return done('error', 'journey requires observedFile')
    if (!existsSync(obsFile)) return done('error', `observation missing: ${executor.observedFile}`)
    const obs = readJson(obsFile)
    if ('error' in obs) return done('error', `observation malformed: ${obs.error}`)
    const v = obs.value as Record<string, unknown>
    const scenariosList = Array.isArray(v.scenarios) ? v.scenarios.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null) : undefined
    if (!scenariosList) return done('error', 'observation lacks scenarios[]')
    const declared = executor.scenarios ?? []
    if (declared.length === 0) return done('error', 'journey requires scenarios[]')
    const obsById = new Map<string, Array<{ id: string; actual: unknown }>>()
    for (const s of scenariosList) {
      if (typeof s.id !== 'string') return done('error', 'observed scenario lacks id')
      const steps = Array.isArray(s.steps) ? s.steps.filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null) : []
      obsById.set(s.id, steps.map((t) => ({ id: String(t.id), actual: t.actual })))
    }
    const problems: string[] = []
    for (const sc of declared) {
      const observed = obsById.get(sc.id)
      if (!observed) { problems.push(`${sc.id}: scenario not observed`); continue }
      const expectedIds = sc.expectedSteps.map((s) => s.id)
      const observedIds = observed.map((s) => s.id)
      if (expectedIds.join('\u0000') !== observedIds.join('\u0000')) {
        problems.push(`${sc.id}: step sequence drift (expected [${expectedIds.join(',')}], got [${observedIds.join(',')}])`)
      }
      for (const step of sc.expectedSteps) {
        const o = observed.find((x) => x.id === step.id)
        if (!o) continue // 序漂移已点名
        if (step.expected === undefined) continue
        const diffs = jsonPointerDiff(step.expected, o.actual)
        if (diffs.length > 0) problems.push(`${sc.id}/${step.id}: ${summarizeDiffs(diffs)}`)
      }
    }
    const unexpectedSc = [...obsById.keys()].filter((id) => !declared.some((d) => d.id === id))
    if (unexpectedSc.length > 0) problems.push(`unexpected observed scenarios: ${unexpectedSc.join(', ')}`)
    if (problems.length > 0) return done('fail', `journey drift (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${declared.length} scenarios × steps match expected`, declared.map((s) => s.id))
  }

  if (executor.mode === 'property') {
    const obsFile = rel(executor.observedFile)
    if (!obsFile) return done('error', 'property requires observedFile')
    if (!existsSync(obsFile)) return done('error', `observation missing: ${executor.observedFile}`)
    const obs = readJson(obsFile)
    if ('error' in obs) return done('error', `observation malformed: ${obs.error}`)
    const v = obs.value as Record<string, unknown>
    const rawCases = Array.isArray(v.cases) ? v.cases : undefined
    if (!rawCases) return done('error', 'observation lacks cases[]' )
    const minCases = executor.minCases ?? 1
    if (rawCases.length < minCases) return done('error', `property produced ${rawCases.length} cases < minCases ${minCases} (weak evidence rejected)`)
    const assertions = (executor.assertions ?? []) as AssertionSpec[]
    if (assertions.length === 0) return done('error', 'property requires assertions[]')
    const transitions = (executor.allowedTransitions ?? []).map((t) => `${t[0]}→${t[1]}`)
    const counterexamples: string[] = []
    for (const [i, raw] of rawCases.entries()) {
      const caseData = raw
      for (const a of assertions) {
        const verdict = evaluateAssertion(a, caseData)
        if (verdict === false) counterexamples.push(`case[${i}] ${a.left} ${a.operator} ${a.right ?? JSON.stringify(a.value)}`)
      }
      const from = (caseData as Record<string, unknown>).from
      const to = (caseData as Record<string, unknown>).to
      if (typeof from === 'string' && typeof to === 'string' && transitions.length > 0) {
        if (!transitions.includes(`${from}→${to}`)) counterexamples.push(`case[${i}] illegal transition ${from}→${to}`)
      }
    }
    if (counterexamples.length > 0) {
      return done('fail', `property violated by ${counterexamples.length} counterexample(s): ${counterexamples.slice(0, 5).join(' | ')}${counterexamples.length > 5 ? ` …+${counterexamples.length - 5}` : ''}`, counterexamples)
    }
    return done('pass', `property holds: ${rawCases.length} cases (seed ${executor.seed ?? 'n/a'}) × ${assertions.length} assertions${transitions.length ? ` + ${transitions.length} transitions` : ''}`)
  }

  if (executor.mode === 'visual') {
    const actual = rel(executor.observedFile)
    const baseline = rel(executor.expectedFile ?? executor.baselineFile)
    if (!actual || !baseline) return done('error', 'visual requires observedFile (actual) and expectedFile (baseline)')
    if (!existsSync(actual)) return done('error', `actual artifact missing: ${executor.observedFile}`)
    if (!existsSync(baseline)) return done('error', `baseline missing: ${executor.expectedFile ?? executor.baselineFile}`)
    // 同上：目录/不可读降级 error 证据而非抛 EISDIR 炸整 run
    let aStat: Buffer
    let bStat: Buffer
    try {
      aStat = readFileSync(actual)
      bStat = readFileSync(baseline)
    } catch (e) {
      return done('error', `visual artifacts unreadable (${(e as Error).message})`)
    }
    if (aStat.length === 0 || bStat.length === 0) return done('error', 'visual artifacts must be non-empty')
    const aSha = createHash('sha256').update(aStat).digest('hex')
    const bSha = createHash('sha256').update(bStat).digest('hex')
    if (aSha === bSha) return done('pass', `visual exact match (sha256 ${aSha.slice(0, 12)}…, ${aStat.length}B)`)
    // 字节不一致：有容差声明才可比像素，容差度量须由观察文件回报（度量本身也是被核验的声明）
    if (executor.maxDiffPixels !== undefined || executor.maxDiffRatio !== undefined) {
      const metricsFile = rel(executor.dataFile)
      if (!metricsFile || !existsSync(metricsFile)) return done('error', 'tolerance declared but pixel metrics file missing (dataFile)')
      const m = readJson(metricsFile)
      if ('error' in m) return done('error', `pixel metrics malformed: ${m.error}`)
      const mv = m.value as Record<string, unknown>
      const diff = mv.diff as Record<string, unknown> | undefined
      const pixels = diff && typeof diff.pixels === 'number' ? diff.pixels : undefined
      const totalPixels = diff && typeof diff.totalPixels === 'number' ? diff.totalPixels : undefined
      if (pixels === undefined || totalPixels === undefined || totalPixels <= 0) return done('error', 'pixel metrics must carry diff:{pixels,totalPixels>0}')
      if (executor.maxDiffPixels !== undefined && pixels > executor.maxDiffPixels) {
        return done('fail', `visual diff ${pixels}px > maxDiffPixels ${executor.maxDiffPixels}`)
      }
      if (executor.maxDiffRatio !== undefined && pixels / totalPixels > executor.maxDiffRatio) {
        return done('fail', `visual diff ratio ${(pixels / totalPixels).toFixed(4)} > maxDiffRatio ${executor.maxDiffRatio}`)
      }
      return done('pass', `visual within tolerance: ${pixels}/${totalPixels}px (sha differs, pixel-diff mode)`)
    }
    return done('fail', `visual byte mismatch: actual ${aSha.slice(0, 12)}… vs baseline ${bSha.slice(0, 12)}… (no tolerance declared → exact-bytes mode)`)
  }

  if (executor.mode === 'invariant') {
    const obsFile = rel(executor.observedFile)
    if (!obsFile) return done('error', 'invariant requires observedFile')
    if (!existsSync(obsFile)) return done('error', `observation missing: ${executor.observedFile}`)
    const obs = readJson(obsFile)
    if ('error' in obs) return done('error', `observation malformed: ${obs.error}`)
    const v = obs.value as Record<string, unknown>
    if (typeof v.values !== 'object' || v.values === null || Array.isArray(v.values)) return done('error', 'observation lacks values{}')
    const values = v.values
    const assertions = (executor.assertions ?? []) as AssertionSpec[]
    if (assertions.length === 0) return done('error', 'invariant requires assertions[]')
    const violations: string[] = []
    let evaluated = 0
    for (const a of assertions) {
      // 断言语义复用 diff.ts（含 when 条件 skip——上游 invariant 语义：条件不满足该断言跳过）
      const verdict = evaluateAssertion(a, values)
      if (verdict === 'skip') continue
      evaluated++
      if (!verdict) violations.push(`${a.left} ${a.operator} ${a.right ?? JSON.stringify(a.value)} (got ${JSON.stringify(getPath(values, a.left))})`)
    }
    if (evaluated === 0) {
      // 全部断言因 when 条件不满足而跳过（上游：门 SKIP）——本地方言：skipped 证据 → 决策层 INCONCLUSIVE
      ev.result = 'skipped'
      ev.execution = 'exercised'
      ev.summary = 'all assertions skipped (when-conditions unmet) — no invariant evaluated'
      ev.provenance.endedAt = Date.now()
      return ev
    }
    if (violations.length > 0) return done('fail', `invariant violations (${violations.length}): ${violations.join(' | ')}`, violations)
    return done('pass', `${evaluated}/${assertions.length} assertions hold over observed values`)
  }

  return done('error', `unknown behavior mode: ${String(executor.mode)}`)
}
