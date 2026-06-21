<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'

const threadStore = useMatrixThreadStore()
const roomStore = useMatrixRoomStore()
const clientStore = useMatrixClientStore()
const composerStore = useMatrixComposerStore()
const { t } = useI18n()

// ─── Fetch threads from server on mount ──────────────────
onMounted(() => {
  threadStore.initRoomThreads()
})

// Re-fetch when room changes
watch(() => roomStore.activeRoomId, () => {
  if (threadStore.threadRootEventId) {
    threadStore.initRoomThreads()
  }
})

// ─── View mode: list vs detail ────────────────────────────
type ThreadViewMode = 'list' | 'detail'
const viewMode = computed<ThreadViewMode>(() => {
  if (!threadStore.threadRootEventId) return 'list'
  if (threadStore.threadRootEventId === '__list__') return 'list'
  return 'detail'
})

// ─── Thread filter (All / My) ────────────────────────────
type ThreadFilterType = 'all' | 'my'
const threadFilter = ref<ThreadFilterType>('all')

const myUserId = computed(() => clientStore.client?.getUserId() ?? '')

// ─── Detail mode state ────────────────────────────────────
const threadRootEvent = computed<MatrixEvent | null>(() => {
  if (!threadStore.threadRootEventId || !roomStore.activeRoom) return null
  if (threadStore.threadRootEventId === '__list__') return null
  try {
    const liveTimeline = roomStore.activeRoom.getLiveTimeline()
    const events = liveTimeline?.getEvents() ?? []
    return events.find(
      (evt: MatrixEvent) => evt.getId() === threadStore.threadRootEventId,
    ) ?? null
  } catch {
    return null
  }
})

const threadRootSender = computed(() => threadRootEvent.value?.getSender() ?? '')
const threadRootContent = computed(() => {
  if (!threadRootEvent.value) return ''
  const c = threadRootEvent.value.getContent()
  return composerStore.stripPlainReply(c?.body ?? '')
})

const threadRootAvatar = computed(() => roomStore.getUserAvatarUrl(threadRootEvent.value?.getSender(), 32))
const threadRootInitial = computed(() => (threadRootEvent.value?.getSender() ?? '?').charAt(0).toUpperCase())
const threadRootTime = computed(() => {
  if (!threadRootEvent.value) return ''
  const d = threadRootEvent.value.getDate()
  if (!d) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
})

const threadReplyMessages = computed(() => threadStore.threadMessages)

// ─── List mode: thread list ──────────────────────────────
const roomThreads = computed(() => {
  try {
    const threads = threadStore.getRoomThreads()
    if (threadFilter.value === 'my') {
      return threads.filter((thread: any) => {
        const rootEvent = thread.rootEvent
        if (rootEvent?.getSender() === myUserId.value) return true
        try {
          const events = thread.timelineSet?.getLiveTimeline?.()?.getEvents?.() ?? []
          return events.some((evt: MatrixEvent) => evt.getSender() === myUserId.value)
        } catch {
          return false
        }
      })
    }
    return threads
  } catch {
    return []
  }
})

const hasThreads = computed(() => {
  try {
    return threadStore.getRoomThreads().length > 0
  } catch {
    return false
  }
})

function openThread(rootEvent: MatrixEvent) {
  threadStore.setThreadView(rootEvent)
}

function backToList() {
  threadStore.openThreadPanel()
}

function closePanel() {
  threadStore.clearThreadView()
}

async function markAllThreadsRead() {
  if (!roomStore.activeRoom || !clientStore.client) return
  try {
    await clientStore.client.sendReadReceipt(roomStore.activeRoom as any)
  } catch {
    // ignore errors
  }
}

// ─── Thread list item helpers ────────────────────────────
function getThreadRootSender(thread: any): string {
  return thread.rootEvent?.getSender() ?? ''
}

function getThreadRootContent(thread: any): string {
  const rootEvent = thread.rootEvent
  if (!rootEvent) return ''
  const c = rootEvent.getContent()
  return composerStore.stripPlainReply(c?.body ?? '').slice(0, 100)
}

function getThreadReplyCount(thread: any): number {
  return thread.length ?? 0
}

