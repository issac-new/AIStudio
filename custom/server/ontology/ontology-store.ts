/**
 * 本体存储（GB/T 48000.3 方法论产品化）。
 *
 * 文件 JSON 持久化（board-graph/kg-version 同款先例）：
 *   env ONTOLOGY_DIR > ~/.hermes/semantica/ontology/
 *     ontology.json   —— spec 正本（PUT /spec 经校验门禁后落盘）
 *     instances.json  —— 实例正本（写入即校验：error 拒写由 controller 承担）
 *     snapshots/      —— spec 版本快照（kg-<ts>.json + .meta.json 边车，
 *                        tmp+rename 原子写、保留上限 50、回滚前另存 pre-rollback）
 *
 * 版本管理（国标 4.3 owl:versionIRI/priorVersion）：每次保存 version+1、
 * priorVersion 记上一版、versionIri 重算——语义变更从"口头通知"变成
 * "可查询的事件"（快照列表即版本史）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { hasErrors, validateInstances, validateSpec } from './ontology-validate'
import { seedInstances, seedSpec } from './ontology-seed'
import { versionIriOf, type OntologyInstance, type OntologySpec, type Violation } from './ontology-types'

export const SNAP_MAX = 50

function ontologyDir(): string {
  const env = process.env.ONTOLOGY_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes', 'semantica', 'ontology')
}

function specPath(): string { return join(ontologyDir(), 'ontology.json') }
function instancesPath(): string { return join(ontologyDir(), 'instances.json') }
function snapDir(): string { return join(ontologyDir(), 'snapshots') }

function snapMax(): number {
  const raw = Number(process.env.ONTOLOGY_SNAPSHOT_MAX)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : SNAP_MAX
}

function writeAtomic(file: string, text: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

// ---- spec ----

/** 读 spec；冷启动（文件缺席）落种子 v1——首次访问即有可校验的领域骨架。
 *  文件存在但损坏：只读返回内存种子并留痕，不覆盖（坏文件可人工排查）。 */
export function loadSpec(): OntologySpec {
  const file = specPath()
  if (existsSync(file)) {
    const hit = readJson<OntologySpec>(file)
    if (hit && Array.isArray(hit.entityTypes)) return hit
    console.warn(`[ontology] ontology.json 存在但不可解析/缺 entityTypes——返回内存种子（不覆盖原文件）`)
    return seedSpec()
  }
  const seed = seedSpec()
  try {
    writeAtomic(file, JSON.stringify(seed, null, 2))
  } catch (err) {
    console.warn(`[ontology] 种子落盘失败（只读返回内存态）：${err instanceof Error ? err.message : String(err)}`)
  }
  return seed
}

export interface SaveSpecResult {
  ok: boolean
  spec?: OntologySpec
  violations: Violation[]
  /** 写入前快照文件（版本史锚点）。 */
  snapshot?: string | null
}

/** 保存 spec：模式层自检 error=0 才落盘（写入前门禁）；版本+1 + 快照。 */
export function saveSpec(next: OntologySpec, actor?: string, now = Date.now()): SaveSpecResult {
  const violations = validateSpec(next)
  if (hasErrors(violations)) return { ok: false, violations }
  const prev = readJson<OntologySpec>(specPath())
  const version = (prev?.version ?? 0) + 1
  const saved: OntologySpec = {
    ...next,
    version,
    priorVersion: prev?.version,
    versionIri: versionIriOf(next.namespace, version),
    updatedAt: now,
  }
  const snapshot = prev ? snapshotSpec(prev, now, 'pre-save') : null
  writeAtomic(specPath(), JSON.stringify(saved, null, 2))
  if (actor) console.log(`[ontology] spec v${version} 保存（actor=${actor}，快照=${snapshot ?? '首版无'}）`)
  return { ok: true, spec: saved, violations, snapshot }
}

// ---- instances ----

/** 读实例；冷启动（文件缺席）落种子实例——与 spec 同语义，开箱即可校验走通。
 *  用户清空实例=写空数组文件，文件在即不再重播种（删除语义不被重启推翻）。 */
export function loadInstances(): OntologyInstance[] {
  const file = instancesPath()
  if (existsSync(file)) {
    const hit = readJson<OntologyInstance[]>(file)
    return Array.isArray(hit) ? hit : []
  }
  const seed = seedInstances()
  try {
    writeAtomic(file, JSON.stringify(seed, null, 2))
  } catch (err) {
    console.warn(`[ontology] 种子实例落盘失败（只读返回内存态）：${err instanceof Error ? err.message : String(err)}`)
  }
  return seed
}

export interface UpsertInstanceResult {
  ok: boolean
  instances?: OntologyInstance[]
  violations: Violation[]
  saved?: OntologyInstance
}

/** 新增/替换实例（写入即校验：error 级违规拒写——数据契约=事前准入；
 *  warning/info 放行并随响应返回）。replaceId 存在则为替换语义。 */
export function upsertInstance(inst: OntologyInstance, replaceId?: string, now = Date.now()): UpsertInstanceResult {
  const spec = loadSpec()
  const prev = loadInstances().filter((x) => (replaceId === undefined ? true : x.id !== replaceId))
  if (replaceId === undefined && prev.some((x) => x.id === inst.id)) {
    return { ok: false, violations: [{ severity: 'error', code: 'inst:dup-id', subject: inst.id, detail: `实例 id 已存在：${inst.id}（替换请走 PUT）` }] }
  }
  const candidate: OntologyInstance = { ...inst, updatedAt: now }
  const violations = validateInstances(spec, [...prev, candidate])
  if (violations.some((x) => x.severity === 'error' && (x.subject === inst.id || x.code === 'inst:dup-id'))) {
    return { ok: false, violations }
  }
  const next = [...prev, candidate]
  writeAtomic(instancesPath(), JSON.stringify(next, null, 2))
  return { ok: true, instances: next, violations, saved: candidate }
}

