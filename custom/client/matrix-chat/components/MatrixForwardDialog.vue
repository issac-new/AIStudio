<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

interface Props {
  event: MatrixEvent
  visible: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const roomStore = useMatrixRoomStore()
const composerStore = useMatrixComposerStore()
const clientStore = useMatrixClientStore()

const searchQuery = ref('')
const sendStates = reactive<Record<string, 'idle' | 'sending' | 'sent' | 'failed'>>({})

/**
 * Transform event content for forwarding (Element Web parity).
 * Strips m.relates_to so forwarded messages don't carry reply/edit/reaction chains.
 */
function transformContent(event: MatrixEvent): Record<string, unknown> {
  const originalContent = event.getContent()
  const content = { ...(originalContent as Record<string, unknown>) }
  // Strip relations — forwarded message should be standalone
  delete content['m.relates_to']
  return content
}

const rooms = computed(() => {
  const q = searchQuery.value.toLowerCase()
  const list = (roomStore.roomList as any[]) || []
  // Filter: only joined rooms, exclude current room
  const filtered = list.filter((r: any) => {
    if (r.roomId === roomStore.activeRoomId) return false
    if (!q) return true
    const name = (r.name ?? '').toLowerCase()
    return name.includes(q)
  })
  // Sort alphabetically (Element Web uses recency; alpha is simpler + deterministic)
  filtered.sort((a: any, b: any) => (a.name || a.roomId).localeCompare(b.name || b.roomId))
  return filtered.slice(0, 30)
})

const sourceContent = computed(() => {
  const c = props.event.getContent()
  return composerStore.stripPlainReply(c?.body ?? '').slice(0, 200)
})

function getRoomAvatarUrl(room: any): string | null {
  return roomStore.getRoomAvatarUrl(room, 32)
}

/** Forward event content to a room directly (Element Web parity: Entry.send) */
async function forwardTo(roomId: string) {
  if (!clientStore.client) return
  sendStates[roomId] = 'sending'
  try {
    const content = transformContent(props.event)
    // Preserve body; use original msgtype and content structure
    await clientStore.client.sendEvent(roomId, props.event.getType(), content)
    sendStates[roomId] = 'sent'
  } catch {
    sendStates[roomId] = 'failed'
  }
}

function getSendState(roomId: string): 'idle' | 'sending' | 'sent' | 'failed' {
  return sendStates[roomId] || 'idle'
}

function canSend(roomId: string): boolean {
  const state = getSendState(roomId)
  return state === 'idle' || state === 'failed'
}
</script>

<template>
  <div v-if="visible" class="matrix-dialog-overlay" @click.self="emit('close')">
    <div class="matrix-dialog forward-dialog">
      <div class="matrix-dialog__header">
        <h3>{{ t('matrixChat.forwardMessage') }}</h3>
        <button class="matrix-dialog__close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="forward-dialog__preview">
        <span class="forward-dialog__preview-label">{{ t('matrixChat.forwardingMessage') }}</span>
        <p class="forward-dialog__preview-text">{{ sourceContent || '(no text content)' }}</p>
      </div>

      <div class="forward-dialog__search">
        <input
          v-model="searchQuery"
          type="text"
          class="matrix-input"
          :placeholder="t('matrixChat.searchRooms')"
        />
      </div>

      <div class="forward-dialog__room-list">
        <div
          v-for="room in rooms"
          :key="room.roomId"
          class="forward-dialog__room-item"
        >
          <div class="forward-dialog__room-avatar">
            <img v-if="getRoomAvatarUrl(room)" :src="getRoomAvatarUrl(room)!" alt="" class="forward-dialog__avatar-img" />
            <div v-else class="forward-dialog__avatar-placeholder">{{ (room.name || '?').charAt(0).toUpperCase() }}</div>
          </div>
          <span class="forward-dialog__room-name">{{ room.name || room.roomId }}</span>
          <button
            class="forward-dialog__send-btn"
            :class="`forward-dialog__send-btn--${getSendState(room.roomId)}`"
            :disabled="!canSend(room.roomId)"
            @click="forwardTo(room.roomId)"
          >
            <span v-if="getSendState(room.roomId) === 'idle'">{{ t('matrixChat.send') }}</span>
            <span v-else-if="getSendState(room.roomId) === 'sending'">{{ t('matrixChat.messageSending') }}</span>
            <span v-else-if="getSendState(room.roomId) === 'sent'">✓ {{ t('matrixChat.sent') }}</span>
            <span v-else-if="getSendState(room.roomId) === 'failed'">! {{ t('matrixChat.failed') }}</span>
          </button>
        </div>
        <p v-if="rooms.length === 0" class="forward-dialog__empty">{{ t('matrixChat.noRooms') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.matrix-dialog {
  background: $bg-card;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.matrix-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;

  h3 { margin: 0; font-size: 16px; font-weight: 600; color: $text-primary; }
}

.matrix-dialog__close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;

  &:hover { background: $bg-secondary; color: $text-primary; }
}

.forward-dialog__preview {
  padding: 12px 20px;
  background: $bg-secondary;
  border-bottom: 1px solid $border-color;
}

.forward-dialog__preview-label {
  font-size: 11px;
  color: $text-muted;
  font-weight: 600;
  text-transform: uppercase;
}

.forward-dialog__preview-text {
  font-size: 13px;
  color: $text-primary;
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forward-dialog__search {
  padding: 12px 20px;
  border-bottom: 1px solid $border-color;
}

.matrix-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: 6px;
  font-size: 14px;
  color: $text-primary;
  outline: none;
  box-sizing: border-box;

  &:focus { border-color: $accent-primary; }
}

.forward-dialog__room-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.forward-dialog__room-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
}

.forward-dialog__room-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.forward-dialog__avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.forward-dialog__avatar-placeholder {
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

.forward-dialog__room-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forward-dialog__send-btn {
  padding: 4px 12px;
  border: 1px solid $border-color;
  border-radius: 6px;
  background: $bg-card;
  color: $accent-primary;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &:hover:not(:disabled) { background: $accent-primary; color: #fff; border-color: $accent-primary; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }

  &--sent {
    color: $success;
    border-color: $success;
    background: rgba($success, 0.06);
  }
  &--failed {
    color: $error;
    border-color: $error;
    background: rgba($error, 0.06);
  }
  &--sending {
    color: $text-muted;
  }
}

.forward-dialog__empty {
  padding: 24px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}
</style>