function getThreadLastReplyTime(thread: any): string {
  const lastReply = thread.replyToEvent
  if (!lastReply) return ''
  const d = lastReply.getDate()
  if (!d) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getThreadRootEvent(thread: any): MatrixEvent | null {
  return thread.rootEvent ?? null
}

function getThreadAvatarUrl(thread: any): string | null {
  const sender = thread.rootEvent?.getSender()
  return roomStore.getUserAvatarUrl(sender, 32)
}

function getThreadInitial(thread: any): string {
  return (thread.rootEvent?.getSender() ?? '?').charAt(0).toUpperCase()
}

// ─── Thread detail message helpers ───────────────────────
function getSender(event: MatrixEvent): string {
  return event.getSender() ?? ''
}

function getContent(event: MatrixEvent): string {
  const c = event.getContent()
  return composerStore.stripPlainReply(c?.body ?? '')
}

function getTime(event: MatrixEvent): string {
  const d = event.getDate()
  if (!d) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getAvatarUrl(event: MatrixEvent): string | null {
  return roomStore.getUserAvatarUrl(event.getSender(), 28)
}

function getInitial(event: MatrixEvent): string {
  return (event.getSender() ?? '?').charAt(0).toUpperCase()
}

// ─── Inline thread composer ──────────────────────────────
const threadInput = ref('')
const threadSending = ref(false)

async function handleThreadSend() {
  const text = threadInput.value.trim()
  if (!text || !threadStore.threadRootEventId) return
  threadSending.value = true
  try {
    await threadStore.sendThreadMessage(
      text,
      threadStore.threadRootEventId,
      threadStore.threadMessages.length > 0
        ? threadStore.threadMessages[threadStore.threadMessages.length - 1]?.getId()
        : undefined,
    )
    threadInput.value = ''
  } catch {
    // error handled in store
  } finally {
    threadSending.value = false
  }
}
</script>

<template>
  <div class="matrix-thread-panel">
    <!-- ─── List mode: Thread list ──────────────────────── -->
    <template v-if="viewMode === 'list'">
      <div class="thread-panel-header">
        <h3 class="thread-panel-title">{{ t('matrixChat.threads') }}</h3>
        <button class="thread-panel-close" @click="closePanel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- Filter tabs (All / My) + Mark all read -->
      <div v-if="hasThreads" class="thread-filter-bar">
        <button
          class="thread-filter-tab"
          :class="{ active: threadFilter === 'all' }"
          @click="threadFilter = 'all'"
        >{{ t('matrixChat.allThreads') }}</button>
        <button
          class="thread-filter-tab"
          :class="{ active: threadFilter === 'my' }"
          @click="threadFilter = 'my'"
        >{{ t('matrixChat.myThreads') }}</button>
        <button class="thread-mark-all-read-btn" @click="markAllThreadsRead" :title="t('matrixChat.markAllThreadsRead')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>

      <!-- Loading spinner -->
      <div v-if="threadStore.threadsLoading" class="thread-loading">
        <div class="thread-spinner" />
        <span>{{ t('matrixChat.loadingThreads') }}</span>
      </div>

      <div class="thread-list">
        <!-- Empty state -->
        <div v-if="!threadStore.threadsLoading && roomThreads.length === 0" class="thread-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p class="thread-empty-title">{{ t('matrixChat.noThreadsTitle') }}</p>
          <p class="thread-empty-desc">{{ t('matrixChat.noThreadsDesc') }}</p>
        </div>

        <!-- Thread list items (element-web style) -->
        <div
          v-for="thread in roomThreads"
          :key="thread.id"
          class="thread-list-item"
          @click="openThread(getThreadRootEvent(thread)!)"
        >
          <!-- Avatar -->
          <div class="thread-item-avatar">
            <img v-if="getThreadAvatarUrl(thread)" :src="getThreadAvatarUrl(thread)!" alt="" class="thread-item-avatar-img" />
            <div v-else class="thread-item-avatar-placeholder">{{ getThreadInitial(thread) }}</div>
          </div>

          <!-- Content -->
          <div class="thread-item-body">
            <div class="thread-item-header">
              <span class="thread-item-sender">{{ getThreadRootSender(thread) }}</span>
              <span class="thread-item-time">{{ getThreadLastReplyTime(thread) }}</span>
            </div>
            <div class="thread-item-content">{{ getThreadRootContent(thread) }}</div>
            <div class="thread-item-meta">
              <span class="thread-item-reply-count">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {{ getThreadReplyCount(thread) }} {{ t('matrixChat.threadReplies', { count: getThreadReplyCount(thread) }) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ─── Detail mode: Single thread view ─────────────── -->
    <template v-if="viewMode === 'detail'">
      <div class="thread-detail-header">
        <button class="thread-back-btn" @click="backToList">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {{ t('matrixChat.backToThreads') }}
        </button>
        <button class="thread-panel-close" @click="closePanel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- Thread root event -->
      <div v-if="threadRootEvent" class="thread-root">
        <div class="thread-msg-sender">
          <img v-if="threadRootAvatar" :src="threadRootAvatar" alt="" class="thread-msg-avatar" />
          <div v-else class="thread-msg-avatar-placeholder">{{ threadRootInitial }}</div>
          <span class="thread-msg-name">{{ threadRootSender }}</span>
          <span class="thread-msg-time">{{ threadRootTime }}</span>
        </div>
        <div class="thread-msg-content">{{ threadRootContent }}</div>
      </div>

      <!-- Thread replies -->
      <div class="thread-replies">
        <div
          v-for="event in threadReplyMessages"
          :key="event.getId()"
          class="thread-reply"
        >
          <div class="thread-msg-sender">
            <img v-if="getAvatarUrl(event as any)" :src="getAvatarUrl(event as any)!" alt="" class="thread-msg-avatar" />
            <div v-else class="thread-msg-avatar-placeholder">{{ getInitial(event as any) }}</div>
            <span class="thread-msg-name">{{ getSender(event as any) }}</span>
            <span class="thread-msg-time">{{ getTime(event as any) }}</span>
          </div>
          <div class="thread-msg-content">{{ getContent(event as any) }}</div>
        </div>
      </div>

      <!-- Thread composer -->
      <div class="thread-composer">
        <div class="thread-composer-bar">
          <textarea
            v-model="threadInput"
            class="thread-composer-input"
            :placeholder="t('matrixChat.threadPlaceholder')"
            :disabled="threadSending"
            rows="1"
            @keydown.enter.exact.prevent="!threadSending && handleThreadSend()"
          />
          <button class="thread-send-btn" :disabled="!threadInput.trim() || threadSending" @click="handleThreadSend">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-thread-panel {
  width: 320px;
  flex-shrink: 0;
  flex-grow: 0;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-width: 0;
  border-left: 1px solid $border-color;
  background: $bg-card;
  overflow: hidden;
}

// ─── Header ──────────────────────────────────────────────
.thread-panel-header,
.thread-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.thread-panel-title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.thread-panel-close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  transition: all $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.08); color: $text-primary; }
}

.thread-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: $radius-sm;
  transition: all $transition-fast;

  &:hover { color: $text-primary; background: rgba(var(--accent-primary-rgb), 0.06); }
}

