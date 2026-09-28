// overlay/custom/client/matrix-chat/__tests__/linkify.test.ts
// P4 协作沟通增强①②守门（2026-09-28 §五）：
// card=t_xxx 卡链接化 + @当前登录人高亮 + XSS 先转义后链接红线。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { escapeHtml, linkifyPlainText } from '../utils/linkify'

describe('linkify 纯文本安全增强', () => {
  it('XSS 红线：原文中的标签永远以惰性文本出现（先转义后链接）', () => {
    const evil = '<img src=x onerror=alert(1)> <script>alert(2)</script> card=t_abc123'
    const { html } = linkifyPlainText(evil, 'fanfan')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;script')
    // 卡链接仍正常生成（落点=驾驶舱看板预选，与 onHandleTask 同源）
    expect(html).toContain('href="#/app/board?task=t_abc123"')
  })

  it('card=t_xxx 链接化：href 深链看板卡 + 多个去重 + card: 写法兼容', () => {
    const { html, cardIds } = linkifyPlainText('派发 card=t_f52893c4 请处理，关联 card: t_ab12cd 与 card=t_f52893c4', null)
    expect(cardIds).toEqual(['t_f52893c4', 't_ab12cd'])
    expect(html.match(/mx-card-link/g)?.length).toBe(3) // 三处都链接化
    expect(html).toContain('card=t_f52893c4</a>')
  })

  it('@当前登录人高亮：短名/全形/大小写不敏感；他人不高亮', () => {
    const mine = linkifyPlainText('@fanfan 请确认，@wei:matrix.test 同步知悉', 'fanfan')
    expect(mine.mentionsMe).toBe(true)
    expect(mine.html).toContain('<span class="mx-mention-me">@fanfan</span>')
    expect(mine.html).toContain('<span class="mx-mention">@wei:matrix.test</span>')
    expect(mine.html).not.toContain('mx-mention-me">@wei')

    const byHost = linkifyPlainText('任务交给 @Fanfan:matrix.test', 'fanfan')
    expect(byHost.mentionsMe).toBe(true)

    const nobody = linkifyPlainText('@fanfan 请确认', null)
    expect(nobody.mentionsMe).toBe(false)
    expect(nobody.html).toContain('<span class="mx-mention">@fanfan</span>')
  })

  it('卡 id 字符集受限：注入 payload 不会借 href 逃逸', () => {
    const { html, cardIds } = linkifyPlainText('card=t_ab12"><script>alert(1)</script>', null)
    // t_ab12 命中（合法前缀），引号部分在转义层即惰性化
    expect(cardIds).toEqual(['t_ab12'])
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('无命中时 html 等于 escapeHtml(原文)；空串安全', () => {
    const plain = '普通消息 没有卡和提及'
    const r = linkifyPlainText(plain, 'fanfan')
    expect(r.html).toBe(escapeHtml(plain))
    expect(r.cardIds).toEqual([])
    expect(r.mentionsMe).toBe(false)
    expect(linkifyPlainText('', 'fanfan').html).toBe('')
  })

  it('escapeHtml 五字符全覆盖', () => {
    expect(escapeHtml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f')
  })
})
