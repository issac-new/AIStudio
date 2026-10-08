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
  /** 防篡改链（六文调研轮 C，arXiv 2609.24515 反取证）：指向前一条的 hash；首条为 GENESIS。 */
  prevHash?: string
  /** 本条链哈希 = sha256(prevHash + 规范化记录体)；旧记录（前链时代）无此字段。 */
  hash?: string
  /** 缺陷分诊（六文调研轮 D）：product_gap=产品能力缺口 / implementation_gap=客户实施缺口。 */
  gapClass?: 'product_gap' | 'implementation_gap'
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

// ---------- 防篡改 hash 链（六文调研轮 C） ----------
//
// 论文反取证判断：当事故日志成为调查依据，日志本身就是攻击面——被控 Agent 可能
// 改写历史让攻击"在报告里看起来不存在"。对策 = tamper-evident 前向链：
//   hash(n) = sha256( hash(n-1) + canonicalJSON(record_n 去链字段) )
// 改任何一条历史记录 → 其后所有 hash 断链，一次校验即可发现。
//
// 纪律边界：旧记录（升级前落账）按"证据只增不改"不加回头哈希——校验如实标注
// unchained（前链时代）；环形挤出（MAX_RECORDS）后首条剩余记录的 prevHash 指向
// 已挤出条目，属预期断锚（anchorDangling）不算篡改。

/** 规范化序列化（键序稳定，递归排序；链字段与 gapClass 之外的变性字段全量入哈希）。 */
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
}

/** 计算一条记录的链哈希。body = 记录去掉 hash/prevHash 后的规范化体。 */
export function hashEvidenceRecord(rec: EvidenceRecord): string {
  const { hash: _h, prevHash: _p, ...body } = rec
  return createHash('sha256').update(`${rec.prevHash ?? 'GENESIS'}|${canonicalJson(body)}`).digest('hex')
}

export interface ChainCheck {
  /** 单条校验结果。 */
  index: number
  evidenceId: string
  status: 'chained_ok' | 'unchained' | 'hash_mismatch' | 'link_broken' | 'anchor_dangling'
  note?: string
}

export interface ChainVerification {
  taskId: string
  chained: number
  unchained: number
  /** 前链时代记录数（升级前落账，无哈希字段——如实呈现不算缺陷）。 */
  intact: boolean
  firstBroken: number | null
  checks: ChainCheck[]
  at: number
}

/** 校验台账 hash 链：改写历史/删除中插/伪造追加都会在断链处现形。 */
export function verifyEvidenceChain(taskId: string): ChainVerification {
  const records = loadEvidence(taskId).records
  const checks: ChainCheck[] = []
  let chained = 0
  let unchained = 0
  let intact = true
  let firstBroken: number | null = null
  let prevHash: string | null = null  // 上一条链记录的 hash（null=链尚未开始）
  let sawChained = false
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (!r.hash || !r.prevHash) {
      unchained += 1
      checks.push({ index: i, evidenceId: r.evidenceId, status: 'unchained', note: '前链时代记录（升级前落账，未回填哈希）' })
      continue
    }
    // 链接校验：非首条链记录，prevHash 必须等于上一条链记录的 hash
    if (sawChained && r.prevHash !== prevHash) {
      intact = false
      if (firstBroken === null) firstBroken = i
      checks.push({ index: i, evidenceId: r.evidenceId, status: 'link_broken', note: `prevHash 与前条 hash 不符（链在此断开）` })
      // 断链后从本条重新锚定继续查（后续 hash 自身仍逐一验）
    } else if (!sawChained && r.prevHash !== 'GENESIS') {
      checks.push({ index: i, evidenceId: r.evidenceId, status: 'anchor_dangling', note: '链首 prevHash 非 GENESIS：环形挤出后的断锚（预期行为，不算篡改）' })
    }
    // 自身哈希校验
    if (hashEvidenceRecord(r) !== r.hash) {
      intact = false
      if (firstBroken === null) firstBroken = i
      checks.push({ index: i, evidenceId: r.evidenceId, status: 'hash_mismatch', note: '记录体与哈希不符（内容被改写或伪造）' })
    } else {
      chained += 1
      checks.push({ index: i, evidenceId: r.evidenceId, status: 'chained_ok' })
    }
    prevHash = r.hash
    sawChained = true
  }
  return { taskId, chained, unchained, intact, firstBroken, checks, at: Date.now() }
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
  // 防篡改链（六文调研轮 C）：追加即挂链——prevHash 接最后一条链记录（无链记录时 GENESIS）
  const lastChained = [...file.records].reverse().find((r) => r.hash)
  const chainedRec = file.records[file.records.length - 1]
  chainedRec.prevHash = lastChained?.hash ?? 'GENESIS'
  chainedRec.hash = hashEvidenceRecord(chainedRec)
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
  emitEvidenceGovEvent(chainedRec)
  return { added: true, total: file.records.length, evicted }
}

/** 治理事件总线桥（六文调研轮 F）：验证裁决 fail → quality 域 high 事件（真实"质量 P0"信号面）。
 *  动态 import 单例（vitest ESM 下 require 加载含 import 语句的模块会静默失败）+
 *  fire-and-forget 异步——事件最终落盘，不阻断台账主链路。 */
function emitEvidenceGovEvent(rec: EvidenceRecord): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      if (rec.kind === 'verification') {
        appendGovEvent({
          domain: 'quality',
          severity: rec.verdict === 'fail' ? 'high' : 'info',
          type: `evidence.verdict_${rec.verdict}`,
          source: 'evidence/evidence-store',
          summary: `任务 ${rec.taskId} 验证裁决 ${rec.verdict}${rec.basis ? `（依据 ${rec.basis.slice(0, 80)}）` : ''}`,
          refs: { taskId: rec.taskId, evidenceId: rec.evidenceId },
          payload: { verdict: rec.verdict },
        })
      } else if (rec.gapClass) {
        appendGovEvent({
          domain: 'quality',
          severity: 'info',
          type: `evidence.gap_${rec.gapClass}`,
          source: 'evidence/evidence-store',
          summary: `任务 ${rec.taskId} 新增${rec.gapClass === 'product_gap' ? '产品能力缺口' : '实施缺口'}标记`,
          refs: { taskId: rec.taskId, evidenceId: rec.evidenceId },
          payload: { gapClass: rec.gapClass },
        })
      }
    })
    .catch(() => { /* fail-soft：总线故障不影响台账主链路 */ })
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
