// 批四 T3 接线守门（spec 2026-11-21-ai-native-orgworkbench-batch4.md §三）：
// curateCandidate 权威写成功 → 决策图谱 recordLearningDecision 被调（统一决策引用）；
// recorder 抛异常不阻断审核主链路（fire-and-forget）。
// mock 模式照 autonomy-ladder 先例：vi.hoisted + vi.mock 拦截 decision-recorder。
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _useStoreDirForTests, curateCandidate, readExpStore, writeExpStore,
} from '../exp-store'
import type { ExpCandidate } from '../exp-types'

const recordLearningDecision = vi.hoisted(() => vi.fn())
vi.mock('../../decisiongraph/decision-recorder', () => ({ recordLearningDecision }))

const dir = mkdtempSync(join(tmpdir(), 'expcandidates-dg-'))
_useStoreDirForTests(dir)
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => {
  rmSync(join(dir, 'exp-candidates.json'), { force: true })
  recordLearningDecision.mockReset()
})

/** 直接入库一条候选（store 公共 API；陈述 ≥10 字且不命中泛泛/过窄/矛盾词表，可过反思守卫）。 */
function seedCandidate(id: string, status: ExpCandidate['status'] = 'candidate'): void {
  const store = readExpStore()
  store.candidates.push({
    id,
    type: 'sop',
    statement: '合同建模前先与验收负责人对齐指标口径再动笔',
    fingerprint: `fp-${id}`,
    evidence: [],
    status,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
    injectedRuns: [],
  })
  store.nextSeq += 1
  writeExpStore(store)
}

describe('curateCandidate → 决策图谱接线（批四 T3）', () => {
  it('真实状态迁移（candidate→probation[批一 b 批准落点] / probation→rejected）→ recorder 被调，入参带 from/to', () => {
    seedCandidate('exp-001')
    const approved = curateCandidate('exp-001', 'approved')
    // 批一 b 变更 3：批准落 probation（试用期）；决策记录按真实迁移记 to=probation
    expect(approved.status).toBe('probation')
    expect(recordLearningDecision).toHaveBeenCalledTimes(1)
    expect(recordLearningDecision).toHaveBeenCalledWith({ candidateId: 'exp-001', from: 'candidate', to: 'probation' })

    const rejected = curateCandidate('exp-001', 'rejected')
    expect(rejected.status).toBe('rejected')
    expect(recordLearningDecision).toHaveBeenCalledTimes(2)
    expect(recordLearningDecision).toHaveBeenLastCalledWith({ candidateId: 'exp-001', from: 'probation', to: 'rejected' })
  })

  it('同状态重写不是决定（candidate→candidate）→ recorder 不被调', () => {
    seedCandidate('exp-002')
    const again = curateCandidate('exp-002', 'candidate')
    expect(again.status).toBe('candidate')
    expect(recordLearningDecision).not.toHaveBeenCalled()
  })

  it('审查 I-2：effect_unknown 挂人工后 approve=显式转正（probation→approved）→ recorder 记人工决定', () => {
    seedCandidate('exp-004')
    // 先推进到 effect_unknown（二次样本不足结算终态——直接造档等价）
    const store = readExpStore()
    const c = store.candidates.find((x) => x.id === 'exp-004')!
    c.status = 'probation'
    c.probation = { startedAt: '2026-11-01T00:00:00.000Z', windowTasks: 20, minSamples: 5, settledAt: '2026-11-10T00:00:00.000Z', verdict: 'effect_unknown' }
    writeExpStore(store)
    const r = curateCandidate('exp-004', 'approved')
    expect(r.status).toBe('approved')
    expect(r.probation?.verdict).toBe('manual_approved')
    expect(recordLearningDecision).toHaveBeenCalledWith({ candidateId: 'exp-004', from: 'probation', to: 'approved' })
  })

  it('recorder 抛异常 → 审核主链路不受影响（fire-and-forget：返回值与落盘照常）', () => {
    recordLearningDecision.mockImplementation(() => { throw new Error('KG bridge down') })
    seedCandidate('exp-003')
    const r = curateCandidate('exp-003', 'approved')
    expect(r.status).toBe('probation')
    expect(readExpStore().candidates.find((c) => c.id === 'exp-003')?.status).toBe('probation')
  })

  it('候选不存在 → 原有异常行为不变，recorder 不被调', () => {
    expect(() => curateCandidate('exp-999', 'approved')).toThrow('不存在')
    expect(recordLearningDecision).not.toHaveBeenCalled()
  })
})
