// custom/server/platform/evidence/evidence-store.ts
// 追加式证据存储（P1 Task 2）：EvidenceRecord 九字段契约的校验与 JSONL 落盘。
//
// 设计约束（设计书 §3.4 与 P1 目标「记录在档不得伪装成功」）：
// - validateEvidenceRecord 纯函数：缺关键字段/非法值抛错点名——校验失败即抛，
//   不静默落盘（append 前置门）；「键缺席」与「显式 null」区分（commit/sourceDigest
//   的 null=如实缺席，undefined=遗漏即非法）。
// - appendEvidence：单行 appendFileSync（行级原子，追加范式照 userperms/audit-store）；
//   写失败向上抛而非吞掉——证据写不进存储必须可见，不允许「以为记了」。
// - latestEvidenceFor：读面 fail-soft——文件不存在=null（不猜）、坏行跳过（JSON 损坏
//   或九字段校验不过）、不存在主体=null。
// - 向后兼容读取：旧三字段行（P0 形状 {subject,status,source}）归一为 LegacyEvidenceRecord
//   投影，缺席字段如实 null，不编造 evidenceId/producer/时戳。
// - 路径解析序：PLATFORM_EVIDENCE_FILE（整文件路径覆盖，测试隔离位）→
//   underWebUi('platform-evidence.jsonl')（lib/paths 单一事实源，缺省 ~/.hermes-web-ui/）。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EvidenceRecord, EvidenceStatus } from '../../../platform/contracts/evidence'
import { underWebUi } from '../../lib/paths'

/** 存储文件 env 覆盖名（显式整文件路径；测试隔离与部署注入共用）。 */
export const PLATFORM_EVIDENCE_FILE_ENV = 'PLATFORM_EVIDENCE_FILE'

const EVIDENCE_STATUSES: ReadonlySet<string> = new Set(['pass', 'fail', 'unknown', 'waived'])

/** 九字段落盘键序（固定序=行内容确定性，白名单杜绝未校验字段混入）。 */
const EVIDENCE_RECORD_KEYS = [
  'evidenceId', 'subjectId', 'status', 'producer', 'commit',
  'startedAt', 'endedAt', 'sourceDigest', 'artifactRefs',
] as const

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** 「非空字符串或显式 null」合法；undefined（键缺席）/空串/其他类型非法。 */
function checkStringOrNull(problems: string[], field: 'commit' | 'sourceDigest', v: unknown): void {
  if (v === null) return
  if (!isNonEmptyString(v)) problems.push(field)
}

/**
 * 九字段契约校验（纯函数）：全部问题一次收齐后抛错点名，不 partial 通过。
 * 用作 appendEvidence 前置门与读面坏行判据；不作运行期类型断言之外的状态判定。
 */
export function validateEvidenceRecord(record: unknown): asserts record is EvidenceRecord {
  const problems: string[] = []
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('validateEvidenceRecord：证据记录必须是对象')
  }
  const r = record as Record<string, unknown>
  if (!isNonEmptyString(r.evidenceId)) problems.push('evidenceId')
  if (!isNonEmptyString(r.subjectId)) problems.push('subjectId')
  if (typeof r.status !== 'string' || !EVIDENCE_STATUSES.has(r.status)) problems.push('status')
  if (!isNonEmptyString(r.producer)) problems.push('producer')
  checkStringOrNull(problems, 'commit', r.commit)
  checkStringOrNull(problems, 'sourceDigest', r.sourceDigest)
  if (typeof r.startedAt !== 'number' || !Number.isFinite(r.startedAt)) problems.push('startedAt')
  if (typeof r.endedAt !== 'number' || !Number.isFinite(r.endedAt)) problems.push('endedAt')
  else if (typeof r.startedAt === 'number' && Number.isFinite(r.startedAt) && r.endedAt < r.startedAt) {
    problems.push('endedAt（早于 startedAt）')
  }
  if (!Array.isArray(r.artifactRefs) || !r.artifactRefs.every(isNonEmptyString)) problems.push('artifactRefs')
  if (problems.length > 0) {
    throw new Error(`validateEvidenceRecord：证据记录缺关键字段或非法：${problems.join('、')}`)
  }
}

/** 存储文件路径：PLATFORM_EVIDENCE_FILE 覆盖 → underWebUi 缺省。 */
export function evidenceStoreFile(): string {
  const env = process.env[PLATFORM_EVIDENCE_FILE_ENV]?.trim()
  if (env) return env
  return underWebUi('platform-evidence.jsonl')
}

/** 九字段白名单投影（固定键序序列化；白名单外的字段不落盘）。 */
function toStoredLine(record: EvidenceRecord): string {
  const picked: Record<string, unknown> = {}
  for (const key of EVIDENCE_RECORD_KEYS) {
    picked[key] = (record as unknown as Record<string, unknown>)[key]
  }
  return JSON.stringify(picked)
}

/**
 * 追加一条证据（行级原子）：先过九字段校验（非法即抛、不落盘），再单行
 * appendFileSync；父目录按需创建。写失败抛错——证据未落盘不得被当作已记录。
 */
export function appendEvidence(record: EvidenceRecord): void {
  validateEvidenceRecord(record)
  const file = evidenceStoreFile()
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  appendFileSync(file, toStoredLine(record) + '\n', { mode: 0o600 })
}

/** 旧三字段行（P0 形状）的归一读投影：缺席字段如实 null，legacy 标记区分新旧。 */
export interface LegacyEvidenceRecord {
  legacy: true
  evidenceId: null
  subjectId: string
  status: EvidenceStatus
  producer: null
  commit: null
  startedAt: null
  endedAt: null
  sourceDigest: string | null
  artifactRefs: string[]
}

/** 单行解析：新九字段行校验通过原样返回；旧三字段行归一 legacy；否则 null（坏行）。 */
function parseStoredLine(line: string): EvidenceRecord | LegacyEvidenceRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const r = parsed as Record<string, unknown>
  if (typeof r.subjectId === 'string') {
    try {
      validateEvidenceRecord(r)
      return r as EvidenceRecord
    } catch {
      return null // 九字段形状在但校验不过：坏行跳过（fail-soft，不阻断读）
    }
  }
  // 旧三字段形状（P0）：subject/status/source
  if (isNonEmptyString(r.subject) && typeof r.status === 'string' && EVIDENCE_STATUSES.has(r.status)) {
    return {
      legacy: true,
      evidenceId: null,
      subjectId: r.subject,
      status: r.status as EvidenceStatus,
      producer: null,
      commit: null,
      startedAt: null,
      endedAt: null,
      sourceDigest: isNonEmptyString(r.source) ? r.source : null,
      artifactRefs: [],
    }
  }
  return null
}

/**
 * 查主体的最新证据（追加序末位命中）：文件不存在=null、主体无记录=null（不猜）、
 * 坏行跳过。同主体新旧行混存时按文件序取最后一行，legacy 投影原样返回。
 */
export function latestEvidenceFor(subjectId: string): EvidenceRecord | LegacyEvidenceRecord | null {
  const file = evidenceStoreFile()
  if (!existsSync(file)) return null
  let latest: EvidenceRecord | LegacyEvidenceRecord | null = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue
    const rec = parseStoredLine(line)
    if (rec && rec.subjectId === subjectId) latest = rec
  }
  return latest
}
