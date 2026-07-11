// overlay/custom/server/loop/store/matrix-client.ts
import { createClient, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk'

export interface MatrixClientConfig {
  homeserverUrl: string
  accessToken: string
  userId: string
  roomId: string
}

let clientInstance: MatrixClient | null = null

export function getMatrixClient(config: MatrixClientConfig): MatrixClient {
  if (clientInstance) return clientInstance
  clientInstance = createClient({
    baseUrl: config.homeserverUrl,
    accessToken: config.accessToken,
    userId: config.userId,
  })
  clientInstance.startClient({ initialSync: true })
  return clientInstance
}

export function disconnectMatrixClient(): void {
  if (clientInstance) {
    clientInstance.stopClient()
    clientInstance = null
  }
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
  return client.sendStateEvent(roomId, type, content, key)
}

export async function sendMessage(
  client: MatrixClient,
  roomId: string,
  type: string,
  content: unknown,
): Promise<string> {
  return client.sendMessage(roomId, {
    msgtype: 'm.text',
    body: JSON.stringify(content),
    ...content as object,
  })
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
  const events = state.filter((e: MatrixEvent) => e.getType() === type)
  return events.map((e: MatrixEvent) => ({
    key: e.getStateKey() ?? '',
    content: e.getContent(),
  }))
}

export async function getRoomMessages(
  client: MatrixClient,
  roomId: string,
  limit: number = 50,
): Promise<MatrixEvent[]> {
  const response = await client.createMessagesRequest(roomId, '', limit, 'b')
  return response.chunk ?? []
}
