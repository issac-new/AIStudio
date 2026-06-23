import type { RouteLocationRaw } from 'vue-router'

export type NotifyKind = 'matrix' | 'chat' | 'group'

export interface NotifyItem {
  id: string                  // `<kind>:<roomId/sessionId>`
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

/** 单聊: completedUnread 二值, count 恒 1 */
export function fromChatSession(session: {
  id: string
  title: string
  profile?: string | null
  updatedAt?: string
  lastActiveAt?: string | number | null
}): NotifyItem {
  const ts = toMs(session.lastActiveAt ?? session.updatedAt)
  return {
    id: `chat:${session.id}`,
    kind: 'chat',
    title: session.title || session.id,
    preview: '助手运行完成，请查看结果',
    ts,
    count: 1,
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
