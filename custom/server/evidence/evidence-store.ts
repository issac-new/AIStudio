// overlay/evidence 域：任务=证据累积对象（routa §七#3 + antigravity A1 合并域，矩阵 §3.6 P0）。
//
// routa 语义映射（models/task.ts:835-899 证据累积面）：
// - deliverySnapshot（base..HEAD 交付冻结）→ evidence.kind='delivery_snapshot'（revision 字段带 base/head）；
// - verificationVerdict（验证裁决）→ kind='verification'（verdict pass/fail/conditional）；
// - A1 证据型工件（截图/录制/diff 卡挂里程碑）→ kind='artifact'（artifactType + milestone）。
// laneSessions/laneHandoffs（泳道履历）依赖 loop 会话域，列后续扩（本表预留 kind 即可平滑增）。
//
// 存储：每任务一份 JSON（append 语义 + 幂等键 evidenceId），HERMES_EVIDENCE_DIR >
// ~/.hermes-web-ui/evidence（旧档 cwd/.evidence 兜底已撤：serve-server.mjs 以 upstream 为 cwd
// 启动，cwd 档会写进只读 upstream 树——与 approval-store 同款取舍）。
// 文件名 = id 稳定哈希（sha256 前 32 hex + 可读前缀）：清洗名多对一（'a/b'≡'a_b'、同长中文、
// 大小写变体）会撞同一文件，叠加整账覆写即前账全灭。旧清洗名读侧兼容（命中且身份相符才迁）。
// 落盘 = tmp+rename 原子写；坏文件改名 .corrupt.<ts> 留档（G7 时间戳防二次损坏覆盖现场），
// 不再静默当空账续写。
// 纪律：证据只增不改（每条 = 一次事实记录）；验证裁决可以追加新条覆盖旧裁决（verdict 序列）。
//
// 归属（已知边界，勿当无漏）：本台账是**单租户信任模型**——任意登录用户凭 taskId 可读写
// 任意台账，写入只留 actor 痕。多租户任务归属待接（routa Task.workspaceId 是 routa 内部 id
// 而非文件系统路径，与 workspace-access.ts canUseWorkspace 的 workspacePath 判据不同源，
// 现状硬接闸=臆造归属模型）。属主判定语义定下来后再接。
import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
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
  /** 客户端自报时间（可信面）：at 一律服务端时间戳为准，client 提供的原始值留痕于此。 */
  claimedAt?: number
  /** 写入者（ctx.state.user 的 username/id，approval 域 callerOf 同源取法）；未启用鉴权的部署缺席。 */
  actor?: string
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

/** 追加结果：code 只报原因码（S-D：不展开 err，syscall/errno 会泄漏服务器路径）。 */
export interface AppendEvidenceResult {
  added: boolean
  total: number
  /** 本次落盘挤出的环形丢弃条数（上限 MAX_RECORDS；被挤出即离开幂等键保护范围）。 */
  evicted: number
  /** 失败码（成功/幂等跳过无此字段）：identity_mismatch 台账身份不符拒绝写；write_failed 落盘失败。 */
  code?: 'identity_mismatch' | 'write_failed'
}

const MAX_RECORDS = 500
/** 字段上限（超限截断）：自由文本 4000、ref 路径/URL 200。 */
const TEXT_CAP = 4000
const REF_CAP = 200

/** 按码点截断（UTF-16 code unit 截断会切出孤立代理对）。 */
function clip(s: string, cap: number): string {
  const cps = [...s]
  return cps.length <= cap ? s : cps.slice(0, cap).join('')
}

function clipRecord(rec: EvidenceRecord): EvidenceRecord {
  const out: EvidenceRecord = { ...rec, ref: clip(rec.ref, REF_CAP) }
  if (out.note !== undefined) out.note = clip(out.note, TEXT_CAP)
  if (out.basis !== undefined) out.basis = clip(out.basis, TEXT_CAP)
  return out
}

