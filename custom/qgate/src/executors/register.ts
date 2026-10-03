// register executor（v0.3 §4.3/§4.4，上游 registries 本地方言）：
// 登记簿从"在档检查"升级为 exercised 级内容核验。
//   debt        —— 技术债：open+high/critical 阻断、dueDate 过期阻断、空登记须显式 none:true
//   assumptions —— 假设全部 confirmed、结构化引用 {file}/{gateId} 真实存在
//   decisions   —— 全部 resolved，或 deferred 且 revisitBy 未逾期（逾期 FAIL）
// 兼容回退：assumptions/decisions 的 JSON 缺席而 md 在档 → 维持 mustContain 级判定
// （在档 ≠ 被验证，诚实语义不变）。登记文件缺失/畸形 → error（INCONCLUSIVE，不是 PASS）。

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { isRecord } from '../core/parse.js'
import { isInside } from '../core/safe-path.js'
import { loadProject } from '../core/loader.js'

export interface RegisterExecutorInput {
  runId: string
  gateId: string
  workspace: string
  commit?: string
}

type RegisterKind = 'debt' | 'assumptions' | 'decisions'

interface KindOutcome {
  kind: RegisterKind
  status: 'pass' | 'fail' | 'error'
  /** exercised=JSON 内容核验；present=md 在档（含标记）。 */
  level: 'exercised' | 'present'
  notes: string[]
}

const MD_MARKERS: Record<'assumptions' | 'decisions', string[]> = {
  assumptions: ['## Assumptions', 'assumption:', 'impact:'],
  decisions: ['## Decisions', 'decision:', 'status:'],
}

