<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import type { MatrixEvent, Room } from 'matrix-js-sdk'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const isLoading = ref(false)
const fileEvents = ref<MatrixEvent[]>([])
const hasMoreFiles = ref(false)
const isLoadingMore = ref(false)

const fileMsgTypes = ['m.file', 'm.image', 'm.video', 'm.audio']

function loadFiles(reset = true) {
  if (!room.value || !clientStore.client) return
  isLoading.value = true
  try {
    const timeline = room.value.getLiveTimeline()
    const events: MatrixEvent[] = []
    const tlEvents = timeline.getEvents()
    for (const ev of tlEvents) {
      if (ev.isRedacted?.()) continue
      if (ev.getType() !== 'm.room.message') continue
      const msgtype = ev.getContent()?.msgtype
      if (fileMsgTypes.includes(msgtype)) {
        events.push(ev)
      }
    }
    events.sort((a, b) => (b.getTs() ?? 0) - (a.getTs() ?? 0))
    fileEvents.value = events
    // Check if there are more events to paginate
    hasMoreFiles.value = timeline.canPaginate('b')
  } catch {
    // ignore
  } finally {
    isLoading.value = false
  }
}

async function loadMoreFiles() {
  if (!room.value || isLoadingMore.value) return
  isLoadingMore.value = true
  try {
    const timeline = room.value.getLiveTimeline()
    if (timeline.canPaginate('b')) {
      await timeline.paginate('b', 30)
      loadFiles(false)
    } else {
      hasMoreFiles.value = false
    }
  } catch {
    hasMoreFiles.value = false
  } finally {
    isLoadingMore.value = false
  }
}

watch(room, () => { if (room.value) loadFiles() }, { immediate: true })
onMounted(() => { if (room.value) loadFiles() })

function handleBack() {
  rightPanelStore.rightPanelBack()
}

// ─── Helpers ──────────────────────────────────────────────

function getEventSenderName(ev: MatrixEvent): string {
  const senderId = ev.getSender()
  if (!senderId || !room.value) return senderId
  const member = room.value.getMember(senderId)
  return member?.name ?? senderId
}

function getEventSenderAvatar(ev: MatrixEvent): string | null {
  const senderId = ev.getSender()
  if (!senderId) return null
  return roomStore.getUserAvatarUrl(senderId, 28)
}

function getFileName(ev: MatrixEvent): string {
  return ev.getContent()?.body ?? ev.getContent()?.filename ?? t('matrixChat.unknownFile')
}

