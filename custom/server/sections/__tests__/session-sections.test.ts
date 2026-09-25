// 会话分节守门（codex：定义幂等/手动 move/汇总）。
import { describe, it, expect } from 'vitest'
import { defineSection, moveTurn, sectionView } from '../session-sections'

describe('会话分节（codex 语义）', () => {
  it('定义幂等（重定义改标题）；move 跨节重排；汇总计数', () => {
    let secs = defineSection([], 's1', '登录部分', [0, 1, 2])
    secs = defineSection(secs, 's2', '测试部分', [3])
    secs = defineSection(secs, 's1', '登录与修复')  // 幂等改标题
    expect(secs.find((s) => s.sectionId === 's1')!.title).toBe('登录与修复')

    secs = moveTurn(secs, 's1', 's2', 1)
    expect(secs.find((s) => s.sectionId === 's1')!.turnIndices).toEqual([0, 2])
    expect(secs.find((s) => s.sectionId === 's2')!.turnIndices).toEqual([1, 3])  // 排序
    expect(sectionView(secs)).toEqual([
      { sectionId: 's1', title: '登录与修复', turnCount: 2 },
      { sectionId: 's2', title: '测试部分', turnCount: 2 },
    ])
    // 无效 move 原样返回
    expect(moveTurn(secs, 's1', 's1', 0)).toHaveLength(2)
    expect(moveTurn(secs, 'nope', 's1', 0)).toHaveLength(2)
  })
})
