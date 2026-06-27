<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})

interface PinnedItem {
  eventId: string
  event?: any
  loading: boolean
}

const pinnedItems = ref<PinnedItem[]>([])
const loadingAll = ref(false)
const canUnpin = ref(false)

// Resolve pinned event IDs to actual events
async function loadPinnedEvents() {
  if (!room.value || !clientStore.client) return

  const ids = roomStore.getPinnedEventIds(room.value)
  pinnedItems.value = ids.map(id => ({ eventId: id, loading: true }))
  loadingAll.value = true

  try {
    // Check unpin permission
    const userId = clientStore.client.getSafeUserId()
    const powerLevels = room.value.currentState?.getStateEvents('m.room.power_levels', '')
    const requiredLevel = powerLevels?.getContent()?.events?.['m.room.pinned_events'] ?? 50
    const myMember = room.value.getMember(userId)
    const myPower = myMember?.powerLevel ?? 0
    canUnpin.value = myPower >= requiredLevel

    // Resolve each event
    const resolved: PinnedItem[] = []
    for (const id of ids) {
      let event = room.value.findEventById(id)
      if (!event) {
        try {
          const raw = await clientStore.client.fetchRoomEvent(room.value.roomId, id)
          const mapper = clientStore.client.getEventMapper?.()
          event = mapper ? mapper(raw) : null
        } catch {
          // Event may have been deleted or is inaccessible
        }
      }
      resolved.push({ eventId: id, event, loading: false })
    }
    pinnedItems.value = resolved
  } catch {
    // ignore
  } finally {
    loadingAll.value = false
  }
}

// Load on mount and when room changes
watch(room, () => {
  if (room.value) loadPinnedEvents()
}, { immediate: true })

onMounted(() => {
  if (room.value) loadPinnedEvents()
})

// ─── Actions ──────────────────────────────────────────────

async function handleUnpin(eventId: string) {
  if (!room.value || !clientStore.client) return
  try {
    const ids = roomStore.getPinnedEventIds(room.value)
    const updated = ids.filter(id => id !== eventId)
    await clientStore.client.sendStateEvent(
      room.value.roomId,
      'm.room.pinned_events',
      { pinned: updated },
      '',
    )
    // Remove from local list
    pinnedItems.value = pinnedItems.value.filter(item => item.eventId !== eventId)
    roomStore.bumpRoomVersion()
  } catch {
    // ignore
  }
}

async function handleUnpinAll() {
  if (!room.value || !clientStore.client) return
  try {
    await clientStore.client.sendStateEvent(
      room.value.roomId,
      'm.room.pinned_events',
      { pinned: [] },
      '',
    )
    pinnedItems.value = []
    roomStore.bumpRoomVersion()
  } catch {
    // ignore
  }
}

function handleBack() {
  rightPanelStore.rightPanelBack()
}

// ─── Helpers ──────────────────────────────────────────────

function getEventSender(event: any): string {
  return event?.getSender?.() ?? event?.sender ?? ''
}

function getEventContent(event: any): string {
  const content = event?.getContent?.()
  if (!content) return ''
  // Prefer formatted_body, fallback to body
  const body = content.formatted_body || content.body || ''
  // Strip HTML tags for plain text preview
  return body.replace(/<[^>]*>/g, '').trim().slice(0, 200)
}

function getEventTimestamp(event: any): string {
  const ts = event?.getTs?.() ?? 0
  if (!ts) return ''
  const date = new Date(ts)
  return date.toLocaleString()
}

function getSenderName(event: any): string {
  const senderId = getEventSender(event)
  if (!senderId || !room.value) return senderId
  const member = room.value.getMember(senderId)
  return member?.name ?? senderId
}

function getSenderAvatar(event: any): string | null {
  const senderId = getEventSender(event)
  if (!senderId) return null
  return roomStore.getUserAvatarUrl(senderId, 32)
}
</script>

