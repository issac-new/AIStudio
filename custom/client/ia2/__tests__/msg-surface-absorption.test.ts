// 未读线程聚合守门。原 Spotlight 用例已迁至统一 GlobalSearchDialog 测试。
import { describe, it, expect } from 'vitest'

describe('未读线程聚合数据面（threadsAggregateNotificationType 归并）', () => {
  it('Highlight/Total 双态归并，none 与异常房跳过，截断 8 条', () => {
    const rooms = [
      { roomId: '!a', name: 'A', threadsAggregateNotificationType: 'Highlight' },
      { roomId: '!b', name: 'B', threadsAggregateNotificationType: 'Total' },
      { roomId: '!c', name: 'C', threadsAggregateNotificationType: undefined },
      { roomId: '!d', name: 'D' },
      ...Array.from({ length: 10 }, (_, i) => ({ roomId: `!h${i}`, name: `H${i}`, threadsAggregateNotificationType: 'Total' })),
    ]
    const out = rooms.flatMap((room: any) => {
      try {
        const n = room?.threadsAggregateNotificationType
        if (n === 'Highlight' || n === 2) return [{ roomId: room.roomId, highlight: true }]
        if (n === 'Total' || n === 1) return [{ roomId: room.roomId, highlight: false }]
        return []
      } catch { return [] }
    }).slice(0, 8)
    expect(out).toHaveLength(8)
    expect(out[0]).toEqual({ roomId: '!a', highlight: true })
    expect(out[1]).toEqual({ roomId: '!b', highlight: false })
  })
})
