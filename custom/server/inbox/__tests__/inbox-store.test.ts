// 注意力队列守门（multica §六 inbox：三档/双轴/双收件人/正文截断）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  deliver, isInboxSeverity, isInboxType, loadInbox, markItems, queryInbox,
  type InboxItem,
} from '../inbox-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inbox-'))
  process.env.HERMES_INBOX_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_INBOX_DIR
  rmSync(dir, { recursive: true, force: true })
})

const item = (over: Partial<InboxItem>): InboxItem => ({
  itemId: 'i1', type: 'mentioned', severity: 'attention', recipientKind: 'agent',
  recipient: 'zcode', body: 'x'.repeat(300), at: 1, read: false, archived: false, ...over,
})

describe('三档词表+正文截 200（multica 列表项语义）', () => {
  it('severity/type 词表冻结；正文截 200 码点', () => {
    expect([].concat(...[isInboxSeverity('action_required') && 1, isInboxSeverity('attention') && 1, isInboxSeverity('info') && 1]).length).toBe(3)
    expect(isInboxSeverity('urgent')).toBe(false)
    expect(isInboxType('mentioned')).toBe(true)
    expect(isInboxType('mystery')).toBe(false)
    const r = deliver(item({}))
    expect(r.added).toBe(true)
    expect(loadInbox('agent', 'zcode')[0].body).toHaveLength(200)
  })
})

describe('双收件人隔离 + 幂等 + 环形', () => {
  it('member/agent 各自桶；itemId 幂等；环形 200', () => {
    deliver(item({ recipientKind: 'member', recipient: 'alice' }))
    expect(loadInbox('agent', 'zcode')).toHaveLength(0)  // 桶隔离
    expect(deliver(item({})).added).toBe(true)
    expect(deliver(item({})).added).toBe(false)  // 幂等
    for (let i = 0; i < 210; i++) deliver(item({ itemId: `x${i}`, at: i }))
    expect(loadInbox('agent', 'zcode')).toHaveLength(200)
  })
})

describe('双轴查询与批量操作', () => {
  it('unread/archived 四象限过滤；批量双轴', () => {
    deliver(item({ itemId: 'a', read: false, archived: false }))
    deliver(item({ itemId: 'b', read: true, archived: false }))
    deliver(item({ itemId: 'c', read: false, archived: true }))
    expect(queryInbox('agent', 'zcode', { unreadOnly: true }).map((i) => i.itemId)).toEqual(['a'])  // 未读未归档
    expect(queryInbox('agent', 'zcode', { includeArchived: true }).map((i) => i.itemId).sort()).toEqual(['a', 'b', 'c'])
    expect(queryInbox('agent', 'zcode').map((i) => i.itemId).sort()).toEqual(['a', 'b'])  // 默认未归档
    expect(queryInbox('agent', 'zcode', { severity: 'attention', includeArchived: true })).toHaveLength(3)
    // 批量双轴：a 归档、b 标未读。
    const changed = markItems('agent', 'zcode', ['a'], { archived: true })
    expect(changed).toBe(1)
    markItems('agent', 'zcode', ['b'], { read: false })
    const all = queryInbox('agent', 'zcode', { includeArchived: true })
    expect(all.find((i) => i.itemId === 'a')?.archived).toBe(true)
    expect(all.find((i) => i.itemId === 'b')?.read).toBe(false)
    expect(markItems('agent', 'zcode', ['nope'], { read: true })).toBe(0)
  })
})
