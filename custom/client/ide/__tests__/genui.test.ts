// G6 Gen UI 指令解析守门：key=value / JSON 双形态、代码块排除、路径安全、工作区边界、CSP。
import { describe, it, expect } from 'vitest'
import {
  parseGenUiDirectives, isSafeGenUiPath, isWithinWorkspace, collectGenUiReferences,
  wrapGenUiHtml, GEN_UI_SRCDOC_CSP,
} from '../utils/genui'

describe('parseGenUiDirectives', () => {
  it('key=value 与 JSON 两形态都解析，保留 offset/mode/title', () => {
    const text = '前文 ::visualize{path="/w/a.html" title="体积" mode="wide"} 后文\n::visualize{"path":"/w/b.html","title":"B"}'
    const r = parseGenUiDirectives(text)
    expect(r.references.map(x => x.path)).toEqual(['/w/a.html', '/w/b.html'])
    expect(r.references[0]).toMatchObject({ title: '体积', mode: 'wide' })
    expect(r.references[1].title).toBe('B')
    expect(r.references[0].offset).toBe(text.indexOf('::visualize'))
  })

  it('代码块/未闭合围栏内的示例忽略', () => {
    expect(parseGenUiDirectives('```text\n::visualize{path="/w/x.html"}\n```').references).toHaveLength(0)
    expect(parseGenUiDirectives('```\n::visualize{"path":"/w/x.html"}').references).toHaveLength(0)
  })

  it('非法路径/URL/相对/含 ../协议/mode 非法：计数 invalid 且不入列', () => {
    const bad = [
      '::visualize{path="https://x/y.html"}',
      '::visualize{path="relative/a.html"}',
      '::visualize{path="/w/../etc/passwd"}',
      '::visualize{title="no path"}',
      '::visualize{path=/w/a.html}',
    ].join('\n')
    const r = parseGenUiDirectives(bad)
    expect(r.references).toHaveLength(0)
    expect(r.invalid).toBeGreaterThanOrEqual(5)
    // mode 非法只丢 mode，不丢引用
    expect(parseGenUiDirectives('::visualize{path="/w/a.html" mode="fullscreen2"}').references[0]).toMatchObject({ path: '/w/a.html' })
  })

  it('大括号在标题串内/转义引号不破坏平衡', () => {
    const r = parseGenUiDirectives('::visualize{path="/w/a.html" title="Group {A} \\"B\\""}')
    expect(r.references[0].title).toBe('Group {A} "B"')
  })
})

describe('path safety', () => {
  it('isSafeGenUiPath：绝对 POSIX/盘符可，URL/相对/.. /控制字符不可', () => {
    expect(isSafeGenUiPath('/w/a.html')).toBe(true)
    expect(isSafeGenUiPath('C:/w/a.html')).toBe(true)
    expect(isSafeGenUiPath('https://x')).toBe(false)
    expect(isSafeGenUiPath('a/b')).toBe(false)
    expect(isSafeGenUiPath('/w/../../etc')).toBe(false)
    expect(isSafeGenUiPath('/w/a\nb')).toBe(false)
  })

  it('isWithinWorkspace：根内可，根外/前缀相似不可', () => {
    expect(isWithinWorkspace('/w/a.html', '/w')).toBe(true)
    expect(isWithinWorkspace('/w', '/w')).toBe(true)
    expect(isWithinWorkspace('/w2/a.html', '/w')).toBe(false)
    expect(isWithinWorkspace('/w/a.html', null)).toBe(true)
  })
})

describe('collectGenUiReferences', () => {
  it('只取 assistant/system，去重，过滤工作区外路径', () => {
    const list = collectGenUiReferences([
      { id: 'u1', role: 'user', content: '::visualize{path="/w/u.html"}' },
      { id: 'a1', role: 'assistant', content: '::visualize{path="/w/a.html"} ::visualize{path="/other/x.html"}' },
      { id: 'a2', role: 'assistant', content: '::visualize{path="/w/a.html"}' },
    ], '/w')
    expect(list.map(x => x.path)).toEqual(['/w/a.html'])
    expect(list[0].messageId).toBe('a1')
  })
})

describe('wrapGenUiHtml', () => {
  it('注入 CSP；有 head 时插到 head 内，无 head 时包完整文档', () => {
    const a = wrapGenUiHtml('<html><head><meta charset="utf-8"></head><body>x</body></html>', 'T')
    expect(a).toContain(GEN_UI_SRCDOC_CSP)
    expect(a.indexOf('Content-Security-Policy')).toBeLessThan(a.indexOf('</head>'))
    const b = wrapGenUiHtml('<p>hi</p>', '<script>bad</script>')
    expect(b).toContain('<!doctype html>')
    expect(b).not.toContain('<title><script>')
  })
})
