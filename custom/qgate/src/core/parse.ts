// 容错解析器（house style：非法输入返回 null + 诊断，绝不抛）。
// 与 matrix-teams protocol.ts / delivery-protocol.ts 同一纪律：解析器即校验器（OD-001 裁定）。

import type {
  Claim,
  Criticality,
  EvidenceIndependence,
  EvidenceExecution,
  ExecutorSpec,
  GateSpec,
  PolicyAction,
  Profile,
  QualityDomain,
  Trigger,
} from './types.js'

export type Diagnostic = { path: string; message: string }

const DOMAINS: readonly QualityDomain[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']
const TRIGGERS: readonly Trigger[] = [
  'task_start', 'before_change', 'after_edit', 'task_close', 'pre_commit', 'release',
]
const POLICY_ACTIONS: readonly PolicyAction[] = ['block', 'warn']
const CRITICALITY: readonly Criticality[] = ['high', 'medium', 'low']
const EXECUTIONS: readonly EvidenceExecution[] = ['present', 'wired', 'exercised']
const INDEPENDENCE: readonly EvidenceIndependence[] = [
  'self-generated', 'implementation-derived', 'spec-derived',
  'existing-independent', 'runtime-observed', 'human-reviewed',
]

const MAX_ID = 128
const MAX_STATEMENT = 4000
const MAX_STR_LIST = 50
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function strList(v: unknown, max = MAX_STR_LIST): string[] | undefined {
  if (!Array.isArray(v) || v.length > max) return undefined
  const out: string[] = []
  for (const item of v) {
    if (typeof item !== 'string' || item.length === 0) return undefined
    out.push(item)
  }
  return out
}
function enumOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = str(v)
  return s !== undefined && (allowed as readonly string[]).includes(s) ? (s as T) : undefined
}
function validId(v: unknown): string | undefined {
  const s = str(v)
  return s !== undefined && s.length <= MAX_ID && ID_PATTERN.test(s) ? s : undefined
}

// ── Claim ──

export function parseClaim(raw: unknown): Claim | null {
  if (!isRecord(raw)) return null
  const id = validId(raw.id)
  const statement = str(raw.statement)
  if (!id || !statement || statement.length > MAX_STATEMENT) return null
  const domain = enumOf(raw.domain, DOMAINS)
  const criticality = enumOf(raw.criticality, CRITICALITY)
  if (!domain || !criticality) return null
  const source = strList(raw.source)
  const tags = strList(raw.tags)
  return { id, statement, domain, criticality, source, tags }
}

// ── Gate Spec ──

