// B9 守门：收件箱偏好分组降噪（multica 7 分组吸收；v13 §4-5 落地）。
// 契约：分组开关默认全开（零行为变化）；关掉的分组其 kinds 从过滤面消失；
// 未归组的新 kind 默认放行（新增类目不被静默吞）；localStorage 持久化；
// 面板徽章计数走同一过滤面。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  NOTIFY_PREF_GROUPS, filterInboxByPrefs, kindEnabled, prefEnabled, setPref,
  __resetNotifyPrefsForTest,
} from '../store/notify-prefs'
import type { InboxKind } from '@/custom/cockpit/adapters/inbox-adapter'

function item(kind: InboxKind, id = kind): { id: string; kind: InboxKind; count: number } {
  return { id, kind, count: 1 }
}

describe('B9 收件箱偏好分组', () => {
  beforeEach(() => __resetNotifyPrefsForTest())

  it('默认全开：全量放行（零行为变化）', () => {
    const items = [item('approval'), item('chat'), item('mcp'), item('reminder')]
    expect(filterInboxByPrefs(items)).toHaveLength(4)
    expect(NOTIFY_PREF_GROUPS.every((g) => prefEnabled(g.key))).toBe(true)
  })

  it('关闭 messages 组：chat/matrix/group 三类消失，其余保留', () => {
    setPref('messages', false)
    const items = [item('approval'), item('chat'), item('matrix'), item('group'), item('mcp')]
    const out = filterInboxByPrefs(items)
    expect(out.map((i) => i.kind)).toEqual(['approval', 'mcp'])
    expect(kindEnabled('chat')).toBe(false)
    expect(kindEnabled('approval')).toBe(true)
  })

  it('持久化：写入后重读 localStorage 生效；重开恢复', () => {
    setPref('system', false)
    // 2026-10-02 #13 步二批二：持久化走 settings-layers user 层（sl:user:notify.prefs）
    expect(JSON.parse(localStorage.getItem('sl:user:notify.prefs') ?? '{}')).toEqual({ system: false })
    setPref('system', true)
    expect(prefEnabled('system')).toBe(true)
  })

  it('遗留收养：旧裸键 ia2_notify_prefs 的值无损入分层（复位重载触发，旧键退役）', () => {
    localStorage.setItem('ia2_notify_prefs', JSON.stringify({ reminders: false }))
    __resetNotifyPrefsForTest()
    expect(prefEnabled('reminders')).toBe(false)
    expect(localStorage.getItem('ia2_notify_prefs')).toBeNull()
  })

  it('未归组 kind 默认放行（词表漂移防护）', () => {
    setPref('messages', false)
    expect(kindEnabled('approval' as InboxKind)).toBe(true)
    // 词表完整性：所有分组引用的 kind 都是合法 InboxKind（编译期已由类型保证，运行期点验键名）
    expect(NOTIFY_PREF_GROUPS.map((g) => g.key)).toEqual(['approvals', 'taskStatus', 'clarify', 'messages', 'system', 'reminders'])
  })
})
