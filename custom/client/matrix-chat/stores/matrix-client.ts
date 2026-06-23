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
} from 'matrix-js-sdk'
import {
  getMatrixCredentials,
  storeMatrixCredentials,
  clearMatrixCredentials,
  hasMatrixCredentials,
  type MatrixCredentials,
} from '@/api/client'
import { matrixSdkLogin } from '@/api/auth'
import { matrixEventBus } from './matrix-events'

export const useMatrixClientStore = defineStore('matrix-client', () => {
  // ─── State ─────────────────────────────────────────────
  const client = ref<MatrixClient | null>(null)
  const credentials = ref<MatrixCredentials | null>(getMatrixCredentials())
  const authenticated = ref(hasMatrixCredentials())
  const syncState = ref<string>('') // PREPARED / SYNCING / RECONNECTING / ERROR / STOPPED
  const error = ref<string | null>(null)

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

    const creds = getMatrixCredentials()
    if (!creds) {
      error.value = 'No Matrix credentials found'
      return
    }
    credentials.value = creds
    authenticated.value = true

    const opts: ICreateClientOpts = {
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
    // SDK 在 /sync 带回 notification_count、或收到 receipt 时会触发此事件。
    // 之前没监听它,导致 roomList 的未读 badge 不响应 SDK 的更新(表现为
    // 已读房间仍显示旧未读数,如"始终 2 条")。
    matrixClient.on(RoomEvent.UnreadNotifications, () => {
      matrixEventBus.onRoomListChange.value?.()
    })

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