function parseExecutor(raw: unknown): ExecutorSpec | null {
  if (!isRecord(raw)) return null
  const id = validId(raw.id)
  const type = enumOf(raw.type, ['command', 'persistence', 'ontology', 'files', 'llm', 'scope', 'traceability', 'register', 'contract', 'behavior', 'semantic', 'ops'] as const)
  const evidenceType = validId(raw.evidenceType)
  if (!id || !type || !evidenceType) return null
  const out: ExecutorSpec = { id, type, evidenceType }
  if (type === 'command') {
    const command = strList(raw.command, 64)
    if (!command || command.length === 0) return null
    out.command = command
    const cwd = str(raw.cwd)
    if (cwd !== undefined) out.cwd = cwd
    const expectExit = num(raw.expectExit)
    if (expectExit !== undefined) out.expectExit = expectExit
    const timeoutMs = num(raw.timeoutMs)
    if (timeoutMs !== undefined && timeoutMs > 0) out.timeoutMs = timeoutMs
    if (raw.rawOutput !== undefined) {
      if (!isRecord(raw.rawOutput)) return null
      const format = enumOf(raw.rawOutput.format, ['tap', 'junit'] as const)
      const file = str(raw.rawOutput.file)
      const minTotal = num(raw.rawOutput.minTotal)
      if (!format || !file || file.length === 0) return null
      if (minTotal !== undefined && minTotal <= 0) return null
      out.rawOutput = { format, file, ...(minTotal !== undefined ? { minTotal } : {}) }
    }
  } else if (type === 'persistence') {
    const scenario = str(raw.scenario)
    if (scenario === undefined || scenario.length === 0) return null
    out.scenario = scenario
  } else if (type === 'ontology') {
    const scan = strList(raw.scan, 100)
    if (scan !== undefined && scan.length > 0) out.scan = scan
  } else if (type === 'files') {
    const require = strList(raw.require, 200)
    if (!require || require.length === 0) return null
    out.require = require
    if (raw.mustContain !== undefined) {
      if (!Array.isArray(raw.mustContain) || raw.mustContain.length > 50) return null
      const entries: NonNullable<ExecutorSpec['mustContain']> = []
      for (const m of raw.mustContain) {
        if (!isRecord(m)) return null
        const file = str(m.file)
        const markers = strList(m.markers, 20)
        if (!file || !markers || markers.length === 0) return null
        entries.push({ file, markers })
      }
      out.mustContain = entries
    }
  } else if (type === 'scope') {
    const mode = enumOf(raw.mode, ['scope', 'acceptance'] as const)
    if (!mode) return null
    out.mode = mode
    if (raw.taskIntent !== undefined) {
      if (!isRecord(raw.taskIntent)) return null
      const file = str(raw.taskIntent.file)
      if (!file || file.length === 0) return null
      const acknowledgedSha256 = str(raw.taskIntent.acknowledgedSha256)
      out.taskIntent = {
        file,
        ...(acknowledgedSha256 !== undefined ? { acknowledgedSha256 } : {}),
        ...(raw.taskIntent.require === true ? { require: true } : {}),
      }
    }
  } else if (type === 'traceability') {
    const requirementsFile = str(raw.requirementsFile)
    if (requirementsFile !== undefined) out.requirementsFile = requirementsFile
  } else if (type === 'register') {
    const kinds = strList(raw.register, 3)
    if (!kinds || kinds.length === 0) return null
    const allowed = ['debt', 'assumptions', 'decisions'] as const
    if (!kinds.every((k) => (allowed as readonly string[]).includes(k))) return null
    out.register = kinds as ExecutorSpec['register']
    const registerFile = str(raw.registerFile)
    if (registerFile !== undefined) out.registerFile = registerFile
  } else if (type === 'contract' || type === 'behavior' || type === 'ops') {
    // v0.3 R1/R2/R4：结构性字段（mode）在解析层校验；载荷字段由 executor 运行时 fail-closed
    const modes = type === 'contract'
      ? ['diff', 'breaking', 'surface', 'matrix'] as const
      : type === 'behavior'
        ? ['cases', 'journey', 'property', 'visual', 'invariant'] as const
        : ['metrics', 'budget', 'rerun', 'trace-continuity', 'resilience', 'topology', 'conventions', 'consistency', 'configuration', 'documentation', 'symbols'] as const
    const mode = enumOf(raw.mode, modes)
    if (!mode) return null
    out.mode = mode
    if (type !== 'ops') {
      const expectedFile = str(raw.expectedFile)
      if (expectedFile !== undefined) out.expectedFile = expectedFile
    }
    const observedFile = str(raw.observedFile)
    if (observedFile !== undefined) out.observedFile = observedFile
    const dataFile = str(raw.dataFile)
    if (dataFile !== undefined) out.dataFile = dataFile
    if (type === 'contract') {
      if (raw.ignorePaths !== undefined) {
        const ignorePaths = strList(raw.ignorePaths, 100)
        if (!ignorePaths) return null
        out.ignorePaths = ignorePaths
      }
      const surfaceFile = str(raw.surfaceFile)
      if (surfaceFile !== undefined) out.surfaceFile = surfaceFile
      const consumersDir = str(raw.consumersDir)
      if (consumersDir !== undefined) out.consumersDir = consumersDir
    } else if (type === 'behavior') {
      if (raw.cases !== undefined) {
        if (!Array.isArray(raw.cases) || raw.cases.length === 0 || raw.cases.length > 20) return null
        const cases: NonNullable<ExecutorSpec['cases']> = []
        for (const c of raw.cases) {
          if (!isRecord(c) || typeof c.id !== 'string' || c.id.length === 0) return null
          cases.push({ id: c.id, expected: c.expected })
        }
        out.cases = cases
      }
      if (raw.scenarios !== undefined) {
        if (!Array.isArray(raw.scenarios) || raw.scenarios.length === 0 || raw.scenarios.length > 20) return null
        const scenarios: NonNullable<ExecutorSpec['scenarios']> = []
        for (const s of raw.scenarios) {
          if (!isRecord(s) || typeof s.id !== 'string' || !Array.isArray(s.expectedSteps) || s.expectedSteps.length === 0) return null
          const steps: Array<{ id: string; expected?: unknown }> = []
          for (const t of s.expectedSteps) {
            if (!isRecord(t) || typeof t.id !== 'string' || t.id.length === 0) return null
            steps.push({ id: t.id, expected: t.expected })
          }
          scenarios.push({ id: s.id, expectedSteps: steps })
        }
        out.scenarios = scenarios
      }
      if (raw.f2p !== undefined) { const v = strList(raw.f2p, 20); if (!v) return null; out.f2p = v }
      if (raw.p2p !== undefined) { const v = strList(raw.p2p, 20); if (!v) return null; out.p2p = v }
      const baselineFile = str(raw.baselineFile)
      if (baselineFile !== undefined) out.baselineFile = baselineFile
      if (raw.replayBaseline !== undefined) {
        if (!isRecord(raw.replayBaseline)) return null
        const file = str(raw.replayBaseline.file)
        if (!file || file.length === 0) return null
        const contentSha256 = str(raw.replayBaseline.contentSha256)
        out.replayBaseline = { file, ...(contentSha256 !== undefined ? { contentSha256 } : {}) }
      }
      if (raw.allowedTransitions !== undefined) {
        if (!Array.isArray(raw.allowedTransitions) || raw.allowedTransitions.length > 50) return null
        const pairs: string[][] = []
        for (const t of raw.allowedTransitions) {
          if (!Array.isArray(t) || t.length !== 2 || t.some((x) => typeof x !== 'string')) return null
          pairs.push([t[0], t[1]])
        }
        out.allowedTransitions = pairs
      }
      if (raw.assertions !== undefined) out.assertions = parseAssertions(raw.assertions)
      const seed = num(raw.seed)
      if (seed !== undefined) out.seed = seed
      const minCases = num(raw.minCases)
      if (minCases !== undefined && minCases > 0) out.minCases = minCases
      const maxDiffPixels = num(raw.maxDiffPixels)
      if (maxDiffPixels !== undefined && maxDiffPixels >= 0) out.maxDiffPixels = maxDiffPixels
      const maxDiffRatio = num(raw.maxDiffRatio)
      if (maxDiffRatio !== undefined && maxDiffRatio >= 0 && maxDiffRatio <= 1) out.maxDiffRatio = maxDiffRatio
    } else {
      if (raw.thresholds !== undefined) {
        if (!isRecord(raw.thresholds)) return null
        const thresholds: Record<string, { min?: number; max?: number }> = {}
        for (const [k, v] of Object.entries(raw.thresholds)) {
          if (!isRecord(v)) return null
          const min = num(v.min)
          const max = num(v.max)
          if (min === undefined && max === undefined) return null
          thresholds[k] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
        }
        out.thresholds = thresholds
      }
      if (raw.pairs !== undefined) {
        if (!Array.isArray(raw.pairs) || raw.pairs.length === 0 || raw.pairs.length > 40) return null
        const pairs: string[][] = []
        for (const p of raw.pairs) {
          if (!Array.isArray(p) || p.length !== 2 || p.some((x) => typeof x !== 'string')) return null
          pairs.push([p[0], p[1]])
        }
        out.pairs = pairs
      }
      const maxRecoveryMs = num(raw.maxRecoveryMs)
      if (maxRecoveryMs !== undefined && maxRecoveryMs > 0) out.maxRecoveryMs = maxRecoveryMs
      const maxAgeDays = num(raw.maxAgeDays)
      if (maxAgeDays !== undefined && maxAgeDays > 0) out.maxAgeDays = maxAgeDays
      if (raw.requiredSignals !== undefined) { const v = strList(raw.requiredSignals, 10); if (!v) return null; out.requiredSignals = v }
      if (raw.aliases !== undefined) {
        if (!isRecord(raw.aliases)) return null
        const aliases: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw.aliases)) {
          if (typeof v !== 'string' || k.length === 0 || v.length === 0) return null
          aliases[k] = v
        }
        out.aliases = aliases
      }
      if (raw.ignoredSpecifiers !== undefined) { const v = strList(raw.ignoredSpecifiers, 50); if (!v) return null; out.ignoredSpecifiers = v }
    }
  } else if (type === 'semantic') {
    const check = enumOf(raw.check, ['alignment', 'consistency', 'constraint', 'state', 'exposure', 'instance', 'relation', 'terminology', 'profile'] as const)
    if (!check) return null
    out.check = check
    const catalogFile = str(raw.catalogFile)
    if (catalogFile !== undefined) out.catalogFile = catalogFile
    const shapesFile = str(raw.shapesFile)
    if (shapesFile !== undefined) out.shapesFile = shapesFile
    const dataFile = str(raw.dataFile)
    if (dataFile !== undefined) out.dataFile = dataFile
    const observedFile = str(raw.observedFile)
    if (observedFile !== undefined) out.observedFile = observedFile
    const concept = str(raw.concept)
    if (concept !== undefined) out.concept = concept
    const matchMode = enumOf(raw.matchMode, ['strict', 'subsumed'] as const)
    if (matchMode !== undefined) out.matchMode = matchMode
    if (raw.requireRuntimeOrigin === true) out.requireRuntimeOrigin = true
    if (raw.expectedMap !== undefined) {
      if (!Array.isArray(raw.expectedMap) || raw.expectedMap.length === 0 || raw.expectedMap.length > 100) return null
      const map: Array<{ symbol: string; iri: string }> = []
      for (const m of raw.expectedMap) {
        if (!isRecord(m) || typeof m.symbol !== 'string' || typeof m.iri !== 'string') return null
        map.push({ symbol: m.symbol, iri: m.iri })
      }
      out.expectedMap = map
    }
    if (raw.relations !== undefined) {
      if (!Array.isArray(raw.relations) || raw.relations.length === 0 || raw.relations.length > 100) return null
      const rels: Array<{ subject: string; predicate: string; object: string }> = []
      for (const r of raw.relations) {
        if (!isRecord(r) || typeof r.subject !== 'string' || typeof r.predicate !== 'string' || typeof r.object !== 'string') return null
        rels.push({ subject: r.subject, predicate: r.predicate, object: r.object })
      }
      out.relations = rels
    }
  }
  return out
}

