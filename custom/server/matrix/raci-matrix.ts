// custom/server/matrix/raci-matrix.ts
// RACI 派发的真实 Matrix 面（aipaydev 推演 room-invite-gap 根治）：
// 原先 raci-dispatch 调 simulation.ts 的内存模拟——邀人只进了内存数组，
// 真实 Matrix 房间里一个人都没有，推演时全靠导演手动补邀（最高频缺口 ×9）。
//
// 本模块把「建群 + 邀人 + 发摘要」做成真实 Matrix client-server HTTP 调用。
// 凭据走 gateway dotenv 五件套（gateway-env.readGatewayMatrixEnv），与
// brief-matrix-delivery 同一凭据链；读不到凭据 → 返回 null，由调用方决定
// 回落（环境无 Matrix 时退回内存模拟，测试/无网关环境仍可用）。
//
// 安全边界：homeserver 经 safeMatrixOrigin（url-guard SSRF 防护，允许内网 http
// 自建 homeserver——推演 Synapse 即 http://127.0.0.1:8008）；token 不落日志。
//
// 边界规则（docs/superpowers/specs/2026-09-25-capability-boundaries-design.md §2/§3-E6）：
// Matrix client-server REST 直连仅限初始化与派发摘要（建群/邀人/一条通知），
// 跨机协作消息一律走 matrix-teams/delivery 协议事件。本模块调用方锁白名单
// （raci-dispatch.ts），新增消费方须先过该文档 §6-T1 裁决并更新守门测试。

import type { RACITuple } from './gateway-env'
import { readGatewayMatrixEnv } from './gateway-env'
import { safeMatrixOrigin } from './admin-service'

export interface MatrixDispatchEnv {
  homeserverUrl: string
  accessToken: string
  userId: string
}

/** 解析派发的 Matrix 凭据；读不到三必填 → null（调用方回落模拟） */
export function resolveMatrixDispatchEnv(
  env: Record<string, string | undefined> = process.env,
): MatrixDispatchEnv | null {
  const creds = readGatewayMatrixEnv(env)
  if (!creds) return null
  return {
    homeserverUrl: creds.homeserverUrl,
    accessToken: creds.accessToken,
    userId: creds.userId,
  }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** 建私密任务房间（invite  RACI 名单随建房一并提交，Synapse 幂等）。返回 roomId。 */
export async function matrixCreateTaskRoom(
  env: MatrixDispatchEnv,
  name: string,
  inviteUserIds: string[],
): Promise<string> {
  const origin = await safeMatrixOrigin(env.homeserverUrl)
  const res = await fetch(`${origin}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: authHeaders(env.accessToken),
    body: JSON.stringify({
      name,
      preset: 'private_chat',
      is_direct: false,
      invite: inviteUserIds,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`createRoom failed: HTTP ${res.status} ${body.slice(0, 120)}`)
  }
  const data = (await res.json()) as { room_id?: string }
  if (!data.room_id) throw new Error('createRoom returned no room_id')
  return data.room_id
}

/** 邀请用户进房；已在房（M_FORBIDDEN already in room）按幂等成功处理。 */
export async function matrixInviteUser(
  env: MatrixDispatchEnv,
  roomId: string,
  userId: string,
): Promise<void> {
  const origin = await safeMatrixOrigin(env.homeserverUrl)
  const res = await fetch(`${origin}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, {
    method: 'POST',
    headers: authHeaders(env.accessToken),
    body: JSON.stringify({ user_id: userId }),
  })
  if (res.ok) return
  const body = await res.text().catch(() => '')
  // 幂等：重邀已在房成员不算失败（对齐 hermes matrix invite 的 already-in-room 语义）
  if (/already in the room|already invited|is already in the chat/i.test(body)) return
  throw new Error(`invite ${userId} failed: HTTP ${res.status} ${body.slice(0, 120)}`)
}

/** 发送 m.room.message 文本到房间（仅人读通知，不承担协作语义）。 */
export async function matrixSendMessage(
  env: MatrixDispatchEnv,
  roomId: string,
  text: string,
): Promise<void> {
  const origin = await safeMatrixOrigin(env.homeserverUrl)
  const txnId = `raci-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const res = await fetch(
    `${origin}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
    {
      method: 'PUT',
      headers: authHeaders(env.accessToken),
      body: JSON.stringify({ msgtype: 'm.text', body: text }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`sendMessage failed: HTTP ${res.status} ${body.slice(0, 120)}`)
  }
}

/**
 * 发送自定义类型协议事件（协作信号唯一通道）。类型字符串与 content 形状由
 * task-protocol.ts 约束（镜像 matrix-teams 协议 v1 稳定面）；禁止用本函数发
 * 自由格式协作消息——那类诉求走矩阵协议事件或人读摘要。
 */
export async function matrixSendProtocolEvent(
  env: MatrixDispatchEnv,
  roomId: string,
  eventType: string,
  content: Record<string, unknown>,
): Promise<void> {
  const origin = await safeMatrixOrigin(env.homeserverUrl)
  const txnId = `proto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const res = await fetch(
    `${origin}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/${encodeURIComponent(txnId)}`,
    {
      method: 'PUT',
      headers: authHeaders(env.accessToken),
      body: JSON.stringify(content),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`sendProtocolEvent ${eventType} failed: HTTP ${res.status} ${body.slice(0, 120)}`)
  }
}

/** RACI 名单归集：responsible/approver/consulted/informed 全量去重 */
export function raciInviteeIds(raci: RACITuple): string[] {
  return [...new Set([
    ...raci.responsible,
    ...raci.approver,
    ...raci.consulted,
    ...raci.informed,
  ])]
}
