// 主张-回执核验测试：无引用/不可解析/跨任务 → 未验证；全部可解析 → 通过。
import { describe, it, expect } from 'vitest'
import { receiptFactsOf, verifyClaims } from '../claims'

const facts = receiptFactsOf([{ evidenceId: 'ev-a' }, { evidenceId: 'ev-b' }])

describe('verifyClaims', () => {
  it('全部引用可解析 → verified 且 allVerified', () => {
    const r = verifyClaims('t1', [
      { id: 'c1', text: '修好了竞态', evidenceRefs: ['ev-a'] },
      { id: 'c2', text: '补了回归', evidenceRefs: ['ev-b'] },
    ], facts)
    expect(r.verified).toBe(2)
    expect(r.unverified).toBe(0)
    expect(r.allVerified).toBe(true)
  })

  it('无引用 → no_receipt（自述不等于证据）', () => {
    const r = verifyClaims('t1', [{ id: 'c1', text: '我改好了' }], facts)
    expect(r.allVerified).toBe(false)
    expect(r.claims[0].issues).toEqual(['no_receipt'])
    expect(r.claims[0].detail).toContain('自述不等于证据')
  })

  it('引用解析不到 → unresolvable_receipt；跨任务引用 → cross_task_receipt', () => {
    const r = verifyClaims('t1', [
      { id: 'c1', text: '有据', evidenceRefs: ['ev-ghost'] },
      { id: 'c2', text: '借别的任务的证据', evidenceRefs: ['ev-x'] },
    ], { ...facts, foreignEvidenceTask: new Map([['ev-x', 't2']]) })
    expect(r.claims[0].issues).toEqual(['unresolvable_receipt'])
    expect(r.claims[1].issues).toEqual(['cross_task_receipt'])
    expect(r.unverified).toBe(2)
  })

  it('混合引用：一条坏就整条未验证（部分可解析不等于通过）', () => {
    const r = verifyClaims('t1', [{ id: 'c1', text: '半真', evidenceRefs: ['ev-a', 'ev-ghost'] }], facts)
    expect(r.claims[0].status).toBe('unverified')
    expect(r.claims[0].resolved).toEqual(['ev-a'])
    expect(r.unverified).toBe(1)
  })

  it('空主张列表：allVerified=false 且说明「空列表不判通过」', () => {
    const r = verifyClaims('t1', [], facts)
    expect(r.allVerified).toBe(false)
    expect(r.note).toContain('不判通过')
  })

  it('重复引用去重后的 resolved 反映真实命中数', () => {
    const r = verifyClaims('t1', [{ id: 'c1', text: '重复引用同一证据', evidenceRefs: ['ev-a', 'ev-a'] }], facts)
    expect(r.claims[0].resolved).toEqual(['ev-a', 'ev-a'])
    expect(r.claims[0].status).toBe('verified')
  })
})