/** 断言数组解析（behavior property / semantic constraint 共用形状）。 */
function parseAssertions(raw: unknown): NonNullable<ExecutorSpec['assertions']> | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return undefined
  const ops = ['eq', 'neq', 'le', 'lt', 'ge', 'gt'] as const
  const out: NonNullable<ExecutorSpec['assertions']> = []
  for (const a of raw) {
    if (!isRecord(a) || typeof a.left !== 'string' || a.left.length === 0) return undefined
    const operator = enumOf(a.operator, ops)
    if (!operator) return undefined
    if (a.right === undefined && !('value' in a)) return undefined
    out.push({
      left: a.left,
      operator,
      ...(typeof a.right === 'string' ? { right: a.right } : {}),
      ...('value' in a ? { value: a.value } : {}),
      ...(typeof a.when === 'string' ? { when: a.when } : {}),
    })
  }
  return out
}

export function parseGateSpec(raw: unknown): GateSpec | null {
  if (!isRecord(raw)) return null
  if (raw.apiVersion !== 'qgate/v1alpha1' || raw.kind !== 'Gate') return null
  if (!isRecord(raw.metadata) || !isRecord(raw.spec)) return null
  const id = validId(raw.metadata.id)
  const version = str(raw.metadata.version)
  if (!id || !version) return null
  const description = str(raw.metadata.description)
  const pack = str(raw.metadata.pack)

  const spec = raw.spec
  const domain = enumOf(spec.domain, DOMAINS)
  const claims = strList(spec.claims)
  const triggersList = Array.isArray(spec.triggers) ? spec.triggers : []
  const triggers: Trigger[] = triggersList
    .map((t) => enumOf(t, TRIGGERS))
    .filter((t): t is Trigger => t !== undefined)
  if (!domain || !claims || claims.length === 0) return null
  if (triggers.length === 0) return null

  if (!Array.isArray(spec.executors) || spec.executors.length === 0) return null
  const executors: ExecutorSpec[] = []
  for (const e of spec.executors) {
    const parsed = parseExecutor(e)
    if (!parsed) return null
    executors.push(parsed)
  }

  if (!isRecord(spec.evidence)) return null
  const required = strList(spec.evidence.required)
  if (!required || required.length === 0) return null

  const meta = spec.meta === true ? true : undefined

  if (!isRecord(spec.policy)) return null
  const failure = enumOf(spec.policy.failure, POLICY_ACTIONS)
  const inconclusive = enumOf(spec.policy.inconclusive, POLICY_ACTIONS)
  if (!failure || !inconclusive) return null
  const allowWaiver = spec.policy.allowWaiver === true ? true : undefined
  const maxAgeHours = num(spec.policy.maxAgeHours)
  if (maxAgeHours !== undefined && maxAgeHours <= 0) return null

  let appliesWhen: GateSpec['spec']['appliesWhen']
  if (spec.appliesWhen !== undefined) {
    if (!isRecord(spec.appliesWhen) || !isRecord(spec.appliesWhen.changed)) return null
    const rawAny = spec.appliesWhen.changed.any
    const rawAll = spec.appliesWhen.changed.all
    const any = rawAny === undefined ? [] : strList(rawAny, 200)
    const all = rawAll === undefined ? [] : strList(rawAll, 200)
    if (any === undefined || all === undefined) return null
    if (any.length === 0 && all.length === 0) return null
    appliesWhen = { changed: { any: any.length ? any : undefined, all: all.length ? all : undefined } }
  }

  return {
    apiVersion: 'qgate/v1alpha1',
    kind: 'Gate',
    metadata: { id, version, description, pack },
    spec: {
      domain, claims, appliesWhen, triggers, executors,
      evidence: { required },
      meta,
      policy: { failure, inconclusive, allowWaiver, maxAgeHours },
    },
  }
}

