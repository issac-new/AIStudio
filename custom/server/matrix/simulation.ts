// custom/server/matrix/simulation.ts
// Matrix 模拟服务器：9 用户环境下的消息传递模拟
// 依赖：custom/server/matrix/gateway-env.ts

import type { MatrixUser, MatrixRoom } from './gateway-env'

interface SimulatedMessage {
  roomId: string
  sender: string
  content: string
  timestamp: number
  eventId: string
}

interface RoomMembership {
  roomId: string
  userId: string
  role: 'admin' | 'member' | 'restricted' | 'guest'
}

// ─── 模拟消息存储 ────────────────────────────────

const messages: SimulatedMessage[] = []
const memberships: RoomMembership[] = []

// ─── 模拟发送 ──────────────────────────────────

/**
 * 模拟发送消息到房间
 */
export async function simulateSendMessage(
  roomId: string,
  sender: string,
  content: string,
): Promise<SimulatedMessage> {
  const eventId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const msg: SimulatedMessage = {
    roomId,
    sender,
    content,
    timestamp: Date.now(),
    eventId,
  }
  messages.push(msg)
  return msg
}

/**
 * 模拟创建房间并邀请成员
 */
export async function simulateCreateRoom(
  name: string,
  creator: string,
  invitedUsers: string[],
): Promise<MatrixRoom> {
  const roomId = `!sim-${Date.now()}:localhost`
  const room: MatrixRoom = {
    roomId,
    name,
    preset: 'private_chat',
    members: [creator, ...invitedUsers].map(id => ({
      id,
      displayName: id,
    })),
    createdAt: Date.now(),
  }

  // 记录成员关系
  memberships.push({ roomId, userId: creator, role: 'admin' })
  invitedUsers.forEach(userId => {
    memberships.push({ roomId, userId, role: 'member' })
  })

  return room
}

/**
 * 模拟补邀用户进既有房间（2026-11-26 审查挂账4/6）：RACI 派发被派单门拦下的
 * 责任人在门恢复后重试时补邀进原房间。幂等：已在房成员跳过（对齐真实通道
 * matrixInviteUser 的 already-in-room 语义）；房间不存在抛错（补邀只应发生在
 * dedupe 记录指向的既有房间上，缺席属调用方 bug 不静默）。
 */
export async function simulateInviteUser(
  roomId: string,
  userId: string,
): Promise<void> {
  const existing = memberships.find(m => m.roomId === roomId)
  if (!existing) throw new Error(`simulateInviteUser: room not found: ${roomId}`)
  if (memberships.some(m => m.roomId === roomId && m.userId === userId)) return
  memberships.push({ roomId, userId, role: 'member' })
}

/**
 * 获取房间的完整消息历史
 */
export function getRoomHistory(roomId: string): SimulatedMessage[] {
  return messages.filter(m => m.roomId === roomId)
}

/**
 * 获取用户在所有房间中的成员关系
 */
export function getUserMemberships(userId: string): RoomMembership[] {
  return memberships.filter(m => m.userId === userId)
}

/**
 * 批量模拟：发送一条消息到所有相关房间
 */
export async function broadcastToRooms(
  roomIds: string[],
  sender: string,
  content: string,
): Promise<SimulatedMessage[]> {
  const results = await Promise.all(
    roomIds.map(roomId => simulateSendMessage(roomId, sender, content)),
  )
  return results
}

/**
 * 模拟 Leader 介入消息
 */
export async function simulateLeaderIntervention(
  roomId: string,
  taskId: string,
  reason: string,
): Promise<SimulatedMessage> {
  const content = `🎯 **Leader 介入通知**\n\n任务 ${taskId} 已被架构规则连续阻塞。\n原因：${reason}\n\n请人工审查并解决。`
  return simulateSendMessage(roomId, '@leader:localhost', content)
}