/** 文件名（S-A）：id 稳定哈希 + 可读前缀。前缀仅助排障，身份识别全靠哈希。 */
function stemOf(id: string): string {
  const readable = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 32).replace(/^\.+/, '') || 'id'
  return `${readable}-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
}

/** 旧清洗命名（只用于兼容读取/迁移；多对一有碰撞，不再用于写入）。 */
function legacyStemOf(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_')
}

export function evidenceDir(): string {
  const env = process.env.HERMES_EVIDENCE_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'evidence')
}

export function isEvidenceKind(v: unknown): v is EvidenceKind {
  return typeof v === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(v)
}

export function isVerificationVerdict(v: unknown): v is VerificationVerdict {
  return typeof v === 'string' && (VERIFICATION_VERDICTS as readonly string[]).includes(v)
}

export function evidenceFile(taskId: string): string {
  return join(evidenceDir(), `${stemOf(taskId)}.json`)
}

function legacyEvidenceFile(taskId: string): string {
  return join(evidenceDir(), `${legacyStemOf(taskId)}.json`)
}

/** 原子写（S-B）：tmp+rename，tmp 名带随机后缀防并发同名；rename 前不做 fsync——
 *  断电最坏丢最后一次写（证据可由上游重放），换来永不落半截 JSON（截断→读侧归零→
 *  下条以小账覆写→全史蒸发的链条从源头断掉）。 */
function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, file)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* 无残留 */ }
    throw err
  }
}

/** 坏文件隔离（S-B）：改名 .corrupt.<ts> 留档 + warn，不再静默当空账续写（续写=小账覆写全史）。
 *  时间戳（G7）：固定名 .corrupt 会让二次损坏覆盖第一次现场，档名带 ts 各自留档。 */
function quarantine(file: string, err: unknown): void {
  const archive = `${file}.corrupt.${Date.now()}`
  try { renameSync(file, archive) } catch { /* 留档失败不阻断（只读介质等） */ }
  console.warn(`[evidence-store] 台账文件解析失败，已留档 ${archive}：${err instanceof Error ? err.message : String(err)}`)
}

type LedgerRead = { state: 'ok' | 'missing' | 'mismatch'; file: EvidenceFile }

function readLedgerAt(taskId: string, file: string): LedgerRead {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    if (existsSync(file)) quarantine(file, err)  // 无文件 = miss；有文件读/解析失败 = 坏档隔离
    return { state: 'missing', file: { taskId, records: [] } }
  }
  const obj = raw as { taskId?: unknown; records?: unknown } | null
  if (obj && typeof obj.taskId === 'string' && obj.taskId !== taskId) {
    // 身份不符（碰撞/篡改现场）：读侧回空账，写侧拒绝续写（见 appendEvidence）。
    console.warn(`[evidence-store] 台账身份不符（文件内 ${obj.taskId} ≠ 请求 ${taskId}），拒绝写入`)
    return { state: 'mismatch', file: { taskId, records: [] } }
  }
  if (!obj || obj.taskId !== taskId || !Array.isArray(obj.records)) {
    quarantine(file, new Error('台账结构非法（缺 taskId/records）'))
    return { state: 'missing', file: { taskId, records: [] } }
  }
  return {
    state: 'ok',
    file: { taskId, records: obj.records.filter((r: EvidenceRecord) => r && typeof r.evidenceId === 'string') },
  }
}

/** 读台账：哈希名优先；miss 再查旧清洗名，命中且身份相符即迁移到哈希名。 */
function readLedger(taskId: string): LedgerRead {
  const file = evidenceFile(taskId)
  if (existsSync(file)) return readLedgerAt(taskId, file)
  const legacy = legacyEvidenceFile(taskId)
  if (!existsSync(legacy)) return { state: 'missing', file: { taskId, records: [] } }
  // 旧档只搬身份相符的（多对一碰撞对侧的文件不动，留给对方认领）。
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(legacy, 'utf8'))
  } catch {
    return { state: 'missing', file: { taskId, records: [] } }  // 旧档读不出：无从判归属，不动它
  }
  const obj = raw as { taskId?: unknown; records?: unknown } | null
  if (!obj || obj.taskId !== taskId || !Array.isArray(obj.records)) {
    return { state: 'missing', file: { taskId, records: [] } }
  }
  const migrated: EvidenceFile = {
    taskId,
    records: obj.records.filter((r: EvidenceRecord) => r && typeof r.evidenceId === 'string'),
  }
  try {
    renameSync(legacy, file)  // 迁移 = 换名（内容原样，原子）
  } catch (err) {
    console.warn(`[evidence-store] 旧命名迁移失败（数据已读出，下次重试）：${err instanceof Error ? err.message : String(err)}`)
  }
  return { state: 'ok', file: migrated }
}

export function loadEvidence(taskId: string): EvidenceFile {
  return readLedger(taskId).file
}

/** 追加一条证据。幂等：同 evidenceId 已在则跳过——**幂等键只在环内有效**，被环形挤出的
 *  旧条目再次 append 会当新条入库（丢弃有 evicted 计数可循；需要全史请另落外部存档）。 */
export function appendEvidence(rec: EvidenceRecord): AppendEvidenceResult {
  const read = readLedger(rec.taskId)
  if (read.state === 'mismatch') return { added: false, total: 0, evicted: 0, code: 'identity_mismatch' }
  const file = read.file
  const before = file.records.length
  if (file.records.some((r) => r.evidenceId === rec.evidenceId)) {
    return { added: false, total: before, evicted: 0 }
  }
  file.records.push(clipRecord(rec))
  let evicted = 0
  while (file.records.length > MAX_RECORDS) {
    file.records.shift()
    evicted += 1
  }
  try {
    mkdirSync(evidenceDir(), { recursive: true })
    writeJsonAtomic(evidenceFile(rec.taskId), file)
  } catch (err) {
    console.warn(`[evidence-store] 台账写入失败：${err instanceof Error ? err.message : String(err)}`)
    return { added: false, total: before, evicted: 0, code: 'write_failed' }
  }
  return { added: true, total: file.records.length, evicted }
}

/** 最新验证裁决（verdict 序列取最后一条；无则 null）。缺裁决的残条不当裁决（防遮蔽真实裁决）。 */
export function latestVerdict(taskId: string): EvidenceRecord | null {
  const records = loadEvidence(taskId).records
    .filter((r) => r.kind === 'verification' && isVerificationVerdict(r.verdict))
  return records.length ? records[records.length - 1] : null
}

/** 按 kind 过滤 + 限量倒序（新在前）。limit 非有限数回默认 50（slice(-NaN) 会退化成全量）。 */
export function listEvidence(taskId: string, kind?: EvidenceKind, limit = 50): EvidenceRecord[] {
  const records = loadEvidence(taskId).records
  const filtered = kind ? records.filter((r) => r.kind === kind) : records
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, Math.min(limit, MAX_RECORDS)) : 50
  return filtered.slice(-n).reverse()
}

export function resetEvidenceDirForTests(): void {
  delete process.env.HERMES_EVIDENCE_DIR
}
