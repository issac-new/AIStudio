import { defineStore } from 'pinia'
import { ref, shallowRef, computed, watch } from 'vue'
import {
  Room,
  MatrixEvent,
  KnownMembership,
  NotificationCountType,
  RelationType,
  EventType,
  Visibility,
  DeviceVerification,
} from 'matrix-js-sdk'
import { matrixEventBus } from './matrix-events'
import { useMatrixClientStore } from './matrix-client'
import { createRoomReaderFns, type RoomNotificationLevel } from './matrix-room-readers'


export type RoomNotificationLevel = 'highlight' | 'total' | 'none'
export type { RoomNotificationLevel } from './matrix-room-readers'
export type TimelineLayout = 'group' | 'bubble' | 'irc'

export const useMatrixRoomStore = defineStore('matrix-room', () => {
  const clientStore = useMatrixClientStore()

  // ── Room data ──
  // Snapshot refs (not computed) because matrix-js-sdk returns the same internal
  // array reference — Vue can't see mutations. We re-snapshot on SDK events.
  const roomList = ref<any[]>([])
  const activeRoomId = ref<string | null>(null)
  // shallowRef：SDK 类实例不做深层响应式代理（避免 Vue 深解包剥离 getId 等方法，也防代理破坏 SDK 内部身份）。
  const messageList = shallowRef<MatrixEvent[]>([])
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
    // v14 P2D：ChatBridge 出向徽章事件（正文随 m.text，这里投影来源标识行）
    'com.swarmstudio.agent.message',
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
  /** 每房最后读位（会话级）：selectRoom 离开房间时记录，重进时恢复 marker。 */
  const readMarkerByRoom = new Map<string, string>()

  // ── Typing / selection ──
  const typingUsers = ref<string[]>([])
  function setTypingUsers(users: string[]) { typingUsers.value = users }
  const selectedEventId = ref<string | null>(null)
  function selectEvent(eventId: string | null) { selectedEventId.value = eventId }

  // ── 跨房间打开线程面板的待决标记（2026-10-01 消息面批：未读线程聚合入口用）──
  // 通知中心点击「某房间未读线程」→ 置标记 + 跳 ia2.commsRoom；MatrixRoomCanvas
  // 在房间选择完成后消费标记（调 threadStore.openThreadPanel 并清除）。
  const pendingOpenThreadPanel = ref(false)
  function requestOpenThreadPanel() { pendingOpenThreadPanel.value = true }
  function consumeOpenThreadPanel(): boolean {
    const v = pendingOpenThreadPanel.value
    pendingOpenThreadPanel.value = false
    return v
  }

  // C6 jumpToEvent：修 scrollToEvent 只认已渲染 DOM 的断链。事件未加载（搜索命中远古历史）
  // 时先向上分页 loadOlderMessages 直到命中，再 selectEvent 高亮。上限 30 页防死循环。
  // loadOlderMessages 返回 0 有两种语义，不能一律当"到头"：①到头/翻页失败停试
  // （hasMore=false）→ 放弃；②忙（isLoadingOlder，另有翻页在飞）或未就绪（分页状态
  // 未建立，refreshMessages 尚未落 oldestToken）→ 短暂等待重试（限 20 次），
  // 否则点搜索结果会静默无动作。
  async function jumpToEvent(eventId: string | null): Promise<void> {
    if (!eventId) return
    const idOf = (ev: MatrixEvent): string | undefined => ev.getId?.() ?? (ev as unknown as { event_id?: string }).event_id
    const has = () => messageList.value.some((ev) => idOf(ev) === eventId)
    let stallRetries = 0
    for (let i = 0; i < 30 && !has(); i++) {
      const n = await loadOlderMessages()
      if (n > 0) continue
      const room = activeRoom.value
      const state = room ? paginationState.value[room.roomId] : undefined
      if (state && !state.hasMore) break
      if (++stallRetries > 20) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (has()) selectEvent(eventId)
  }

  // ── Computeds ──
  const activeRoom = computed<Room | null>(() => {
    if (!activeRoomId.value) return null
    // Access client through Pinia store without direct import (avoid cycles)
    const clientStore = useMatrixClientStore()
    if (!clientStore.client) return null
    return clientStore.client.getRoom(activeRoomId.value) ?? null
  })

  // ── Room readers / 小动作（拆分：matrix-room-readers.ts）──
  const {
    getRoomMemberList,
    getMemberPowerLevel,
    canKickInRoom,
    getRoomAvatarUrl,
    getUserAvatarUrl,
    getRoomTopic,
    isRoomEncrypted,
    isRoomPublic,
    getRoomAlias,
    isRoomFavorite,
    toggleRoomFavorite,
    canEditTopic,
    setRoomTopic,
    getHistoryVisibility,
    getE2EStatus,
    isDirectMessage,
    isVideoRoom,
    canInviteToRoom,
    getPinnedEventCount,
    getPinnedEventIds,
    searchUserDirectory,
    getUserPresence,
    getRoomUnreadCount,
    getRoomNotificationLevel,
    getEventReadReceipts,
    threadTimelineVersion,
    initRoomThreads,
    getThreadsTimelineSet,
    getThreadById,
    diagnoseRoom,
  } = createRoomReaderFns({
    getClient: () => clientStore.client,
    getActiveRoom: () => activeRoom.value,
    getActiveRoomId: () => activeRoomId.value,
    getMessageList: () => messageList.value,
    getPaginationState: () => paginationState.value,
    bumpRoomVersion,
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

  // 深链房间页竞态根治（2026-10-31 三区回归实录）：roomList 只靠事件总线回填，
  // 而本模块是懒加载 chunk——晚于 client 的 Sync 状态转换装载时，订阅前的
  // PREPARED/SYNCING 事件已被 matrixEventBus 的 ?.() 静默吞掉；静默 homeserver
  // 无后续房间事件 → roomList 恒空 → 深链房间画布停在「正在同步会话…」直至
  // 15s watchdog 判不可达（实测 7 次深链 4 次不挂载）。事件之外补两条主动快照：
  // 创建时 client 已在 → 立即快照；client 后到位 → watch 快照。与既有
  // 「SDK 事件驱动重快照」同构（roomList 本就是快照式 ref），零常驻开销。
  if (clientStore.client) refreshRoomList()
  watch(() => clientStore.client, (client) => { if (client) refreshRoomList() })

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
  function refreshMessages(opts?: { force?: boolean }) {
    if (!activeRoom.value) {
      messageList.value = []
      return
    }

    // ── 已有分页内容:只追加新事件,不重置 ────────────────────
    if (messageList.value.length > 0) {
      const sdkTimeline = activeRoom.value.timeline.filter(isTimelineEvent)
      const existingIds = new Set(messageList.value.map(e => e.getId()))
      const newEvents = sdkTimeline.filter(e => !existingIds.has(e.getId()))
      if (newEvents.length > 0 || opts?.force) {
        // force=本地回显收敛（LocalEchoUpdated）：SDK 对同一事件对象原地换
        // id/status，不替换数组则 v-for key 不重读、「发送中…」行不重挂。
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
    // 离开房间时把"已读到哪"记为该房的 read marker；重进时恢复——
    // TopUnreadBar 的「跳到未读」与 TimelinePanel 的 marker 线都消费
    // readMarkerEventId，此前全库无写入方，按钮恒回落 jump-bottom 跳过全部未读
    const prevRoomId = activeRoomId.value
    if (prevRoomId && prevRoomId !== roomId) {
      const lastId = messageList.value.at(-1)?.getId?.() ?? null
      if (lastId) readMarkerByRoom.set(prevRoomId, lastId)
    }
    setReadMarker(roomId ? (readMarkerByRoom.get(roomId) ?? null) : null)
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




  return {
    roomList, activeRoomId, messageList, roomSearchTerm, roomVersion,
    isSearching, searchResults, searchHighlights, searchCount, searchInProgress,
    performRoomSearch, cancelRoomSearch,
    bumpRoomVersion,
    timelineLayout, alwaysShowTimestamps, useCompactLayout,
    readMarkerEventId, readMarkerVisible, typingUsers, selectedEventId,
    pendingOpenThreadPanel, requestOpenThreadPanel, consumeOpenThreadPanel,
    activeRoom, sortedRooms, activeRoomMessages, activeRoomUnreadCount,
    setTimelineLayout, toggleAlwaysShowTimestamps, toggleCompactLayout,
    setReadMarker, hideReadMarker, setTypingUsers, selectEvent, jumpToEvent,
    refreshRoomList, refreshMessages, selectRoom,
    getRoomMemberList, getMemberPowerLevel, canKickInRoom,
    inviteUser, kickUser, setIgnoreUser, startDmWithUser,
    getRoomAvatarUrl, getUserAvatarUrl, getRoomTopic,
    isRoomEncrypted, isRoomPublic, getRoomAlias, isRoomFavorite,
    toggleRoomFavorite, canEditTopic, setRoomTopic,
    getHistoryVisibility, getE2EStatus, isDirectMessage, isVideoRoom,
    canInviteToRoom, getPinnedEventCount, getPinnedEventIds,
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
matrixEventBus.onLocalEchoUpdated.value = () => getRoomStore().refreshMessages({ force: true })

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
