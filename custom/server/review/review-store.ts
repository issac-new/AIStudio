// overlay/review 域：/review 评审模式（codex-product §五 P0-1 吸收，矩阵 §3.8 codex-product P0）。
//
// 语义映射：评审对象两域（基线分支 diff / 未提交改动）+ 行内评论回流 + 三裁决
// （approve / request_changes / comment）。与 evidence 台账天然衔接：裁决即落
// verification 证据（appendEvidence 联动），评审链可追溯。
// 存储：每评审一份 JSON（reviewId 幂等），HERMES_REVIEW_DIR > cwd/.review >
// ~/.hermes-web-ui/review 降级（evidence-store 同款模式）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { appendEvidence } from '../evidence/evidence-store'

export const REVIEW_VERDICTS = ['approve', 'request_changes', 'comment'] as const
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number]

export const REVIEW_DOMAINS = ['baseline', 'uncommitted'] as const
export type ReviewDomain = (typeof REVIEW_DOMAINS)[number]

export interface InlineComment {
  commentId: string
  /** 文件 + 行（file:line 定位，回流到实现侧可导航）。 */
  file: string
  line: number
  body: string
  at: number
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
  comments: InlineComment[]
  verdict?: { verdict: ReviewVerdict; note?: string; at: number }
}

const MAX_COMMENTS = 200

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.review-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function reviewDir(): string {
  const env = process.env.HERMES_REVIEW_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.review')
  return join(homedir(), '.hermes-web-ui', 'review')
}

export function isReviewVerdict(v: unknown): v is ReviewVerdict {
  return typeof v === 'string' && (REVIEW_VERDICTS as readonly string[]).includes(v)
}

function reviewFile(reviewId: string): string {
  return join(reviewDir(), `${reviewId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

export function loadReview(reviewId: string): ReviewRecord | null {
  try {
    const raw = JSON.parse(readFileSync(reviewFile(reviewId), 'utf8'))
    if (raw && raw.reviewId === reviewId && Array.isArray(raw.comments)) return raw as ReviewRecord
  } catch { /* 坏/无文件 fail-soft */ }
  return null
}

function save(rec: ReviewRecord): void {
  mkdirSync(reviewDir(), { recursive: true })
  writeFileSync(reviewFile(rec.reviewId), JSON.stringify(rec, null, 2))
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

/** 行内评论（幂等 commentId；上限 200）。 */
export function addComment(reviewId: string, c: InlineComment): ReviewRecord | { error: string } {
  const rec = loadReview(reviewId)
  if (!rec) return { error: '评审不存在' }
  if (rec.verdict) return { error: '评审已裁决，不可再评论（如需补评审请开新评审）' }
  if (rec.comments.some((x) => x.commentId === c.commentId)) return rec  // 幂等
  rec.comments.push(c)
  if (rec.comments.length > MAX_COMMENTS) rec.comments.shift()
  save(rec)
  return rec
}

/** 评论回流收口（open → resolved）。 */
export function resolveComment(reviewId: string, commentId: string): ReviewRecord | { error: string } {
  const rec = loadReview(reviewId)
  if (!rec) return { error: '评审不存在' }
  const c = rec.comments.find((x) => x.commentId === commentId)
  if (!c) return { error: '评论不存在' }
  c.state = 'resolved'
  save(rec)
  return rec
}

/** 落裁决（一次定音：已裁决不可重裁）。approve/request_changes 联动 evidence
 * 台账（裁决即 verification 证据，评审链可追溯；联动下沉本层=单一事实源）。 */
export function setVerdict(reviewId: string, verdict: ReviewVerdict, note?: string): ReviewRecord | { error: string } {
  const rec = loadReview(reviewId)
  if (!rec) return { error: '评审不存在' }
  if (rec.verdict) return { error: '评审已裁决（一次定音）' }
  rec.verdict = { verdict, note, at: Date.now() }
  save(rec)
  if (rec.taskId && (verdict === 'approve' || verdict === 'request_changes')) {
    try {
      appendEvidence({
        evidenceId: `review-${reviewId}`,
        taskId: rec.taskId,
        kind: 'verification',
        verdict: verdict === 'approve' ? 'pass' : 'fail',
        basis: `review:${reviewId}${note ? ` ${String(note).slice(0, 200)}` : ''}`,
        ref: `review:${reviewId}`,
        at: Date.now(),
      })
    } catch { /* evidence 面缺席不影响评审本体 */ }
  }
  return rec
}
