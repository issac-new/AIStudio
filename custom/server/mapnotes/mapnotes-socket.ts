// overlay[mapnotes] 实时协同 socket 通道（挂账清偿批三 D1，2026-10-27）。
//
// 形态照抄 zcode projection-socket：activeIo 缓存（REST 控制器不穿 io）+ 鉴权中间件
// （懒加载 upstream auth，fail-closed）+ 房间 `mapnotes:<指纹>`。事件两族：
//   mapnotes:changed —— 标注变更（upsert/delete，POST/REST 成功后由控制器广播）；
//   mapnotes:presence —— join/leave 在线协作者数（房间成员数，presence 数据源即房间）。
import type { Server, Socket } from 'socket.io'
import type { MapAnnotation } from './mapnotes-store'

export interface MapnotesNamespaceAuth {
  isAuthEnabled(): Promise<boolean> | boolean
  authenticateUserToken(token: string): Promise<unknown> | unknown
}

/** 懒加载 upstream auth（zcode projection-socket 同款：不做静态 import，symlink realpath 陷阱）。 */
function loadUpstreamAuth(): MapnotesNamespaceAuth {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../../../upstream/hermes-studio/packages/server/src/modules/studio/public/auth') as Partial<MapnotesNamespaceAuth>
  if (typeof mod?.isAuthEnabled !== 'function' || typeof mod?.authenticateUserToken !== 'function') {
    throw new Error('upstream auth 模块缺少 isAuthEnabled/authenticateUserToken')
  }
  return mod as MapnotesNamespaceAuth
}

export type MapnotesEvent =
  | { kind: 'upsert'; key: string; annotation: MapAnnotation; applied: boolean }
  | { kind: 'delete'; key: string; nodeId: string; by: string }

let activeIo: Server | null = null

function roomOf(key: string): string {
  return `mapnotes:${key}`
}

/** 房间成员数（presence 读数源）。 */
async function presenceOf(io: Server, key: string): Promise<number> {
  try {
    const sockets = await io.of('/mapnotes').in(roomOf(key)).fetchSockets()
    return sockets.length
  } catch { return 0 }
}

export function setupMapnotesSocket(io: Server, authDeps?: MapnotesNamespaceAuth): void {
  activeIo = io
  const nsp = io.of('/mapnotes')
  const auth = authDeps ?? loadUpstreamAuth()
  nsp.use(async (socket: Socket, next: (err?: Error) => void) => {
    if (!auth) {
      next(new Error('mapnotes 鉴权面不可用，拒绝连接'))
      return
    }
    try {
      if (!(await auth.isAuthEnabled())) { next(); return }
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token
      const user = await auth.authenticateUserToken(typeof token === 'string' ? token : '')
      if (!user) { next(new Error('Authentication failed')); return }
      ;(socket.data as Record<string, unknown>).user = user
      next()
    } catch (err) {
      next(err instanceof Error ? err : new Error('Authentication failed'))
    }
  })

  nsp.on('connection', (socket: Socket) => {
    socket.on('subscribe', async (key: unknown) => {
      if (typeof key !== 'string' || !/^[a-f0-9]{6,64}$/.test(key)) return
      socket.join(roomOf(key))
      // 进房广播 presence（含自己——「N 人正在看」含当前用户）
      const n = await presenceOf(activeIo as Server, key)
      ;(activeIo as Server).of('/mapnotes').to(roomOf(key)).emit('mapnotes:presence', { key, watchers: n, joined: true })
    })
    socket.on('unsubscribe', async (key: unknown) => {
      if (typeof key !== 'string') return
      socket.leave(roomOf(key))
      const n = await presenceOf(activeIo as Server, key)
      ;(activeIo as Server).of('/mapnotes').to(roomOf(key)).emit('mapnotes:presence', { key, watchers: n, joined: false })
    })
  })
}

/** 变更广播（REST 控制器消费）：io 缺席时静默（无连接面=无人需要实时同步）。 */
export function emitMapnotesEvent(event: MapnotesEvent): void {
  if (!activeIo) return
  activeIo.of('/mapnotes').to(roomOf(event.key)).emit('mapnotes:changed', event)
}
