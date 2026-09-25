// /btw 侧问守门（cc：三态/合并回注/不改主方向）。
import { describe, it, expect } from 'vitest'
import { btwState, mergeBtwNote, type BtwExchange } from '../btw-sidebar'

const x = (over: Partial<BtwExchange> = {}): BtwExchange => ({
  exchangeId: 'b1', question: '这个函数干嘛的？', answer: null, at: 1, merged: false, ...over,
})

describe('/btw 侧问（cc 语义）', () => {
  it('三态判定；合并回注旁注语义；已合并/未答=null', () => {
    expect(btwState(x())).toBe('waiting')
    expect(btwState(x({ answer: '解析日期' }))).toBe('answered')
    expect(btwState(x({ answer: 'a', merged: true }))).toBe('merged')
    const note = mergeBtwNote(x({ answer: '解析日期' }))
    expect(note).toContain('[btw 旁注]')
    expect(note).toContain('不改主任务方向')
    expect(mergeBtwNote(x())).toBeNull()
    expect(mergeBtwNote(x({ answer: 'a', merged: true }))).toBeNull()
  })
})
