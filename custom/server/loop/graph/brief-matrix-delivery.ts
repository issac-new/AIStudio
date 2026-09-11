// overlay/custom/server/loop/graph/brief-matrix-delivery.ts
// R1 每日 Brief 的 Matrix 投递传输（2026-09-10 接线，用户拍板：使用本机配置的登录身份）。
//
// 凭据来源优先级：
// 1) matrix-session.json——应用内最近一次 Matrix 登录（POST /api/auth/matrix-login，
//    patch 012 校验通过后经 custom/server/matrix/session-store.ts 落盘的本机身份）；
// 2) LOOP_MATRIX_HOMESERVER / LOOP_MATRIX_TOKEN / LOOP_MATRIX_USER env 三件套
//    （store-factory.ts 的 MatrixStore 同名约定，显式声明即用）。
//
// 装配语义（与 graph-assembly.ts 的双条件守卫对齐）：
// - 创建时无任何凭据 → 返回 undefined，assembly 沿既有 warn-once + event-log-only
//   （delivered:false）路径，不产出一个"什么都没发"的空传输；
// - 有凭据 → 返回投递函数：每次发送重读凭据（重登录后 token 轮换即时生效，一天一次
//   的 Brief 读文件开销可忽略），经 getMatrixClient 单例（复用 matrix-store 既有连接）
//   发 m.text 纯文本（免 formatted_body 渲染依赖）；发送失败向上 throw，由
//   DailyBriefJob 的 dispatch 捕获并落 delivered:false + error 审计。

import { getMatrixClient } from '../store/matrix-client'
import { loadMatrixSession } from '../../matrix/session-store'

/** 投递凭据（roomId 由调用方逐次传入，不在此解析） */
interface BriefDeliveryCredentials {
  homeserverUrl: string
  accessToken: string
  userId: string
}

/** env 三件套回退（与 store-factory 的 LOOP_MATRIX_* 命名一致；room 走 LOOP_BRIEF_ROOM） */
function credentialsFromEnv(env: Record<string, string | undefined>): BriefDeliveryCredentials | null {
  const homeserverUrl = env.LOOP_MATRIX_HOMESERVER?.trim()
  const accessToken = env.LOOP_MATRIX_TOKEN?.trim()
  const userId = env.LOOP_MATRIX_USER?.trim()
  if (!homeserverUrl || !accessToken || !userId) return null
  return { homeserverUrl, accessToken, userId }
}

function resolveCredentials(env: Record<string, string | undefined>): BriefDeliveryCredentials | null {
  const session = loadMatrixSession(env)
  if (session) {
    return { homeserverUrl: session.homeserverUrl, accessToken: session.accessToken, userId: session.userId }
  }
  return credentialsFromEnv(env)
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
      // 创建时有凭据、发送时文件被删且无 env——按配置漂移处理，抛错走审计（不静默丢）
      throw new Error('matrix credentials vanished since briefDelivery creation (matrix-session.json removed and no LOOP_MATRIX_* env)')
    }
    const client = getMatrixClient({
      homeserverUrl: creds.homeserverUrl,
      accessToken: creds.accessToken,
      userId: creds.userId,
      roomId,
    })
    await client.sendMessage(roomId, {
      msgtype: 'm.text' as never,
      body: text,
    } as never)
  }
}
