// overlay/trust 域：案件存储、清单存储与事件账。
//
// 写入纪律：
//   - 每案一份 JSON，临时文件 + 原子替换；读取要么看到完整旧版，要么看到完整新版。
//   - 事件账整文件原子重写（不是裸 append），避免崩溃留下半行 JSON。
//   - 事件账是前向哈希链，复用 auditchain/forward-chain 的规范化哈希；
//     改写历史、删除中插、伪造追加会在 verify 时现形。
//   - 台账有长度上限，裁剪后链首变成断锚（anchor_dangling），按既有约定不算篡改。
import { createHash, randomBytes } from 'crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { chainHashOfEntry, canonicalJson, GENESIS, verifyForwardChain } from '../auditchain/forward-chain'
import type { IntegrityManifest, TrustCase, TrustCaseSummary, TrustLedgerEvent } from './types'

const MAX_LEDGER_EVENTS = 5_000
const KEEP_LEDGER_EVENTS = 4_500

export function trustDir(): string {
  const env = process.env.HERMES_TRUST_DIR?.trim()
  return env ? resolve(env) : join(homedir(), '.hermes-web-ui', 'trust')
}

function casesDir(): string {
  return join(trustDir(), 'cases')
}

function manifestsDir(caseId: string): string {
  return join(trustDir(), 'manifests', stemOf(caseId))
}

function ledgerPath(): string {
  return join(trustDir(), 'ledger.json')
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function stemOf(id: string): string {
  const readable = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 32).replace(/^\.+/, '') || 'id'
  return `${readable}-${createHash('sha256').update(id).digest('hex').slice(0, 16)}`
}

/** 原子写：写临时文件并 fsync，再 rename 覆盖。失败时清理临时文件并抛出。 */
export function writeJsonAtomic(path: string, value: unknown): void {
  ensureDir(dirname(path))
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(5).toString('hex')}`
  const fd = openSync(tmp, 'w')
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2))
    fsyncSync(fd)
  } catch (e) {
    closeSync(fd)
    try { unlinkSync(tmp) } catch { /* 临时文件可能已被清理 */ }
    throw e
  }
  closeSync(fd)
  try {
    renameSync(tmp, path)
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* 同上 */ }
    throw e
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

export function caseFile(caseId: string): string {
  return join(casesDir(), `${stemOf(caseId)}.json`)
}

export function loadCase(caseId: string): TrustCase | null {
  const c = readJson<TrustCase>(caseFile(caseId))
  return c && c.id === caseId ? c : null
}

export function saveCase(c: TrustCase): void {
  writeJsonAtomic(caseFile(c.id), c)
}

export function listCases(): TrustCase[] {
  const dir = casesDir()
  if (!existsSync(dir)) return []
  const out: TrustCase[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const c = readJson<TrustCase>(join(dir, name))
    if (c && typeof c.id === 'string') out.push(c)
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

export function saveManifest(caseId: string, manifest: IntegrityManifest): void {
  writeJsonAtomic(join(manifestsDir(caseId), `${manifest.id}.json`), manifest)
}

export function loadManifest(caseId: string, manifestId: string): IntegrityManifest | null {
  const m = readJson<IntegrityManifest>(join(manifestsDir(caseId), `${manifestId}.json`))
  return m && m.id === manifestId ? m : null
}

/** 案件摘要：去掉清单条目、断点列表与易变的 updatedAt，只保留决策与审计内容身份。 */
export function caseDigest(c: TrustCase): string {
  const body = { ...c, updatedAt: undefined, checkpoints: [] as TrustCase['checkpoints'] }
  return createHash('sha256').update(canonicalJson(body)).digest('hex')
}

export function caseSummary(c: TrustCase): TrustCaseSummary {
  const latest = new Map<string, string>()
  for (const a of c.audits) latest.set(a.claimId, a.verdict)
  let verified = 0
  let refuted = 0
  for (const claim of c.claims) {
    const v = latest.get(claim.id)
    if (v === 'verified') verified += 1
    if (v === 'refuted') refuted += 1
  }
  return {
    id: c.id,
    title: c.title,
    ...(c.runId ? { runId: c.runId } : {}),
    state: c.state,
    forgeAttempts: c.forgeAttempts,
    claimCount: c.claims.length,
    verifiedCount: verified,
    refutedCount: refuted,
    integrityState: c.integrity?.state ?? 'unknown',
    updatedAt: c.updatedAt,
    ...(c.blockedReason ? { blockedReason: c.blockedReason } : {}),
  }
}

interface LedgerFile {
  events: TrustLedgerEvent[]
}

/** 读取事件账。文件存在但结构损坏时抛错而不是返回空数组——空数组会让下一次
 *  追加静默重开一条新链，等于把历史丢掉。 */
export function readLedger(): TrustLedgerEvent[] {
  const path = ledgerPath()
  if (!existsSync(path)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`事件账损坏，拒绝追加：${e instanceof Error ? e.message : String(e)}`)
  }
  const events = (parsed as LedgerFile | null)?.events
  if (!Array.isArray(events)) throw new Error('事件账结构不符合预期，拒绝追加')
  return events
}

/** 追加一条事件并原子重写账本。返回落账后的完整记录（带 hash）。 */
export function appendLedger(input: Omit<TrustLedgerEvent, 'seq' | 'prevHash' | 'hash'>): TrustLedgerEvent {
  const events = readLedger()
  const prev = events.length > 0 ? events[events.length - 1] : null
  const entry: TrustLedgerEvent = {
    ...input,
    seq: (prev?.seq ?? 0) + 1,
    prevHash: prev?.hash ?? GENESIS,
  } as TrustLedgerEvent
  entry.hash = chainHashOfEntry(entry)
  const next = [...events, entry]
  const trimmed = next.length > MAX_LEDGER_EVENTS ? next.slice(next.length - KEEP_LEDGER_EVENTS) : next
  writeJsonAtomic(ledgerPath(), { events: trimmed })
  return entry
}

export function verifyLedger(): ReturnType<typeof verifyForwardChain> {
  return verifyForwardChain(readLedger())
}
