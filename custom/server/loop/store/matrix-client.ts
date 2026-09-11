// overlay/custom/server/loop/store/matrix-client.ts
import { createClient, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk'

export interface MatrixClientConfig {
  homeserverUrl: string
  accessToken: string
  userId: string
  roomId: string
}

/** 凭据指纹 → 客户端 的键控池（2026-09-12 审查）：此前纯单例会永久钉死首次凭据——
 *  应用内重登录（token 轮换/旧 token 吊销）后 Brief 投递一直用死 token 静默 401，
 *  或与 MatrixStore 身份串号。按指纹键控：同凭据复用连接，凭据变更即换新客户端；
 *  上限 4 防指纹膨胀（现实至多 store + gateway 两套）。 */
const clientPool = new Map<string, MatrixClient>()
const CLIENT_POOL_MAX = 4

function identityOf(config: MatrixClientConfig): string {
  return `${config.userId}\n${config.homeserverUrl}\n${config.accessToken}`
}

export function getMatrixClient(config: MatrixClientConfig): MatrixClient {
  const identity = identityOf(config)
  const existing = clientPool.get(identity)
  if (existing) return existing
  const client = createClient({
    baseUrl: config.homeserverUrl,
    accessToken: config.accessToken,
    userId: config.userId,
  })
  client.startClient({ initialSync: true } as any) as any as string
  clientPool.set(identity, client)
  if (clientPool.size > CLIENT_POOL_MAX) {
    const oldestKey = clientPool.keys().next().value
    if (oldestKey !== undefined) {
      const oldest = clientPool.get(oldestKey)
      clientPool.delete(oldestKey)
      if (oldest) {
        try { oldest.stopClient() } catch { /* 退场失败不阻断新客户端 */ }
      }
    }
  }
  return client
}

export function disconnectMatrixClient(): void {
  for (const client of clientPool.values()) {
    try { client.stopClient() } catch { /* 逐个退场，互不阻断 */ }
  }
  clientPool.clear()
}

export const LOOP_STATE_EVENT_TYPES = {
  STATE: 'm.loop.state',
  CONTRACT: 'm.loop.contract',
  VERIFICATION: 'm.loop.verification',
  EVENT_LOG: 'm.loop.event',
  LEASE: 'm.loop.lease',
} as const

export async function sendStateEvent(
  client: MatrixClient,
  roomId: string,
  type: string,
  key: string,
  content: unknown,
): Promise<string> {
  return client.sendStateEvent(roomId, type as any, content, key) as any as string
}

export async function sendMessage(
  client: MatrixClient,
  roomId: string,
  type: string,
  content: unknown,
): Promise<string> {
  const res = await client.sendMessage(roomId, {
    msgtype: 'm.text' as any,
    body: JSON.stringify(content),
    ...content as object,
  })
  return typeof res === 'string' ? res : (res as any)?.event_id ?? ''
}

export async function getStateEvent(
  client: MatrixClient,
  roomId: string,
  type: string,
  key: string,
): Promise<unknown | null> {
  try {
    return await client.getStateEvent(roomId, type, key)
  } catch {
    return null
  }
}

export async function listStateEventsWithType(
  client: MatrixClient,
  roomId: string,
  type: string,
): Promise<Array<{ key: string; content: unknown }>> {
  const state = await client.roomState(roomId)
  const events = state.filter((e: any) => e.getType() === type)
  return events.map((e: any) => ({
    key: e.getStateKey() ?? '',
    content: e.getContent(),
  }))
}

export async function getRoomMessages(
  client: MatrixClient,
  roomId: string,
  limit: number = 50,
): Promise<MatrixEvent[]> {
  const response = await client.createMessagesRequest(roomId, '', limit, 'b' as any)
  return (response.chunk ?? []) as any[]
}
