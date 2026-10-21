// taskledger 回执账本：登记（upsert）与查询。落盘 <home>/runtime/taskledger.json，
// 写入走 tmp+rename 原子替换（与 eval-store 同纪律）。只读各源系统的投影，
// 不回写源系统——本账本是「委派事实 + 统一生命周期」的单一查询面。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  type InstructionLifecycle, type LedgerEntry, type LedgerSource, isTerminal, mapExternalStatus,
} from './taskledger'

const MAX_ENTRIES = 5_000

function ledgerPath(): string {
  const env = process.env.TASKLEDGER_STORE?.trim()
  if (env) return env
  return join(process.env.HERMES_HOME?.trim() || join(tmpdir(), 'hermes'), 'runtime', 'taskledger.json')
}

interface LedgerFile {
  version: 1
  entries: LedgerEntry[]
}

function readLedger(): LedgerFile {
  try {
    const raw = readFileSync(ledgerPath(), 'utf8')
    const parsed = JSON.parse(raw) as LedgerFile
    return Array.isArray(parsed?.entries) ? parsed : { version: 1, entries: [] }
  } catch {
    return { version: 1, entries: [] }
  }
}

function writeLedger(file: LedgerFile): void {
  const path = ledgerPath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8')
  renameSync(tmp, path)
}

export interface RegisterInput {
  source: LedgerSource
  sourceKey: string
  externalStatus: string
  title?: string
  assignee?: string
  parentInstructionId?: string
  instructionId?: string
  updatedAt?: number
}

export type RegisterResult =
  | { ok: true; entry: LedgerEntry; transition: 'created' | 'updated' | 'terminal-locked' | 'no-op' }
  | { ok: false; problem: string }

/** 登记一条源状态：映射到统一生命周期后 upsert。终态锁定（DDD 聚合不变性：终态不再跃迁）。 */
export function registerEntry(input: RegisterInput, now = Date.now()): RegisterResult {
  const lifecycle = mapExternalStatus(input.source, input.externalStatus)
  if (!lifecycle) {
    return { ok: false, problem: `源状态映射不上统一生命周期（${input.source}:${input.externalStatus}）——先补映射表，不猜` }
  }
  const instructionId = input.instructionId?.trim() || `${input.source}:${input.sourceKey}`
  const ledger = readLedger()
  const existing = ledger.entries.find((e) => e.instructionId === instructionId)
  const entry: LedgerEntry = {
    instructionId,
    source: input.source,
    sourceKey: input.sourceKey,
    externalStatus: input.externalStatus,
    lifecycle,
    title: input.title,
    assignee: input.assignee,
    parentInstructionId: input.parentInstructionId,
    updatedAt: input.updatedAt ?? now,
  }
  if (!existing) {
    ledger.entries.unshift(entry)
    if (ledger.entries.length > MAX_ENTRIES) ledger.entries.length = MAX_ENTRIES
    writeLedger(ledger)
    return { ok: true, entry, transition: 'created' }
  }
  if (isTerminal(existing.lifecycle) && existing.lifecycle !== lifecycle) {
    return { ok: true, entry: existing, transition: 'terminal-locked' }
  }
  if (existing.lifecycle === lifecycle && existing.externalStatus === input.externalStatus) {
    existing.updatedAt = entry.updatedAt
    return { ok: true, entry: existing, transition: 'no-op' }
  }
  ledger.entries[ledger.entries.indexOf(existing)] = entry
  writeLedger(ledger)
  return { ok: true, entry, transition: 'updated' }
}

export function listEntries(filter: { source?: LedgerSource; lifecycle?: InstructionLifecycle } = {}): LedgerEntry[] {
  const entries = readLedger().entries
  return entries.filter((e) =>
    (!filter.source || e.source === filter.source) && (!filter.lifecycle || e.lifecycle === filter.lifecycle))
}

export function getEntry(instructionId: string): LedgerEntry | undefined {
  return readLedger().entries.find((e) => e.instructionId === instructionId)
}

/** 测试/收口用：指定落盘路径（须在首个读写前设置）。 */
export function setStorePathForTests(path: string | undefined): void {
  if (path === undefined) delete process.env.TASKLEDGER_STORE
  else process.env.TASKLEDGER_STORE = path
}

export function ledgerPathForDisplay(): string {
  return existsSync(ledgerPath()) ? ledgerPath() : `${ledgerPath()}（尚未生成）`
}
