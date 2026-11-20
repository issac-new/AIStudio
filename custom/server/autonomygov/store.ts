/**
 * 自治刻度存储（A 组）——JSON 单文件 + 原子写 + 坏档隔离。
 *
 * 与 autonomyladder 同款约定：env 显式 > ~/.hermes-web-ui/；读侧 fail-soft
 * （坏档隔离留档后从空起步）；写侧校验由 rules.validateEntryInput 把守。
 */
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { atomicWriteJson, appendJsonl, readJsonl } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type { AutonomyLevel, AutonomyScaleEntry, Dod } from './types'

function storeDir(): string {
  const env = process.env.HERMES_AUTONOMY_GOV_DIR?.trim()
  if (env) return resolve(env)
  return underWebUi('autonomy-gov')
}

function storePath(): string {
  return join(storeDir(), 'scale.json')
}

function gapLogPath(): string {
  return join(storeDir(), 'dual-sign-gaps.jsonl')
}

interface StoreShape {
  entries: AutonomyScaleEntry[]
}

/** 单条粗校验：坏行不入内存（字段类型不对即丢，不让半条配置污染判定）。 */
function isUsableEntry(e: unknown): e is AutonomyScaleEntry {
  if (!e || typeof e !== 'object') return false
  const v = e as Partial<AutonomyScaleEntry>
  return typeof v.target === 'string'
    && typeof v.al === 'number' && v.al >= 0 && v.al <= 5
    && !!v.dod && typeof v.dod === 'object'
    && typeof v.auditSampling === 'number'
    && typeof v.humanScan === 'boolean'
}

function load(): StoreShape {
  const file = storePath()
  if (!existsSync(file)) return { entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoreShape>
    if (parsed && Array.isArray(parsed.entries)) {
      return { entries: parsed.entries.filter(isUsableEntry) }
    }
  } catch { /* 坏档：隔离留档再从空起步（对齐 review-store 先例） */ }
  try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 隔离失败不阻断 */ }
  return { entries: [] }
}

function save(s: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(storePath(), s)
}

export function listScale(): AutonomyScaleEntry[] {
  return load().entries.slice().sort((a, b) => a.target.localeCompare(b.target))
}

export function getScale(target: string): AutonomyScaleEntry | null {
  return load().entries.find((e) => e.target === target) ?? null
}

/** upsert（幂等按 target）。写入前由调用方跑 validateEntryInput。 */
export function upsertScale(input: {
  target: string
  al: AutonomyLevel
  dod: Dod
  auditSampling: number
  humanScan: boolean
  note?: string
  updatedBy?: string
}): AutonomyScaleEntry {
  const s = load()
  const entry: AutonomyScaleEntry = {
    target: input.target,
    al: input.al,
    dod: {
      criteria: input.dod.criteria.map((c) => c.trim()).filter(Boolean),
      sample: input.dod.sample.trim(),
      stopCondition: input.dod.stopCondition.trim(),
    },
    auditSampling: input.auditSampling,
    humanScan: input.humanScan,
    reviewedAt: Date.now(),
    ...(input.note ? { note: input.note } : {}),
    ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
  }
  const idx = s.entries.findIndex((e) => e.target === input.target)
  if (idx >= 0) s.entries[idx] = entry
  else s.entries.push(entry)
  save(s)
  return entry
}

export function removeScale(target: string): boolean {
  const s = load()
  const idx = s.entries.findIndex((e) => e.target === target)
  if (idx < 0) return false
  s.entries.splice(idx, 1)
  save(s)
  return true
}

// ── 双签缺口（附录式记录，不参与判定；供页签与审计面消费）──

export interface DualSignGap {
  at: number
  changeId: string
  klass: string
  signers: string[]
  reason: string
  /** 触发面：approval-log 后置校验 / 手动登记 */
  source: string
}

export function recordDualSignGap(gap: DualSignGap): void {
  mkdirSync(storeDir(), { recursive: true })
  appendJsonl(gapLogPath(), gap)
}

export function listDualSignGaps(limit = 200): DualSignGap[] {
  const read = readJsonl<DualSignGap>(gapLogPath())
  const rows = read.rows.filter((g) => g && typeof g.changeId === 'string')
  return rows.slice(-limit).reverse()
}

// ── 双签签署台账（2026-11-05 收口：从「只记缺口」到「记签署人」）──

function signPath(): string {
  return join(storeDir(), 'dual-sign-signatures.json')
}

