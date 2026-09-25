// overlay/review 域：/review 评审模式（codex-product §五 P0-1 吸收，矩阵 §3.8 codex-product P0）。
//
// 语义映射：评审对象两域（基线分支 diff / 未提交改动）+ 行内评论回流 + 三裁决
// （approve / request_changes / comment）。与 evidence 台账天然衔接：裁决即落
// verification 证据（appendEvidence 联动），评审链可追溯。
// 存储：每评审一份 JSON（reviewId 幂等），HERMES_REVIEW_DIR > ~/.hermes-web-ui/review
// （旧档 cwd/.review 兜底已撤，同 evidence-store）。
// 文件名 = reviewId 稳定哈希（sha256 前 32 hex + 可读前缀）：清洗名多对一会撞同一文件
// 整账覆写；旧清洗名读侧兼容迁移（命中且身份相符才搬）。落盘 tmp+rename 原子写，
// 坏文件改名 .corrupt 留档。
//
// 归属（已知边界，勿当无漏）：单租户信任模型——任意登录用户凭 reviewId 可读写任意评审，
// 写入只记 actor 痕（opener/评论者/裁决者各留一道）。多租户任务归属待接（同 evidence-store）。
import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { appendEvidence } from '../evidence/evidence-store'

export const REVIEW_VERDICTS = ['approve', 'request_changes', 'comment'] as const
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number]

export const REVIEW_DOMAINS = ['baseline', 'uncommitted'] as const
export type ReviewDomain = (typeof REVIEW_DOMAINS)[number]

export interface InlineComment {
  commentId: string
  /** 文件 + 行（file:line 定位，回流到实现侧可导航）。file 为项目相对路径（controller 归一）。 */
  file: string
  line: number
  body: string
  at: number
  /** 评论者（ctx.state.user 同源取法）；未启用鉴权的部署缺席。 */
  actor?: string
  /** 回流状态：open → resolved（实现侧处理后收口）。 */
  state: 'open' | 'resolved'
}

export interface ReviewRecord {
  reviewId: string
  taskId?: string
  domain: ReviewDomain
  /** 基线域：对照的 base ref；uncommitted 域可省。 */
  baseRef?: string
  headRef?: string
  createdAt: number
  /** 开评审者（ctx.state.user 同源取法）。 */
  actor?: string
  comments: InlineComment[]
  verdict?: { verdict: ReviewVerdict; note?: string; at: number; actor?: string }
  /** 裁决→evidence 落账失败标记（待补账；裁决本体已一次定音）。 */
  evidencePending?: boolean
}

const MAX_COMMENTS = 200
/** 字段上限（超限截断）：自由文本 4000。 */
const TEXT_CAP = 4000

/** 按码点截断（UTF-16 code unit 截断会切出孤立代理对）。 */
function clip(s: string, cap: number): string {
  const cps = [...s]
  return cps.length <= cap ? s : cps.slice(0, cap).join('')
}

/** 文件名（S-A）：reviewId 稳定哈希 + 可读前缀。前缀仅助排障，身份识别全靠哈希。 */
function stemOf(id: string): string {
  const readable = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 32).replace(/^\.+/, '') || 'review'
  return `${readable}-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
}

export function reviewDir(): string {
  const env = process.env.HERMES_REVIEW_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'review')
}

export function isReviewVerdict(v: unknown): v is ReviewVerdict {
  return typeof v === 'string' && (REVIEW_VERDICTS as readonly string[]).includes(v)
}

export function reviewFile(reviewId: string): string {
  return join(reviewDir(), `${stemOf(reviewId)}.json`)
}

/** 旧清洗命名（只用于兼容读取/迁移；多对一有碰撞，不再用于写入）。 */
function legacyReviewFile(reviewId: string): string {
  return join(reviewDir(), `${reviewId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

/** 原子写（S-B）：tmp+rename，tmp 名带随机后缀防并发同名；rename 前不做 fsync——
 *  断电最坏丢最后一次写，换来永不落半截 JSON（截断→读侧归零→下条小账覆写→全史蒸发）。 */
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

/** 坏文件隔离（S-B）：改名 .corrupt 留档 + warn，不再静默当"评审不存在"续写。 */
function quarantine(file: string, err: unknown): void {
  const archive = `${file}.corrupt`
  try { renameSync(file, archive) } catch { /* 留档失败不阻断（只读介质等） */ }
  console.warn(`[review-store] 评审文件解析失败，已留档 ${archive}：${err instanceof Error ? err.message : String(err)}`)
}

type ReviewRead = { state: 'ok' | 'missing' | 'mismatch'; rec: ReviewRecord | null }

function readReviewFile(reviewId: string, file: string): ReviewRead {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    if (existsSync(file)) quarantine(file, err)  // 无文件 = miss；有文件读/解析失败 = 坏档隔离
    return { state: 'missing', rec: null }
  }
  const obj = raw as { reviewId?: unknown; comments?: unknown } | null
  if (obj && typeof obj.reviewId === 'string' && obj.reviewId !== reviewId) {
    console.warn(`[review-store] 评审身份不符（文件内 ${obj.reviewId} ≠ 请求 ${reviewId}），拒绝写入`)
    return { state: 'mismatch', rec: null }
  }
  if (!obj || obj.reviewId !== reviewId || !Array.isArray(obj.comments)) {
    quarantine(file, new Error('评审结构非法（缺 reviewId/comments）'))
    return { state: 'missing', rec: null }
  }
  return { state: 'ok', rec: raw as ReviewRecord }
}

