<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import MatrixMessageItem from './MatrixMessageItem.vue'
import MatrixDateSeparator from './MatrixDateSeparator.vue'
import MatrixReadMarker from './MatrixReadMarker.vue'
import MatrixTypingNotification from './MatrixTypingNotification.vue'

const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const listRef = ref<HTMLElement | null>(null)
const isLoadingMore = ref(false)
const isNearBottom = ref(true)
const scrollTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const messages = computed(() => roomStore.activeRoomMessages)

/** Group messages with date separators, continuation flags, and read marker */
const groupedItems = computed(() => {
  const result: Array<
    | { type: 'date'; date: string }
    | { type: 'message'; event: any; showSender: boolean; isContinuation: boolean; isLastInSection: boolean }
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

    // Check if read marker should be inserted before this message
    const readMarkerId = roomStore.readMarkerEventId
    if (readMarkerId && readMarkerId === event.getId() && roomStore.readMarkerVisible) {
      result.push({ type: 'readMarker' })
    }

    const senderId = event.getSender() ?? ''
    const isContinuation = senderId === lastSenderId && lastDateStr === dateStr
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

async function loadMore() {
  if (isLoadingMore.value) return
  isLoadingMore.value = true
  try {
    await roomStore.paginateMessages()
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
    <div v-if="isLoadingMore" class="paginate-loading">
      {{ t('matrixChat.paginateLoading') }}
    </div>
    <template v-for="(item, idx) in groupedItems" :key="item.type === 'date' ? 'date-' + item.date : item.type === 'readMarker' ? 'read-marker-' + idx : 'msg-' + item.event.getId()">
      <MatrixDateSeparator v-if="item.type === 'date'" :date="item.date" />
      <MatrixReadMarker v-if="item.type === 'readMarker'" />
      <MatrixMessageItem
        v-if="item.type === 'message'"
        :event="item.event"
        :show-sender="item.showSender"
        :is-continuation="item.isContinuation"
        :is-last-in-section="item.isLastInSection"
        :layout="roomStore.timelineLayout"
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

  // Performance optimization: content-visibility for off-screen items
  :deep(.mx_EventTile) {
    content-visibility: auto;
    contain-intrinsic-size: 0 60px;
  }
}

.paginate-loading {
  padding: 8px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
