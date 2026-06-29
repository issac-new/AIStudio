<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

const roomStore = useMatrixRoomStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const results = computed(() => roomStore.searchResults)
const isSearching = computed(() => roomStore.searchInProgress)
const searchCount = computed(() => roomStore.searchCount)
const searchTerm = computed(() => roomStore.roomSearchTerm)
const highlights = computed(() => roomStore.searchHighlights)
const room = computed(() => roomStore.activeRoom)

function handleSelectEvent(eventId: string) {
  // Jump to the event in the timeline, then cancel search
  roomStore.selectEvent(eventId)
  roomStore.cancelRoomSearch()
}

function handleCancel() {
  roomStore.cancelRoomSearch()
}

function getSenderName(senderId: string): string {
  if (!room.value) return senderId
  const member = room.value.getMember(senderId)
  return member?.name ?? senderId
}

function getSenderAvatar(senderId: string): string | null {
  return roomStore.getUserAvatarUrl(senderId, 32)
}

function getFormattedTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Highlight search terms in text */
function highlightText(text: string): string {
  if (!text) return ''
  let result = text
  for (const term of highlights.value) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark class="search-highlight">$1</mark>',
    )
  }
  // Escape HTML first, then re-apply mark tags
  const div = document.createElement('div')
  div.textContent = result
  let escaped = div.innerHTML
  // Re-insert mark tags (they were escaped)
  escaped = escaped.replace(/&lt;mark class="search-highlight"&gt;/g, '<mark class="search-highlight">')
  escaped = escaped.replace(/&lt;\/mark&gt;/g, '</mark>')
  return escaped
}

function getContentPreview(event: any): string {
  const content = event?.getContent?.() ?? event?.content
  const body = content?.body
  if (typeof body === 'string') return body.slice(0, 200)
  return ''
}
</script>

<template>
  <div class="room-search-view">
    <!-- Search header bar -->
    <div class="rsv-header">
      <div class="rsv-search-info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span class="rsv-term">{{ searchTerm }}</span>
        <span v-if="!isSearching && searchCount > 0" class="rsv-count">
          {{ t('matrixChat.searchResultCount', { count: searchCount }) }}
        </span>
      </div>
      <button class="rsv-cancel-btn" @click="handleCancel" :title="t('matrixChat.cancel')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Results list -->
    <div class="rsv-results">
      <!-- Loading -->
      <div v-if="isSearching" class="rsv-loading">
        <span class="rsv-spinner" />
        {{ t('matrixChat.loading') }}
      </div>

      <!-- Empty -->
      <div v-else-if="results.length === 0" class="rsv-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p>{{ t('matrixChat.noResults') }}</p>
      </div>

      <!-- Results -->
      <div v-else class="rsv-list">
        <div
          v-for="item in results"
          :key="item.eventId"
          class="rsv-item"
          @click="handleSelectEvent(item.eventId)"
        >
          <div class="rsv-item-avatar">
            <img
              v-if="getSenderAvatar(item.sender)"
              :src="getSenderAvatar(item.sender)!"
              alt=""
              class="rsv-item-avatar-img"
            />
            <div v-else class="rsv-item-avatar-placeholder">
              {{ getSenderName(item.sender).charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="rsv-item-body">
            <div class="rsv-item-header">
              <span class="rsv-item-sender">{{ getSenderName(item.sender) }}</span>
              <span class="rsv-item-time">{{ getFormattedTime(item.timestamp) }}</span>
            </div>
            <p class="rsv-item-content" v-html="highlightText(getContentPreview(item.event))" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.room-search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

// ─── Header ──────────────────────────────────────────────

.rsv-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
  background: $bg-card;
}

.rsv-search-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  svg { color: $text-muted; flex-shrink: 0; }
}

.rsv-term {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rsv-count {
  font-size: 12px;
  color: $text-muted;
  flex-shrink: 0;
  padding: 2px 8px;
  background: $bg-secondary;
  border-radius: 10px;
}

.rsv-cancel-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all $transition-fast;

  &:hover { background: rgba(var(--text-muted-rgb), 0.08); color: $text-primary; }
}

// ─── Results ─────────────────────────────────────────────

.rsv-results {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.rsv-loading, .rsv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: $text-muted;
  font-size: 13px;
}

.rsv-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  display: inline-block;
  animation: rsv-spin 0.6s linear infinite;
}

@keyframes rsv-spin { to { transform: rotate(360deg); } }

.rsv-list {
  display: flex;
  flex-direction: column;
}

.rsv-item {
  display: flex;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(var(--text-muted-rgb), 0.06);
  cursor: pointer;
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }
}

.rsv-item-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.rsv-item-avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.rsv-item-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.rsv-item-body {
  flex: 1;
  min-width: 0;
}

.rsv-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.rsv-item-sender {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rsv-item-time {
  font-size: 11px;
  color: $text-muted;
  flex-shrink: 0;
}

.rsv-item-content {
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.4;
  margin: 0;
  word-break: break-word;

  :deep(.search-highlight) {
    background: rgba(var(--accent-warning-rgb, 245 158 11), 0.25);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }
}
</style>
