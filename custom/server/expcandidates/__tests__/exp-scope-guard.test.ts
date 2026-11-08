// 经验作用域与反思守卫守护（EvoTeam 吸收，2026-11-08）：
// scope 过滤（列/specialist 两维）、批准时拒收泛泛/过窄/自相矛盾。
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { experienceInScope, selectableExperiences } from '../exp-inject'
import { ReflectionGuardError, _useStoreDirForTests, curateCandidate, listCandidates, writeExpStore } from '../exp-store'
import type { ExpCandidate } from '../exp-types'
import { validateReflectionStatement } from '../reflection-guard'

const dir = mkdtempSync(join(tmpdir(), 'exp-scope-guard-'))
_useStoreDirForTests(dir)
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => { rmSync(join(dir, 'exp-candidates.json'), { force: true }) })

function cand(id: string, extra: Partial<ExpCandidate> = {}): ExpCandidate {
  return {
    id,
    type: 'sop',
    statement: `经验 ${id}：同类任务先备齐证据再提交`,
    fingerprint: `fp-${id}`,
    evidence: [],
    status: 'approved',
    createdAt: 't',
    updatedAt: `t-${id}`,
    injectedRuns: [],
    ...extra,
  }
}

describe('经验作用域', () => {
  it('无 scope 视为全局；列命中才保留；列限定但当前列缺席→排除（不猜）', () => {
    expect(experienceInScope(cand('a'), { column: 'review' })).toBe(true)
    const scoped = cand('b', { scope: { columns: ['review'] } })
    expect(experienceInScope(scoped, { column: 'review' })).toBe(true)
    expect(experienceInScope(scoped, { column: 'devimpl' })).toBe(false)
    expect(experienceInScope(scoped, {})).toBe(false)
  })

  it('specialist 维度同理；两维同时限定需同时命中', () => {
    const scoped = cand('c', { scope: { columns: ['review'], specialists: ['review-guard'] } })
    expect(experienceInScope(scoped, { column: 'review', specialist: 'review-guard' })).toBe(true)
    expect(experienceInScope(scoped, { column: 'review', specialist: 'dev-crafter' })).toBe(false)
    expect(experienceInScope(scoped, { column: 'review' })).toBe(false)
  })

  it('selectableExperiences 按作用域过滤且封顶 3', () => {
    const list = [
      cand('g1'), cand('g2'), cand('g3'), cand('g4'),
      cand('r1', { scope: { columns: ['review'] } }),
      cand('d1', { scope: { columns: ['devimpl'] } }),
    ]
    const review = selectableExperiences(list, { column: 'review' })
    expect(review.map((c) => c.id)).toContain('r1')
    expect(review.map((c) => c.id)).not.toContain('d1')
    expect(review.length).toBeLessThanOrEqual(3)
  })
})

describe('反思守卫', () => {
  it('可执行陈述通过', () => {
    const r = validateReflectionStatement('交接前必须附改动文件清单与复现命令，缺失则退回补齐')
    expect(r.ok).toBe(true)
  })

  it('泛泛而谈拒收（英文/中文）', () => {
    expect(validateReflectionStatement('Always verify the result carefully').ok).toBe(false)
    expect(validateReflectionStatement('务必仔细检查所有结果是否正确').ok).toBe(false)
  })

  it('文件行号级过窄拒收', () => {
    const r = validateReflectionStatement('修改 src/server/foo.ts:128 处的判断条件再提交')
    expect(r.ok).toBe(false)
    expect(r.reasons.join('')).toContain('过窄')
  })

  it('过短拒收', () => {
    expect(validateReflectionStatement('先验证').ok).toBe(false)
  })

  it('与既有经验自相矛盾拒收', () => {
    const r = validateReflectionStatement('为了速度可以跳过测试直接提交，先验证逻辑即可', ['发布前必须运行测试，禁止跳过测试'])
    expect(r.ok).toBe(false)
    expect(r.reasons.join('')).toContain('自相矛盾')
  })
})

describe('curateCandidate 批准门', () => {
  it('泛泛陈述批准 → ReflectionGuardError，状态不落 approved', () => {
    writeExpStore({ candidates: [cand('bad', { statement: '总是要仔细检查，确保一切正确', status: 'candidate' })], nextSeq: 2 })
    expect(() => curateCandidate('bad', 'approved')).toThrow(ReflectionGuardError)
    // 状态未被改动
    expect(listCandidates()[0].status).toBe('candidate')
  })

  it('可执行陈述批准成功；拒绝/回退不受守卫影响', () => {
    writeExpStore({
      candidates: [
        cand('good', { statement: '交接前必须附改动文件清单、复现命令与未验证项，缺项退回补齐', status: 'candidate' }),
        cand('plain', { statement: '总是要仔细检查，确保一切正确', status: 'candidate' }),
      ],
      nextSeq: 3,
    })
    expect(curateCandidate('good', 'approved').status).toBe('approved')
    expect(curateCandidate('plain', 'rejected').status).toBe('rejected')
    expect(curateCandidate('plain', 'candidate').status).toBe('candidate')
  })
})