// ── Profile ──

export function parseProfile(raw: unknown): Profile | null {
  if (!isRecord(raw)) return null
  if (raw.apiVersion !== 'qgate/v1alpha1' || raw.kind !== 'Profile') return null
  if (!isRecord(raw.metadata) || !isRecord(raw.spec)) return null
  const id = validId(raw.metadata.id)
  if (!id) return null
  const tier = enumOf(raw.metadata.tier, ['lite', 'standard', 'compliance'] as const)
  if (raw.metadata.tier !== undefined && tier === undefined) return null
  const description = str(raw.metadata.description)

  const enable = strList(raw.spec.enable, 500)
  const disable = strList(raw.spec.disable, 500)
  if (!enable || !disable) return null

  let overrides: Profile['spec']['overrides']
  if (raw.spec.overrides !== undefined) {
    if (!isRecord(raw.spec.overrides)) return null
    overrides = {}
    for (const [gateId, ov] of Object.entries(raw.spec.overrides)) {
      if (!isRecord(ov)) return null
      const policyRec = isRecord(ov.policy) ? ov.policy : undefined
      const failure = policyRec ? enumOf(policyRec.failure, POLICY_ACTIONS) : undefined
      const inconclusive = policyRec ? enumOf(policyRec.inconclusive, POLICY_ACTIONS) : undefined
      const allowWaiver = policyRec?.allowWaiver === true
      const maxAgeHours = policyRec ? num(policyRec.maxAgeHours) : undefined
      overrides[gateId] = {
        policy: {
          ...(failure ? { failure } : {}),
          ...(inconclusive ? { inconclusive } : {}),
          ...(allowWaiver ? { allowWaiver: true } : {}),
          ...(maxAgeHours !== undefined ? { maxAgeHours } : {}),
        },
      }
    }
  }
  return {
    apiVersion: 'qgate/v1alpha1',
    kind: 'Profile',
    metadata: { id, tier, description },
    spec: { enable, disable, overrides },
  }
}

