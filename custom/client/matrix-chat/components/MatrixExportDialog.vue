<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const emit = defineEmits<{ close: [] }>()

const exporting = ref(false)
const exportError = ref<string | null>(null)
const exportedCount = ref(0)

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const roomId = computed(() => room.value?.roomId ?? '')

async function handleExport() {
  if (!roomId.value) return
  exporting.value = true
  exportError.value = null
  try {
    // Export messages from the room store's timeline (already loaded in memory)
    const messages = roomStore.messageList.map((ev: any) => ({
      event_id: ev.getId?.() ?? ev.event_id,
      sender: ev.getSender?.() ?? ev.sender,
      origin_server_ts: ev.getTs?.() ?? ev.origin_server_ts,
      type: ev.getType?.() ?? ev.type,
      content: ev.getContent?.() ?? ev.content,
    }))

    // Create and download JSON file
    const json = JSON.stringify(messages, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `room-${roomId.value.slice(1, 10)}-export.json`
    a.click()
    URL.revokeObjectURL(url)
    exportedCount.value = messages.length
  } catch (err: any) {
    exportError.value = err?.message || t('matrixChat.exportFailed')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="export-dialog-overlay" @click.self="emit('close')">
    <div class="export-dialog">
      <div class="export-dialog-header">
        <h3 class="export-dialog-title">{{ t('matrixChat.exportChatMenu') }}</h3>
        <button class="export-dialog-close" @click="emit('close')" :title="t('matrixChat.cancel')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="export-dialog-body">
        <p class="export-description">{{ t('matrixChat.exportChatDescription') }}</p>
        <p v-if="exportedCount > 0" class="export-success">
          {{ t('matrixChat.exportSuccess', { count: exportedCount }) }}
        </p>
        <p v-if="exportError" class="export-error">{{ exportError }}</p>
      </div>

      <div class="export-dialog-footer">
        <button class="export-cancel-btn" @click="emit('close')" :disabled="exporting">
          {{ t('matrixChat.cancel') }}
        </button>
        <button class="export-submit-btn" @click="handleExport" :disabled="exporting">
          <span v-if="exporting" class="export-spinner" />
          {{ exporting ? t('matrixChat.exporting') : t('matrixChat.exportChatMenu') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.export-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.export-dialog {
  width: 400px;
  max-width: 90vw;
  background: $bg-card;
  border-radius: $radius-lg;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.export-dialog-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;
}

.export-dialog-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.export-dialog-close {
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

  &:hover { background: rgba(var(--text-muted-rgb), 0.08); color: $text-primary; }
}

.export-dialog-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-description {
  font-size: 13px;
  color: $text-secondary;
  margin: 0;
  line-height: 1.5;
}

.export-success {
  font-size: 13px;
  color: var(--success, #22c55e);
  margin: 0;
}

.export-error {
  font-size: 12px;
  color: var(--error, #ef4444);
  margin: 0;
}

.export-dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.export-cancel-btn {
  font-size: 13px;
  padding: 6px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover:not(:disabled) { background: rgba(var(--text-muted-rgb), 0.06); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.export-submit-btn {
  font-size: 13px;
  padding: 6px 16px;
  border: none;
  border-radius: $radius-sm;
  background: $accent-primary;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all $transition-fast;

  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.export-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: export-spin 0.6s linear infinite;
}

@keyframes export-spin { to { transform: rotate(360deg); } }
</style>
