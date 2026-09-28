// P4① 卡链接（群聊面接线）守门：card= 引用转看板深链 markdown；无命中零改动。
import { describe, it, expect } from 'vitest'
import { cardRefsToMarkdownLinks } from '../utils/group-body-links'

describe('group-body-links（P4① 群聊卡链接）', () => {
  it('card=t_xxx 与 card: t_xxx 双写法都转深链 markdown', () => {
    expect(cardRefsToMarkdownLinks('双凭证：commit=61f3dcf card=t_9e5c6c18 请复核'))
      .toBe('双凭证：commit=61f3dcf [📋 t_9e5c6c18](#/app/board?task=t_9e5c6c18) 请复核')
    expect(cardRefsToMarkdownLinks('见 card: t_4b12eb64。'))
      .toBe('见 [📋 t_4b12eb64](#/app/board?task=t_4b12eb64)。')
  })

  it('多处引用逐一转换', () => {
    const out = cardRefsToMarkdownLinks('主卡 card=t_9e5c6c18 拆单 card=t_4b12eb64')
    expect(out).toContain('task=t_9e5c6c18')
    expect(out).toContain('task=t_4b12eb64')
    expect((out.match(/📋/g) || []).length).toBe(2)
  })

  it('无命中原样返回；空串安全', () => {
    expect(cardRefsToMarkdownLinks('普通消息无引用')).toBe('普通消息无引用')
    expect(cardRefsToMarkdownLinks('')).toBe('')
    // 非任务号不误转
    expect(cardRefsToMarkdownLinks('card=x_1234 card=t_')).not.toContain('](#')
  })
})
