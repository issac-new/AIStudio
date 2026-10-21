// AGT 吸收轮 B（2026-10-21）：前向 hash 链共用件单测——防篡改判定面。
import { describe, expect, it } from 'vitest'
import { GENESIS, chainHashOfEntry, verifyForwardChain } from '../forward-chain'

interface Rec { ts: number; text: string; prevHash?: string; hash?: string }

function chainOf(texts: string[]): Rec[] {
  const out: Rec[] = []
  let prev = GENESIS
  for (const text of texts) {
    const rec: Rec = { ts: out.length, text }
    rec.prevHash = prev
    rec.hash = chainHashOfEntry(rec)
    out.push(rec)
    prev = rec.hash
  }
  return out
}

describe('forward-chain（防篡改前向链）', () => {
  it('干净链：全部 chained_ok 且 intact', () => {
    const v = verifyForwardChain(chainOf(['a', 'b', 'c']))
    expect(v.intact).toBe(true)
    expect(v.chained).toBe(3)
    expect(v.unchained).toBe(0)
    expect(v.firstBroken).toBeNull()
  })

  it('改写历史：被改条 hash_mismatch，intact=false，firstBroken 指向该条', () => {
    const entries = chainOf(['a', 'b', 'c'])
    entries[1].text = '篡改'
    const v = verifyForwardChain(entries)
    expect(v.intact).toBe(false)
    expect(v.firstBroken).toBe(1)
    expect(v.checks[1].status).toBe('hash_mismatch')
  })

  it('删除中插：后条 link_broken 现形', () => {
    const entries = chainOf(['a', 'b', 'c', 'd'])
    entries.splice(1, 1) // 删 b
    const v = verifyForwardChain(entries)
    expect(v.intact).toBe(false)
    expect(v.checks.some((c) => c.status === 'link_broken')).toBe(true)
  })

  it('前链时代记录（无 hash 字段）：unchained 如实标注，不算破链', () => {
    const legacy: Rec[] = [{ ts: 0, text: 'old1' }, { ts: 1, text: 'old2' }]
    const v = verifyForwardChain([...legacy, ...chainOf(['a'])])
    expect(v.unchained).toBe(2)
    expect(v.chained).toBe(1)
    expect(v.intact).toBe(true)
  })

  it('轮转/裁剪断锚：链首 prevHash 非 GENESIS → anchor_dangling，不算篡改', () => {
    const full = chainOf(['a', 'b', 'c'])
    const trimmed = full.slice(1) // 裁掉链首
    const v = verifyForwardChain(trimmed)
    expect(v.checks[0].status).toBe('anchor_dangling')
    expect(v.intact).toBe(true)
  })

  it('伪造追加（带假 hash）：hash_mismatch 现形', () => {
    const entries = chainOf(['a', 'b'])
    entries.push({ ts: 2, text: '伪造', prevHash: entries[1].hash, hash: '0'.repeat(64) })
    const v = verifyForwardChain(entries)
    expect(v.intact).toBe(false)
    expect(v.checks[2].status).toBe('hash_mismatch')
  })
})
