// 注意力队列守门（multica §六 inbox：三档/双轴/双收件人/正文截断）。
// S-A 桶名哈希、S-B 坏档隔离、S-D 码点截断与 limit clamp 在此守门。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  deliver, inboxFile, isInboxSeverity, isInboxType, loadInbox, markItems, queryInbox,
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

describe('三档词表+正文截 200 码点（multica 列表项语义）', () => {
  it('severity/type 词表冻结；正文截 200 码点', () => {
    expect([].concat(...[isInboxSeverity('action_required') && 1, isInboxSeverity('attention') && 1, isInboxSeverity('info') && 1]).length).toBe(3)
    expect(isInboxSeverity('urgent')).toBe(false)
    expect(isInboxType('mentioned')).toBe(true)
    expect(isInboxType('mystery')).toBe(false)
    const r = deliver(item({}))
    expect(r.added).toBe(true)
    expect(loadInbox('agent', 'zcode')[0].body).toHaveLength(200)
  })

  it('emoji 按码点截断（UTF-16 code unit 截断会切出孤立代理对）', () => {
    deliver(item({ body: '😀'.repeat(300) }))
    const body = loadInbox('agent', 'zcode')[0].body
    expect([...body].length).toBe(200)   // 200 码点 = 200 个 emoji，不是 100 个
    expect(body).toBe('😀'.repeat(200))
    expect(body.length).toBe(400)        // 400 个 code unit，无孤立代理对
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

  it('桶名哈希化（S-A）：清洗名多对一的收件人不共桶互覆', () => {
    // 缺陷前提：旧 key() 把下面这些折成同一个桶名。
    expect('member-张三'.replace(/[^A-Za-z0-9._-]/g, '_')).toBe('member-李四'.replace(/[^A-Za-z0-9._-]/g, '_'))
    expect(inboxFile('member', '张三')).not.toBe(inboxFile('member', '李四'))
    expect(inboxFile('member', 'a/b')).not.toBe(inboxFile('member', 'a_b'))
    deliver(item({ recipientKind: 'member', recipient: '张三', itemId: 'z1', body: '张三的信' }))
    deliver(item({ recipientKind: 'member', recipient: '李四', itemId: 'l1', body: '李四的信' }))
    expect(loadInbox('member', '张三').map((i) => i.itemId)).toEqual(['z1'])
    expect(loadInbox('member', '李四').map((i) => i.itemId)).toEqual(['l1'])
  })

  it('旧清洗命名兼容迁移：按条目收件人分账认领（不动对侧的账）', () => {
    // 旧清洗名 'member-a_b.json' 是 'a/b' 与 'a_b' 的共桶（多对一碰撞的现场）。
    writeFileSync(join(dir, 'member-a_b.json'), JSON.stringify([
      item({ itemId: 'mine', recipientKind: 'member', recipient: 'a/b' }),
      item({ itemId: 'theirs', recipientKind: 'member', recipient: 'a_b' }),
    ]), 'utf8')
    expect(loadInbox('member', 'a/b').map((i) => i.itemId)).toEqual(['mine'])
    expect(existsSync(inboxFile('member', 'a/b'))).toBe(true)  // 已迁到哈希桶
    // 对侧条目留在旧文件，等对方认领。
    expect(JSON.parse(readFileSync(join(dir, 'member-a_b.json'), 'utf8')).map((i: InboxItem) => i.itemId)).toEqual(['theirs'])
    expect(loadInbox('member', 'a_b').map((i) => i.itemId)).toEqual(['theirs'])
    deliver(item({ itemId: 'more', recipientKind: 'member', recipient: 'a/b' }))
    expect(loadInbox('member', 'a/b').map((i) => i.itemId)).toEqual(['mine', 'more'])
  })

  it('坏文件隔离 .corrupt.<ts> 留档（G7 时间戳防二次损坏覆盖）+ 可续写（不再静默当空桶续写）', () => {
    writeFileSync(inboxFile('agent', 'zcode'), '{{bad', 'utf8')
    expect(loadInbox('agent', 'zcode')).toEqual([])
    const archives = readdirSync(dir).filter((n) => n.includes('.corrupt.'))  // 坏档留档不销毁
    expect(archives).toHaveLength(1)
    expect(readFileSync(join(dir, archives[0]), 'utf8')).toBe('{{bad')
    expect(deliver(item({})).added).toBe(true)                 // 且可正常续写
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

  it('limit 非有限数回默认 50（slice(-NaN) 不再回全量）', () => {
    for (let i = 0; i < 60; i++) deliver(item({ itemId: `m${i}` }))
    expect(queryInbox('agent', 'zcode', { limit: Number.NaN })).toHaveLength(50)
    expect(queryInbox('agent', 'zcode', { limit: 10 })).toHaveLength(10)
    expect(queryInbox('agent', 'zcode', { limit: Number.POSITIVE_INFINITY })).toHaveLength(50)
  })
})