function getFileSize(ev: MatrixEvent): string {
  const info = ev.getContent()?.info
  const size = info?.size
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getFileType(ev: MatrixEvent): 'image' | 'video' | 'audio' | 'file' {
  const msgtype = ev.getContent()?.msgtype
  if (msgtype === 'm.image') return 'image'
  if (msgtype === 'm.video') return 'video'
  if (msgtype === 'm.audio') return 'audio'
  return 'file'
}

function getThumbnailUrl(ev: MatrixEvent): string | null {
  const content = ev.getContent()
  if (!content) return null
  // Try thumbnail first, then direct URL for images
  const info = content.info
  if (info?.thumbnail_url) {
    return clientStore.client?.mxcUrlToHttp?.(info.thumbnail_url, 64, 64, 'crop') ?? null
  }
  if (content.url && getFileType(ev) === 'image') {
    return clientStore.client?.mxcUrlToHttp?.(content.url, 64, 64, 'crop') ?? null
  }
  return null
}

function getDownloadUrl(ev: MatrixEvent): string | null {
  const content = ev.getContent()
  const url = content?.url ?? content?.file?.url
  if (!url || !clientStore.client) return null
  return clientStore.client.mxcUrlToHttp?.(url) ?? null
}

function getTimestamp(ev: MatrixEvent): string {
  const ts = ev.getTs() ?? 0
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

function getFileTypeIcon(type: 'image' | 'video' | 'audio' | 'file'): string {
  switch (type) {
    case 'image': return '🖼️'
    case 'video': return '🎬'
    case 'audio': return '🎵'
    default: return '📄'
  }
}
</script>

<template>
  <div class="file-panel">
    <!-- Header -->
    <div class="fp-header">
      <button class="fp-back-btn" @click="handleBack">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h3 class="fp-title">{{ t('matrixChat.filesMenu') }}</h3>
    </div>

    <!-- Content -->
    <div class="fp-content">
      <div v-if="isLoading" class="fp-loading">
        <span class="fp-spinner" />
        {{ t('matrixChat.loading') }}
      </div>

      <div v-else-if="fileEvents.length === 0" class="fp-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
        </svg>
        <p>{{ t('matrixChat.noFilesFound') }}</p>
      </div>

      <div v-else class="fp-list">
        <div
          v-for="ev in fileEvents"
          :key="ev.getId()"
          class="fp-item"
        >
          <div class="fp-item-thumb">
            <img v-if="getThumbnailUrl(ev)" :src="getThumbnailUrl(ev)!" alt="" class="fp-item-thumb-img" />
            <div v-else class="fp-item-thumb-icon">{{ getFileTypeIcon(getFileType(ev)) }}</div>
          </div>
          <div class="fp-item-body">
            <div class="fp-item-name">
              <a
                v-if="getDownloadUrl(ev)"
                :href="getDownloadUrl(ev)!"
                class="fp-item-link"
                target="_blank"
                rel="noopener"
              >{{ getFileName(ev) }}</a>
              <span v-else class="fp-item-link">{{ getFileName(ev) }}</span>
            </div>
            <div class="fp-item-meta">
              <span class="fp-item-sender">{{ getEventSenderName(ev) }}</span>
              <span v-if="getFileSize(ev)" class="fp-item-size">{{ getFileSize(ev) }}</span>
              <span class="fp-item-time">{{ getTimestamp(ev) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Load more button -->
      <div v-if="hasMoreFiles && fileEvents.length > 0" class="fp-load-more">
        <button class="fp-load-more-btn" :disabled="isLoadingMore" @click="loadMoreFiles">
          <span v-if="isLoadingMore" class="fp-spinner" />
          {{ isLoadingMore ? t('matrixChat.loading') : t('matrixChat.loadMore') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.file-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.fp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
  min-height: 44px;
}

.fp-back-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); color: $text-primary; }
}

.fp-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.fp-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.fp-loading, .fp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  color: $text-muted;
  font-size: 13px;
}

.fp-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  display: inline-block;
  animation: fp-spin 0.6s linear infinite;
}

@keyframes fp-spin { to { transform: rotate(360deg); } }

.fp-list { display: flex; flex-direction: column; }

.fp-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--text-muted-rgb), 0.08);
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.03); }
}

.fp-item-thumb {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: $radius-sm;
  overflow: hidden;
  background: $bg-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fp-item-thumb-img {
  width: 44px;
  height: 44px;
  object-fit: cover;
}

.fp-item-thumb-icon {
  font-size: 22px;
}

.fp-item-body {
  flex: 1;
  min-width: 0;
}

.fp-item-name {
  margin-bottom: 2px;
}

.fp-item-link {
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;

  &[href] {
    color: $accent-primary;
    &:hover { text-decoration: underline; }
  }
}

.fp-item-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: $text-muted;
}

.fp-item-sender {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

.fp-item-size { flex-shrink: 0; }
.fp-item-time { flex-shrink: 0; }

.fp-load-more {
  padding: 10px;
  display: flex;
  justify-content: center;
}

.fp-load-more-btn {
  font-size: 12px;
  padding: 6px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: none;
  color: $accent-primary;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all $transition-fast;

  &:hover:not(:disabled) { background: rgba(var(--accent-primary-rgb), 0.06); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
</style>
