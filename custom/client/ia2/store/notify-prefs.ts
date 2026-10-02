// overlay/custom/client/ia2/store/notify-prefs.ts
// B9 收件箱偏好分组（multica 通知偏好 7 分组降噪的吸收；v13 §4-5 记档项落地）。
// 语义：按分组开关收件箱消息类目的可见性——关掉的分组不进通知下拉「消息」页签、
// 不计入铃铛消息徽章（降噪=真不打扰），数据本身不删（分组内条目随时可恢复）。
// 持久化=localStorage（客户端偏好，per-user 语义诚实）；默认全开（零行为变化）。
// 分组→InboxKind 映射对齐 cockpit inbox-adapter 词表（单一事实源）。
import { reactive } from 'vue'
import type { InboxKind } from '@/custom/cockpit/adapters/inbox-adapter'
import { readSetting, writeSetting, adoptLegacySetting } from '@/custom/settings-layers'

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

const PREFS_KEY = 'notify.prefs'  // settings-layers 分层键（2026-10-02 #13 步二批二）

function loadPrefs(): Record<string, boolean> {
  try {
    // 遗留裸键 ia2_notify_prefs 一次性收养（已有值无损入 user 层）
    adoptLegacySetting(PREFS_KEY, 'ia2_notify_prefs')
    const raw = readSetting<Record<string, boolean>>(PREFS_KEY, {}).value
    return typeof raw === 'object' && raw ? raw : {}
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
  try { writeSetting('user', PREFS_KEY, state.prefs) } catch { /* quota 静默 */ }
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

/** 测试/复位用：清全部层的分层键后重载（重载会触发遗留裸键收养——测试可注入
 *  旧键验证迁移语义；清层不清遗留键，收养只发生一次的语义由 settings-layers 保证）。 */
export function __resetNotifyPrefsForTest(): void {
  for (const l of ['user', 'workspace', 'session'] as const) {
    try { localStorage.removeItem(`sl:${l}:${PREFS_KEY}`) } catch { /* 忽略 */ }
  }
  state.prefs = loadPrefs()
}
