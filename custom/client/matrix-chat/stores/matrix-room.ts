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
  /** Search term from RoomSummaryCard search bar — consumed by MatrixMessagePanel */
  const roomSearchTerm = ref('')
  /** Inline room search state (element-web TimelineRenderingType.Search equivalent) */
  const isSearching = ref(false)
  const searchResults = ref<any[]>([])
  const searchHighlights = ref<string[]>([])
  const searchCount = ref(0)
  const searchInProgress = ref(false)
  const searchBatchSize = ref(20)
  let searchAbortController: AbortController | null = null

  /**
   * Local fallback search for loaded room events.
   * Element Web uses EventIndex for encrypted/local searches; we do not have Seshat,
   * so fallback to currently loaded MatrixEvent objects (messageList + SDK live timeline).
   */
  function localSearchLoadedRoomEvents(term: string): any[] {
    const q = term.toLowerCase()
    const byId = new Map<string, MatrixEvent>()

    for (const ev of messageList.value) {
      const id = ev.getId?.()
      if (id) byId.set(id, ev)
    }

    const liveEvents = activeRoom.value?.getLiveTimeline?.()?.getEvents?.() ?? []
    for (const ev of liveEvents) {
      const id = ev.getId?.()
      if (id) byId.set(id, ev)
    }

    const matches: any[] = []
    for (const ev of byId.values()) {
      if (ev.getType?.() !== 'm.room.message' || ev.isRedacted?.()) continue
      const content = ev.getContent?.() ?? {}
      const body = String(content.body ?? '')
      const formatted = String(content.formatted_body ?? '').replace(/<[^>]*>/g, ' ')
      const haystack = `${body}\n${formatted}`.toLowerCase()
      if (!haystack.includes(q)) continue
      matches.push({
        event: ev,
        rank: 1,
        eventId: ev.getId?.(),
        sender: ev.getSender?.(),
        timestamp: ev.getTs?.(),
        body,
        context: [],
        local: true,
      })
    }

    // Recent first, matching element-web SearchOrderBy.Recent
    matches.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    return matches
  }

  /**
   * Perform an inline room message search (element-web eventSearch equivalent).
   * Results are stored in searchResults; isSearching switches the message panel
   * to search-result rendering mode.
   */
  async function performRoomSearch(term: string): Promise<void> {
    const q = term.trim()
    if (!q) {
      cancelRoomSearch()
      return
    }
    // Abort previous search
    searchAbortController?.abort()
    searchAbortController = new AbortController()

    isSearching.value = true
    searchInProgress.value = true
    searchResults.value = []
    searchCount.value = 0
    roomSearchTerm.value = q

    try {
      if (!clientStore.client || !activeRoomId.value) return
      const resp: any = await clientStore.client.searchRoomEvents({
        term: q,
        filter: { rooms: [activeRoomId.value] },
      } as any)
      if (searchAbortController?.signal.aborted) return

      // matrix-js-sdk searchRoomEvents returns ISearchResults directly:
      // { count, results, highlights, next_batch, _query }
      const rawResults = resp?.results ?? []
      searchCount.value = resp?.count ?? rawResults.length

      // Collect highlights
      let hl = resp?.highlights ?? []
      if (!hl.includes(q)) hl = [...hl, q]
      hl = hl.sort((a: string, b: string) => b.length - a.length)
      searchHighlights.value = hl

      // Map results: each result has result (MatrixEvent) + rank + context
      const mapped = rawResults.map((r: any) => {
        const ev = r.result
        return {
          event: ev,
          rank: r.rank ?? 0,
          eventId: ev.getId?.() ?? ev.event_id,
          sender: ev.getSender?.() ?? ev.sender,
          timestamp: ev.getTs?.() ?? ev.origin_server_ts,
          body: ev.getContent?.()?.body ?? ev.content?.body ?? '',
          context: r.context?.events_before ?? [],
        }
      })
      mapped.sort((a: any, b: any) => b.rank - a.rank)

      // If homeserver search returns no results (common for encrypted rooms or
      // homeservers without message search indexing), fallback to locally loaded
      // timeline messages. This mirrors Element Web's local/EventIndex path.
      const fallback = mapped.length === 0 ? localSearchLoadedRoomEvents(q) : []
      searchResults.value = mapped.length > 0 ? mapped : fallback
      if (fallback.length > 0) searchCount.value = fallback.length
    } catch {
      if (!searchAbortController?.signal.aborted) {
        const fallback = localSearchLoadedRoomEvents(q)
        searchResults.value = fallback
        searchCount.value = fallback.length
        searchHighlights.value = [q]
      }
    } finally {
      if (!searchAbortController?.signal.aborted) {
        searchInProgress.value = false
      }
    }
  }

  /** Cancel inline search, return to normal timeline */
  function cancelRoomSearch(): void {
    searchAbortController?.abort()
    searchAbortController = null
    isSearching.value = false
    searchResults.value = []
    searchHighlights.value = []
    searchCount.value = 0
    searchInProgress.value = false
    roomSearchTerm.value = ''
  }
  /**
   * Version counter bumped after every room mutation (name/topic/avatar/favourite/power/etc).
   * Components that read Room properties directly (room.name etc.) should add this as a
   * dependency in their computed so Vue sees the change even though the Room object reference
   * hasn't changed.
   */
  const roomVersion = ref(0)
  function bumpRoomVersion() {
    roomVersion.value++
    // Also refresh room list so sidebar updates room names/avatars
    refreshRoomList()
  }

  // 正在拉取完整消息历史的房间集合(去重,避免并发刷新重复请求 /messages)
  const loadingRooms = new Set<string>()

  // 每个房间的分页状态(向上翻页游标)。
  // oldestToken: createMessagesRequest 返回的 end token,null 表示已到房间起点。
  // hasMore: 是否还有更早的历史可拉。
  // isLoadingOlder: 正在向上翻页(loadOlderMessages 运行中)。
  const paginationState = ref<Record<string, { oldestToken: string | null; hasMore: boolean; isLoadingOlder: boolean }>>({})

  // 历史加载错误(按 roomId)。服务器对 /messages 返回 500 时设置,
  // 让 UI 能显示"服务器错误,无法加载更早历史"而非静默失败。
  const historyLoadError = ref<Record<string, string | null>>({})

  // 消息 + 状态事件过滤白名单(主时间线显示这些类型)。
  // m.room.message: 普通消息; m.room.member: 加入/离开/邀请/封禁; m.room.create: 房间创建。
  // m.room.encrypted: 加密房间里 /messages 返回的密文事件(getType() 解密前是 encrypted)。
  //   必须**先包含**,再在 await 解密后重新判断 getType() 是否变成 m.room.message。
  //   否则加密房间的历史会被过滤成空(无法滚动到 room 起点)。
  // 房间设置变更事件(name/topic/avatar/power_levels/canonical_alias/join_rules/
  //   history_visibility/encryption/pinned_events/tombstone): 对齐 element-web
  //   TextForEvent,在时间线中渲染为系统通知。
  const TIMELINE_EVENT_TYPES = new Set([
    'm.room.message', 'm.room.member', 'm.room.create', 'm.room.encrypted',
    'm.room.name', 'm.room.topic', 'm.room.avatar', 'm.room.power_levels',
    'm.room.canonical_alias', 'm.room.join_rules', 'm.room.history_visibility',
    'm.room.encryption', 'm.room.pinned_events', 'm.room.tombstone',
    'm.room.server_acl',
  ])

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
    // roomVersion dependency: when unread counts are cleared (selectRoom/SCR),
    // bumpRoomVersion fires so downstream consumers (cockpit notifyItems, room
    // list badges) re-evaluate even though Room object references are unchanged.
    void roomVersion.value
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
   * 刷新当前房间的消息列表。
   *
   * 分两种模式:
   *   1. 首次加载(messageList 为空):先用 SDK room.timeline 快速填充,再异步调
   *      createMessagesRequest 拉~50 条覆盖(首屏)。
   *   2. 后续增量(messageList 已有分页内容):从 SDK room.timeline 检出不在现有列表
   *      中的新事件,追加到末尾。不重置 messageList,保留 loadOlderMessages() 加载
   *      的历史。
   *
   * 区分原因:RoomEvent.Timeline 在每次同步新消息时触发,旧实现直接重置 messageList
   * 会导致已分页的历史丢失,用户无法滚动回到 room 起点。
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

    // ── 已有分页内容:只追加新事件,不重置 ────────────────────
    if (messageList.value.length > 0) {
      const sdkTimeline = activeRoom.value.timeline.filter(isTimelineEvent)
      const existingIds = new Set(messageList.value.map(e => e.getId()))
      const newEvents = sdkTimeline.filter(e => !existingIds.has(e.getId()))
      if (newEvents.length > 0) {
        messageList.value = [...messageList.value, ...newEvents]
      }
      return
    }

    // ── 首次加载:SDK timeline 快速填充 + 异步拉取 ───────────
    messageList.value = [...activeRoom.value.timeline.filter(isTimelineEvent)]
    void ensureTimelineLoaded(activeRoom.value)
  }

  /**
   * 判断事件是否应显示在主时间线。
   * m.room.message: 普通消息(过滤 redact + replace 编辑关系)
   * m.room.member: 加入/离开/邀请/封禁(过滤 no-op:join 但 profile 无变化)
   * m.room.create: 房间创建
   *
   * 注意:加密事件(m.room.encrypted)在这里通过,但其 getType() 在解密完成后会
   * 变成 m.room.message。对这类事件不能查 isRelation(密文阶段无 relates_to),
   * 也不能按 m.room.message 的规则过滤——交给解密后的二次过滤处理。
   */
  function isTimelineEvent(evt: any): boolean {
    if (!evt || typeof evt.getType !== 'function') return false
    const type = evt.getType()
    if (!TIMELINE_EVENT_TYPES.has(type)) return false
    if (evt.isRedacted?.()) return false
    // 加密事件:解密前不查 m.replace,否则会把合法的加密编辑当成"编辑"过滤掉
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
   * 等待事件解密完成(若是加密事件)。
   * /messages 返回 m.room.encrypted;SDK event mapper 会 fire-and-forget
   * 触发 attemptDecryption,但同步代码里 getType() 仍是 encrypted。
   * 必须等解密 promise 走完,getType() 才会变成 m.room.message。
   */
  async function awaitDecryption(evt: any): Promise<void> {
    if (!evt || typeof evt.isEncrypted !== 'function' || !evt.isEncrypted()) return
    // 若 SDK 还没触发解密,主动触发
    if (typeof evt.shouldAttemptDecryption === 'function' && evt.shouldAttemptDecryption()) {
      try {
        const crypto = clientStore.client?.getCrypto?.()
        if (crypto) await evt.attemptDecryption?.(crypto)
      } catch {
        // 解密失败(密钥未到) → 保留密文事件,渲染层显示"无法解密"
      }
    }
    // 等待 mapper / 主动触发里设置的 decryptionPromise
    if (typeof evt.isBeingDecrypted === 'function' && evt.isBeingDecrypted()) {
      try {
        await evt.getDecryptionPromise?.()
      } catch {
        // ignore
      }
    }
  }

  /**
   * 首屏拉取:用 createMessagesRequest 从最新位置向后拉一页(~50 条)。
   * 记录 oldestToken 供 loadOlderMessages 向上翻页。绕过 SDK 的 canContain 过滤。
   *
   * 关键:fetch 完成前不写入 paginationState(避免 loadOlderMessages 在
   * oldestToken=null 时竞态拉取重复数据)。结果与现有 messageList 合并而非
   * 替换,保护可能已在并行分页中加载的历史。
   */
  async function ensureTimelineLoaded(room: any) {
    if (!clientStore.client) return
    if (loadingRooms.has(room.roomId)) return
    loadingRooms.add(room.roomId)

    try {
      const res = await fetchMessagesPage(room, null, 50)
      historyLoadError.value = { ...historyLoadError.value, [room.roomId]: null }
      const mapped = await mapAndFilterEvents(res.events)

      if (activeRoomId.value === room.roomId) {
        if (mapped.length > 0) {
          // 合并而非替换:保护 loadOlderMessages 在请求期间加载的历史
          const existingById = new Map<string, any>()
          for (const e of messageList.value) existingById.set(e.getId(), e)
          for (const e of mapped) existingById.set(e.getId(), e)
          messageList.value = Array.from(existingById.values())
            .sort((a: any, b: any) => (a.getTs?.() ?? 0) - (b.getTs?.() ?? 0))
        }

        // 兜底:拉到 0 条且 room.timeline 也空 → 用 thread 根消息
        if (mapped.length === 0 && (!room.timeline || room.timeline.length === 0)) {
          await ensureRoomThreadsLoaded(room)
          const roots = await collectThreadRoots(room)
          if (roots.length > 0) {
            const existingById = new Map<string, any>()
            for (const e of messageList.value) existingById.set(e.getId(), e)
            for (const e of roots.filter(isTimelineEvent)) existingById.set(e.getId(), e)
            messageList.value = Array.from(existingById.values())
              .sort((a: any, b: any) => (a.getTs?.() ?? 0) - (b.getTs?.() ?? 0))
          }
        }
      }

      // 仅 fetch 成功后写入分页状态(确保 oldestToken 有效)
      updatePagination(room.roomId, { oldestToken: res.endToken, hasMore: !!res.endToken })
    } catch (err: any) {
      // /messages 失败(常见:Conduit 服务器对某些 room 返回 500)。
      // 记录错误供 UI 显示;保留 refreshMessages 的快速首屏(SDK room.timeline)。
      const msg = err?.data?.error || err?.message || `HTTP ${err?.httpStatus ?? '?'}`
      historyLoadError.value = { ...historyLoadError.value, [room.roomId]: msg }
      // eslint-disable-next-line no-console
      console.warn(`[matrix] /messages failed for ${room.roomId}:`, msg, err)
      // 设置 hasMore=false 防止 UI 无限重试 500 的端点
      updatePagination(room.roomId, { hasMore: false, isLoadingOlder: false })
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
      const mapped = await mapAndFilterEvents(res.events)
      historyLoadError.value = { ...historyLoadError.value, [room.roomId]: null }
      if (mapped.length > 0 && activeRoomId.value === room.roomId) {
        // prepend:更早的消息插到数组前面(时间正序)
        messageList.value = [...mapped, ...messageList.value]
      }
      updatePagination(room.roomId, { oldestToken: res.endToken, hasMore: !!res.endToken, isLoadingOlder: false })
      return mapped.length
    } catch (err: any) {
      // /messages 向上翻页失败(常见:Conduit 500)。记录错误,停止重试。
      const msg = err?.data?.error || err?.message || `HTTP ${err?.httpStatus ?? '?'}`
      historyLoadError.value = { ...historyLoadError.value, [room.roomId]: msg }
      // eslint-disable-next-line no-console
      console.warn(`[matrix] loadOlderMessages failed for ${room.roomId}:`, msg, err)
      updatePagination(room.roomId, { hasMore: false, isLoadingOlder: false })
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

  /**
   * 把原始 IEvent 数组 map 成 MatrixEvent,过滤 + 按时间正序排序。
   *
   * 异步:加密事件(m.room.encrypted)需等解密完成后才知真实类型。否则 /messages
   * 在加密房间返回的密文事件会在 getType()=encrypted 时被 isTimelineEvent 过滤掉,
   * 导致加密房间历史显示不全(用户无法滚动到 room 起点)。
   *
   * 解密失败(密钥未到)的事件保留为密文,渲染层应显示"无法解密"占位。
   */
  async function mapAndFilterEvents(rawEvents: any[]): Promise<any[]> {
    const mapper = clientStore.client?.getEventMapper?.()
    const mapped = rawEvents
      .map((raw: any) => (mapper ? mapper(raw) : null))
      .filter((e: any) => !!e)
    // 并发等待所有加密事件解密完成
    await Promise.all(mapped.map(awaitDecryption))
    return mapped
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
      delete historyLoadError.value[roomId]
      historyLoadError.value = { ...historyLoadError.value }
      // 点击进入房间 = 用户正在查看,立即本地清零未读数(visual feedback)。
      // 实际 read receipt 由 TimelinePanel 的 scheduleReadReceipt 发送。
      const room = clientStore.client?.getRoom(roomId)
      if (room) {
        try {
          room.setUnreadNotificationCount(NotificationCountType.Total, 0)
          room.setUnreadNotificationCount(NotificationCountType.Highlight, 0)
        } catch {
          // ignore
        }
      }
      // Trigger downstream re-evaluation (cockpit notify panel, room list badges)
      bumpRoomVersion()
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
      bumpRoomVersion()
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
      bumpRoomVersion()
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
      bumpRoomVersion()
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
      bumpRoomVersion()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to set room topic'
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
   */
  function getE2EStatus(roomId: string): 'normal' | 'warning' {
    if (!clientStore.client) return 'normal'
    const room = clientStore.client.getRoom(roomId)
    if (!room) return 'normal'
    if (!room.hasEncryptionStateEvent()) return 'normal'
    // Check if crypto is available and has untrusted devices
    try {
      const crypto = clientStore.client.getCrypto?.()
      if (!crypto) return 'normal'
      // Check device trust status via cross-signing / device list
      const myUserId = clientStore.client.getUserId()
      if (!myUserId) return 'normal'
      const members = room.getJoinedMembers()
      for (const member of members) {
        if (member.userId === myUserId) continue
        try {
          // getUserDeviceInfo may take a single userId or array depending on SDK version
          const deviceMap: any = crypto.getUserDeviceInfo?.(member.userId)
            ?? crypto.getUserDeviceInfo?.([member.userId])
          if (deviceMap instanceof Map) {
            for (const [, device] of deviceMap) {
              // Check various trust indicators across SDK versions
              if (typeof device?.isUnverified === 'function' && device.isUnverified()) return 'warning'
              if (typeof device?.isVerified === 'function' && !device.isVerified()) return 'warning'
              if (device?.verified === false) return 'warning'
            }
          }
        } catch {
          // skip this member if device lookup fails
        }
      }
      return 'normal'
    } catch {
      return 'normal'
    }
  }

  /** Check if a room is a direct message (1:1 chat). Matches element-web useIsDirectMessage. */
  function isDirectMessage(room: any): boolean {
    if (!room || !clientStore.client) return false
    try {
      // Check m.direct account data first (authoritative)
      const directEvent = clientStore.client.getAccountData('m.direct')
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
    if (!room || !clientStore.client) return false
    try {
      const uid = clientStore.client.getSafeUserId()
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

  /** Get file events from room timeline (stub — for future FilePanel). */
  function getRoomFiles(_room: any): any[] {
    // TODO: Implement file listing from room timeline filtered by m.file type
    return []
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
   * Clear (redact) all visible messages in the active room.
   * Matrix protocol does not support bulk-delete; we redact each message event
   * the current user can redact. State events (member/name/topic) are left intact.
   */
  async function clearAllMessages(): Promise<{ deleted: number; failed: number }> {
    if (!clientStore.client || !activeRoom.value) return { deleted: 0, failed: 0 }
    const client = clientStore.client
    const roomId = activeRoom.value.roomId
    const myUserId = client.getUserId()
    const myPowerLevel = activeRoom.value.getMember(myUserId)?.powerLevel ?? 0
    const powerLevels = activeRoom.value.currentState?.getStateEvents('m.room.power_levels', '')?.getContent() ?? {}
    const redactLevel = powerLevels.redact ?? 50

    let deleted = 0
    let failed = 0

    // Collect all redactable message events from live timeline
    const events = messageList.value.filter((ev: MatrixEvent) => {
      if (ev.isRedacted?.()) return false
      if (ev.getType() !== 'm.room.message') return false
      // Check power level: can redact own always, others need redactLevel
      const sender = ev.getSender()
      if (sender === myUserId) return true
      return myPowerLevel >= redactLevel
    })

    // Redact in reverse (newest first) to preserve scroll position context
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      const eventId = ev.getId()
      if (!eventId) continue
      try {
        await client.redactEvent(roomId, eventId, undefined, undefined)
        deleted++
      } catch {
        failed++
      }
    }

    // Refresh message list to reflect redactions
    refreshMessages()
    bumpRoomVersion()
    return { deleted, failed }
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

  /**
   * 诊断:打印某个 room 的完整属性 + /messages 原始返回,用于对比不同 room 的差异。
   * 浏览器控制台调用:
   *   useMatrixRoomStore().diagnoseRoom('!bqMsLiasBqZqWkuogk:matrix.test')
   * 或在组件里直接调。
   * 返回一个对象(也 console.log 出来),含 room 属性 + timeline + /messages 原始 chunk。
   */
  async function diagnoseRoom(roomId: string): Promise<any> {
    const client = clientStore.client
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
      activeRoomId: activeRoomId.value,
      isActive: activeRoomId.value === roomId,
      messageListLength: messageList.value.length,
      paginationState: paginationState.value[roomId] ?? null,
    }

    const diag = { roomProps, rawMessages, storeState }
    // eslint-disable-next-line no-console
    console.log(`[matrix-diagnose] room ${roomId}`, diag)
    return diag
  }

  return {
    roomList, activeRoomId, messageList, roomSearchTerm, roomVersion,
    isSearching, searchResults, searchHighlights, searchCount, searchInProgress,
    performRoomSearch, cancelRoomSearch,
    bumpRoomVersion,
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
    getHistoryVisibility, getE2EStatus, isDirectMessage, isVideoRoom,
    canInviteToRoom, getPinnedEventCount, getPinnedEventIds,
    getRoomFiles,
    searchUserDirectory, getUserPresence,
    createRoom, joinRoom, leaveRoom, paginateMessages,
    getRoomUnreadCount, getRoomNotificationLevel, getEventReadReceipts,
    clearAllMessages,
    initRoomThreads, getThreadsTimelineSet, getThreadById,
    threadTimelineVersion,
    // 分页加载(向上翻页历史消息)
    paginationState, loadOlderMessages, hasMoreMessages,
    // 历史加载错误(服务器 500 等),供 UI 显示
    historyLoadError,
    // 诊断(临时,排查历史加载问题)
    diagnoseRoom,
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

// 诊断快捷入口:浏览器控制台输入 __diagMatrix() 对比所有房间
// 或 __diagMatrix('!bqMs...:matrix.test') 诊断单个房间
;(typeof window !== 'undefined') && ((window as any).__diagMatrix = async (roomId?: string) => {
  const store = getRoomStore()
  if (roomId) return store.diagnoseRoom(roomId)
  // 对比所有已加入的房间
  const rooms = store.sortedRooms
  console.log(`[matrix-diagnose] ${rooms.length} joined rooms:`)
  for (const r of rooms) {
    await store.diagnoseRoom(r.roomId)
  }
})
