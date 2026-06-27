<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const { t } = useI18n()

const emit = defineEmits<{ close: [] }>()

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const roomName = computed(() => room.value?.name ?? '')
const isLeaving = ref(false)
const error = ref<string | null>(null)

async function handleLeave() {
  if (!room.value) return
  isLeaving.value = true
  error.value = null
  try {
    await roomStore.leaveRoom(room.value.roomId)
    rightPanelStore.closeRightPanel()
    emit('close')
  } catch (err: any) {
    error.value = err?.message || t('matrixChat.leaveFailed')
  } finally {
    isLeaving.value = false
  }
}
</script>

<template>
  <div class="leave-dialog-overlay" @click.self="emit('close')">
    <div class="leave-dialog">
      <div class="leave-dialog-header">
        <h3 class="leave-dialog-title">{{ t('matrixChat.leaveRoom') }}</h3>
        <button class="leave-dialog-close" @click="emit('close')" :title="t('matrixChat.cancel')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="leave-dialog-body">
        <p class="leave-description">
          {{ t('matrixChat.leaveRoomConfirm', { room: roomName }) }}
        </p>
        <p v-if="error" class="leave-error">{{ error }}</p>
      </div>

      <div class="leave-dialog-footer">
        <button class="leave-cancel-btn" @click="emit('close')" :disabled="isLeaving">
          {{ t('matrixChat.cancel') }}
        </button>
        <button class="leave-submit-btn" @click="handleLeave" :disabled="isLeaving">
          <span v-if="isLeaving" class="leave-spinner" />
          {{ isLeaving ? t('matrixChat.loading') : t('matrixChat.leaveRoom') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.leave-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.leave-dialog {
  width: 400px;
  max-width: 90vw;
  background: $bg-card;
  border-radius: $radius-lg;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.leave-dialog-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;
}

.leave-dialog-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--error, #ef4444);
  margin: 0;
}

.leave-dialog-close {
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

.leave-dialog-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.leave-description {
  font-size: 13px;
  color: $text-secondary;
  margin: 0;
  line-height: 1.5;
}

.leave-error {
  font-size: 12px;
  color: var(--error, #ef4444);
  margin: 0;
}

.leave-dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.leave-cancel-btn {
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

.leave-submit-btn {
  font-size: 13px;
  padding: 6px 16px;
  border: none;
  border-radius: $radius-sm;
  background: var(--error, #ef4444);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all $transition-fast;

  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.leave-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: leave-spin 0.6s linear infinite;
}

@keyframes leave-spin { to { transform: rotate(360deg); } }
</style>
