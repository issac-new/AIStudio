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
  const type = enumOf(raw.type, ['command', 'persistence', 'ontology', 'files', 'llm'] as const)
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
  }
}
