// 同名房间消歧守门（推演审计二轮 U5）：同名尾缀短房 ID，唯一名不加噪音。
import { describe, it, expect } from 'vitest'
import { duplicateNames, shortRoomId } from '../utils/room-disambig'

describe('同名房间消歧（room-disambig）', () => {
  it('同名 ≥2 次进消歧集合；唯一名不进', () => {
    const dup = duplicateNames(['支付收银台需求分析讨论群', '支付收银台需求分析讨论群', 'delivery-dlv-run-092528'])
    expect(dup.has('支付收银台需求分析讨论群')).toBe(true)
    expect(dup.has('delivery-dlv-run-092528')).toBe(false)
    expect(dup.size).toBe(1)
  })

  it('全唯一时集合为空（零噪音）', () => {
    expect(duplicateNames(['a', 'b', 'c']).size).toBe(0)
    expect(duplicateNames([]).size).toBe(0)
  })

  it('短房 ID 去 ! 前缀与 host，取前 8 位', () => {
    expect(shortRoomId('!mNFDYqvKSdjuNjt|tgYS:matrix.test')).toBe('mNFDYqvK')
    expect(shortRoomId('!abc123456:example.org')).toBe('abc12345')
  })
})
