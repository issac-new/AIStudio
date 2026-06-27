<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const emit = defineEmits<{ close: [] }>()

const linkCopied = ref(false)

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const roomName = computed(() => room.value?.name ?? t('matrixChat.noRoomSelected'))
const roomAlias = computed(() => roomStore.getRoomAlias(room.value))
const roomId = computed(() => room.value?.roomId ?? '')

const shareLink = computed(() => {
  if (!roomId.value) return ''
  return `https://matrix.to/#/${roomId.value}`
})

const qrCodeUrl = computed(() => {
  if (!shareLink.value) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareLink.value)}&margin=8`
})

const aliasLink = computed(() => {
  if (!roomAlias.value) return ''
  return `https://matrix.to/#/${roomAlias.value}`
})

async function handleCopyLink() {
  if (!shareLink.value) return
  try {
    await navigator.clipboard.writeText(shareLink.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {
    // clipboard API may not be available
  }
}

async function handleCopyAlias() {
  if (!roomAlias.value) return
  try {
    await navigator.clipboard.writeText(roomAlias.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {
    // ignore
  }
}
</script>

<template>
  <div class="share-dialog-overlay" @click.self="emit('close')">
    <div class="share-dialog">
      <div class="share-dialog-header">
        <h3 class="share-dialog-title">{{ t('matrixChat.shareRoom') }}</h3>
        <button class="share-dialog-close" @click="emit('close')" :title="t('matrixChat.cancel')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="share-dialog-body">
        <!-- Room name -->
        <div class="share-section">
          <label class="share-label">{{ t('matrixChat.roomName') }}</label>
          <p class="share-value">{{ roomName }}</p>
        </div>

        <!-- Room alias (if exists) -->
        <div v-if="roomAlias" class="share-section">
          <label class="share-label">{{ t('matrixChat.roomAlias') }}</label>
          <div class="share-copy-row">
            <code class="share-code">{{ roomAlias }}</code>
            <button class="share-copy-btn" @click="handleCopyAlias">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Room ID -->
        <div class="share-section">
          <label class="share-label">Matrix.to Link</label>
          <div class="share-copy-row">
            <code class="share-code share-code--link">{{ shareLink }}</code>
            <button class="share-copy-btn" @click="handleCopyLink">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>

        <!-- QR Code -->
        <div v-if="qrCodeUrl" class="share-qr">
          <img :src="qrCodeUrl" alt="QR Code" class="share-qr-img" />
        </div>

        <!-- Copy confirmation -->
        <p v-if="linkCopied" class="share-copied">{{ t('matrixChat.linkCopied') }}</p>
      </div>

      <div class="share-dialog-footer">
        <button class="share-done-btn" @click="emit('close')">{{ t('matrixChat.cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.share-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.share-dialog {
  width: 400px;
  max-width: 90vw;
  max-height: 80vh;
  background: $bg-card;
  border-radius: $radius-lg;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.share-dialog-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;
}

.share-dialog-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.share-dialog-close {
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
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--text-muted-rgb), 0.08);
    color: $text-primary;
  }
}

.share-dialog-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.share-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share-label {
  font-size: 12px;
  font-weight: 500;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.share-value {
  font-size: 14px;
  color: $text-primary;
  margin: 0;
}

.share-copy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: $bg-secondary;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  padding: 6px 10px;
}

.share-code {
  flex: 1;
  font-size: 12px;
  font-family: monospace;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
  padding: 0;
}

.share-code--link {
  color: $accent-primary;
}

.share-copy-btn {
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
    background: rgba(var(--accent-primary-rgb), 0.08);
    color: $accent-primary;
  }
}

.share-copied {
  font-size: 12px;
  color: var(--success, #22c55e);
  margin: 0;
  text-align: center;
}

.share-qr {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.share-qr-img {
  width: 150px;
  height: 150px;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
}

.share-dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
}

.share-done-btn {
  font-size: 13px;
  padding: 6px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--text-muted-rgb), 0.06);
    color: $text-primary;
  }
}
</style>
