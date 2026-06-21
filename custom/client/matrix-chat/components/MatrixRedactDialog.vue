<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const composerStore = useMatrixComposerStore()
const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const reason = ref('')
const redacting = ref(false)

async function handleRedact() {
  if (!composerStore.redactingEventId || !roomStore.activeRoomId) return
  redacting.value = true
  try {
    await composerStore.redactEvent(
      composerStore.redactingEventId,
      roomStore.activeRoomId,
      reason.value.trim() || undefined,
    )
    composerStore.closeRedactDialog()
  } catch {
    // error handled in store
  } finally {
    redacting.value = false
  }
}

function handleCancel() {
  composerStore.closeRedactDialog()
}
</script>

<template>
  <div class="dialog-overlay" @click.self="handleCancel">
    <div class="dialog-card">
      <h3 class="dialog-title">{{ t('matrixChat.delete') }}</h3>
      <p class="dialog-message">{{ t('matrixChat.confirmDelete') }}</p>
      <input
        v-model="reason"
        type="text"
        class="dialog-input"
        :placeholder="t('matrixChat.deleteReasonPlaceholder')"
      />
      <div class="dialog-actions">
        <button class="dialog-btn cancel" type="button" @click="handleCancel">
          {{ t('matrixChat.cancel') }}
        </button>
        <button
          class="dialog-btn danger"
          type="button"
          :disabled="redacting"
          @click="handleRedact"
        >
          {{ redacting ? '...' : t('matrixChat.confirmDeleteAction') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-card {
  width: 400px;
  max-width: calc(100vw - 32px);
  padding: 24px;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
}

.dialog-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 16px;
  line-height: 1.5;
}

.dialog-input {
  width: 100%;
  height: 38px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-input);
  outline: none;
  box-sizing: border-box;

  &::placeholder { color: var(--text-muted); }
  &:focus { border-color: var(--accent-primary); }
}

.dialog-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}

.dialog-btn {
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s;

  &.cancel {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
  }

  &.danger {
    background: var(--error, #dc2626);
    color: #fff;
  }

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
}
</style>
