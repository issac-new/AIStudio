// @提及域合并守门（#9：六源前缀/派单兼容/未知前缀/汇总）。
import { describe, it, expect } from 'vitest'
import { mentionSummary, resolveMentions } from '../utils/mention-resolution'

describe('@提及统一解析（六源+派单合并口径）', () => {
  it('六源前缀形式；裸 @word=派单 agent 兼容 #7', () => {
    const refs = resolveMentions('@file:src/a.ts @session:sess-1 @skill:review @squad/core @zcode')
    expect(refs.map((r) => [r.kind, r.target])).toEqual([
      ['file', 'src/a.ts'], ['session', 'sess-1'], ['skill', 'review'],
      ['squad', 'core'], ['agent', 'zcode'],
    ])
    expect(refs.slice(0, 4).every((r) => r.resolved)).toBe(true)
    expect(refs[4].resolved).toBe(false)  // 裸 agent 待派单面解析
  })

  it('斜杠形式同义；未知前缀按文件路径尝试；重复去重', () => {
    const refs = resolveMentions('@skill/x @bogus/target @a @a')
    expect(refs[0]).toMatchObject({ kind: 'skill', target: 'x' })
    expect(refs[1]).toMatchObject({ kind: 'file', target: 'bogus/target', resolved: false })
    expect(refs).toHaveLength(3)  // @a 去重
  })

  it('合并口径汇总', () => {
    const refs = resolveMentions('@file:a @skill:b @zcode @squad/s')
    expect(mentionSummary(refs)).toEqual({ sixSource: 2, dispatch: 2, unresolved: 1 })  // squad 前缀已解析，仅裸 @zcode 待派单解析
  })
})
