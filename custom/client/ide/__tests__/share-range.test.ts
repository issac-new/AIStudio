// G7 分享选段守门：区间裁剪、markdown/json 导出、边界夹取。
import { describe, it, expect } from 'vitest'
import { sliceMessages, rangeToMarkdown, rangeToJson, rangeLabel } from '../utils/share-range'

const msgs = [
  { id: 'm1', role: 'user', content: '问题', timestamp: 1_700_000_000_000 },
  { id: 'm2', role: 'assistant', content: '回答', timestamp: 1_700_000_001_000 },
  { id: 'm3', role: 'tool', toolName: 'bash', toolStatus: 'done', content: 'ok', timestamp: 1_700_000_002_000 },
  { id: 'm4', role: 'assistant', content: '结论', timestamp: 1_700_000_003_000 },
]

describe('sliceMessages', () => {
  it('正常区间闭区间截取；倒置区间自动纠正', () => {
    expect(sliceMessages(msgs, { start: 1, end: 2 }).map(m => m.id)).toEqual(['m2', 'm3'])
    expect(sliceMessages(msgs, { start: 2, end: 1 }).map(m => m.id)).toEqual(['m2', 'm3'])
  })
  it('越界夹取；空数组返回空', () => {
    expect(sliceMessages(msgs, { start: -5, end: 99 }).map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(sliceMessages([], { start: 0, end: 1 })).toEqual([])
  })
})

describe('exports', () => {
  it('markdown 含角色/时间/工具状态与正文', () => {
    const md = rangeToMarkdown(sliceMessages(msgs, { start: 1, end: 2 }), '选段')
    expect(md).toContain('# 选段')
    expect(md).toContain('## assistant')
    expect(md).toContain('## tool:bash')
    expect(md).toContain('> status: done')
    expect(md).toContain('ok')
    expect(md).not.toContain('问题')
  })

  it('json 只含白名单字段，不含未知字段', () => {
    const json = JSON.parse(rangeToJson(sliceMessages(msgs, { start: 0, end: 0 })))
    expect(json.messages[0]).toMatchObject({ id: 'm1', role: 'user', content: '问题' })
    expect(json.messages[0]).not.toHaveProperty('secret')
  })
})

describe('rangeLabel', () => {
  it('1 基序号与总数', () => {
    expect(rangeLabel(msgs, { start: 1, end: 2 })).toBe('2-3 / 4')
  })
})
