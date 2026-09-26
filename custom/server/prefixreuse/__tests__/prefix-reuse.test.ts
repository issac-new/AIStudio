// 前缀复用数据面守门（设计文档 §2：链式指纹/断裂检测/回退语义）。
import { describe, it, expect } from 'vitest'
import { buildPrefixChain, verifyPrefix, reusePlan, type Message } from '../prefix-reuse'

const msgs = (n: number): Message[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))

describe('buildPrefixChain（链式指纹）', () => {
  it('改任何历史其后全变；未改前缀不变', () => {
    const a = buildPrefixChain(msgs(6))
    const edited = msgs(6)
    edited[3].content = 'tampered'
    const b = buildPrefixChain(edited)
    expect(b[0]).toBe(a[0])
    expect(b[2]).toBe(a[2])
    expect(b[3]).not.toBe(a[3])
    expect(b[5]).not.toBe(a[5])
  })
})

describe('verifyPrefix + reusePlan', () => {
  it('指纹一致→增量只发 suffix', () => {
    const chain = buildPrefixChain(msgs(8))
    const v = verifyPrefix(chain, 5, chain[5])
    expect(v).toEqual({ reusableCount: 6, consistent: true })
    const plan = reusePlan(msgs(8), v)
    expect(plan.mode).toBe('incremental')
    expect(plan.suffix.map((m) => m.content)).toEqual(['m6', 'm7'])
  })

  it('历史改写→不一致→全量回退（compact 路径同覆盖）', () => {
    const original = buildPrefixChain(msgs(6))
    const rewritten = msgs(6)
    rewritten[2].content = 'compacted'
    const v = verifyPrefix(buildPrefixChain(rewritten), 4, original[4])
    expect(v.consistent).toBe(false)
    const plan = reusePlan(rewritten, v)
    expect(plan.mode).toBe('full')
    expect(plan.suffix).toHaveLength(6)
  })

  it('越界验证点拒（0 复用）', () => {
    const chain = buildPrefixChain(msgs(3))
    expect(verifyPrefix(chain, 9, chain[0]).consistent).toBe(false)
    expect(verifyPrefix(chain, -1, chain[0]).consistent).toBe(false)
  })
})