// ─── Filter bar ──────────────────────────────────────────
.thread-filter-bar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 16px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.thread-filter-tab {
  padding: 8px 12px;
  border: none;
  background: none;
  color: $text-muted;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all $transition-fast;

  &:hover { color: $text-primary; }
  &.active {
    color: var(--accent-primary, $accent-primary);
    border-bottom-color: var(--accent-primary, $accent-primary);
  }
}

.thread-mark-all-read-btn {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  transition: all $transition-fast;

  &:hover { color: var(--accent-primary, $accent-primary); background: rgba(var(--accent-primary-rgb), 0.06); }
}

// ─── Loading ─────────────────────────────────────────────
.thread-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: $text-muted;
  font-size: 13px;
}

.thread-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  animation: thread-spin 0.7s linear infinite;
}

@keyframes thread-spin {
  to { transform: rotate(360deg); }
}

// ─── Thread list ──────────────────────────────────────────
.thread-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.thread-empty {
  padding: 40px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: $text-muted;

  svg { opacity: 0.4; }
}

.thread-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-secondary;
  margin: 0;
}

.thread-empty-desc {
  font-size: 13px;
  color: $text-muted;
  margin: 0;
  line-height: 1.4;
}

// ─── Thread list item (element-web style) ────────────────
.thread-list-item {
  display: flex;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); }
}

.thread-item-avatar {
  flex-shrink: 0;
  padding-top: 2px;
}

.thread-item-avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.thread-item-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}

.thread-item-body {
  flex: 1;
  min-width: 0;
}

.thread-item-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.thread-item-sender {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-item-time {
  font-size: 11px;
  color: $text-muted;
  flex-shrink: 0;
}

.thread-item-content {
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.4;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.thread-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.thread-item-reply-count {
  font-size: 12px;
  color: var(--accent-primary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;

  svg { flex-shrink: 0; }
}

// ─── Thread detail ────────────────────────────────────────
.thread-root {
  padding: 12px 16px;
  border-bottom: 1px solid $border-color;
  background: rgba(var(--accent-primary-rgb), 0.02);
  flex-shrink: 0;
}

.thread-msg-sender {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thread-msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.thread-msg-avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.thread-msg-name {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-msg-time {
  font-size: 11px;
  color: $text-muted;
  flex-shrink: 0;
  margin-left: auto;
}

.thread-msg-content {
  font-size: 14px;
  color: $text-primary;
  white-space: pre-wrap;
  margin-top: 6px;
  line-height: 1.5;
  padding-left: 36px;
}

// ─── Thread replies ──────────────────────────────────────
.thread-replies {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thread-reply {
  padding: 6px 0;
}

// ─── Thread composer ──────────────────────────────────────
.thread-composer {
  padding: 12px 16px;
  border-top: 1px solid $border-color;
  flex-shrink: 0;
}

.thread-composer-bar {
  display: flex;
  gap: 8px;
}

.thread-composer-input {
  flex: 1;
  min-height: 34px;
  max-height: 120px;
  padding: 6px 12px;
  border: 1px solid $border-color;
  border-radius: 6px;
  font-size: 14px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  box-sizing: border-box;
  resize: none;
  overflow-y: auto;
  line-height: 1.4;

  &::placeholder { color: $text-muted; }
  &:focus { border-color: $accent-primary; }
}

.thread-send-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 6px;
  background: $accent-primary;
  color: $text-on-accent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
</style>
