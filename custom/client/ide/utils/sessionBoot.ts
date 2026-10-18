// overlay/custom/client/ide/utils/sessionBoot.ts
// 冷启动会话选择（?session= 深链 vs ensureSession）的纯判定。
//
// 背景（2026-10-18 回归实测）：IdeChatPane onMounted 先 loadSessions 再
// ensureSession；imported/CLI 会话的 agent 与 IDE 底座不同，ensureSession 会
// 新建空会话把深链目标顶掉——冷启动 12s 后标题仍是「新会话」。
export interface BootSessionResolution {
  /** 深链目标存在于会话列表（无论是否已激活） */
  matched: boolean
  /** 需要切换到的会话 id；已激活或未命中时为 null */
  switchTo: string | null
}

/** 解析 ?session= 在本次启动中应如何落位 */
export function resolveBootSession(
  querySession: unknown,
  sessionIds: readonly string[],
  activeSessionId: string | null,
): BootSessionResolution {
  const id = typeof querySession === 'string' ? querySession.trim() : ''
  if (!id || !sessionIds.includes(id)) return { matched: false, switchTo: null }
  return { matched: true, switchTo: activeSessionId === id ? null : id }
}
