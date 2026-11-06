import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _useJudgmentStoreForTests, appendJudgment, listJudgments } from '../judgments'
import type { Person } from '../people'

const people: Person[] = [{ id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual', createdAt: 1 }]
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'judg-')); _useJudgmentStoreForTests(dir) })
afterEach(() => { _useJudgmentStoreForTests(null); rmSync(dir, { recursive: true, force: true }) })

describe('judgment records', () => {
  it('正常署名记录', () => {
    const r = appendJudgment({ unitId: 'aid-1', kind: 'acceptance', subjectRef: 'card-1', rationale: '复核了三条边界用例，结论正确，并核对了数据与权限评估', evidenceRefs: ['ev-1'] }, 'p-1', people)
    expect(r.ok).toBe(true)
    expect(listJudgments('aid-1')).toHaveLength(1)
    if (r.ok) expect(r.record.source).toBe('human-entry')
  })

  it('理由不足 20 字拒绝', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'acceptance', subjectRef: 'x', rationale: '太短', evidenceRefs: [] }, 'p-1', people).ok).toBe(false)
  })

  it('非在岗自然人拒绝', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'override', subjectRef: 'x', rationale: '业务方绕过审批扩大场景，依责任卡升级条件行使推翻权并留痕', evidenceRefs: [] }, 'p-x', people).ok).toBe(false)
  })

  it('subjectRef 必填', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'rejection', subjectRef: ' ', rationale: '打回原因：交付物未覆盖边界情况，要求补充用例后重交', evidenceRefs: [] }, 'p-1', people).ok).toBe(false)
  })

  it('append-only：再次追加不覆盖首条', () => {
    appendJudgment({ unitId: 'aid-2', kind: 'escalation', subjectRef: 'a', rationale: '第一条升级理由：关键规则无法验证，按升级条件上报值班负责人', evidenceRefs: [] }, 'p-1', people)
    appendJudgment({ unitId: 'aid-2', kind: 'pause', subjectRef: 'b', rationale: '第二条暂停理由：出现越权调用，按暂停条件立即停止并撤权', evidenceRefs: [] }, 'p-1', people)
    expect(listJudgments('aid-2')).toHaveLength(2)
  })
})
