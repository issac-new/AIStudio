<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
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
const { t } = useI18n()

const listRef = ref<HTMLElement | null>(null)
const isLoadingMore = ref(false)
const isNearBottom = ref(true)
const scrollTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

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

/** 判断事件是否为状态事件(m.room.create / m.room.member)。 */
function isStateEvent(event: any): boolean {
  const type = event?.getType?.()
  return type === 'm.room.create' || type === 'm.room.member'
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
    }
  },
)

function handleScroll() {
  if (!listRef.value) return

  checkScrollPosition()

  // Debounce pagination check
  if (scrollTimeout.value) clearTimeout(scrollTimeout.value)
  scrollTimeout.value = setTimeout(() => {
    if (listRef.value && listRef.value.scrollTop < 100) {
      loadMore()
    }
  }, 150)
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
    // 恢复滚动位置:新内容加在上方,scrollTop 加上新增高度,保持视口内容不变
    nextTick(() => {
      if (listRef.value) {
        const newHeight = listRef.value.scrollHeight
        listRef.value.scrollTop = oldScrollTop + (newHeight - oldScrollHeight)
      }
    })
  } catch {
    // ignore
  } finally {
    isLoadingMore.value = false
  }
}

onMounted(() => {
  nextTick(() => scrollToBottom())
})
</script>

<template>
  <div ref="listRef" class="matrix-timeline-panel" @scroll="handleScroll">
    <!-- 顶部:加载更早消息 / 已到房间起点(仅主实例) -->
    <div v-if="!useExternalTimeline && pagination.isLoadingOlder" class="paginate-loading">
      {{ t('matrixChat.stateLoadingOlder') }}
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
      <MatrixMessageItem
        v-if="item.type === 'message'"
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

  // Performance optimization: content-visibility for off-screen items.
  // 注意 contain-intrinsic-size 的 width 必须是 auto(或具体宽度),
  // 不能是 0 —— 在 flex column 容器里 width:0 会让元素被压成不可见。
  :deep(.mx_EventTile) {
    content-visibility: auto;
    contain-intrinsic-size: auto 60px;
  }
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
</style>
