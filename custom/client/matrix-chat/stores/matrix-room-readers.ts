// 文件职责：matrix-room store 的只读投影与小动作（成员/房间信息/E2E/thread/诊断）。
// 拆分纪律：纯移动，无行为变更；依赖以 getter 注入，避免循环 import。
import { ref } from 'vue'
import { Room, KnownMembership, NotificationCountType, EventType, DeviceVerification } from 'matrix-js-sdk'
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk'

export type RoomNotificationLevel = 'highlight' | 'total' | 'none'

/** 分页状态形状＝matrix-room store 的 paginationState ref（事实源在 store，此处为注入契约） */
export type RoomPaginationState = Record<string, { oldestToken: string | null; hasMore: boolean; isLoadingOlder: boolean }>

export interface RoomReaderDeps {
  getClient: () => MatrixClient | null
  getActiveRoom: () => Room | null
  getActiveRoomId: () => string | null
  getMessageList: () => MatrixEvent[]
  getPaginationState: () => RoomPaginationState
  bumpRoomVersion: () => void
  /** 拆分前为 clientStore.error 赋值；错误面归 client store，经注入写入 */
  setError: (message: string | null) => void
}

export function createRoomReaderFns(deps: RoomReaderDeps) {
  const { getClient, getActiveRoom, getActiveRoomId, getMessageList, getPaginationState, bumpRoomVersion, setError } = deps
  // ── Room member helpers ──
  /** Get sorted member list for a room, grouped by role */
  function getRoomMemberList(roomId: string): { admins: any[]; mods: any[]; defaults: any[]; invited: any[] } {
    const client = getClient()
    const room = client?.getRoom(roomId)
    if (!room) return { admins: [], mods: [], defaults: [], invited: [] }

    const members = room.getJoinedMembers()
    const admins: any[] = []
    const mods: any[] = []
    const defaults: any[] = []
    const invited: any[] = []

    for (const member of members) {
      const powerLevel = member.powerLevel ?? 0
      if (powerLevel >= 100) admins.push(member)
      else if (powerLevel >= 50) mods.push(member)
      else defaults.push(member)
    }

    // Also include invited members
    const state = room.currentState
    if (state) {
      state.getMembers().forEach((m: any) => {
        if (m.membership === KnownMembership.Invite) {
          invited.push(m)
        }
      })
    }

    return { admins, mods, defaults, invited }
  }

  /** Get the power level (role) of a member */
  function getMemberPowerLevel(roomId: string, userId: string): number {
    const room = getClient()?.getRoom(roomId)
    if (!room) return 0
    const member = room.getMember(userId)
    return member?.powerLevel ?? 0
  }

  /** Check if the current user can kick/ban in a room */
  function canKickInRoom(roomId: string): boolean {
    const client = getClient()
    if (!client) return false
    const room = client.getRoom(roomId)
    if (!room) return false
    const myUserId = client.getUserId()
    if (!myUserId) return false
    const me = room.getMember(myUserId)
    return (me?.powerLevel ?? 0) >= 50 // Need mod or admin level
  }
  // ── Room readers ──
  /** Get room avatar URL (mxc -> http) */
  function getRoomAvatarUrl(room: any, size = 96): string | null {
    const client = getClient()
    if (!client) return null
    const mxcUrl = room.getMxcAvatarUrl()
    if (!mxcUrl) return null
    return client.mxcUrlToHttp(mxcUrl, size, size, 'crop') ?? null
  }

  /** Get user avatar URL */
  function getUserAvatarUrl(memberOrUserId: any, size = 64): string | null {
    const client = getClient()
    if (!client) return null
    const mxcUrl = typeof memberOrUserId === 'string'
      ? client.getUser(memberOrUserId)?.avatarUrl
      : memberOrUserId?.getMxcAvatarUrl?.() ?? memberOrUserId?.avatarUrl
    if (!mxcUrl) return null
    return client.mxcUrlToHttp(mxcUrl, size, size, 'crop') ?? null
  }

  /** Get room topic */
  function getRoomTopic(room: any): string {
    if (!room) return ''
    const state = room.currentState
    if (!state) return ''
    const topicEvent = state.getStateEvents('m.room.topic', '')
    if (!topicEvent) return ''
    return topicEvent.getContent()?.topic ?? ''
  }

  /** Check if a room is encrypted */
  function isRoomEncrypted(roomId: string): boolean {
    const room = getClient()?.getRoom(roomId)
    if (!room) return false
    return room.hasEncryptionStateEvent()
  }

  /** Check if a room is public (join_rule = public) */
  function isRoomPublic(room: any): boolean {
    if (!room) return false
    const state = room.currentState
    if (!state) return false
    const joinRuleEvent = state.getStateEvents('m.room.join_rules', '')
    const joinRule = joinRuleEvent?.getContent()?.join_rule
    return joinRule === 'public'
  }

  /** Get room alias (canonical alias or first alt alias) */
  function getRoomAlias(room: Room | null): string {
    if (!room) return ''
    return room.getCanonicalAlias() || room.getAltAliases()?.[0] || ''
  }

  /** Check if current room is marked as favorite */
  function isRoomFavorite(): boolean {
    const room = getActiveRoom()
    if (!room) return false
    const tags = room.tags as Record<string, Record<string, any>> | undefined
    return !!tags?.['m.favourite']
  }

  /** Toggle favorite tag on current room */
  async function toggleRoomFavorite(): Promise<void> {
    const client = getClient()
    const room = getActiveRoom()
    if (!client || !room) return
    const fav = isRoomFavorite()
    try {
      if (fav) {
        await client.deleteRoomTag(room.roomId, 'm.favourite')
      } else {
        await client.setRoomTag(room.roomId, 'm.favourite', { order: 0 })
      }
      bumpRoomVersion()
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle favorite')
      throw err
    }
  }

  /** Check if the current user can edit the room topic */
  function canEditTopic(): boolean {
    const client = getClient()
    const room = getActiveRoom()
    if (!room || !client) return false
    const uid = client.getUserId()
    if (!uid) return false
    try {
      return room.currentState.maySendStateEvent(EventType.RoomTopic, uid)
    } catch {
      return false
    }
  }

  /** Set room topic */
  async function setRoomTopic(topicText: string): Promise<void> {
    const client = getClient()
    const roomId = getActiveRoomId()
    if (!client || !roomId) return
    try {
      await client.setRoomTopic(roomId, topicText)
      bumpRoomVersion()
    } catch (err: any) {
      setError(err?.message || 'Failed to set room topic')
      throw err
    }
  }
  // ── Room Info helpers (mirror element-web RoomSummaryCardViewModel) ──

  /** Get history visibility for a room: world_readable | shared | invited | joined */
  function getHistoryVisibility(room: any): string {
    if (!room?.currentState) return ''
    const hvEvent = room.currentState.getStateEvents('m.room.history_visibility', '')
    const hv = hvEvent?.getContent()?.history_visibility
    return hv ?? ''
  }

  /**
   * Get E2E trust status for a room.
   * 'warning' = room is encrypted but there are unverified devices.
   * 'normal'  = OK or not encrypted.
   *
   * SDK v41 的设备信息 API 全异步（getUserDeviceInfo(userIds: string[]) →
   * Promise<DeviceMap>；旧版「单 userId 同步返回 Map」形态已不存在），而消费方
   * （RoomSummaryCard / MemberInfo）是同步 computed——采用「读缓存 + 后台刷新」：
   * 首读触发一次异步探测，结果变化时 bumpRoomVersion 驱动消费方重算；
   * in-flight 去重 + 10s 冷却，防 roomVersion 回环与重复探测。
   */
  const e2eStatusCache = ref<Record<string, 'normal' | 'warning'>>({})
  const e2eRefreshing = new Set<string>()
  const e2eCheckedAt: Record<string, number> = {}

  function getE2EStatus(roomId: string): 'normal' | 'warning' {
    if (Date.now() - (e2eCheckedAt[roomId] ?? 0) > 10_000) {
      e2eCheckedAt[roomId] = Date.now()
      void refreshE2EStatus(roomId)
    }
    return e2eStatusCache.value[roomId] ?? 'normal'
  }

  async function refreshE2EStatus(roomId: string): Promise<void> {
    if (e2eRefreshing.has(roomId)) return
    e2eRefreshing.add(roomId)
    try {
      const client = getClient()
      const room = client?.getRoom(roomId)
      if (!client || !room || !room.hasEncryptionStateEvent()) return
      const crypto = client.getCrypto?.()
      if (!crypto) return
      const myUserId = client.getUserId()
      const others = room.getJoinedMembers().map(m => m.userId).filter(id => id !== myUserId)
      if (others.length === 0) return
      const deviceMap = await crypto.getUserDeviceInfo(others)
      let warning = false
      for (const devices of deviceMap.values()) {
        for (const device of devices.values()) {
          if (device.verified === DeviceVerification.Unverified) { warning = true; break }
        }
        if (warning) break
      }
      const next: 'normal' | 'warning' = warning ? 'warning' : 'normal'
      if (e2eStatusCache.value[roomId] !== next) {
        e2eStatusCache.value = { ...e2eStatusCache.value, [roomId]: next }
        bumpRoomVersion()
      }
    } catch {
      // 设备列表不可用（无 cross-signing / 请求失败 / 房间未就绪）：保持上次结果，不猜
    } finally {
      e2eRefreshing.delete(roomId)
    }
  }

  /** Check if a room is a direct message (1:1 chat). Matches element-web useIsDirectMessage. */
  function isDirectMessage(room: any): boolean {
    const client = getClient()
    if (!room || !client) return false
    try {
      // Check m.direct account data first (authoritative)
      const directEvent = client.getAccountData(EventType.Direct)
      if (directEvent) {
        const content = directEvent.getContent() as Record<string, string[]>
        for (const [, roomIds] of Object.entries(content)) {
          if (Array.isArray(roomIds) && roomIds.includes(room.roomId)) return true
        }
      }
      // Fallback: 2 members and not public
      const joinRuleEvent = room.currentState?.getStateEvents('m.room.join_rules', '')
      const isPublic = joinRuleEvent?.getContent()?.join_rule === 'public'
      return room.getJoinedMemberCount() === 2 && !isPublic
    } catch {
      return false
    }
  }

  /** Check if a room is a video room (Element Call / video conferencing room). */
  function isVideoRoom(room: any): boolean {
    if (!room) return false
    try {
      // Check via SDK helper if available
      if (typeof room.isVideoRoom === 'function') return room.isVideoRoom()
      // Check create event for type field
      const createEvent = room.currentState?.getStateEvents('m.room.create', '')
      const type = createEvent?.getContent()?.type
      return type === 'm.video'
    } catch {
      return false
    }
  }

  /** Check if the current user can invite new members to the room. Matches element-web canInviteTo. */
  function canInviteToRoom(room: any): boolean {
    const client = getClient()
    if (!room || !client) return false
    try {
      const uid = client.getSafeUserId()
      return room.canInvite(uid) && room.getMyMembership() === 'join'
    } catch {
      return false
    }
  }

  /** Get count of pinned messages in a room. */
  function getPinnedEventCount(room: any): number {
    if (!room?.currentState) return 0
    try {
      const pinnedEvent = room.currentState.getStateEvents('m.room.pinned_events', '')
      if (!pinnedEvent) return 0
      const pinned = pinnedEvent.getContent()?.pinned
      return Array.isArray(pinned) ? pinned.length : 0
    } catch {
      return 0
    }
  }

  /** Get the pinned events state content (event IDs array). */
  function getPinnedEventIds(room: any): string[] {
    if (!room?.currentState) return []
    try {
      const pinnedEvent = room.currentState.getStateEvents('m.room.pinned_events', '')
      const pinned = pinnedEvent?.getContent()?.pinned
      return Array.isArray(pinned) ? pinned : []
    } catch {
      return []
    }
  }


  /** Search the user directory for matching users */
  async function searchUserDirectory(query: string): Promise<Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>> {
    const client = getClient()
    if (!client || !query.trim()) return []
    try {
      const result = await client.searchUserDirectory({ term: query.trim(), limit: 20 })
      return (result.results || []).map((u: any) => ({
        userId: u.user_id,
        displayName: u.display_name || null,
        avatarUrl: u.avatar_url || null,
      }))
    } catch {
      return []
    }
  }

  /** Get presence status of a user */
  function getUserPresence(userIdToCheck: string): { status: string; lastActive?: number } {
    const client = getClient()
    if (!client) return { status: 'offline' }
    const user = client.getUser(userIdToCheck)
    if (!user) return { status: 'offline' }
    const presence = user.presence ?? 'offline'
    const lastActiveAgo = user.lastActiveAgo ?? undefined
    const lastActive = lastActiveAgo != null ? Date.now() - lastActiveAgo : undefined
    return { status: presence, lastActive }
  }
  function getRoomUnreadCount(room: any): number {
    return room.getUnreadNotificationCount(NotificationCountType.Total) +
      room.getUnreadNotificationCount(NotificationCountType.Highlight)
  }
  /**
   * Read receipts for a specific event, as { userId, ts } pairs.
   * Wraps matrix-js-sdk Room.getEventReadReceipts. Excludes the local user.
   */
  function getEventReadReceipts(eventId: string | null): Array<{ userId: string; ts: number }> {
    const room = getActiveRoom()
    if (!room || !eventId) return []
    const me = getClient()?.getUserId() ?? ''
    try {
      const raw = (room as any).getEventReadReceipts?.(eventId) ?? []
      return raw
        .map((r: any) => ({ userId: String(r?.userId ?? ''), ts: Number(r?.ts ?? 0) }))
        .filter((r: { userId: string }) => r.userId && r.userId !== me)
    } catch {
      return []
    }
  }

  /**
   * Notification level for a room: 'highlight' if any highlight notifications,
   * else 'total' if any total notifications, else 'none'.
   */
  function getRoomNotificationLevel(room: any): RoomNotificationLevel {
    if (!room) return 'none'
    try {
      const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight)
      if (highlight && highlight > 0) return 'highlight'
      const total = room.getUnreadNotificationCount(NotificationCountType.Total)
      if (total && total > 0) return 'total'
      return 'none'
    } catch {
      return 'none'
    }
  }
  /**
   * 初始化房间的话题 timeline sets(镜像 element-web ThreadPanel onMount)。
   * threadTimelineVersion 是响应式触发器:SDK 内部填充 threadsTimelineSets 不会
   * 被 Vue 追踪,所以 init 完成后自增它,让 getThreadsTimelineSet 的 computed 重算。
   */
  const threadTimelineVersion = ref(0)
  async function initRoomThreads(): Promise<void> {
    const room = getActiveRoom()
    if (!room) return
    try {
      await (room as any).createThreadsTimelineSets()
      await (room as any).fetchRoomThreads()
    } catch {
      // Server may not support threads — ignore
    } finally {
      threadTimelineVersion.value++
    }
  }

  /**
   * 取话题过滤后的 timeline set。
   * All = threadsTimelineSets[0],My = [1](镜像 element-web ThreadPanel)。
   * 注意读取 threadTimelineVersion.value 以建立响应式依赖。
   */
  function getThreadsTimelineSet(filter: 'all' | 'my'): any | undefined {
    void threadTimelineVersion.value // 响应式依赖
    const room = getActiveRoom()
    if (!room) return undefined
    const sets = (room as any).threadsTimelineSets
    if (!sets) return undefined
    return filter === 'my' ? sets[1] : sets[0]
  }

  /** 按 id 取 SDK Thread 对象 */
  function getThreadById(threadId: string): any | null {
    const room = getActiveRoom()
    if (!room) return null
    try {
      return (room as any).getThread(threadId) ?? null
    } catch {
      return null
    }
  }
  /**
   * 诊断:打印某个 room 的完整属性 + /messages 原始返回,用于对比不同 room 的差异。
   * 浏览器控制台调用:
   *   useMatrixRoomStore().diagnoseRoom('!bqMsLiasBqZqWkuogk:matrix.test')
   * 或在组件里直接调。
   * 返回一个对象(也 console.log 出来),含 room 属性 + timeline + /messages 原始 chunk。
   */
  async function diagnoseRoom(roomId: string): Promise<any> {
    const client = getClient()
    if (!client) return { error: 'no client' }
    const room: any = client.getRoom(roomId)
    if (!room) return { error: `room ${roomId} not found in client` }

    // SDK room 属性(只取可序列化的)
    const cs = room.currentState ?? room.getLiveTimeline?.().getState?.(0)
    const histVis = cs?.getStateEvents?.('m.room.history_visibility', '')?.getContent?.()?.history_visibility
    const joinRule = cs?.getStateEvents?.('m.room.join_rules', '')?.getContent?.()?.join_rule
    const powerLevels = cs?.getStateEvents?.('m.room.power_levels', '')?.getContent?.()
    const roomProps: any = {
      roomId: room.roomId,
      name: room.name,
      normalizedName: room.normalizedName,
      tags: room.tags,
      myMembership: room.getMyMembership?.(),
      hasEncryptionStateEvent: room.hasEncryptionStateEvent?.(),
      // ★ history_visibility: world_readable / shared / invited / joined
      //   joined = 只能看到加入后的消息(加入前的历史 /messages 返回空)
      //   这是 Room1/2 能否加载历史的决定性因素
      historyVisibility: histVis,
      joinRule,
      myPowerLevel: (() => {
        const me = client.getUserId()
        if (!me) return null
        const member = room.getMember?.(me)
        return member?.powerLevel ?? null
      })(),
      powerLevelsDefault: powerLevels?.events_default ?? null,
      timelineLength: room.timeline?.length ?? 0,
      timelineTypes: (room.timeline ?? []).map((e: any) => e.getType?.()),
      timelineIds: (room.timeline ?? []).slice(-5).map((e: any) => e.getId?.()),
      // 分页 token(SDK 内部的,可能与 /messages 的 token 不同)
      liveTimelineStartToken: room.getLiveTimeline?.().getPaginationToken?.(0),
      liveTimelineEndToken: room.getLiveTimeline?.().getPaginationToken?.(1),
      // 未读
      unreadTotal: room.getUnreadNotificationCount?.(NotificationCountType.Total),
      unreadHighlight: room.getUnreadNotificationCount?.(NotificationCountType.Highlight),
      // 已读回执位置(本用户)
      myReadReceipt: (() => {
        const me = client.getUserId()
        if (!me) return null
        const rr = room.getReadReceipt?.(me)
        return rr?.eventId ?? rr?.data?.event_id ?? null
      })(),
    }

    // 直接打 /messages 看原始返回(不经过 mapper/filter)
    let rawMessages: any = null
    try {
      const res: any = await (client as any).createMessagesRequest(roomId, null, 10, 'b')
      rawMessages = {
        chunkLength: res?.chunk?.length ?? 0,
        start: res?.start,
        end: res?.end,
        types: (res?.chunk ?? []).map((e: any) => e.type),
        firstEvent: res?.chunk?.[0],
        lastEvent: res?.chunk?.[res.chunk.length - 1],
      }
    } catch (e: any) {
      rawMessages = { error: e?.message || String(e) }
    }

    // 本 store 的状态
    const storeState = {
      activeRoomId: getActiveRoomId(),
      isActive: getActiveRoomId() === roomId,
      messageListLength: getMessageList().length,
      paginationState: getPaginationState()[roomId] ?? null,
    }

    const diag = { roomProps, rawMessages, storeState }
    // eslint-disable-next-line no-console
    console.log(`[matrix-diagnose] room ${roomId}`, diag)
    return diag
  }

  return {
    getRoomMemberList, getMemberPowerLevel, canKickInRoom, getRoomAvatarUrl, getUserAvatarUrl, getRoomTopic, isRoomEncrypted, isRoomPublic, getRoomAlias, isRoomFavorite, toggleRoomFavorite, canEditTopic, setRoomTopic, getHistoryVisibility, getE2EStatus, isDirectMessage, isVideoRoom, canInviteToRoom, getPinnedEventCount, getPinnedEventIds, searchUserDirectory, getUserPresence, getRoomUnreadCount, getRoomNotificationLevel, getEventReadReceipts, threadTimelineVersion, initRoomThreads, getThreadsTimelineSet, getThreadById, diagnoseRoom,
  }
}
