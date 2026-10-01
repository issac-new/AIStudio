// overlay/custom/client/ia2/i18n-msg-surface.ts
// 消息面吸收批词条（Spotlight 混合搜索 / 跳到未读条 / 未读线程聚合，2026-10-01）。
// 独立小事实源 + locale 切换（同 i18n-run-surface.ts 先例）——不动 patch 473 的
// locale 单一事实源面：注入链处漂移态，patch 路线在本树不可验证；待漂移治理轮
// 恢复 473 后收编（届时本模块退役）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const MSG_SURFACE_TEXT = {
  zh: {
    jumpToUnread: '跳到未读',
    newMessages: '条新消息',
    markRead: '标记已读',
    jumpBottom: '回到底部',
    noUnread: '暂无未读',
    searchPlaceholder: '搜索会话 / 房间 / 任务 / 命令…',
    groupSessions: '会话与房间',
    groupTasks: '看板任务',
    groupCommands: '命令',
    groupEmpty: '无匹配结果',
    cmdBoard: '打开看板',
    cmdInbox: '打开审批收件箱',
    cmdRuns: '打开运行中心',
    cmdGov: '打开治理中心',
    cmdCases: '打开交付案例',
    cmdIde: '切换到 IDE 工作台',
    cmdOverview: '打开概览',
    cmdSettings: '打开设置',
    threadsSection: '未读线程',
    threadsJump: '查看线程',
    threadsEmpty: '各房间线程均无未读',
    historyTitle: '历史提示',
    historySearchHint: '搜索本会话的历史提示…',
    historyEmpty: '本会话暂无历史提示',
    historyJump: '定位到该消息',
    historyCopy: '复制文本',
    historyEdit: '编辑重发（复制到剪贴板+聚焦输入框）',
    historyLocked: '运行中只读',
    historyLockedHint: '当前回合进行中——历史动作在回合结束后可用（minimax 语义）',
  },
  en: {
    jumpToUnread: 'Jump to unread',
    newMessages: 'new messages',
    markRead: 'Mark as read',
    jumpBottom: 'Jump to bottom',
    noUnread: 'No unread',
    searchPlaceholder: 'Search sessions / rooms / tasks / commands…',
    groupSessions: 'Sessions & rooms',
    groupTasks: 'Board tasks',
    groupCommands: 'Commands',
    groupEmpty: 'No results',
    cmdBoard: 'Open board',
    cmdInbox: 'Open approval inbox',
    cmdRuns: 'Open run center',
    cmdGov: 'Open governance',
    cmdCases: 'Open delivery cases',
    cmdIde: 'Switch to IDE workbench',
    cmdOverview: 'Open overview',
    cmdSettings: 'Open settings',
    threadsSection: 'Unread threads',
    threadsJump: 'View thread',
    threadsEmpty: 'No unread threads',
    historyTitle: 'Prompt history',
    historySearchHint: 'Search prompt history in this session…',
    historyEmpty: 'No prompt history in this session',
    historyJump: 'Jump to this message',
    historyCopy: 'Copy text',
    historyEdit: 'Edit & resend (copy to clipboard + focus composer)',
    historyLocked: 'Read-only while running',
    historyLockedHint: 'A turn is in progress — history actions unlock when it settles (minimax semantics)',
  },
} as const

// 值放宽为 string：as const 下 zh/en 字面量类型互斥（TS2322）；键完整性由 Record 强制。
export type MsgSurfaceText = Record<keyof typeof MSG_SURFACE_TEXT.zh, string>

/** 消息面词条（locale 响应式跟随） */
export function useMsgSurfaceText() {
  const i18nCtx = useI18n()
  return computed<MsgSurfaceText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? MSG_SURFACE_TEXT.zh : MSG_SURFACE_TEXT.en
  })
}
