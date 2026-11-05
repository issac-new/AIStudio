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

/** 测试隔离。 */
export function _useAutonomyGovDirForTests(dir: string): void {
  process.env.HERMES_AUTONOMY_GOV_DIR = dir
}

export function _resetAutonomyGovDirForTests(): void {
  delete process.env.HERMES_AUTONOMY_GOV_DIR
}
