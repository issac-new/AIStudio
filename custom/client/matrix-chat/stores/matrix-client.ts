import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createClient,
  ClientEvent,
  RoomEvent,
  HttpApiEvent,
  KnownMembership,
  type MatrixClient,
  type ICreateClientOpts,
  type Room,
} from 'matrix-js-sdk'
import {
  getMatrixCredentials,
  storeMatrixCredentials,
  clearMatrixCredentials,
  hasMatrixCredentials,
  type MatrixCredentials,
} from './matrix-credentials'
import { matrixSdkLogin } from './matrix-credentials'
import { matrixEventBus } from './matrix-events'
import { fetchMatrixServerInfo } from '@/custom/ia2/matrix-server-info'
import { homeserverUrlEquals } from '../utils/server-url'

/**
 * 凭据桥接（run23 复盘）：/api/matrix/gateway-credentials 返回本机 gateway 的
 * Matrix 三元组（服务端回环四闸在 custom/server/matrix/routes.ts；deviceId 缺省
 * 空串与上游 autoLoginFromGateway 同口径）。失败返回 null——调用方回落原错误口径。
 * 不引 deviceId 桥（网关 dotenv 无该字段；空 deviceId 的 client 走 /sync 正常）。
 */
async function bridgeCredentialsFromGateway() {
  try {
    const res = await fetch('/api/matrix/gateway-credentials')
    if (!res.ok) return null
    const g = await res.json() as {
      configured?: boolean; homeserverUrl?: string; accessToken?: string; userId?: string
    }
    if (!g?.configured || !g.accessToken || !g.userId || !g.homeserverUrl) return null
    return { homeserverUrl: g.homeserverUrl, accessToken: g.accessToken, userId: g.userId, deviceId: '' }
  } catch {
    return null
  }
}