// ── Evidence 读取（store 里的 JSON 回读） ──

export function parseEvidence(raw: unknown): import('./types.js').Evidence | null {
  if (!isRecord(raw)) return null
  const id = validId(raw.id)
  const runId = str(raw.runId)
  const gateId = validId(raw.gateId)
  const type = validId(raw.type)
  const producer = validId(raw.producer)
  const result = enumOf(raw.result, ['pass', 'fail', 'error', 'conditional', 'skipped'] as const)
  const execution = enumOf(raw.execution, EXECUTIONS)
  if (!id || !runId || !gateId || !type || !producer || !result || !execution) return null
  if (!isRecord(raw.provenance)) return null
  const startedAt = num(raw.provenance.startedAt)
  if (startedAt === undefined) return null
  const independence = enumOf(raw.independence, INDEPENDENCE)
  const summary = str(raw.summary)
  const artifacts = strList(raw.artifacts, 100)
  return {
    id, runId, gateId, type, producer, result, execution, independence, summary,
    provenance: {
      startedAt,
      endedAt: num(raw.provenance.endedAt),
      exitCode: num(raw.provenance.exitCode),
      command: str(raw.provenance.command),
      cwd: str(raw.provenance.cwd),
      commit: str(raw.provenance.commit),
      treeHash: str(raw.provenance.treeHash),
      affectedPaths: strList(raw.provenance.affectedPaths, 500),
    },
    artifacts,
  }
}