export interface SignatureLedger {
  [targetId: string]: { signers: string[]; updatedAt: number }
}

function loadSignatures(): SignatureLedger {
  if (!existsSync(signPath())) return {}
  try {
    const parsed = JSON.parse(readFileSync(signPath(), 'utf8')) as SignatureLedger
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* 坏档：隔离留档再从空起步 */ }
  try { renameSync(signPath(), `${signPath()}.corrupt-${Date.now()}`) } catch { /* 不阻断 */ }
  return {}
}

/** 读某目标已签人（读侧 fail-soft：坏档按空处理，闸会要求重签而不是误放行）。 */
export function listDualSignSigners(targetId: string): string[] {
  const row = loadSignatures()[targetId]
  return Array.isArray(row?.signers) ? row!.signers.filter((x) => typeof x === 'string' && x.trim()) : []
}

/** 追加签署人（幂等：同一人重复签不增加）。 */
export function recordDualSignSigner(targetId: string, actor: string): string[] {
  const s = loadSignatures()
  const prev = Array.isArray(s[targetId]?.signers) ? s[targetId]!.signers : []
  const next = prev.slice()
  const name = actor.trim()
  if (name && !next.includes(name)) next.push(name)
  s[targetId] = { signers: next, updatedAt: Date.now() }
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(signPath(), s)
  return next
}

/** 清空某目标签署（测试与重开审批用）。 */
export function clearDualSignSigners(targetId: string): void {
  const s = loadSignatures()
  if (!(targetId in s)) return
  delete s[targetId]
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(signPath(), s)
}

// ── 批一 Task 12：outcome 双签台账（角色感知；与通用 signers 台账分册，不混编）──
// 通用 dual-sign-signatures.json 只记 actor 集合（fleet/enf 风险档闸消费）；outcome
// high+one-way 双签要求「owner 与 verifier 两笔不同 actor」，须记角色才能判齐——
// 独立分册防两种判定互相污染形状。

/** outcome 双签签署记录（targetId=收件箱条目 id，如 deferredfile:<id>）。 */
export interface OutcomeSignRecord {
  role: 'owner' | 'verifier'
  actor: string
  at: number
  /** 签署时核验通过的合同版本（stale 门在签前已把守）。 */
  contractVersion: number
}

function outcomeSignPath(): string {
  return join(storeDir(), 'outcome-dual-sign.json')
}

type OutcomeSignLedger = Record<string, OutcomeSignRecord[]>

function loadOutcomeSigns(): OutcomeSignLedger {
  const file = outcomeSignPath()
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as OutcomeSignLedger
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch { /* 坏档：隔离留档再从空起步 */ }
  try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 不阻断 */ }
  return {}
}

function isUsableSign(r: unknown): r is OutcomeSignRecord {
  if (!r || typeof r !== 'object') return false
  const v = r as Partial<OutcomeSignRecord>
  return (v.role === 'owner' || v.role === 'verifier')
    && typeof v.actor === 'string' && v.actor.trim().length > 0
    && typeof v.at === 'number' && Number.isFinite(v.at)
    && typeof v.contractVersion === 'number' && Number.isInteger(v.contractVersion)
}

/** 读某条目的 outcome 双签签署（追加序；读侧 fail-soft：坏档按空处理，闸会要求重签）。 */
export function listOutcomeDualSign(targetId: string): OutcomeSignRecord[] {
  const rows = loadOutcomeSigns()[targetId]
  return Array.isArray(rows) ? rows.filter(isUsableSign) : []
}

/** 追加一笔签署（调用方=裁决门，已过角色映射与同人两票校验）。 */
export function recordOutcomeDualSign(targetId: string, rec: OutcomeSignRecord): void {
  const s = loadOutcomeSigns()
  const prev = Array.isArray(s[targetId]) ? s[targetId]!.filter(isUsableSign) : []
  s[targetId] = [...prev, rec]
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(outcomeSignPath(), s)
}

/** 清空某条目签署（测试与条目重开用）。 */
export function clearOutcomeDualSign(targetId: string): void {
  const s = loadOutcomeSigns()
  if (!(targetId in s)) return
  delete s[targetId]
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(outcomeSignPath(), s)
}

/** 测试隔离。 */
export function _useAutonomyGovDirForTests(dir: string): void {
  process.env.HERMES_AUTONOMY_GOV_DIR = dir
}

export function _resetAutonomyGovDirForTests(): void {
  delete process.env.HERMES_AUTONOMY_GOV_DIR
}
