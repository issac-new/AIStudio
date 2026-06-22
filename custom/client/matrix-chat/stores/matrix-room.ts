import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  Room,
  MatrixEvent,
  KnownMembership,
  NotificationCountType,
  RelationType,
  EventType,
  Visibility,
} from 'matrix-js-sdk'
import { matrixEventBus } from './matrix-events'
import { useMatrixClientStore } from './matrix-client'

export type RoomNotificationLevel = 'highlight' | 'total' | 'none'
export type TimelineLayout = 'group' | 'bubble' | 'irc'

export const useMatrixRoomStore = defineStore('matrix-room', () => {
  const clientStore = useMatrixClientStore()

  // ── Room data ──
  // Snapshot refs (not computed) because matrix-js-sdk returns the same internal
  // array reference — Vue can't see mutations. We re-snapshot on SDK events.
  const roomList = ref<any[]>([])
  const activeRoomId = ref<string | null>(null)
  const messageList = ref<MatrixEvent[]>([])

  // 正在拉取完整消息历史的房间集合(去重,避免并发刷新重复请求 /messages)
  const loadingRooms = new Set<string>()

  // 每个房间的分页状态(向上翻页游标)。
  // oldestToken: createMessagesRequest 返回的 end token,null 表示已到房间起点。
  // hasMore: 是否还有更早的历史可拉。
  // isLoadingOlder: 正在向上翻页(loadOlderMessages 运行中)。
  const paginationState = ref<Record<string, { oldestToken: string | null; hasMore: boolean; isLoadingOlder: boolean }>>({})

  // 消息 + 状态事件过滤白名单(主时间线显示这些类型)。
  // m.room.message: 普通消息; m.room.member: 加入/离开/邀请/封禁; m.room.create: 房间创建。
  const TIMELINE_EVENT_TYPES = new Set(['m.room.message', 'm.room.member', 'm.room.create'])

  // ── Layout settings (timeline-rendering concern) ──
  const timelineLayout = ref<TimelineLayout>('group')
  const alwaysShowTimestamps = ref(false)
  const useCompactLayout = ref(false)
  function setTimelineLayout(layout: TimelineLayout) { timelineLayout.value = layout }
  function toggleAlwaysShowTimestamps() { alwaysShowTimestamps.value = !alwaysShowTimestamps.value }
  function toggleCompactLayout() { useCompactLayout.value = !useCompactLayout.value }

  // ── Read marker (timeline concern) ──
  const readMarkerEventId = ref<string | null>(null)
  const readMarkerVisible = ref(true)
  function setReadMarker(eventId: string | null) {
    readMarkerEventId.value = eventId
    readMarkerVisible.value = true
  }
  function hideReadMarker() { readMarkerVisible.value = false }

  // ── Typing / selection ──
  const typingUsers = ref<string[]>([])
  function setTypingUsers(users: string[]) { typingUsers.value = users }
  const selectedEventId = ref<string | null>(null)
  function selectEvent(eventId: string | null) { selectedEventId.value = eventId }

  // ── Computeds ──
  const activeRoom = computed<Room | null>(() => {
    if (!activeRoomId.value) return null
    // Access client through Pinia store without direct import (avoid cycles)
    const clientStore = useMatrixClientStore()
    if (!clientStore.client) return null
    return clientStore.client.getRoom(activeRoomId.value) ?? null
  })

  const sortedRooms = computed(() => {
    return [...roomList.value]
      .filter((r: any) => r.getMyMembership() === KnownMembership.Join)
      .sort((a: any, b: any) => {
        const aTs = getLastMessageTimestamp(a)
        const bTs = getLastMessageTimestamp(b)
        return bTs - aTs
      })
  })

  const activeRoomMessages = computed(() => messageList.value)

  const activeRoomUnreadCount = computed<number>(() => {
    if (!activeRoom.value) return 0
    const room = activeRoom.value
    return room.getUnreadNotificationCount(NotificationCountType.Total) +
      room.getUnreadNotificationCount(NotificationCountType.Highlight)
  })

  // ── Helpers ──
  function getLastMessageTimestamp(room: any): number {
    const timeline = room.timeline
    for (let i = timeline.length - 1; i >= 0; i--) {
      const evt = timeline[i]
      if (evt.getType() === 'm.room.message') {
        return evt.getTs() || 0
      }
    }
    return 0
  }

  /** Snapshot the current room list from the client into the reactive ref. */
  function refreshRoomList() {
    if (!clientStore.client) {
      roomList.value = []
      return
    }
    // Create a new array so Vue detects the change
    roomList.value = [...clientStore.client.getRooms()]
  }

  /**
   * 刷新当前房间的消息列表(首屏)。
   *
   * 策略:先拉一页最近的消息(约 50 条,覆盖最近 1-2 天),快速展示。
   * 完整历史靠用户向上滚动时 loadOlderMessages 按需分页拉取。
   *
   * 不直接用 room.timeline:开启 threadSupport 后,SDK 会过滤 thread replies,
   * 且 initialSyncLimit(20)限制太多。改用 createMessagesRequest 直接拉 /messages,
   * 绕过 SDK 的 timelineSet 过滤(canContain 双重过滤 bug)。
   */
  function refreshMessages() {
    if (!activeRoom.value) {
      messageList.value = []
      return
    }
    // 立即用 SDK 已有的 timeline 填充(快速首屏,无网络等待)
    messageList.value = [...activeRoom.value.timeline.filter(isTimelineEvent)]
    // 异步拉取首屏消息页(createMessagesRequest),覆盖快速首屏
    void ensureTimelineLoaded(activeRoom.value)
  }

  /**
   * 判断事件是否应显示在主时间线。
   * m.room.message: 普通消息(过滤 redact + replace 编辑关系)
   * m.room.member: 加入/离开/邀请/封禁(过滤 no-op:join 但 profile 无变化)
   * m.room.create: 房间创建
   */
  function isTimelineEvent(evt: any): boolean {
    if (!evt || typeof evt.getType !== 'function') return false
    const type = evt.getType()
    if (!TIMELINE_EVENT_TYPES.has(type)) return false
    if (evt.isRedacted?.()) return false
    if (type === 'm.room.message' && evt.isRelation?.(RelationType.Replace)) return false
    // no-op member event: join 但 prev_content 也是 join 且 displayname/avatar 未变 → 过滤
    if (type === 'm.room.member') {
      const content = evt.getContent?.()
      const prev = evt.getPrevContent?.()
      if (content?.membership === KnownMembership.Join && prev?.membership === KnownMembership.Join) {
        const nameChanged = content.displayname !== prev.displayname
        const avatarChanged = content.avatar_url !== prev.avatar_url
        if (!nameChanged && !avatarChanged) return false
      }
    }
    return true
  }

  /**
   * 首屏拉取:用 createMessagesRequest 从最新位置向后拉一页(~50 条)。
   * 记录 oldestToken 供 loadOlderMessages 向上翻页。绕过 SDK 的 canContain 过滤。
   */
  async function ensureTimelineLoaded(room: any) {
    if (!clientStore.client) return
    if (loadingRooms.has(room.roomId)) return
    loadingRooms.add(room.roomId)

    // 重置该房间的分页状态
    const state = { oldestToken: null as string | null, hasMore: true, isLoadingOlder: false }
    paginationState.value = { ...paginationState.value, [room.roomId]: state }

    try {
      const res = await fetchMessagesPage(room, null, 50)
      const mapped = mapAndFilterEvents(res.events)
      if (mapped.length > 0 && activeRoomId.value === room.roomId) {
        messageList.value = mapped
      }
      // 记录游标:res.end 是更早的 token;null 表示已到起点
      updatePagination(room.roomId, { oldestToken: res.endToken, hasMore: !!res.endToken })

      // 兜底:拉到 0 条且 room.timeline 也空 → 用 thread 根消息
      if (mapped.length === 0 && (!room.timeline || room.timeline.length === 0)) {
        await ensureRoomThreadsLoaded(room)
        const roots = await collectThreadRoots(room)
        if (roots.length > 0 && activeRoomId.value === room.roomId) {
          messageList.value = roots.filter(isTimelineEvent)
        }
      }
    } catch {
      // 网络错误:保留 refreshMessages 的快速首屏
    } finally {
      loadingRooms.delete(room.roomId)
    }
  }

  /**
   * 向上翻页:加载更早的消息,prepend 到 messageList 前面。
   * 由 MatrixTimelinePanel 在用户滚到顶部时调用。返回新插入的消息数(供滚动锚定)。
   */
  async function loadOlderMessages(): Promise<number> {
    const room = activeRoom.value
    if (!room || !clientStore.client) return 0
    const state = paginationState.value[room.roomId]
    if (!state || !state.hasMore || state.isLoadingOlder) return 0

    updatePagination(room.roomId, { isLoadingOlder: true })
    try {
      const res = await fetchMessagesPage(room, state.oldestToken, 50)
      const mapped = mapAndFilterEvents(res.events)
      if (mapped.length > 0 && activeRoomId.value === room.roomId) {
        // prepend:更早的消息插到数组前面(时间正序)
        messageList.value = [...mapped, ...messageList.value]
      }
      updatePagination(room.roomId, { oldestToken: res.endToken, hasMore: !!res.endToken, isLoadingOlder: false })
      return mapped.length
    } catch {
      updatePagination(room.roomId, { isLoadingOlder: false })
      return 0
    }
  }

  /** 查询当前房间是否还有更早的历史可加载。 */
  function hasMoreMessages(): boolean {
    const room = activeRoom.value
    if (!room) return false
    return paginationState.value[room.roomId]?.hasMore ?? false
  }

  /** 更新某房间的分页状态(不可变更新,触发 Vue 响应式)。 */
  function updatePagination(roomId: string, patch: Partial<{ oldestToken: string | null; hasMore: boolean; isLoadingOlder: boolean }>) {
    const prev = paginationState.value[roomId] ?? { oldestToken: null, hasMore: true, isLoadingOlder: false }
    paginationState.value = { ...paginationState.value, [roomId]: { ...prev, ...patch } }
  }

  /**
   * 拉取一页 /messages(向后/backward)。
   * @param fromToken null=从最新位置开始;否则用上一页返回的 end token
   * @returns { events: 原始 IEvent[], endToken: 更早的 token(null=到起点) }
   */
  async function fetchMessagesPage(room: any, fromToken: string | null, limit: number): Promise<{ events: any[]; endToken: string | null }> {
    const client = clientStore.client
    if (!client) return { events: [], endToken: null }
    const res: any = await (client as any).createMessagesRequest(
      room.roomId,
      fromToken,
      limit,
      'b' as any, // Direction.Backward
    )
    const chunk = res?.chunk ?? []
    // /messages 返回的 chunk 是逆序(新→旧),end 是更早的 token。
    // 无 end 表示已到房间起点,无更多历史。
    const endToken = res?.end ?? null
    return { events: chunk, endToken }
  }

  /** 把原始 IEvent 数组 map 成 MatrixEvent,过滤 + 按时间正序排序。 */
  function mapAndFilterEvents(rawEvents: any[]): any[] {
    const mapper = clientStore.client?.getEventMapper?.()
    return rawEvents
      .map((raw: any) => (mapper ? mapper(raw) : null))
      .filter((e: any) => !!e)
      .filter(isTimelineEvent)
      .sort((a: any, b: any) => (a.getTs?.() ?? 0) - (b.getTs?.() ?? 0))
  }

  /**
   * 从 room 的 thread 集合里收集所有 thread 根事件(按时间排序)。
   * 若 thread 的 rootEvent 未加载到本地,用 client.fetchRoomEvent 补拉。
   */
  async function collectThreadRoots(room: any): Promise<any[]> {
    if (!clientStore.client) return []
    try {
      const threads = room.getThreads?.() ?? []
      const roots: any[] = []
      const eventMapper = clientStore.client.getEventMapper?.()
      for (const t of threads) {
        let root = t.rootEvent ?? null
        if (!root && t.id) {
          root = room.findEventById?.(t.id) ?? null
        }
        // 本地没有 → 从服务器拉取
        if (!root && t.id) {
          try {
            const raw = await clientStore.client.fetchRoomEvent(room.roomId, t.id)
            root = eventMapper ? eventMapper(raw) : null
          } catch {
            // 事件可能已被删除,跳过
          }
        }
        if (root) roots.push(root)
      }
      return roots.sort((a, b) => (a.getTs?.() ?? 0) - (b.getTs?.() ?? 0))
    } catch {
      return []
    }
  }

  /** 确保 room 的 thread 列表已从服务器拉取(幂等:threadsReady 标志位去重)。 */
  async function ensureRoomThreadsLoaded(room: any): Promise<void> {
    if (!clientStore.client) return
    if (room.threadsReady) return
    try {
      if (!room.threadsTimelineSets || room.threadsTimelineSets.length === 0) {
        await room.createThreadsTimelineSets?.()
      }
      await room.fetchRoomThreads?.()
    } catch {
      // 服务器可能不支持 threads,忽略
    }
  }

  function selectRoom(roomId: string | null) {
    activeRoomId.value = roomId
    // 切房间时重置消息列表 + 分页状态(refreshMessages 会重新初始化)
    messageList.value = []
    if (roomId) {
      delete paginationState.value[roomId]
      paginationState.value = { ...paginationState.value }
    }
    refreshMessages()
    matrixEventBus.onSelectRoom.value?.()
  }

  // ── Room member helpers ──
  /** Get sorted member list for a room, grouped by role */
  function getRoomMemberList(roomId: string): { admins: any[]; mods: any[]; defaults: any[]; invited: any[] } {
    const room = clientStore.client?.getRoom(roomId)
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
    const room = clientStore.client?.getRoom(roomId)
    if (!room) return 0
    const member = room.getMember(userId)
    return member?.powerLevel ?? 0
  }

  /** Check if the current user can kick/ban in a room */
  function canKickInRoom(roomId: string): boolean {
    const room = clientStore.client?.getRoom(roomId)
    if (!room) return false
    const myUserId = clientStore.userId
    if (!myUserId) return false
    const me = room.getMember(myUserId)
    return (me?.powerLevel ?? 0) >= 50 // Need mod or admin level
  }

  // ── Member management actions ──
  async function inviteUser(roomId: string, userIdToInvite: string) {
    if (!clientStore.client) return
    try {
      await clientStore.client.invite(roomId, userIdToInvite)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to invite user'
      throw err
    }
  }

  async function kickUser(roomId: string, userIdToKick: string, reason?: string) {
    if (!clientStore.client) return
    try {
      await clientStore.client.kick(roomId, userIdToKick, reason ?? '')
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to kick user'
      throw err
    }
  }

  async function setIgnoreUser(userIdToIgnore: string, ignore: boolean) {
    if (!clientStore.client) return
    try {
      if (ignore) {
        await clientStore.client.setIgnoredUsers([userIdToIgnore])
      } else {
        const currentIgnored = await clientStore.client.getIgnoredUsers()
        const newIgnored = currentIgnored.filter((id: string) => id !== userIdToIgnore)
        await clientStore.client.setIgnoredUsers(newIgnored)
      }
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to update ignore list'
      throw err
    }
  }

  /** Start a 1:1 DM with a user */
  async function startDmWithUser(otherUserId: string) {
    if (!clientStore.client) return
    try {
      const result = await clientStore.client.createRoom({
        visibility: Visibility.Private,
        is_direct: true,
        invite: [otherUserId],
      })
      selectRoom(result.room_id)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to start DM'
      throw err
    }
  }

  // ── Room readers ──
  /** Get room avatar URL (mxc -> http) */
  function getRoomAvatarUrl(room: any, size = 96): string | null {
    if (!clientStore.client) return null
    const mxcUrl = room.getMxcAvatarUrl()
    if (!mxcUrl) return null
    return clientStore.client.mxcUrlToHttp(mxcUrl, size, size, 'crop') ?? null
  }

  /** Get user avatar URL */
  function getUserAvatarUrl(memberOrUserId: any, size = 64): string | null {
    if (!clientStore.client) return null
    const mxcUrl = typeof memberOrUserId === 'string'
      ? clientStore.client.getUser(memberOrUserId)?.avatarUrl
      : memberOrUserId?.getMxcAvatarUrl?.() ?? memberOrUserId?.avatarUrl
    if (!mxcUrl) return null
    return clientStore.client.mxcUrlToHttp(mxcUrl, size, size, 'crop') ?? null
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
    const room = clientStore.client?.getRoom(roomId)
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
    if (!activeRoom.value) return false
    const tags = (activeRoom.value as any).tags as Record<string, Record<string, any>> | undefined
    return !!tags?.['m.favourite']
  }

  /** Toggle favorite tag on current room */
  async function toggleRoomFavorite(): Promise<void> {
    if (!clientStore.client || !activeRoom.value) return
    const fav = isRoomFavorite()
    try {
      if (fav) {
        await clientStore.client.deleteRoomTag(activeRoom.value.roomId, 'm.favourite')
      } else {
        await clientStore.client.setRoomTag(activeRoom.value.roomId, 'm.favourite', { order: 0 })
      }
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to toggle favorite'
      throw err
    }
  }

  /** Check if the current user can edit the room topic */
  function canEditTopic(): boolean {
    if (!activeRoom.value || !clientStore.client) return false
    const uid = clientStore.client.getUserId()
    if (!uid) return false
    try {
      return activeRoom.value.currentState.maySendStateEvent(EventType.RoomTopic, uid)
    } catch {
      return false
    }
  }

  /** Set room topic */
  async function setRoomTopic(topicText: string): Promise<void> {
    if (!clientStore.client || !activeRoomId.value) return
    try {
      await clientStore.client.setRoomTopic(activeRoomId.value, topicText)
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to set room topic'
      throw err
    }
  }

  /** Search the user directory for matching users */
  async function searchUserDirectory(query: string): Promise<Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>> {
    if (!clientStore.client || !query.trim()) return []
    try {
      const result = await clientStore.client.searchUserDirectory({ term: query.trim(), limit: 20 })
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
    if (!clientStore.client) return { status: 'offline' }
    const user = clientStore.client.getUser(userIdToCheck)
    if (!user) return { status: 'offline' }
    const presence = user.presence ?? 'offline'
    const lastActiveAgo = user.lastActiveAgo ?? undefined
    const lastActive = lastActiveAgo != null ? Date.now() - lastActiveAgo : undefined
    return { status: presence, lastActive }
  }

  // ── Room actions ──
  async function createRoom(options: {
    name?: string
    isPublic?: boolean
    isEncrypted?: boolean
  }) {
    if (!clientStore.client) return
    const opts: Record<string, unknown> = {
      visibility: options.isPublic ? 'public' : 'private',
      name: options.name,
      initial_state: [],
    }
    if (options.isEncrypted) {
      opts.initial_state = [
        {
          type: 'm.room.encryption',
          state_key: '',
          content: {
            algorithm: 'm.megolm.v1.aes-sha2',
          },
        },
      ]
    }
    try {
      const result = await clientStore.client.createRoom(opts)
      selectRoom(result.room_id)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to create room'
      throw err
    }
  }

  async function joinRoom(roomIdOrAlias: string) {
    if (!clientStore.client) return
    try {
      const result = await clientStore.client.joinRoom(roomIdOrAlias)
      selectRoom(result.roomId)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to join room'
      throw err
    }
  }

  async function leaveRoom(roomId: string) {
    if (!clientStore.client) return
    try {
      await clientStore.client.leave(roomId)
      if (activeRoomId.value === roomId) {
        activeRoomId.value = null
      }
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to leave room'
      throw err
    }
  }

  async function paginateMessages() {
    // 保留向后兼容:委托给 loadOlderMessages(新的 createMessagesRequest 分页路径)。
    // 旧实现走 SDK paginateEventTimeline,与 messageList 脱节;新实现直接 prepend。
    await loadOlderMessages()
    return hasMoreMessages()
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
    const room = activeRoom.value
    if (!room || !eventId) return []
    const me = clientStore.client?.getUserId() ?? ''
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
    if (!activeRoom.value) return
    try {
      await (activeRoom.value as any).createThreadsTimelineSets()
      await (activeRoom.value as any).fetchRoomThreads()
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
    if (!activeRoom.value) return undefined
    const sets = (activeRoom.value as any).threadsTimelineSets
    if (!sets) return undefined
    return filter === 'my' ? sets[1] : sets[0]
  }

  /** 按 id 取 SDK Thread 对象 */
  function getThreadById(threadId: string): any | null {
    if (!activeRoom.value) return null
    try {
      return (activeRoom.value as any).getThread(threadId) ?? null
    } catch {
      return null
    }
  }

  return {
    roomList, activeRoomId, messageList,
    timelineLayout, alwaysShowTimestamps, useCompactLayout,
    readMarkerEventId, readMarkerVisible, typingUsers, selectedEventId,
    activeRoom, sortedRooms, activeRoomMessages, activeRoomUnreadCount,
    setTimelineLayout, toggleAlwaysShowTimestamps, toggleCompactLayout,
    setReadMarker, hideReadMarker, setTypingUsers, selectEvent,
    refreshRoomList, refreshMessages, selectRoom,
    getRoomMemberList, getMemberPowerLevel, canKickInRoom,
    inviteUser, kickUser, setIgnoreUser, startDmWithUser,
    getRoomAvatarUrl, getUserAvatarUrl, getRoomTopic,
    isRoomEncrypted, isRoomPublic, getRoomAlias, isRoomFavorite,
    toggleRoomFavorite, canEditTopic, setRoomTopic,
    searchUserDirectory, getUserPresence,
    createRoom, joinRoom, leaveRoom, paginateMessages,
    getRoomUnreadCount, getRoomNotificationLevel, getEventReadReceipts,
    initRoomThreads, getThreadsTimelineSet, getThreadById,
    threadTimelineVersion,
    // 分页加载(向上翻页历史消息)
    paginationState, loadOlderMessages, hasMoreMessages,
  }
})

// Register room store handlers on the event bus (outside store definition to
// avoid circular imports between stores). These are called by matrix-client
// when SDK events fire.
// Lazily initialize the store reference to avoid "no active Pinia" errors during
// module load in test environments.
let _roomStore: ReturnType<typeof useMatrixRoomStore> | null = null
function getRoomStore() {
  if (!_roomStore) _roomStore = useMatrixRoomStore()
  return _roomStore
}
matrixEventBus.onRoomListChange.value = () => getRoomStore().refreshRoomList()
matrixEventBus.onTimeline.value = () => getRoomStore().refreshMessages()