/** 读评审：哈希名优先；miss 再查旧清洗名，命中且身份相符即迁移。 */
function readReview(reviewId: string): ReviewRead {
  const file = reviewFile(reviewId)
  if (existsSync(file)) return readReviewFile(reviewId, file)
  const legacy = legacyReviewFile(reviewId)
  if (!existsSync(legacy)) return { state: 'missing', rec: null }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(legacy, 'utf8'))
  } catch {
    return { state: 'missing', rec: null }  // 旧档读不出：无从判归属，不动它
  }
  const obj = raw as { reviewId?: unknown; comments?: unknown } | null
  if (!obj || obj.reviewId !== reviewId || !Array.isArray(obj.comments)) {
    return { state: 'missing', rec: null }  // 身份不符（碰撞对侧的账）：不动
  }
  try {
    renameSync(legacy, file)  // 迁移 = 换名（内容原样，原子）
  } catch (err) {
    console.warn(`[review-store] 旧命名迁移失败（数据已读出，下次重试）：${err instanceof Error ? err.message : String(err)}`)
  }
  return { state: 'ok', rec: raw as ReviewRecord }
}

export function loadReview(reviewId: string): ReviewRecord | null {
  return readReview(reviewId).rec
}

/** 写侧读取：身份不符单独报错（不当"评审不存在"，更不当空账续写）。 */
function requireReview(reviewId: string): ReviewRecord | { error: string } {
  const read = readReview(reviewId)
  if (read.state === 'mismatch') return { error: `评审台账身份不符，拒绝写入（identity_mismatch）：${reviewId}` }
  if (!read.rec) return { error: '评审不存在' }
  return read.rec
}

/** 落盘（S-B 原子写 + S-A 身份校验）：目标文件 id 不符即抛错拒绝写（碰撞/篡改现场不销毁）；
 *  写失败抛出不含服务器路径的错误（err 详情只进 warn；HTTP 500 由 koa 兜，不回 err 正文）。 */
function save(rec: ReviewRecord): void {
  const file = reviewFile(rec.reviewId)
  const existing = readReviewFile(rec.reviewId, file)
  if (existing.state === 'mismatch') {
    throw new Error(`评审台账身份不符，拒绝写入（identity_mismatch）：${rec.reviewId}`)
  }
  mkdirSync(reviewDir(), { recursive: true })
  try {
    writeJsonAtomic(file, rec)
  } catch (err) {
    console.warn(`[review-store] 评审写入失败：${err instanceof Error ? err.message : String(err)}`)
    throw new Error(`评审写入失败（write_failed）：${rec.reviewId}`)
  }
}

/** 开评审（幂等：同 reviewId 已存在则原样返回）。 */
export function openReview(rec: Omit<ReviewRecord, 'comments' | 'createdAt'> & { createdAt?: number }): ReviewRecord {
  const existing = loadReview(rec.reviewId)
  if (existing) return existing
  const full: ReviewRecord = {
    ...rec,
    createdAt: rec.createdAt ?? Date.now(),
    comments: [],
  }
  save(full)
  return full
}

/** 行内评论（幂等 commentId；上限 200；正文截 4000）。 */
export function addComment(reviewId: string, c: InlineComment): ReviewRecord | { error: string } {
  const rec = requireReview(reviewId)
  if ('error' in rec) return rec
  if (rec.verdict) return { error: '评审已裁决，不可再评论（如需补评审请开新评审）' }
  if (rec.comments.some((x) => x.commentId === c.commentId)) return rec  // 幂等
  rec.comments.push({ ...c, body: clip(c.body, TEXT_CAP) })
  while (rec.comments.length > MAX_COMMENTS) rec.comments.shift()
  save(rec)
  return rec
}

/** 评论回流收口（open → resolved）。 */
export function resolveComment(reviewId: string, commentId: string): ReviewRecord | { error: string } {
  const rec = requireReview(reviewId)
  if ('error' in rec) return rec
  const c = rec.comments.find((x) => x.commentId === commentId)
  if (!c) return { error: '评论不存在' }
  c.state = 'resolved'
  save(rec)
  return rec
}

/** 落裁决（一次定音：已裁决不可重裁）。approve/request_changes 联动 evidence
 * 台账（裁决即 verification 证据，评审链可追溯；联动下沉本层=单一事实源）。
 * evidence 落账失败不再被吞：标 evidencePending 待补账 + warn，评审本体照常定音。 */
export function setVerdict(
  reviewId: string, verdict: ReviewVerdict, note?: string, actor?: string,
): ReviewRecord | { error: string } {
  const rec = requireReview(reviewId)
  if ('error' in rec) return rec
  if (rec.verdict) return { error: '评审已裁决（一次定音）' }
  rec.verdict = {
    verdict,
    note: note !== undefined ? clip(note, TEXT_CAP) : note,
    at: Date.now(),
    ...(actor ? { actor } : {}),
  }
  if (rec.taskId && (verdict === 'approve' || verdict === 'request_changes')) {
    const result = appendEvidence({
      evidenceId: `review-${reviewId}`,
      taskId: rec.taskId,
      kind: 'verification',
      verdict: verdict === 'approve' ? 'pass' : 'fail',
      basis: `review:${reviewId}${note ? ` ${clip(note, 200)}` : ''}`,
      ref: `review:${reviewId}`,
      at: Date.now(),
      ...(actor ? { actor } : {}),
    })
    if (result.code) {
      rec.evidencePending = true
      console.warn(`[review-store] 裁决证据落账失败（${result.code}），已标 evidencePending：review=${reviewId} task=${rec.taskId}`)
    }
  }
  save(rec)
  return rec
}
