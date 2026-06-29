<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import MatrixMessageItem from './MatrixMessageItem.vue'
import MatrixDateSeparator from './MatrixDateSeparator.vue'
import MatrixReadMarker from './MatrixReadMarker.vue'
import MatrixTypingNotification from './MatrixTypingNotification.vue'
import MatrixStateEvent from './MatrixStateEvent.vue'

interface Props {
  /** 传入时,从该 timelineSet 派生消息(列表/详情用);不传 = 读 roomStore.activeRoomMessages(主聊天界面,零回归) */
  timelineSet?: any
  /** 渲染模式:'room'(主时间线)|'thread'(单话题详情)|'threads-list'(话题列表) */
  renderingType?: 'room' | 'thread' | 'threads-list'
  /** thread id(renderingType='thread' 时用) */
  threadId?: string
  showReadReceipts?: boolean
  showReactions?: boolean
  hideThreadedMessages?: boolean
  alwaysShowTimestamps?: boolean
  disableGrouping?: boolean
  emptyState?: { title: string; description: string }
}
const props = withDefaults(defineProps<Props>(), {
  timelineSet: undefined,
  renderingType: 'room',
  threadId: undefined,
  showReadReceipts: true,
  showReactions: true,
  hideThreadedMessages: false,
  alwaysShowTimestamps: false,
  disableGrouping: false,
  emptyState: undefined,
})

const roomStore = useMatrixRoomStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const listRef = ref<HTMLElement | null>(null)
const isLoadingMore = ref(false)
const isNearBottom = ref(true)
const scrollTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
// 已读回执去抖:用户停滚 500ms 后发一次 receipt,避免高频请求。
let readReceiptTimer: ReturnType<typeof setTimeout> | null = null
// 记录已发过 receipt 的最新 event id,避免重复发送同一条。
let lastReceiptEventId: string | null = null

// 切房间时重置已读回执游标 + 滚动状态(isNearBottom 复位为 true,新房间默认贴底)
watch(
  () => roomStore.activeRoomId,
  () => {
    lastReceiptEventId = null
    isNearBottom.value = true
  },
)

// 传入 timelineSet ⇒ 从该 timelineSet 派生;否则走 roomStore(现状)
const useExternalTimeline = computed(() => props.timelineSet !== undefined)
const messages = computed(() => {
  if (useExternalTimeline.value) {
    const live = props.timelineSet?.getLiveTimeline?.()
    const evts = live?.getEvents?.() ?? []
    return evts.filter(
      (e: any) => e.getType?.() === 'm.room.message' && !e.isRedacted?.(),
    )
  }
  return roomStore.activeRoomMessages
})

// 主实例(非 external timeline)的分页状态,用于顶部加载指示器 + 阻止到头后重复请求
const pagination = computed(() => {
  if (useExternalTimeline.value) return { hasMore: true, isLoadingOlder: false }
  const room = roomStore.activeRoom as any
  if (!room) return { hasMore: false, isLoadingOlder: false }
  return roomStore.paginationState[room.roomId] ?? { hasMore: true, isLoadingOlder: false }
})

// 历史加载错误(服务器 500 等)。仅主实例。
const historyError = computed(() => {
  if (useExternalTimeline.value) return null
  const room = roomStore.activeRoom as any
  if (!room) return null
  return roomStore.historyLoadError?.[room.roomId] ?? null
})

/** 判断事件是否为状态事件(m.room.create / m.room.member)。 */
const STATE_EVENT_TYPES = new Set([
  'm.room.create', 'm.room.member',
  'm.room.name', 'm.room.topic', 'm.room.avatar', 'm.room.power_levels',
  'm.room.canonical_alias', 'm.room.join_rules', 'm.room.history_visibility',
  'm.room.encryption', 'm.room.pinned_events', 'm.room.tombstone',
  'm.room.server_acl',
])

function isStateEvent(event: any): boolean {
  const type = event?.getType?.()
  return STATE_EVENT_TYPES.has(type)
}

