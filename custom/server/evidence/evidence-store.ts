// overlay/evidence 域：任务=证据累积对象（routa §七#3 + antigravity A1 合并域，矩阵 §3.6 P0）。
//
// routa 语义映射（models/task.ts:835-899 证据累积面）：
// - deliverySnapshot（base..HEAD 交付冻结）→ evidence.kind='delivery_snapshot'（revision 字段带 base/head）；
// - verificationVerdict（验证裁决）→ kind='verification'（verdict pass/fail/conditional）；
// - A1 证据型工件（截图/录制/diff 卡挂里程碑）→ kind='artifact'（artifactType + milestone）。
// laneSessions/laneHandoffs（泳道履历）依赖 loop 会话域，列后续扩（本表预留 kind 即可平滑增）。
//
// 存储：每任务一份 JSON（append 语义 + 幂等键 evidenceId），HERMES_EVIDENCE_DIR >
// cwd/.evidence > ~/.hermes-web-ui/evidence 降级（loop/paths.ts 同款模式）。
// 纪律：证据只增不改（每条 = 一次事实记录）；验证裁决可以追加新条覆盖旧裁决（verdict 序列）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export const EVIDENCE_KINDS = ['artifact', 'delivery_snapshot', 'verification', 'lane_session', 'lane_handoff'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const VERIFICATION_VERDICTS = ['pass', 'fail', 'conditional'] as const
export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number]

export interface EvidenceRecord {
  evidenceId: string
  taskId: string
  kind: EvidenceKind
  at: number
  /** artifact：工件类型（screenshot/recording/diff/log 等）+ 里程碑标签。 */
  artifactType?: string
  milestone?: string
  /** 工件引用（路径/URL；不内嵌字节——A1 间接引用纪律）。 */
  ref: string
  note?: string
  /** delivery_snapshot：交付冻结 revision（base..HEAD）。 */
  revision?: { base: string; head: string }
  /** verification：裁决三态（routa verificationVerdict）。 */
  verdict?: VerificationVerdict
  /** 验证命令/依据（validatorCommand 同语义）。 */
  basis?: string
}

export interface EvidenceFile {
  taskId: string
  records: EvidenceRecord[]
}

const MAX_RECORDS = 500

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.evidence-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function evidenceDir(): string {
  const env = process.env.HERMES_EVIDENCE_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.evidence')
  return join(homedir(), '.hermes-web-ui', 'evidence')
}

export function isEvidenceKind(v: unknown): v is EvidenceKind {
  return typeof v === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(v)
}

export function isVerificationVerdict(v: unknown): v is VerificationVerdict {
  return typeof v === 'string' && (VERIFICATION_VERDICTS as readonly string[]).includes(v)
}

export function evidenceFile(taskId: string): string {
  return join(evidenceDir(), `${taskId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

export function loadEvidence(taskId: string): EvidenceFile {
  try {
    const raw = JSON.parse(readFileSync(evidenceFile(taskId), 'utf8'))
    if (raw && raw.taskId === taskId && Array.isArray(raw.records)) {
      return { taskId, records: raw.records.filter((r: EvidenceRecord) => r && typeof r.evidenceId === 'string') }
    }
  } catch { /* 坏文件/无文件 → 空台账（fail-soft） */ }
  return { taskId, records: [] }
}

/** 追加一条证据（幂等：同 evidenceId 已在则跳过；上限 500 条环形）。 */
export function appendEvidence(rec: EvidenceRecord): { added: boolean; total: number } {
  const file = loadEvidence(rec.taskId)
  if (file.records.some((r) => r.evidenceId === rec.evidenceId)) {
    return { added: false, total: file.records.length }
  }
  file.records.push(rec)
  if (file.records.length > MAX_RECORDS) file.records.shift()
  const dir = evidenceDir()
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(evidenceFile(rec.taskId), JSON.stringify(file, null, 2))
  } catch (err) {
    return { added: false, total: file.records.length, ...(err as { code?: string }) }
  }
  return { added: true, total: file.records.length }
}

/** 最新验证裁决（verdict 序列取最后一条；无则 null）。 */
export function latestVerdict(taskId: string): EvidenceRecord | null {
  const records = loadEvidence(taskId).records.filter((r) => r.kind === 'verification')
  return records.length ? records[records.length - 1] : null
}

/** 按 kind 过滤 + 限量倒序（新在前）。 */
export function listEvidence(taskId: string, kind?: EvidenceKind, limit = 50): EvidenceRecord[] {
  const records = loadEvidence(taskId).records
  const filtered = kind ? records.filter((r) => r.kind === kind) : records
  return filtered.slice(-Math.max(1, Math.min(limit, MAX_RECORDS))).reverse()
}

export function resetEvidenceDirForTests(): void {
  delete process.env.HERMES_EVIDENCE_DIR
}
