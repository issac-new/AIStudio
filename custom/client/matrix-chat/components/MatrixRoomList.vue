<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

const roomStore = useMatrixRoomStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const searchQuery = ref('')

const filteredRooms = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  const rooms = roomStore.sortedRooms
  if (!query) return rooms
  return rooms.filter((r) => r.name.toLowerCase().includes(query))
})

const isSyncing = computed(() => clientStore.syncState !== 'PREPARED' && clientStore.syncState !== 'SYNCING')

function getLastMessagePreview(room: any): string {
  const timeline = room.timeline
  for (let i = timeline.length - 1; i >= 0; i--) {
    const evt = timeline[i]
    if (evt.getType() === 'm.room.message' && !evt.isRedacted()) {
      const content = evt.getContent()
      if (content?.body) {
        const body = content.body as string
        return body.length > 50 ? body.substring(0, 50) + '...' : body
      }
    }
  }
  return ''
}

function getRoomAvatarUrl(room: any): string | null {
  return roomStore.getRoomAvatarUrl(room, 36)
}

function isRoomEncrypted(room: any): boolean {
  return roomStore.isRoomEncrypted(room.roomId)
}

function isRoomPublic(room: any): boolean {
  return roomStore.isRoomPublic(room)
}

function getRoomUnreadCount(room: any): number {
  return roomStore.getRoomUnreadCount(room)
}

function hasUnread(room: any): boolean {
  return getRoomUnreadCount(room) > 0
}

function getRoomNotificationLevel(room: any): 'highlight' | 'total' | 'none' {
  return roomStore.getRoomNotificationLevel(room)
}
</script>

<template>
  <div class="matrix-room-list">
    <!-- Search + Action buttons -->
    <div class="room-list-header">
      <input
        v-model="searchQuery"
        class="room-search-input"
        :placeholder="t('matrixChat.searchRooms')"
      />
    </div>

    <!-- Syncing indicator -->
    <div v-if="isSyncing && clientStore.authenticated" class="room-list-syncing">
      <div class="spinner" />
      <span>{{ t('matrixChat.syncConnecting') }}</span>
    </div>

    <!-- Empty state -->
    <div v-if="filteredRooms.length === 0 && !isSyncing" class="room-list-empty">
      <p>{{ clientStore.authenticated ? t('matrixChat.noRooms') : t('matrixChat.notAuthenticated') }}</p>
    </div>

    <!-- Room items (element-web RoomTile style) -->
    <div class="room-list-items">
      <div
        v-for="room in filteredRooms"
        :key="room.roomId"
        class="mx_RoomTile"
          :class="{
            'mx_RoomTile--selected': room.roomId === roomStore.activeRoomId,
            'mx_RoomTile--unread': hasUnread(room),
            'mx_RoomTile--mention': getRoomNotificationLevel(room) === 'highlight',
          }"
          @click="roomStore.selectRoom(room.roomId)"
        >
        <div class="mx_RoomTile_avatar">
          <img v-if="getRoomAvatarUrl(room)" :src="getRoomAvatarUrl(room)!" alt="" class="room-avatar-real" />
          <div v-else class="room-avatar-placeholder">{{ room.name.charAt(0).toUpperCase() }}</div>
          <span v-if="isRoomEncrypted(room)" class="room-icon-badge room-icon-badge--encrypted" title="Encrypted">🔒</span>
          <span v-if="isRoomPublic(room)" class="room-icon-badge room-icon-badge--public" title="Public">🌐</span>
        </div>
        <div class="mx_RoomTile_info">
          <div class="mx_RoomTile_top">
            <span class="mx_RoomTile_name">{{ room.name }}</span>
            <span v-if="getRoomUnreadCount(room) > 0" class="mx_RoomTile_badge">
              {{ getRoomUnreadCount(room) }}
            </span>
          </div>
          <div class="mx_RoomTile_bottom">
            <span class="mx_RoomTile_preview">
              {{ getLastMessagePreview(room) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Dialogs are handled by MatrixChatPanel -->
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-room-list {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.room-list-header {
  padding: 12px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.room-search-input {
  width: 100%;
  height: 34px;
  padding: 6px 10px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-primary;
  background: $bg-input;
  outline: none;

  &::placeholder { color: $text-muted; }
  &:focus { border-color: $accent-primary; }
}

.room-list-syncing {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: $text-muted;
  font-size: 13px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.room-list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: $text-muted;
  font-size: 14px;
}

.room-list-items {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

// ─── element-web RoomTile style ──────────────────────────
.mx_RoomTile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--mx-space-1x, 4px);
  cursor: pointer;
  transition: background-color $transition-fast;
  border-radius: var(--mx-room-tile-radius, 8px);
  margin-bottom: var(--mx-space-1x, 4px);

  &:hover {
    background: var(--mx-room-tile-hover-bg, rgba($accent-primary-rgb, 0.04));
  }

  &--selected {
    background: var(--mx-room-tile-active-bg, rgba($accent-primary-rgb, 0.08));
  }

  &--unread {
    .mx_RoomTile_name {
      font-weight: 600;
    }
  }
}

.mx_RoomTile_avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  position: relative;
}

.room-avatar-real {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.room-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--mx-font-15px, 15px);
  font-weight: 600;
}

.room-icon-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 10px;
  background: $bg-card;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.mx_RoomTile_info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mx_RoomTile_top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mx_RoomTile_name {
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.mx_RoomTile_badge {
  font-size: 11px;
  font-weight: 600;
  color: $text-on-accent;
  background: $accent-primary;
  border-radius: 10px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
}

// Mention / highlight level: stronger emphasis (Pure Ink — no red)
.mx_RoomTile--mention .mx_RoomTile_badge {
  background: $text-primary;
  color: $text-on-accent;
  font-weight: 700;
}

.mx_RoomTile_bottom {
  overflow: hidden;
}

.mx_RoomTile_preview {
  font-size: 12px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