/** Group messages with date separators, continuation flags, read marker, and state events */
const groupedItems = computed(() => {
  const result: Array<
    | { type: 'date'; date: string }
    | { type: 'message'; event: any; showSender: boolean; isContinuation: boolean; isLastInSection: boolean }
    | { type: 'stateEvent'; event: any }
    | { type: 'readMarker' }
  > = []
  let lastSenderId = ''
  let lastDateStr = ''
  for (let i = 0; i < messages.value.length; i++) {
    const event = messages.value[i]
    const date = event.getDate()
    const dateStr = date ? date.toLocaleDateString() : ''

    // Date separator
    if (dateStr && dateStr !== lastDateStr) {
      result.push({ type: 'date', date: dateStr })
      lastDateStr = dateStr
      lastSenderId = ''
    }

    // 状态事件(create/member):渲染为系统通知,不参与消息分组
    if (isStateEvent(event)) {
      result.push({ type: 'stateEvent', event })
      lastSenderId = '' // 状态事件打断消息分组
      continue
    }

    // Check if read marker should be inserted before this message
    const readMarkerId = roomStore.readMarkerEventId
    if (readMarkerId && readMarkerId === event.getId() && roomStore.readMarkerVisible) {
      result.push({ type: 'readMarker' })
    }

    const senderId = event.getSender() ?? ''
    const isContinuation = !props.disableGrouping && senderId === lastSenderId && lastDateStr === dateStr
    const nextEvent = messages.value[i + 1]
    const nextSenderId = nextEvent?.getSender() ?? ''
    const nextDate = nextEvent?.getDate()
    const nextDateStr = nextDate ? nextDate.toLocaleDateString() : ''
    const isLastInSection = senderId !== nextSenderId || dateStr !== nextDateStr

    result.push({
      type: 'message',
      event,
      showSender: !isContinuation,
      isContinuation,
      isLastInSection,
    })
    lastSenderId = senderId
  }

  return result
})