export function deleteInstance(id: string): boolean {
  const prev = loadInstances()
  const next = prev.filter((x) => x.id !== id)
  if (next.length === prev.length) return false
  // 删除后悬空关系（他实例指向被删者）如实放行——下一轮跑批会以 rel:dangling 呈现
  writeAtomic(instancesPath(), JSON.stringify(next, null, 2))
  return true
}

// ---- 版本快照（kg-version 同款：tmp+rename / meta 边车 / prune / 回滚另存） ----

export type SnapshotLabel = 'pre-save' | 'manual' | 'rollback-restore' | 'pre-reset'

export function snapshotSpec(spec: OntologySpec, now = Date.now(), label: SnapshotLabel = 'manual'): string | null {
  try {
    mkdirSync(snapDir(), { recursive: true })
    const out = join(snapDir(), `spec-${now}.json`)
    writeAtomic(out, JSON.stringify(spec, null, 2))
    try {
      writeFileSync(join(snapDir(), `spec-${now}.meta.json`), JSON.stringify({ ts: now, label, version: spec.version }))
    } catch (err) {
      console.warn(`[ontology] 快照边车写入失败（label=${label}）：${err instanceof Error ? err.message : String(err)}`)
    }
    pruneSnapshots()
    return out
  } catch {
    return null
  }
}

export interface SpecSnapshotMeta { ts: number; file: string; bytes: number; label: string; version: number; typeCount: number }

export function listSpecSnapshots(): SpecSnapshotMeta[] {
  if (!existsSync(snapDir())) return []
  try {
    return readdirSync(snapDir())
      .filter((f) => /^spec-\d+\.json$/.test(f))
      .map((f) => {
        const file = join(snapDir(), f)
        let bytes = 0
        let version = 0
        let typeCount = 0
        try {
          bytes = statSync(file).size
          const j = JSON.parse(readFileSync(file, 'utf8')) as OntologySpec
          version = j.version ?? 0
          typeCount = Array.isArray(j.entityTypes) ? j.entityTypes.length : 0
        } catch { /* 坏文件如实记 0 */ }
        let label = 'manual'
        try {
          const meta = JSON.parse(readFileSync(join(snapDir(), f.replace(/\.json$/, '.meta.json')), 'utf8')) as { label?: string }
          if (typeof meta.label === 'string' && meta.label) label = meta.label
        } catch { /* 旧档缺边车 */ }
        return { ts: Number(f.slice(6, -5)), file, bytes, label, version, typeCount }
      })
      .sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

function pruneSnapshots(): void {
  const max = snapMax()
  try {
    const files = readdirSync(snapDir())
      .filter((f) => /^spec-(\d+)\.json$/.test(f))
      .map((f) => ({ f, ts: Number(f.replace(/^spec-(\d+)\.json$/, '$1')) }))
      .sort((a, b) => b.ts - a.ts)
    for (const { f } of files.slice(max)) {
      try { rmSync(join(snapDir(), f)) } catch { /* 下轮再试 */ }
      try { rmSync(join(snapDir(), f.replace(/\.json$/, '.meta.json'))) } catch { /* 同上 */ }
    }
  } catch { /* 放弃本轮 */ }
}

export interface RollbackResult { ok: boolean; error?: string; preRollback?: string; restoredVersion?: number }

/** 回滚到快照：当前 spec 先另存 pre-rollback（可再回滚），再覆盖正本（version 保留快照原值）。 */
export function rollbackSpec(ts: number, now = Date.now()): RollbackResult {
  const hit = listSpecSnapshots().find((s) => s.ts === ts)
  if (!hit) return { ok: false, error: `快照不存在：spec-${ts}.json` }
  const current = readJson<OntologySpec>(specPath())
  if (!current) return { ok: false, error: '当前 spec 缺席（无可回滚前态）' }
  const snap = readJson<OntologySpec>(hit.file)
  if (!snap) return { ok: false, error: '快照文件损坏（JSON 不可解析）' }
  try {
    mkdirSync(snapDir(), { recursive: true })
    const pre = join(snapDir(), `pre-rollback-${now}.json`)
    const preTmp = `${pre}.tmp-${process.pid}`
    copyFileSync(specPath(), preTmp)
    renameSync(preTmp, pre)
    try { writeFileSync(join(snapDir(), `pre-rollback-${now}.meta.json`), JSON.stringify({ ts: now, label: 'rollback-restore', version: current.version })) } catch { /* 缺省可接受 */ }
    writeAtomic(specPath(), JSON.stringify(snap, null, 2))
    return { ok: true, preRollback: pre, restoredVersion: snap.version }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 重置为种子本体（开发/演示用；当前态先快照，可回滚回来）。 */
export function resetToSeed(now = Date.now()): { ok: boolean; snapshot?: string | null; spec: OntologySpec; instances: OntologyInstance[] } {
  const current = readJson<OntologySpec>(specPath())
  const snapshot = current ? snapshotSpec(current, now, 'pre-reset') : null
  const seed = seedSpec(now)
  writeAtomic(specPath(), JSON.stringify(seed, null, 2))
  const insts = seedInstances(now)
  writeAtomic(instancesPath(), JSON.stringify(insts, null, 2))
  return { ok: true, snapshot, spec: seed, instances: insts }
}
