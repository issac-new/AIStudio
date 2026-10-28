// 三类聊天消息归一为 ChatMessage。
// matrix 元素是 matrix-js-sdk 的 MatrixEvent 实例（用方法访问字段）；
// chat/group 元素是 plain object。

export interface ChatMessage {
  id: string
  channelId: string
  author: string
  isMe: boolean
  text: string
  ts: number
}

/** MatrixEvent 的最小形状（duck typing，避免直接 import SDK 类型） */
export interface MatrixLikeEvent {
  getId(): string
  getSender(): string
  getContent(): { body?: string }
  getTs(): number
}

export function fromMatrix(ev: MatrixLikeEvent, currentUserId: string, channelId: string): ChatMessage {
  const sender = ev.getSender()
  return {
    id: ev.getId(),
    channelId,
    author: sender,
    isMe: sender === currentUserId,
    text: ev.getContent()?.body ?? '',
    ts: ev.getTs(),
  }
}

/** chatStore.messages 元素形状（Message 接口的部分字段） */
export interface ChatLikeMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'command'
  content: string
  timestamp: number
}

export function fromChat(m: ChatLikeMessage, currentUserId: string, channelId: string): ChatMessage {
  const isUser = m.role === 'user'
  return {
    id: m.id,
    channelId,
    author: isUser ? currentUserId : m.role,
    isMe: isUser, // 简化：role=user 即视为当前用户发出
    text: m.content,
    ts: m.timestamp,
  }
}

/** groupChatStore.sortedMessages 元素形状（ChatMessage from api） */
export interface GroupLikeMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: number
}

export function fromGroup(m: GroupLikeMessage, currentUserId: string, channelId: string): ChatMessage {
  return {
    id: m.id,
    channelId,
    author: m.senderName || m.senderId,
    isMe: m.senderId === currentUserId,
    text: m.content,
    ts: m.timestamp,
  }
}