<template>
  <div class="pinned-messages-card">
    <!-- Header -->
    <div class="pm-header">
      <button class="pm-back-btn" @click="handleBack">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h3 class="pm-title">{{ t('matrixChat.pinnedMessages') }}</h3>
      <button
        v-if="canUnpin && pinnedItems.length > 0"
        class="pm-unpin-all-btn"
        @click="handleUnpinAll"
      >
        {{ t('matrixChat.unpinAll') }}
      </button>
    </div>

    <!-- Content -->
    <div class="pm-content">
      <!-- Loading -->
      <div v-if="loadingAll" class="pm-loading">
        <span class="pm-spinner" />
        {{ t('matrixChat.loading') }}
      </div>

      <!-- Empty state -->
      <div v-else-if="pinnedItems.length === 0" class="pm-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="17.66 7.34 12 2.34 6.34 7.34" />
        </svg>
        <p>{{ t('matrixChat.noPinnedMessages') }}</p>
      </div>

      <!-- Pinned items list -->
      <div v-else class="pm-list">
        <div
          v-for="item in pinnedItems"
          :key="item.eventId"
          class="pm-item"
        >
          <div v-if="item.loading" class="pm-item-loading">
            <span class="pm-spinner" />
          </div>
          <template v-else-if="item.event">
            <div class="pm-item-avatar">
              <img
                v-if="getSenderAvatar(item.event)"
                :src="getSenderAvatar(item.event)!"
                alt=""
                class="pm-item-avatar-img"
              />
              <div v-else class="pm-item-avatar-placeholder">
                {{ getSenderName(item.event).charAt(0).toUpperCase() }}
              </div>
            </div>
            <div class="pm-item-body">
              <div class="pm-item-header">
                <span class="pm-item-sender">{{ getSenderName(item.event) }}</span>
                <span class="pm-item-time">{{ getEventTimestamp(item.event) }}</span>
              </div>
              <p class="pm-item-content">{{ getEventContent(item.event) || t('matrixChat.undecryptable') }}</p>
            </div>
            <button
              v-if="canUnpin"
              class="pm-item-unpin"
              :title="t('matrixChat.unpinMessage')"
              @click="handleUnpin(item.eventId)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </template>
          <div v-else class="pm-item-missing">
            <span class="pm-item-event-id">{{ item.eventId }}</span>
            <span class="pm-item-missing-label">{{ t('matrixChat.eventNotFound') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.pinned-messages-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

// ─── Header ──────────────────────────────────────────────

.pm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
  min-height: 44px;
}

.pm-back-btn {
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
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.04);
    color: $text-primary;
  }
}

.pm-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pm-unpin-all-btn {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  flex-shrink: 0;
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--error-rgb), 0.06);
    color: var(--error, #ef4444);
    border-color: var(--error, #ef4444);
  }
}

// ─── Content ─────────────────────────────────────────────

.pm-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.pm-loading,
.pm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  color: $text-muted;
  font-size: 13px;
  text-align: center;
}

.pm-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  display: inline-block;
  animation: pm-spin 0.6s linear infinite;
}

@keyframes pm-spin {
  to { transform: rotate(360deg); }
}

// ─── List ────────────────────────────────────────────────

.pm-list {
  display: flex;
  flex-direction: column;
}

.pm-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--text-muted-rgb), 0.08);
  transition: background-color $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.03);
  }
}

.pm-item-loading {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.pm-item-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.pm-item-avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.pm-item-avatar-placeholder {
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

.pm-item-body {
  flex: 1;
  min-width: 0;
}

.pm-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.pm-item-sender {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pm-item-time {
  font-size: 11px;
  color: $text-muted;
  flex-shrink: 0;
}

.pm-item-content {
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.4;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.pm-item-unpin {
  width: 24px;
  height: 24px;
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

  &:hover {
    background: rgba(var(--error-rgb), 0.08);
    color: var(--error, #ef4444);
  }
}

.pm-item-missing {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.pm-item-event-id {
  font-family: monospace;
  font-size: 11px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.pm-item-missing-label {
  color: $text-muted;
  font-style: italic;
}
</style>