export const useMatrixClientStore = defineStore('matrix-client', () => {
  // ─── State ─────────────────────────────────────────────
  const client = ref<MatrixClient | null>(null)
  const credentials = ref<MatrixCredentials | null>(getMatrixCredentials())
  const authenticated = ref(hasMatrixCredentials())
  const syncState = ref<string>('') // PREPARED / SYNCING / RECONNECTING / ERROR / STOPPED
  const error = ref<string | null>(null)
  // 存量凭据 vs server-info 单源对账（spec matrix-server-info-single-source 挂账清零）：
  // localStorage 里的 homeserverUrl 是登录当时的快照，服务器迁移后永不刷新——
  // 不对账则报错与连接一直指向旧地址。命中即置位并拒绝起旧 client（设备凭据
  // 绑定服务器，换 baseUrl 重连必然 401，唯一正路是重登）。
  const serverMoved = ref<{ from: string; to: string } | null>(null)

  // ─── Credential computeds ──────────────────────────────
  const userId = computed(() => credentials.value?.userId ?? null)
  const homeserverUrl = computed(() => credentials.value?.homeserverUrl ?? null)
  const accessToken = computed(() => credentials.value?.accessToken ?? null)
  const deviceId = computed(() => credentials.value?.deviceId ?? null)

  // ─── Actions ───────────────────────────────────────────

  async function login(homeserver: string, username: string, password: string) {
    error.value = null
    try {
      const creds = await matrixSdkLogin(homeserver, username, password)
      storeMatrixCredentials(creds)
      credentials.value = creds
      authenticated.value = true
    } catch (err: any) {
      error.value = err?.message || 'Matrix login failed'
      throw err
    }
  }

  function logout() {
    disconnect()
    clearMatrixCredentials()
    credentials.value = null
    authenticated.value = false
    syncState.value = ''
    error.value = null
    serverMoved.value = null
    // Clear room state via event bus (no direct store import)
    matrixEventBus.onRoomListChange.value = null
    matrixEventBus.onTimeline.value = null
    matrixEventBus.onThreadUpdate.value = null
  }

  function refreshCredentials() {
    const creds = getMatrixCredentials()
    credentials.value = creds
    authenticated.value = !!creds
  }

  // ─── Client lifecycle ──────────────────────────────────

  async function initClient() {
    if (client.value) return // already connected

    let creds = getMatrixCredentials()
    if (!creds) {
      // 凭据缺失桥接（run23 复盘根治）：登录有三种形态，其中两种会写 matrix 四件套
      // （账号密码登录/网关免密自动登录），但「matrix-login 换 JWT 后直写 api_key」
      // 的路径不写——该形态下 delivery-cases 等依赖 matrix-js-sdk 的面板恒空态
      // （协议事件全落房而 client 起不来，run23 实录）。initClient 是所有此类面板
      // 的统一入口，在此桥接一次：尝试 /api/matrix/gateway-credentials（服务端已有
      // 回环四闸，返回本机 gateway 凭据三元组），拿到即按原语义持久化并继续；拿不到
      // 保持原行为（报 No Matrix credentials found），不改变错误口径。
      creds = await bridgeCredentialsFromGateway()
      if (!creds) {
        error.value = 'No Matrix credentials found'
        return
      }
      // 桥接拿到的凭据按原语义持久化——后续 initClient 走正常 getMatrixCredentials
      // 路径（含 homeserver 对账），不因刷新丢失。
      storeMatrixCredentials(creds)
    }
    credentials.value = creds
    authenticated.value = true

    // 单源对账：存量 homeserver 与 /api/matrix/server-info 不一致 → 不起旧
    // client，置 serverMoved 供横幅引导重登（端点不可达时按兜底值对账，与
    // 登录预填同口径；localhost/127.0.0.1 与尾斜杠差异不算变更）。
    const info = await fetchMatrixServerInfo().catch(() => null)
    if (info && !homeserverUrlEquals(creds.homeserverUrl, info.homeserverUrl)) {
      serverMoved.value = { from: creds.homeserverUrl, to: info.homeserverUrl }
      error.value = 'Matrix 服务器地址已变更，请重新登录'
      return
    }
    serverMoved.value = null

    // threadSupport 在当前 SDK 的 IStartClientOpts 上（createClient 侧类型未收录）；
    // 运行时仍随 opts 透传（旧版 SDK 读 createClient opts），故按交叉类型声明，不改传参。
    const opts: ICreateClientOpts & { threadSupport?: boolean } = {
      baseUrl: creds.homeserverUrl,
      accessToken: creds.accessToken,
      userId: creds.userId,
      // 启用 thread 支持:否则 client.supportsThreads() 返回 false,SDK 不会从
      // m.thread 关系构建 Thread 对象 → room.getThread() 永远返回 null,
      // ThreadSummary 卡片无法渲染。element-web 默认开启此项。
      threadSupport: true,
    }

    if (creds.deviceId) {
      opts.deviceId = creds.deviceId
    }

    const matrixClient = createClient(opts)

    matrixClient.on(ClientEvent.Sync, (state: string) => {
      syncState.value = state
      if (state === 'PREPARED') {
        matrixEventBus.onRoomListChange.value?.()
        matrixEventBus.onTimeline.value?.()
        error.value = null
      } else if (state === 'SYNCING') {
        matrixEventBus.onRoomListChange.value?.()
        matrixEventBus.onTimeline.value?.()
        error.value = null
      } else if (state === 'ERROR') {
        error.value = 'Sync error'
      } else if (state === 'RECONNECTING') {
        error.value = 'Reconnecting...'
      }
    })

    matrixClient.on(HttpApiEvent.SessionLoggedOut, () => {
      disconnect()
      authenticated.value = false
      clearMatrixCredentials()
      credentials.value = null
      error.value = 'Session logged out'
    })

    matrixClient.on(RoomEvent.Timeline, (
      _event: any,
      _room: any,
      toStartOfTimeline: boolean | undefined,
    ) => {
      if (toStartOfTimeline) return
      matrixEventBus.onRoomListChange.value?.()
      matrixEventBus.onTimeline.value?.()
      matrixEventBus.onThreadUpdate.value?.()
    })

    // ★ 本地回显收敛（D1 根治）：SDK 发送确认时对同一 MatrixEvent 原地翻转
    // id（~local-* → 真实 id）与 status（SENDING → SENT），只发 LocalEchoUpdated
    // 不发 Timeline——此前零监听，乐观回显的「发送中…」永不收敛（服务端实际
    // 已落库），切房间/刷新才恢复。
    matrixClient.on(RoomEvent.LocalEchoUpdated, () => {
      matrixEventBus.onLocalEchoUpdated.value?.()
      matrixEventBus.onRoomListChange.value?.()
    })

    matrixClient.on(RoomEvent.MyMembership, (room: any, membership: string) => {
      if (membership === KnownMembership.Invite) {
        void matrixClient.joinRoom(room.roomId)
      }
      matrixEventBus.onRoomListChange.value?.()
    })

    matrixClient.on(RoomEvent.Name, () => {
      matrixEventBus.onRoomListChange.value?.()
    })

    // ★ 未读通知数变化时刷新 roomList。
    // SDK 在 /sync 带回 notification_count、或收到 receipt 时会更新未读计数。
    // 之前没监听它,导致 roomList 的未读 badge 不响应 SDK 的更新(表现为
    // 已读房间仍显示旧未读数,如"始终 2 条")。
    // UnreadNotifications 是 Room 侧事件（v41 的客户端 EmittedEvents 不含它，挂在
    // client 上永不触发）——按房间挂载：首同步已建房间立即补挂，后续新房间经
    // ClientEvent.Room 挂载；WeakSet 防重复，房间生命周期随 client 一起丢弃。
    const unreadListened = new WeakSet<Room>()
    const listenRoomUnread = (room: Room): void => {
      if (unreadListened.has(room)) return
      unreadListened.add(room)
      room.on(RoomEvent.UnreadNotifications, () => {
        matrixEventBus.onRoomListChange.value?.()
      })
    }
    matrixClient.getRooms().forEach(listenRoomUnread)
    matrixClient.on(ClientEvent.Room, (room: Room) => listenRoomUnread(room))

    matrixClient.on(RoomEvent.Receipt, () => {
      matrixEventBus.onRoomListChange.value?.()
    })

    client.value = matrixClient

    try {
      // threadSupport 必须在 startClient 的 opts 里(SDK 把 startClient 的 opts
      // 存为 clientOpts,supportsThreads() 读 clientOpts.threadSupport)。
      // 不传则 SDK 不构建 Thread 对象,ThreadSummary 卡片无法渲染。
      await matrixClient.startClient({ initialSyncLimit: 20, threadSupport: true } as any)
    } catch (err: any) {
      error.value = err?.message || 'Failed to start Matrix client'
    }
  }

  function disconnect() {
    if (client.value) {
      client.value.stopClient()
      client.value = null
    }
    syncState.value = 'STOPPED'
  }

  return {
    // State
    client,
    credentials,
    authenticated,
    syncState,
    error,
    serverMoved,
    // Computed
    userId,
    homeserverUrl,
    accessToken,
    deviceId,
    // Actions
    login,
    logout,
    refreshCredentials,
    initClient,
    disconnect,
  }
})
