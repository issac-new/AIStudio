// overlay/custom/client/matrix-teams/utils.ts
// matrix-teams 模块共享 helper（store 与组件公用，单一事实源）。
import type { MatrixClient, MatrixEvent, RoomState } from 'matrix-js-sdk'

/** 解包「pinia 代理值 / 测试 mock 的 ref 形态」双形态。
 *  pinia 代理读取时已解包；测试 mock 的是 setup 原始返回（ref 形态 { value }）。
 *  用 'value' in raw 判定 ref 形态并取 .value（含 null）；真实 MatrixClient/字符串无 .value 属性。
 *  注意不能用 ?.value ?? raw：{ value: null } 会被 ?? 判空而回退成包装对象（真值），丢 null 语义。 */
export function unwrapRef<T>(raw: unknown): T | null {
  if (raw !== null && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    return (raw as { value: unknown }).value as T | null
  }
  return (raw ?? null) as T | null
}

// ── SDK 自定义事件类型的类型收口 ──
// matrix-js-sdk 的 StateEvents / AccountDataEvents / TimelineEvents 以 string enum 成员作键，
// 本模块自定义事件名（见 protocol.ts 的 TEAM_EVENT_TYPES 等）既不在联合里，字符串字面量也不能赋值给 enum 键类型。
// 运行时 SDK 按任意字符串收发事件，故只在类型层放宽：helper 内部断言签名，调用与返回值逐字不变。
type LooseSendStateEvent = (roomId: string, eventType: string, content: unknown, stateKey?: string) => Promise<unknown>
type LooseSendEvent = (roomId: string, eventType: string, content: unknown) => Promise<unknown>

export function sendCustomStateEvent(
  client: MatrixClient, roomId: string, eventType: string, content: unknown, stateKey = '',
): Promise<unknown> {
  return (client.sendStateEvent as unknown as LooseSendStateEvent)(roomId, eventType, content, stateKey)
}

export function sendCustomEvent(
  client: MatrixClient, roomId: string, eventType: string, content: unknown,
): Promise<unknown> {
  return (client.sendEvent as unknown as LooseSendEvent)(roomId, eventType, content)
}

export function setCustomAccountData(client: MatrixClient, eventType: string, content: unknown): Promise<unknown> {
  return (client.setAccountData as unknown as (t: string, c: unknown) => Promise<unknown>)(eventType, content)
}

export function getCustomAccountData(client: MatrixClient, eventType: string): MatrixEvent | undefined {
  return (client.getAccountData as unknown as (t: string) => MatrixEvent | undefined)(eventType)
}

export function getCustomAccountDataFromServer(client: MatrixClient, eventType: string): Promise<unknown> {
  return (client.getAccountDataFromServer as unknown as (t: string) => Promise<unknown>)(eventType)
}

export function getCustomStateEvents(state: RoomState, eventType: string): MatrixEvent[] {
  return (state.getStateEvents as unknown as (t: string, k?: string) => MatrixEvent[])(eventType)
}
