// /review 评审域守门（codex-product §五 P0-1：两域/行内评论/三裁决一次定音/evidence 联动）。
// S-A 文件名哈希/身份校验、S-B 坏档隔离与 evidence 断链标记、S-D 字段上限在此守门。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  addComment, isReviewVerdict, loadReview, openReview, resolveComment, reviewFile, setVerdict,
  type ReviewRecord,
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
    const first = setVerdict('r2', 'approve', 'LGTM') as ReviewRecord
    expect(first.evidencePending).toBeUndefined()  // 落账成功无待补标记
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

  it('裁决→evidence 落账失败标 evidencePending + warn（S-B：不再静默断链）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocker = join(edir, 'blocker')
    writeFileSync(blocker, 'x', 'utf8')  // 占住目录位 → evidence 落盘必失败
    process.env.HERMES_EVIDENCE_DIR = blocker
    open('r6')
    const rec = setVerdict('r6', 'approve', 'LGTM') as ReviewRecord
    expect(rec.evidencePending).toBe(true)                 // 响应里可见
    expect(loadReview('r6')?.evidencePending).toBe(true)   // 落盘可查（待补账）
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('文件名哈希化（S-A：清洗名多对一 = 整账覆写销毁）', () => {
  it('清洗名多对一的 reviewId 各自独立评审', () => {
    expect('r/1'.replace(/[^A-Za-z0-9._-]/g, '_')).toBe('r_1')  // 缺陷前提
    expect(reviewFile('r/1')).not.toBe(reviewFile('r_1'))
    openReview({ reviewId: 'r/1', domain: 'baseline' })
    openReview({ reviewId: 'r_1', domain: 'uncommitted' })
    expect(loadReview('r/1')?.domain).toBe('baseline')
    expect(loadReview('r_1')?.domain).toBe('uncommitted')
  })

  it('旧清洗命名兼容读取 + 命中即迁移', () => {
    writeFileSync(join(rdir, 'r1.json'), JSON.stringify({
      reviewId: 'r1', domain: 'baseline', createdAt: 1, comments: [],
    }), 'utf8')
    expect(loadReview('r1')?.domain).toBe('baseline')
    expect(existsSync(reviewFile('r1'))).toBe(true)          // 已迁到哈希名
    expect(existsSync(join(rdir, 'r1.json'))).toBe(false)
  })

  it('文件内 reviewId 不符拒绝写入并报码（不覆写他人评审）', () => {
    const foreign = JSON.stringify({ reviewId: 'other', domain: 'baseline', createdAt: 1, comments: [] })
    writeFileSync(reviewFile('r1'), foreign, 'utf8')
    const res = addComment('r1', { commentId: 'c1', file: 'a.ts', line: 1, body: 'x', at: 1, state: 'open' })
    expect((res as { error: string }).error).toContain('identity_mismatch')
    expect(readFileSync(reviewFile('r1'), 'utf8')).toBe(foreign)  // 原样未覆写
    expect(() => openReview({ reviewId: 'r1', domain: 'uncommitted' })).toThrow(/identity_mismatch/)
    expect(readFileSync(reviewFile('r1'), 'utf8')).toBe(foreign)
    expect((setVerdict('r1', 'approve') as { error: string }).error).toContain('identity_mismatch')
    expect(readFileSync(reviewFile('r1'), 'utf8')).toBe(foreign)
  })

  it('坏文件隔离 .corrupt 留档 + 可续写（不再静默当"评审不存在"）', () => {
    writeFileSync(reviewFile('r1'), '{{bad', 'utf8')
    expect(loadReview('r1')).toBeNull()
    expect(existsSync(`${reviewFile('r1')}.corrupt`)).toBe(true)   // 坏档留档不销毁
    expect(openReview({ reviewId: 'r1', domain: 'uncommitted' }).reviewId).toBe('r1')
    expect(loadReview('r1')?.comments).toEqual([])
  })
})

describe('字段上限与 actor 留痕（S-D/S-E）', () => {
  it('评论正文/裁决 note 截 4000', () => {
    open()
    const res = addComment('r1', {
      commentId: 'c1', file: 'src/a.ts', line: 1, body: 'b'.repeat(5000), at: 1, state: 'open',
    }) as ReviewRecord
    expect(res.comments[0].body).toHaveLength(4000)
    open('r2')
    const v = setVerdict('r2', 'approve', 'n'.repeat(5000)) as ReviewRecord
    expect(v.verdict?.note).toHaveLength(4000)
  })

  it('actor 落痕：opener/评论者/裁决者各一道', () => {
    openReview({ reviewId: 'r1', taskId: 't1', domain: 'baseline', actor: 'alice' })
    addComment('r1', { commentId: 'c1', file: 'a.ts', line: 1, body: 'x', at: 1, state: 'open', actor: 'bob' })
    const rec = setVerdict('r1', 'approve', undefined, 'carol') as ReviewRecord
    expect(rec.actor).toBe('alice')
    expect(rec.comments[0].actor).toBe('bob')
    expect(rec.verdict?.actor).toBe('carol')
    expect(listEvidence('t1', 'verification')[0].actor).toBe('carol')  // 裁决证据同痕
  })
})
