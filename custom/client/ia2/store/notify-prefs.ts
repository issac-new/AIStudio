// overlay/custom/client/ia2/store/notify-prefs.ts
// B9 收件箱偏好分组（multica 通知偏好 7 分组降噪的吸收；v13 §4-5 记档项落地）。
// 语义：按分组开关收件箱消息类目的可见性——关掉的分组不进通知下拉「消息」页签、
// 不计入铃铛消息徽章（降噪=真不打扰），数据本身不删（分组内条目随时可恢复）。
// 持久化=localStorage（客户端偏好，per-user 语义诚实）；默认全开（零行为变化）。
// 分组→InboxKind 映射对齐 cockpit inbox-adapter 词表（单一事实源）。
import { reactive } from 'vue'
import type { InboxKind } from '@/custom/cockpit/adapters/inbox-adapter'

export interface NotifyPrefGroup {
  key: string
  label: string
  kinds: readonly InboxKind[]
}

/** 偏好分组定义（顺序即面板展示序）。 */
export const NOTIFY_PREF_GROUPS: readonly NotifyPrefGroup[] = [
  { key: 'approvals', label: '审批', kinds: ['approval'] },
  { key: 'taskStatus', label: '任务状态（受阻/评审/分诊）', kinds: ['blocked', 'review', 'triage'] },
  { key: 'clarify', label: '澄清提问', kinds: ['clarify'] },
  { key: 'messages', label: '消息未读（会话/Matrix/群）', kinds: ['chat', 'matrix', 'group'] },
  { key: 'system', label: '系统与集成（MCP 降级）', kinds: ['mcp'] },
  { key: 'reminders', label: '待办提醒', kinds: ['reminder'] },
] as const

const PREFS_KEY = 'ia2_notify_prefs'

function loadPrefs(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    return typeof raw === 'object' && raw ? raw as Record<string, boolean> : {}
  } catch { return {} }
}

const state = reactive<{ prefs: Record<string, boolean> }>({ prefs: loadPrefs() })

export function notifyPrefsState(): { prefs: Record<string, boolean> } {
  return state
}

/** 分组开关读取（缺省=开）。 */
export function prefEnabled(groupKey: string): boolean {
  return state.prefs[groupKey] !== false
}

export function setPref(groupKey: string, enabled: boolean): void {
  state.prefs = { ...state.prefs, [groupKey]: enabled }
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)) } catch { /* quota 静默 */ }
}

/** kind → 所属分组开关判定（未归组的新 kind 默认放行——新增类目不被静默吞掉）。 */
export function kindEnabled(kind: InboxKind): boolean {
  const group = NOTIFY_PREF_GROUPS.find((g) => g.kinds.includes(kind))
  if (!group) return true
  return prefEnabled(group.key)
}

/** 收件箱过滤面（面板与徽章共用单一事实源）。 */
export function filterInboxByPrefs<T extends { kind: InboxKind }>(items: readonly T[]): T[] {
  return items.filter((i) => kindEnabled(i.kind))
}

/** 测试/复位用。 */
export function __resetNotifyPrefsForTest(): void {
  state.prefs = {}
  try { localStorage.removeItem(PREFS_KEY) } catch { /* 忽略 */ }
}
