// overlay[zcode] R4-P2：zcode 会话投影的 socket.io 数据面（/zcode 命名空间）。
//
// 模式复刻 loop-socket（custom/server/loop/services/loop-socket.ts）：连接进
// join 房间、emit 助手供各子系统扇出。房间两级：
//   zcode:<workspacePath>                     —— workspace 级（sessions-index / status）
//   zcode:<workspacePath>:s:<sessionId>       —— 会话级（conversation.frame）
// 事件名 zcode:event，payload = session-projection.ts 的 ProjectionEvent
// （含 DispatchReasonCode 词表值，cockpit chip 按字面值本地化）。
//
// 房间归属（X1 收口）：鉴权（nsp.use）只管「谁能连」，进房另判「谁能看到哪个
// workspace」——subscribe/subscribe-session 经 canUseWorkspace 归属闸（与引擎
// run 入口同款：workspace 须注册于 Studio 会话注册表且对调用方可见），拒绝则静默
// 不进房（协议现状 subscribe 无 ack，客户端 fire-and-forget；跨 workspace 元数据
// 不再可读）。socket.data.user 由鉴权中间件写入；isAuthEnabled 关闭（单用户部署）
// 时缺席 → canUseWorkspace 放行，与 workspace-access.ts 口径一致。
import type { Server, Socket } from 'socket.io'
import type { ProjectionEvent } from './session-projection'
import type { MentionOutcome } from './mention-dispatch'
import { canUseWorkspace, type WorkspaceCaller } from './workspace-access'

/** /zcode 房间可承载的事件面（投影事件 + 派单 outcome；共同约束是 workspaceId 键）。 */
export type ZcodeSocketEvent = ProjectionEvent | MentionOutcome

/** 命名空间鉴权面（upstream studio sockets 同款：isAuthEnabled 开关 + token 校验）。 */
export interface ZcodeNamespaceAuth {
  isAuthEnabled(): Promise<boolean> | boolean
  authenticateUserToken(token: string): Promise<unknown> | unknown
}

/**
 * 缺省鉴权面 = upstream studio 的 public/auth（pet-state.ts authMiddleware 同款语义）。
 * custom 不做静态 import upstream（symlink 真实路径陷阱，见 services/hermes/fleet-events.ts
 * 头注释：src/custom 符号链接 realpath 回 overlay 侧，静态相对 import 落不到 upstream 树）。
 * 这里用懒加载 require 字面量按真实路径取（overlay/custom/server/zcode → ../../../../upstream/...，
 * 与 vitest.config.ts、__tests__ 的 '../upstream/hermes-studio' 兄弟布局同源）：esbuild
 * 构建期会把该字面量打进 bundle（打包产物同样可用），ts-node 运行期走盘上相对解析。
 */
function loadUpstreamAuth(): ZcodeNamespaceAuth {
  // 字面量 require 供构建期打包；try/catch 供布局异常时给出可读失败而不是启动即崩。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../../../upstream/hermes-studio/packages/server/src/modules/studio/public/auth') as Partial<ZcodeNamespaceAuth>
  if (typeof mod?.isAuthEnabled !== 'function' || typeof mod?.authenticateUserToken !== 'function') {
    throw new Error('upstream auth 模块缺少 isAuthEnabled/authenticateUserToken')
  }
  return mod as ZcodeNamespaceAuth
}