// ─── Sticky bottom scroll logic ────────────────────────────
function checkScrollPosition() {
  if (!listRef.value) return
  const el = listRef.value
  const threshold = 80
  isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

function scrollToBottom(smooth = false) {
  if (!listRef.value) return
  listRef.value.scrollTo({
    top: listRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

watch(
  () => messages.value.length,
  (newLen, oldLen) => {
    if (newLen > (oldLen ?? 0) && isNearBottom.value) {
      nextTick(() => scrollToBottom(true))
      // 新消息到达且停在底部 → 标记已读
      scheduleReadReceipt()
    }
  },
)

function handleScroll() {
  if (!listRef.value) return

  checkScrollPosition()

  // 滚到底部附近 → 标记已读(发 read receipt 清未读数)
  if (isNearBottom.value) scheduleReadReceipt()

  // Debounce pagination check
  if (scrollTimeout.value) clearTimeout(scrollTimeout.value)
  scrollTimeout.value = setTimeout(() => {
    if (listRef.value && listRef.value.scrollTop < 100) {
      loadMore()
    }
  }, 150)
}

/**
 * 发送已读回执。
 * 主聊天界面之前从不发 read receipt,导致已读消息的未读数一直不归零。
 * element-web 在滚动到底部 / 新消息到达且停在底部时发 receipt。
 *
 * 仅主实例(非 external timeline)发;线程视图由 ThreadPanel 自己发。
 * 用防抖避免高频请求;记录 lastReceiptEventId 避免重复发同一条。
 */
function scheduleReadReceipt() {
  if (useExternalTimeline.value) return
  if (readReceiptTimer) clearTimeout(readReceiptTimer)
  readReceiptTimer = setTimeout(() => {
    sendReadReceipt()
  }, 500)
}

function sendReadReceipt() {
  const client = clientStore.client
  const room = roomStore.activeRoom as any
  if (!client || !room) return
  // ★ 关键:用 SDK live timeline 的最后一条事件做已读锚点,而不是我们的 messageList。
  // SDK 的未读计数重算 (Room.recalculateUnreadCount) 遍历 room.timeline 事件,
  // 用 hasUserReadEvent 判断每条是否已读。如果 receipt 指向的事件不在 SDK timeline,
  // 或落后于 SDK timeline 的末尾事件,那些末尾事件仍会被算作未读(表现为"始终 2 条")。
  const liveEvents = room.getLiveTimeline?.().getEvents?.() ?? []
  const sdkLastEvent = liveEvents[liveEvents.length - 1]
  // 兜底:SDK timeline 为空时用 messageList 末尾
  const msgs = messages.value
  const fallbackLast = msgs[msgs.length - 1]
  const lastEvent = sdkLastEvent || fallbackLast
  if (!lastEvent) return
  const eventId = lastEvent.getId?.()
  if (!eventId || eventId === lastReceiptEventId) return
  lastReceiptEventId = eventId
  // unthreaded=true:让 receipt 覆盖所有 thread(main + 子话题),
  // 避免线程消息的未读数无法被主时间线的 receipt 清除。
  client.sendReadReceipt(lastEvent, undefined, true).then(() => {
    // 成功 → 本地清零 + 触发 SDK 重算未读(双保险)
    clearLocalUnread(room)
  }).catch((err: any) => {
    // /receipt 失败(500/网络)→ 本地清零,避免假未读数卡住
    clearLocalUnread(room)
    // eslint-disable-next-line no-console
    console.warn('[matrix] sendReadReceipt failed, clearing local unread:', err?.message || err)
  })
}

/**
 * 本地清零 room 的未读通知数(不影响服务器,仅 UI 立即生效)。
 * 配合 matrix-client 里监听的 RoomEvent.UnreadNotifications,
 * setUnreadNotificationCount 会触发 SDK emit → roomList 刷新。
 */
function clearLocalUnread(room: any) {
  if (!room) return
  try {
    // NotificationCountType.Total = 'total', Highlight = 'highlight'
    room.setUnreadNotificationCount?.('total', 0)
    room.setUnreadNotificationCount?.('highlight', 0)
    // 触发 roomStore 的 sortedRooms 重算(依赖未读数) + bumpRoomVersion
    // 让 cockpit notifyItems 等下游消费者重新评估未读计数
    roomStore.refreshRoomList()
    roomStore.bumpRoomVersion()
  } catch {
    // 忽略
  }
}

/**
 * 向上翻页加载更早的消息。
 * 主实例:调 roomStore.loadOlderMessages(),prepend 到 messageList,并保持滚动位置。
 * 外部 timelineSet:走 SDK paginate。
 */
async function loadMore() {
  if (isLoadingMore.value) return
  if (useExternalTimeline.value) {
    isLoadingMore.value = true
    try {
      const live = props.timelineSet?.getLiveTimeline?.()
      await live?.paginate?.('b' as any, 20)
    } catch {
      // ignore
    } finally {
      isLoadingMore.value = false
    }
    return
  }
  // 主实例:检查是否还有更早的历史
  if (!roomStore.hasMoreMessages()) return
  // 记录滚动锚点(关键:prepend 后防跳)
  const el = listRef.value
  const oldScrollHeight = el?.scrollHeight ?? 0
  const oldScrollTop = el?.scrollTop ?? 0
  isLoadingMore.value = true
  try {
    await roomStore.loadOlderMessages()
    // 恢复滚动位置:新内容加在上方,scrollTop 加上新增高度,保持视口内容不变。
    // 用双重 nextTick + requestAnimationFrame 确保布局计算完成(flex 重排可能
    // 跨多帧),否则 scrollHeight 读到旧值导致滚动锚点错位。
    nextTick(() => {
      requestAnimationFrame(() => {
        if (listRef.value) {
          const newHeight = listRef.value.scrollHeight
          listRef.value.scrollTop = oldScrollTop + (newHeight - oldScrollHeight)
        }
      })
    })
  } catch {
    // ignore
  } finally {
    isLoadingMore.value = false
  }
}

onMounted(() => {
  nextTick(() => {
    scrollToBottom()
    // 进入房间默认停在底部 → 标记已读
    scheduleReadReceipt()
  })
})

onBeforeUnmount(() => {
  if (readReceiptTimer) clearTimeout(readReceiptTimer)
  if (scrollTimeout.value) clearTimeout(scrollTimeout.value)
})

// ─── Scroll to event (from search result click) ──────────
// When selectedEventId is set (e.g. after clicking a search result),
// scroll to that event and highlight it briefly.
const highlightedEventId = ref<string | null>(null)

function scrollToEvent(eventId: string) {
  if (!listRef.value) return
  const el = listRef.value.querySelector(`[data-event-id="${eventId}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightedEventId.value = eventId
    setTimeout(() => { highlightedEventId.value = null }, 3000)
  }
}

// Watch selectedEventId from store (set by search result click)
watch(
  () => roomStore.selectedEventId,
  (eventId) => {
    if (eventId) {
      nextTick(() => {
        scrollToEvent(eventId)
        roomStore.selectEvent(null) // clear after handling
      })
    }
  },
)
</script>

<template>
  <div ref="listRef" class="matrix-timeline-panel" @scroll="handleScroll">
    <!-- 顶部:加载更早消息 / 已到房间起点 / 服务器错误(仅主实例) -->
    <div v-if="!useExternalTimeline && pagination.isLoadingOlder" class="paginate-loading">
      {{ t('matrixChat.stateLoadingOlder') }}
    </div>
    <div v-else-if="!useExternalTimeline && historyError" class="timeline-error" :title="historyError">
      {{ t('matrixChat.historyLoadError') }}（{{ historyError }}）
    </div>
    <div v-else-if="!useExternalTimeline && !pagination.hasMore && messages.length > 0" class="timeline-start">
      {{ t('matrixChat.stateNoMoreHistory') }}
    </div>
    <!-- 外部 timeline 的分页加载指示器 -->
    <div v-if="useExternalTimeline && isLoadingMore" class="paginate-loading">
      {{ t('matrixChat.paginateLoading') }}
    </div>
    <!-- 空态(仅外部 timeline 且 messages 为空且提供了 emptyState 时) -->
    <div v-if="emptyState && messages.length === 0 && !isLoadingMore" class="matrix-timeline-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <p class="matrix-timeline-empty-title">{{ emptyState.title }}</p>
      <p class="matrix-timeline-empty-desc">{{ emptyState.description }}</p>
    </div>
    <template v-for="(item, idx) in groupedItems" :key="item.type === 'date' ? 'date-' + item.date : item.type === 'readMarker' ? 'read-marker-' + idx : item.type === 'stateEvent' ? 'state-' + item.event.getId() : 'msg-' + item.event.getId()">
      <MatrixDateSeparator v-if="item.type === 'date'" :date="item.date" />
      <MatrixReadMarker v-if="item.type === 'readMarker'" />
      <MatrixStateEvent v-if="item.type === 'stateEvent'" :event="item.event" />
      <div
        v-if="item.type === 'message'"
        :data-event-id="item.event.getId()"
        :class="['timeline-event-wrapper', { 'timeline-event-wrapper--highlighted': highlightedEventId === item.event.getId() }]"
      >
        <MatrixMessageItem
          :event="item.event"
          :show-sender="item.showSender"
          :is-continuation="item.isContinuation"
          :is-last-in-section="item.isLastInSection"
          :layout="roomStore.timelineLayout"
          :rendering-type="renderingType"
          :thread-id="threadId"
          :show-reactions="showReactions"
          :always-show-timestamps="alwaysShowTimestamps"
        />
      </div>
    </template>
    <MatrixTypingNotification />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-timeline-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;

  // NOTE: content-visibility: auto 已移除 —— 它在 flex column 滚动容器里会导致
  // scrollHeight 估算错误(用 contain-intrinsic-size 的 60px 替代真实高度),使得
  // 用户向上翻页加载历史后无法滚动到 room 起点或滚动条跳变。滚动容器里应避免对
  // 直接子元素使用 content-visibility: auto。
}

.paginate-loading {
  padding: 8px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.timeline-start {
  padding: 8px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

// 服务器错误提示(/messages 返回 500 等)
.timeline-error {
  padding: 8px 16px;
  text-align: center;
  color: var(--error, #e53e3e);
  font-size: 12px;
  background: rgba(229, 62, 62, 0.06);
  border-radius: 6px;
  margin: 0 8px;
}

.matrix-timeline-empty {
  padding: 40px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  margin: auto 0;

  svg {
    opacity: 0.4;
  }
}

.matrix-timeline-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.matrix-timeline-empty-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
  max-width: 260px;
}

// ─── Event highlight (from search jump) ─────────────────

.timeline-event-wrapper {
  border-radius: $radius-sm;
  transition: background-color 0.3s ease;
}

.timeline-event-wrapper--highlighted {
  animation: highlight-flash 3s ease;
}

@keyframes highlight-flash {
  0% { background: rgba(var(--accent-primary-rgb), 0.15); }
  100% { background: transparent; }
}
</style>
