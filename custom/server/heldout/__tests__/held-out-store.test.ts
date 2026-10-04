// held-out 密封评测库单测（P7）：防泄露契约逐条锁定。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createSet, listSets, scoreSet, MAX_ATTEMPTS_PER_ACTOR } from '../held-out-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heldout-test-'))
  process.env.HELDOUT_STORE = dir
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.HELDOUT_STORE
})

const ITEMS = [
  { prompt: 'q1', expected: 'a1' },
  { prompt: 'q2', expected: 'a2' },
  { prompt: 'q3', expected: 'a3' },
]

function seeded(): string {
  const res = createSet({ name: 'distill-v1', items: ITEMS }, 'tester') as { ok: true; meta: { id: string } }
  return res.meta.id
}

describe('P7 防泄露契约', () => {
  it('契约1：listSets 只回元数据——JSON 序列化全文不含任何题目内容', () => {
    const id = seeded()
    const metas = listSets()
    const dump = JSON.stringify(metas)
    expect(dump).not.toContain('q1')
    expect(dump).not.toContain('a1')
    expect(metas[0]).toMatchObject({ id, name: 'distill-v1', itemCount: 3 })
  })

  it('契约2：score 只回聚合——响应不含逐条对错、不含回显答案/期望', () => {
    const id = seeded()
    const res = scoreSet(id, [{ index: 0, answer: 'a1' }, { index: 1, answer: 'wrong' }, { index: 2, answer: 'A3' }], 'agent-x') as { ok: true; result: unknown }
    const dump = JSON.stringify(res)
    expect(res.ok).toBe(true)
    expect(dump).not.toContain('wrong')
    expect(dump).not.toContain('a1')
    expect(res.result).toMatchObject({ n: 3, passRate: 2 / 3 })
  })

  it('契约3：限次——同调用方第 4 次拒绝且 attemptsLeft=0；不同调用方独立计数', () => {
    const id = seeded()
    for (let i = 0; i < MAX_ATTEMPTS_PER_ACTOR; i++) {
      expect(scoreSet(id, [{ index: 0, answer: 'x' }], 'agent-x').ok).toBe(true)
    }
    const blocked = scoreSet(id, [{ index: 0, answer: 'x' }], 'agent-x') as { ok: false; attemptsLeft: number }
    expect(blocked.ok).toBe(false)
    expect(blocked.attemptsLeft).toBe(0)
    // 别的调用方不受影响
    expect(scoreSet(id, [{ index: 0, answer: 'x' }], 'agent-y').ok).toBe(true)
    // 尝试账透明可审计（元数据可见计数）
    expect(listSets()[0]!.attemptCount).toBe(MAX_ATTEMPTS_PER_ACTOR + 1)
  })
})

describe('P7 输入校验', () => {
  it('建集：空 items/空字段/重名拒绝', () => {
    expect(createSet({ name: '', items: ITEMS }, 't').ok).toBe(false)
    expect(createSet({ name: 'x', items: [] }, 't').ok).toBe(false)
    expect(createSet({ name: 'x', items: [{ prompt: '', expected: 'a' }] }, 't').ok).toBe(false)
    seeded()
    expect(createSet({ name: 'distill-v1', items: ITEMS }, 't').ok).toBe(false)
  })

  it('评分：index 越界/重复/非字符串答案拒绝；未作答条目按错计', () => {
    const id = seeded()
    expect(scoreSet(id, [], 't').ok).toBe(false)
    expect(scoreSet(id, [{ index: 99, answer: 'x' }], 't').ok).toBe(false)
    expect(scoreSet(id, [{ index: 0, answer: 'x' }, { index: 0, answer: 'y' }], 't').ok).toBe(false)
    expect(scoreSet(id, [{ index: 0, answer: 1 as unknown as string }], 't').ok).toBe(false)
    // 只答 1 条且对：passRate=1/3（不奖励跳答）
    const res = scoreSet(id, [{ index: 0, answer: 'a1' }], 't2') as { ok: true; result: { passRate: number } }
    expect(res.result.passRate).toBeCloseTo(1 / 3)
  })

  it('大小写与首尾空白不敏感', () => {
    const id = seeded()
    const res = scoreSet(id, [{ index: 0, answer: '  A1 ' }, { index: 1, answer: 'a2' }, { index: 2, answer: 'a3' }], 't3') as { ok: true; result: { passRate: number } }
    expect(res.result.passRate).toBe(1)
  })
})