function loadUpstreamAuthSafe(): ZcodeNamespaceAuth | null {
  try {
    return loadUpstreamAuth()
  } catch (err) {
    // 鉴权面不可用 → fail closed（见 setupZcodeProjectionSocket 内连接拒绝），不静默放行。
    console.error(`[zcode-projection] 鉴权面加载失败，/zcode 将拒绝所有连接：${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

let activeIo: Server | null = null

/**
 * 进房归属闸（X1 收口）：canUseWorkspace 判定通过才 join。拒绝静默不进房——协议现状
 * subscribe 无 ack（客户端 fire-and-forget，见 client zcode-socket.ts），不新增回包形态。
 */
function joinIfAllowed(socket: Socket, room: string, workspacePath: string): void {
  const user = (socket.data as { user?: WorkspaceCaller } | undefined)?.user
  if (!canUseWorkspace(user, workspacePath)) return
  socket.join(room)
}

export function setupZcodeProjectionSocket(io: Server, authDeps?: ZcodeNamespaceAuth): void {
  activeIo = io
  const nsp = io.of('/zcode')

  // /zcode 命名空间鉴权（S3）：客户端 zcode-socket.ts 会送 handshake.auth.token，此前服务端
  // 不校验——同网段任意主机可订阅任意 workspace 的会话投影。接法对齐 upstream pet-state.ts
  // authMiddleware：isAuthEnabled 关闭时放行，开启时校验 token，不通过 next(err) 拒绝连接。
  // authDeps 缺省懒加载 upstream auth；加载失败时 fail closed，不静默放行。
  const auth = authDeps ?? loadUpstreamAuthSafe()
  nsp.use(async (socket: Socket, next: (err?: Error) => void) => {
    if (!auth) {
      next(new Error('zcode 投影鉴权面不可用，拒绝连接'))
      return
    }
    try {
      if (!(await auth.isAuthEnabled())) {
        next()
        return
      }
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token
      const user = await auth.authenticateUserToken(typeof token === 'string' ? token : '')
      if (!user) {
        next(new Error('Authentication failed'))
        return
      }
      ;(socket.data as Record<string, unknown>).user = user
      next()
    } catch (err) {
      next(err instanceof Error ? err : new Error('Authentication failed'))
    }
  })

  nsp.on('connection', (socket: Socket) => {
    socket.on('subscribe', (workspacePath: string) => {
      if (typeof workspacePath === 'string' && workspacePath.length > 0) {
        joinIfAllowed(socket, `zcode:${workspacePath}`, workspacePath) // 归属闸：跨 workspace 不进房
      }
    })
    socket.on('unsubscribe', (workspacePath: string) => {
      if (typeof workspacePath === 'string') socket.leave(`zcode:${workspacePath}`)
    })
    socket.on('subscribe-session', (workspacePath: string, sessionId: string) => {
      if (typeof workspacePath === 'string' && typeof sessionId === 'string' && sessionId.length > 0) {
        joinIfAllowed(socket, `zcode:${workspacePath}:s:${sessionId}`, workspacePath) // 归属闸同 workspace 级
      }
    })
    socket.on('unsubscribe-session', (workspacePath: string, sessionId: string) => {
      if (typeof workspacePath === 'string' && typeof sessionId === 'string') {
        socket.leave(`zcode:${workspacePath}:s:${sessionId}`)
      }
    })
    // multica §五 WS scope 细化：task 级房间（任务维度事件——派单 outcome/编排进度）。
    socket.on('subscribe-task', (workspacePath: string, taskId: string) => {
      if (typeof workspacePath === 'string' && typeof taskId === 'string' && taskId.length > 0) {
        joinIfAllowed(socket, `zcode:${workspacePath}:t:${taskId}`, workspacePath) // 归属闸同 workspace 级
      }
    })
    socket.on('unsubscribe-task', (workspacePath: string, taskId: string) => {
      if (typeof workspacePath === 'string' && typeof taskId === 'string') {
        socket.leave(`zcode:${workspacePath}:t:${taskId}`)
      }
    })
  })
}

/** 扇出：workspace 级房间必投；带 sessionId 的事件加投会话级房间。io 缺席时静默（无连接面）。 */
export function emitZcodeProjectionEvent(io: Server | null | undefined, event: ZcodeSocketEvent): void {
  const target = io ?? activeIo
  if (!target) return
  const rooms = [`zcode:${event.workspaceId}`]
  if ('sessionId' in event && event.sessionId) rooms.push(`zcode:${event.workspaceId}:s:${event.sessionId}`)
  if ('taskId' in event && (event as { taskId?: string }).taskId) rooms.push(`zcode:${event.workspaceId}:t:${(event as { taskId?: string }).taskId}`)
  for (const room of rooms) target.of('/zcode').to(room).emit('zcode:event', event)
}