function strOf(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function readJson(file: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** 登记容器归一：{none:true} / 裸数组 / {entries:[...]}。裸空数组 = 未声明空（FAIL，上游同规）。 */
function entriesOf(raw: unknown): { entries: Record<string, unknown>[] } | { none: true } | { error: string } {
  if (isRecord(raw) && raw.none === true) return { none: true }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { error: 'empty register must declare {"none": true} explicitly (bare [] is not a statement)' }
    if (raw.every(isRecord)) return { entries: raw }
    return { error: 'register entries must be objects' }
  }
  if (isRecord(raw) && Array.isArray(raw.entries)) {
    if (raw.entries.length === 0) return { error: 'empty register must declare {"none": true} explicitly' }
    if (raw.entries.every(isRecord)) return { entries: raw.entries as Record<string, unknown>[] }
    return { error: 'register entries must be objects' }
  }
  return { error: 'register must be an array, {entries:[...]}, or {"none":true}' }
}

function checkDebt(raw: unknown, today: string): Omit<KindOutcome, 'kind' | 'level'> {
  const norm = entriesOf(raw)
  if ('error' in norm) return { status: 'error', notes: [norm.error] }
  if ('none' in norm) return { status: 'pass', notes: ['debt register declares none'] }
  if (norm.entries.length > 100) return { status: 'error', notes: [`debt register has ${norm.entries.length} entries (>100)`] }
  const blocking: string[] = []
  const malformed: string[] = []
  for (const [i, e] of norm.entries.entries()) {
    const id = strOf(e.id) ?? `entry[${i}]`
    for (const f of ['description', 'owner', 'impact', 'repayment'] as const) {
      if (!strOf(e[f])) { malformed.push(`${id}: missing ${f}`); break }
    }
    const severity = strOf(e.severity)
    const status = strOf(e.status)
    if (!severity || !['low', 'medium', 'high', 'critical'].includes(severity)) { malformed.push(`${id}: bad severity`); continue }
    if (!status || !['open', 'in-progress', 'resolved'].includes(status)) { malformed.push(`${id}: bad status`); continue }
    if (status === 'resolved') continue
    if (severity === 'high' || severity === 'critical') blocking.push(`${id} (${severity})`)
    const due = strOf(e.dueDate)
    if (due && due < today) blocking.push(`${id} (overdue ${due})`)
  }
  if (malformed.length > 0) return { status: 'error', notes: malformed.slice(0, 10) }
  if (blocking.length > 0) return { status: 'fail', notes: [`open high/critical or overdue debt: ${blocking.join(', ')}`] }
  return { status: 'pass', notes: [`${norm.entries.length} debt entries, none blocking`] }
}

function checkAssumptions(raw: unknown, workspace: string, knownGateIds: Set<string>): Omit<KindOutcome, 'kind' | 'level'> {
  const norm = entriesOf(raw)
  if ('error' in norm) return { status: 'error', notes: [norm.error] }
  if ('none' in norm) return { status: 'pass', notes: ['assumptions register declares none'] }
  const unconfirmed: string[] = []
  const badRefs: string[] = []
  for (const [i, e] of norm.entries.entries()) {
    const id = strOf(e.id) ?? `assumption[${i}]`
    if (!strOf(e.assumption)) { badRefs.push(`${id}: missing assumption text`); continue }
    if (e.confirmed !== true) unconfirmed.push(id)
    for (const refKey of ['source', 'evidence'] as const) {
      const ref = e[refKey]
      if (ref === undefined) continue
      if (!isRecord(ref)) { badRefs.push(`${id}.${refKey}: reference must be {file}|{gateId}`); continue }
      const file = strOf(ref.file)
      const gateId = strOf(ref.gateId)
      if (file) {
        const resolved = join(workspace, file)
        if (!isInside(workspace, resolved)) { badRefs.push(`${id}.${refKey}: path escapes workspace`); continue }
        if (!existsSync(resolved)) badRefs.push(`${id}.${refKey}: file not found: ${file}`)
      } else if (gateId) {
        if (!knownGateIds.has(gateId)) badRefs.push(`${id}.${refKey}: unknown gateId: ${gateId}`)
      } else {
        badRefs.push(`${id}.${refKey}: reference must carry file or gateId`)
      }
    }
  }
  if (badRefs.length > 0) return { status: 'error', notes: badRefs.slice(0, 10) }
  if (unconfirmed.length > 0) return { status: 'fail', notes: [`unconfirmed assumptions: ${unconfirmed.join(', ')}`] }
  return { status: 'pass', notes: [`${norm.entries.length} assumptions all confirmed`] }
}

function checkDecisions(raw: unknown, today: string): Omit<KindOutcome, 'kind' | 'level'> {
  const norm = entriesOf(raw)
  if ('error' in norm) return { status: 'error', notes: [norm.error] }
  if ('none' in norm) return { status: 'pass', notes: ['decisions register declares none'] }
  const open: string[] = []
  const malformed: string[] = []
  for (const [i, e] of norm.entries.entries()) {
    const id = strOf(e.id) ?? `decision[${i}]`
    if (!strOf(e.decision)) { malformed.push(`${id}: missing decision text`); continue }
    const status = strOf(e.status)
    if (status === 'resolved') continue
    if (status === 'deferred') {
      const revisit = strOf(e.revisitBy)
      if (!revisit) { malformed.push(`${id}: deferred without revisitBy`); continue }
      if (revisit < today) open.push(`${id} (revisitBy ${revisit} overdue)`)
      continue
    }
    malformed.push(`${id}: status must be resolved|deferred`)
  }
  if (malformed.length > 0) return { status: 'error', notes: malformed.slice(0, 10) }
  if (open.length > 0) return { status: 'fail', notes: [`overdue deferred decisions: ${open.join(', ')}`] }
  return { status: 'pass', notes: [`${norm.entries.length} decisions closed or deferred within window`] }
}

export function runRegisterExecutor(executor: ExecutorSpec, input: RegisterExecutorInput): Evidence {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-register`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'spec-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const kinds = (executor.register ? [executor.register].flat() : []) as RegisterKind[]
  if (kinds.length === 0) {
    ev.summary = 'register executor requires a register kind (debt|assumptions|decisions)'
    ev.provenance.endedAt = Date.now()
    return ev
  }

  const today = new Date().toISOString().slice(0, 10)
  const knownGateIds = new Set((loadProject(input.workspace)?.gates ?? []).map((g) => g.metadata.id))
  const outcomes: KindOutcome[] = []

  for (const kind of kinds) {
    const jsonRel = executor.registerFile && kinds.length === 1
      ? executor.registerFile
      : join('.qgate', 'registers', `${kind}.json`)
    const jsonFile = join(input.workspace, jsonRel)
    if (existsSync(jsonFile)) {
      const res = readJson(jsonFile)
      if ('error' in res) {
        outcomes.push({ kind, status: 'error', level: 'exercised', notes: [`${kind}.json malformed: ${res.error}`] })
        continue
      }
      const checked =
        kind === 'debt' ? checkDebt(res.value, today)
        : kind === 'assumptions' ? checkAssumptions(res.value, input.workspace, knownGateIds)
        : checkDecisions(res.value, today)
      outcomes.push({ kind, level: 'exercised', ...checked })
      continue
    }
    // md 回退（仅 assumptions/decisions）：在档+标记 = present 级语义（在档 ≠ 被验证）
    if (kind === 'assumptions' || kind === 'decisions') {
      const mdRel = join('.qgate', 'registers', `${kind}.md`)
      const mdFile = join(input.workspace, mdRel)
      if (existsSync(mdFile)) {
        // existsSync 对目录也为真——<kind>.md 是目录时 readFileSync 抛 EISDIR 炸穿整轮 run
        let content: string
        try {
          content = readFileSync(mdFile, 'utf8')
        } catch (e) {
          outcomes.push({ kind, status: 'error', level: 'present', notes: [`${kind}.md unreadable (${e instanceof Error ? e.message : String(e)})`] })
          continue
        }
        const missing = MD_MARKERS[kind].filter((m) => !content.includes(m))
        if (missing.length === 0) {
          outcomes.push({ kind, status: 'pass', level: 'present', notes: [`${kind}.md on file with markers (present-level: on file ≠ verified)`] })
        } else {
          outcomes.push({ kind, status: 'fail', level: 'present', notes: [`${kind}.md missing markers: ${missing.join(', ')}`] })
        }
        continue
      }
    }
    outcomes.push({ kind, status: 'error', level: 'exercised', notes: [`register missing: ${jsonRel}${kind !== 'debt' ? ` (or .qgate/registers/${kind}.md)` : ''}`] })
  }

  const failed = outcomes.filter((o) => o.status === 'fail')
  const errored = outcomes.filter((o) => o.status === 'error')
  ev.provenance.endedAt = Date.now()
  ev.execution = outcomes.every((o) => o.level === 'exercised') ? 'exercised' : outcomes.some((o) => o.level === 'exercised') ? 'exercised' : 'present'
  const summary = outcomes.map((o) => `${o.kind}: ${o.notes.join('; ')}`).join(' | ')
  if (errored.length > 0) {
    ev.result = 'error'
    ev.execution = 'wired'
    ev.summary = summary.slice(0, 400)
    return ev
  }
  ev.result = failed.length > 0 ? 'fail' : 'pass'
  ev.summary = summary.slice(0, 400)
  return ev
}
