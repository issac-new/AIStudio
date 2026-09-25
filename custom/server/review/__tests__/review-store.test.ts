// /review 评审域守门（codex-product §五 P0-1：两域/行内评论/三裁决一次定音/evidence 联动）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  addComment, isReviewVerdict, loadReview, openReview, resolveComment, setVerdict,
} from '../review-store'
import { listEvidence } from '../../evidence/evidence-store'

let rdir: string, edir: string
beforeEach(() => {
  rdir = mkdtempSync(join(tmpdir(), 'review-'))
  edir = mkdtempSync(join(tmpdir(), 'ev-'))
  process.env.HERMES_REVIEW_DIR = rdir
  process.env.HERMES_EVIDENCE_DIR = edir
})
afterEach(() => {
  delete process.env.HERMES_REVIEW_DIR
  delete process.env.HERMES_EVIDENCE_DIR
  rmSync(rdir, { recursive: true, force: true })
  rmSync(edir, { recursive: true, force: true })
})

const open = (id = 'r1') =>
  openReview({ reviewId: id, taskId: 't1', domain: 'baseline', baseRef: 'main', headRef: 'feat/x' })

describe('两域+幂等开评审', () => {
  it('domain 两域冻结（baseline/uncommitted）；reviewId 幂等', () => {
    expect(isReviewVerdict('approve')).toBe(true)
    expect(isReviewVerdict('lgtm')).toBe(false)
    const a = open()
    const b = open()
    expect(a.reviewId).toBe(b.reviewId)
    expect(loadReview('r1')?.domain).toBe('baseline')
    expect(loadReview('nope')).toBeNull()
  })
})

describe('行内评论（file:line 回流）', () => {
  it('追加+幂等+回流收口；裁决后禁评论', () => {
    open()
    const c = { commentId: 'c1', file: 'src/a.ts', line: 42, body: '此处有 bug', at: 1, state: 'open' as const }
    addComment('r1', c)
    addComment('r1', c)  // 幂等
    expect(loadReview('r1')!.comments).toHaveLength(1)
    const r = resolveComment('r1', 'c1') as { comments: Array<{ state: string }> }
    expect(r.comments[0].state).toBe('resolved')
    setVerdict('r1', 'approve')
    const after = addComment('r1', { ...c, commentId: 'c2' }) as { error?: string }
    expect(after.error).toContain('已裁决')
  })
})

describe('三裁决一次定音 + evidence 联动', () => {
  it('approve → verification pass 证据；request_changes → fail；comment 不落证据；重裁被拒', () => {
    open('r2')
    setVerdict('r2', 'approve', 'LGTM')
    const ev = listEvidence('t1', 'verification')
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ evidenceId: 'review-r2', verdict: 'pass' })
    expect(ev[0].basis).toContain('LGTM')

    open('r3')
    setVerdict('r3', 'request_changes')
    expect(listEvidence('t1', 'verification').map((e) => e.verdict).sort()).toEqual(['fail', 'pass'])

    open('r4')
    setVerdict('r4', 'comment')
    expect(listEvidence('t1', 'verification')).toHaveLength(2)  // comment 不落证据

    const again = setVerdict('r4', 'approve') as { error?: string }
    expect(again.error).toContain('一次定音')
  })

  it('无 taskId 的评审裁决不落证据（零关联零账）', () => {
    openReview({ reviewId: 'r5', domain: 'uncommitted' })
    setVerdict('r5', 'approve')
    expect(listEvidence('t1', 'verification')).toHaveLength(0)
  })
})
