// overlay/custom/server/loop/graph/brief-matrix-delivery.ts
// R1 每日 Brief 的 Matrix 投递传输（2026-09-10 接线，用户拍板：使用本机配置的登录身份；
// 2026-09-11 升级：接入 gateway（hermes-agent）凭据链 + HOME_ROOM 房间回落）。
//
// 凭据来源优先级（每次发送重读，重登录/网关换 token 即时生效）：
// 1) matrix-session.json——应用内最近一次 Matrix 登录（POST /api/auth/matrix-login，
//    patch 012 校验通过后经 custom/server/matrix/session-store.ts 落盘的本机身份）；
// 2) LOOP_MATRIX_HOMESERVER / LOOP_MATRIX_TOKEN / LOOP_MATRIX_USER env 三件套
//    （store-factory.ts 的 MatrixStore 同名约定，显式声明即用；残缺则跳过该级）；
// 3) gateway dotenv——`${HERMES_HOME:-~/.hermes}/profiles/<LOOP_MATRIX_PROFILE|active_profile
//    |orchestrator>/.env` 的 MATRIX_HOMESERVER/MATRIX_ACCESS_TOKEN/MATRIX_USER_ID
//    （custom/server/matrix/gateway-env.ts 解析，本机 gateway 与应用同身份域）。
//
// 房间解析（resolveBriefRoom，装配层消费）：LOOP_BRIEF_ROOM env → gateway
// MATRIX_HOME_ROOM（网关主房间）→ undefined（event-log-only）。房间值两种形态：
// `!xxx:server` 直接发送；`#alias:server` 经 getRoomIdForAlias 解析（失败上抛走审计）。
//
// 装配语义（与 graph-assembly.ts 的双条件守卫对齐）：
// - 创建时无任何凭据 → 返回 undefined，assembly 沿既有 warn-once + event-log-only
//   （delivered:false）路径，不产出一个"什么都没发"的空传输；
// - 有凭据 → 返回投递函数：m.text 纯文本（免 formatted_body 渲染依赖），经
//   getMatrixClient 单例（复用 matrix-store 既有连接）；发送/别名解析失败向上 throw，
//   由 DailyBriefJob 的 dispatch 捕获并落 delivered:false + error 审计。

import { getMatrixClient } from '../store/matrix-client'
import { loadMatrixSession } from '../../matrix/session-store'
import { readGatewayMatrixEnv, readGatewayMatrixFile } from '../../matrix/gateway-env'

/** 投递凭据（roomId 由调用方逐次传入，不在此解析） */
interface BriefDeliveryCredentials {
  homeserverUrl: string
  accessToken: string
  userId: string
}

/** env 三件套（与 store-factory 的 LOOP_MATRIX_* 命名一致；room 走 LOOP_BRIEF_ROOM/gateway） */
function credentialsFromEnv(env: Record<string, string | undefined>): BriefDeliveryCredentials | null {
  const homeserverUrl = env.LOOP_MATRIX_HOMESERVER?.trim()
  const accessToken = env.LOOP_MATRIX_TOKEN?.trim()
  const userId = env.LOOP_MATRIX_USER?.trim()
  if (!homeserverUrl || !accessToken || !userId) return null
  return { homeserverUrl, accessToken, userId }
}

/** gateway dotenv 五件套的凭据三元组（三必填由 gateway-env 保证） */
function credentialsFromGateway(env: Record<string, string | undefined>): BriefDeliveryCredentials | null {
  const gw = readGatewayMatrixEnv(env)
  return gw ? { homeserverUrl: gw.homeserverUrl, accessToken: gw.accessToken, userId: gw.userId } : null
}

function resolveCredentials(env: Record<string, string | undefined>): BriefDeliveryCredentials | null {
  const session = loadMatrixSession(env)
  if (session) {
    return { homeserverUrl: session.homeserverUrl, accessToken: session.accessToken, userId: session.userId }
  }
  return credentialsFromEnv(env) ?? credentialsFromGateway(env)
}

/**
 * Brief 房间解析（装配层每次装配调用一次，与 LOOP_BRIEF_ROOM 同口径）：
 * LOOP_BRIEF_ROOM env → gateway MATRIX_HOME_ROOM → undefined。
 * 房间与凭据独立：gateway 侧只配了 HOME_ROOM 也算"已配置房间"。
 */
export function resolveBriefRoom(env: Record<string, string | undefined> = process.env): string | undefined {
  const explicit = env.LOOP_BRIEF_ROOM?.trim()
  if (explicit) return explicit
  // 宽容读：房间与凭据独立——gateway 只配了 HOME_ROOM 也算"已配置房间"
  //（若此刻全链无凭据，装配层 factory 返回 undefined → warn-once 走审计路径）
  return readGatewayMatrixFile(env)?.MATRIX_HOME_ROOM || undefined
}

/**
 * R1 Brief 投递工厂：无凭据返回 undefined（宿主装配 warn-once），
 * 有凭据返回 (roomId, text) => Promise<void> 传输（失败 throw）。
 */
export function createMatrixBriefDelivery(
  env: Record<string, string | undefined> = process.env,
): ((roomId: string, text: string) => Promise<void>) | undefined {
  if (!resolveCredentials(env)) return undefined

  return async (roomId: string, text: string): Promise<void> => {
    const creds = resolveCredentials(env)
    if (!creds) {
      // 创建时有凭据、发送时全链失效——按配置漂移处理，抛错走审计（不静默丢）
      throw new Error('matrix credentials vanished since briefDelivery creation (session file removed, LOOP_MATRIX_* and gateway dotenv absent)')
    }
    const client = getMatrixClient({
      homeserverUrl: creds.homeserverUrl,
      accessToken: creds.accessToken,
      userId: creds.userId,
      roomId,
    })
    // #alias:server → 解析为 !roomId 再发（每次发送解析，网关换房即时生效）；失败上抛走审计
    let targetRoomId = roomId
    if (roomId.startsWith('#')) {
      const resolved = await client.getRoomIdForAlias(roomId) as { room_id?: string }
      targetRoomId = (resolved as { room_id?: string })?.room_id ?? ''
      if (!targetRoomId) {
        throw new Error(`brief room alias did not resolve to a room id: ${roomId}`)
      }
    }
    await client.sendMessage(targetRoomId, {
      msgtype: 'm.text' as never,
      body: text,
    } as never)
  }
}
