import type { RouteLocationRaw } from 'vue-router'

export type NotifyKind = 'matrix' | 'chat' | 'group' | 'reminder'

export interface NotifyItem {
  id: string                  // `<kind>:<roomId/sessionId>` 或 `reminder:<todoId>:<stage>`
  kind: NotifyKind
  title: string
  preview: string
  ts: number                  // 毫秒
  count: number
  routeTarget: RouteLocationRaw
}

/** Matrix: 从 SDK room 提取未读项。getRoomUnreadCount 返回 0 → null */
export function fromMatrixRoom(room: any, getRoomUnreadCount: (r: any) => number): NotifyItem | null {
  const count = getRoomUnreadCount(room)
  if (!count) return null
  let preview = ''
  let ts = 0
  let sender = ''
  const timeline = room.timeline ?? []
  for (let i = timeline.length - 1; i >= 0; i--) {
    const evt = timeline[i]
    if (typeof evt.getType === 'function' && evt.getType() === 'm.room.message') {
      preview = evt.getContent?.()?.body ?? ''
      ts = evt.getTs?.() || 0
      sender = evt.getSender?.() ?? ''
      break
    }
  }
  const name = room.name || room.roomId
  return {
    id: `matrix:${room.roomId}`,
    kind: 'matrix',
    title: name,
    preview: sender ? `${shorten(sender)}: ${preview}` : preview,
    ts,
    count,
    routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: room.roomId } },
  }
}

/** 单聊: 真实未读消息（count + 最后一条预览）。count 0 → null */
export function fromChatSession(session: {
  id: string
  title: string
  profile?: string | null
  updatedAt?: string
  lastActiveAt?: string | number | null
  unreadCount?: number
  lastPreview?: string
  lastRole?: string
  lastTs?: number
}): NotifyItem | null {
  const count = typeof session.unreadCount === 'number' && session.unreadCount > 0
    ? session.unreadCount
    : 0
  if (!count) return null
  const role = session.lastRole === 'assistant' ? '助手' : '用户'
  const preview = session.lastPreview
    ? `${role}: ${session.lastPreview}`
    : `${count} 条新消息`
  const ts = typeof session.lastTs === 'number' && session.lastTs > 0
    ? session.lastTs
    : toMs(session.lastActiveAt ?? session.updatedAt)
  return {
    id: `chat:${session.id}`,
    kind: 'chat',
    title: session.title || session.id,
    preview,
    ts,
    count,
    routeTarget: {
      name: 'hermes.session',
      params: { sessionId: session.id },
      query: session.profile ? { profile: session.profile } : {},
    },
  }
}

/** 群聊: count 0 → null */
export function fromGroupRoom(
  room: { id: string; name: string },
  unreadCount: number,
  lastMsg: { content: string; senderName: string; ts: number } | null,
): NotifyItem | null {
  if (!unreadCount) return null
  const preview = lastMsg
    ? (lastMsg.senderName ? `${lastMsg.senderName}: ${lastMsg.content}` : lastMsg.content)
    : `${unreadCount} 条新消息`
  return {
    id: `group:${room.id}`,
    kind: 'group',
    title: room.name || room.id,
    preview,
    ts: lastMsg?.ts ?? 0,
    count: unreadCount,
    routeTarget: { name: 'hermes.groupChatRoom', params: { roomId: room.id } },
  }
}

/** 待办闹钟提醒：stage 为 15（T-15）或 5（T-5）。点击跳转 cockpit 并打开日程 */
export function fromReminder(
  todo: { id: string; title: string; date: string; remindAt?: number },
  stage: 15 | 5,
): NotifyItem {
  const when = new Date(todo.remindAt ?? Date.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(when.getHours())}:${pad(when.getMinutes())}`
  return {
    id: `reminder:${todo.id}:${stage}`,
    kind: 'reminder',
    title: `⏰ ${todo.title}`,
    preview: stage === 15 ? `15 分钟后提醒 · ${todo.date} ${timeStr}` : `5 分钟后提醒 · ${todo.date} ${timeStr}`,
    ts: Date.now(),
    count: 1,
    routeTarget: { name: 'hermes.cockpit' },
  }
}

function toMs(t: string | number | null | undefined): number {
  if (t == null) return 0
  const n = typeof t === 'number' ? t : Date.parse(t)
  return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : 0
}

function shorten(sender: string): string {
  // @name:server.org → name
  const m = /^@?([^:]+)/.exec(sender)
  return m ? m[1] : sender
}