export function parseRun(raw: unknown): import('./types.js').GateRun | null {
  if (!isRecord(raw)) return null
  const runId = str(raw.runId)
  const gateId = validId(raw.gateId)
  const gateVersion = str(raw.gateVersion)
  const trigger = enumOf(raw.trigger, TRIGGERS)
  const workspace = str(raw.workspace)
  const startedAt = num(raw.startedAt)
  const verdict = enumOf(raw.verdict, [
    'PASS', 'FAIL', 'CONDITIONAL', 'INCONCLUSIVE', 'WAIVED', 'NOT_APPLICABLE',
  ] as const)
  const evidenceIds = strList(raw.evidenceIds, 200)
  if (!runId || !gateId || !gateVersion || !trigger || !workspace || startedAt === undefined || !verdict || !evidenceIds) {
    return null
  }
  const conditions = strList(raw.conditions, 20)
  if (verdict === 'CONDITIONAL' && (!conditions || conditions.length === 0)) return null
  let inputSnapshot: Record<string, string> | undefined
  if (raw.inputSnapshot !== undefined) {
    if (!isRecord(raw.inputSnapshot)) return null
    const keys = Object.keys(raw.inputSnapshot)
    if (keys.length > 200) return null
    inputSnapshot = {}
    for (const k of keys) {
      const v = str(raw.inputSnapshot[k])
      if (v === undefined) return null
      inputSnapshot[k] = v
    }
  }
  const inputsStable = typeof raw.inputsStable === 'boolean' ? raw.inputsStable : undefined
  return {
    runId, gateId, gateVersion, trigger, workspace, startedAt,
    endedAt: num(raw.endedAt),
    verdict,
    conditions,
    evidenceIds,
    commit: str(raw.commit),
    treeHash: str(raw.treeHash),
    changedPaths: strList(raw.changedPaths, 500),
    failureSummary: str(raw.failureSummary),
    inputSnapshot,
    inputsStable,
  }
}
