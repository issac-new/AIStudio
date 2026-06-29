<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const emit = defineEmits<{ close: [] }>()

const room = computed(() => roomStore.activeRoom)
const roomName = computed(() => room.value?.name ?? '')
const isClearing = ref(false)
const error = ref<string | null>(null)
const result = ref<{ deleted: number; failed: number } | null>(null)

async function handleClear() {
  isClearing.value = true
  error.value = null
  try {
    result.value = await roomStore.clearAllMessages()
  } catch (err: any) {
    error.value = err?.message || t('matrixChat.clearMessagesFailed')
  } finally {
    isClearing.value = false
  }
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="clear-dialog-overlay" @click.self="handleClose">
    <div class="clear-dialog">
      <div class="clear-dialog-header">
        <h3 class="clear-dialog-title">{{ t('matrixChat.clearAllMessages') }}</h3>
        <button class="clear-dialog-close" @click="handleClose" :title="t('matrixChat.cancel')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="clear-dialog-body">
        <template v-if="result">
          <p class="clear-result">
            {{ t('matrixChat.clearMessagesResult', { deleted: result.deleted, failed: result.failed }) }}
          </p>
        </template>
        <template v-else>
          <p class="clear-description">
            {{ t('matrixChat.clearAllMessagesConfirm', { room: roomName }) }}
          </p>
          <p class="clear-warning">{{ t('matrixChat.clearAllMessagesWarning') }}</p>
        </template>
        <p v-if="error" class="clear-error">{{ error }}</p>
      </div>

      <div class="clear-dialog-footer">
        <button class="clear-cancel-btn" @click="handleClose" :disabled="isClearing">
          {{ result ? t('matrixChat.cancel') : t('matrixChat.cancel') }}
        </button>
        <button v-if="!result" class="clear-submit-btn" @click="handleClear" :disabled="isClearing">
          <span v-if="isClearing" class="clear-spinner" />
          {{ isClearing ? t('matrixChat.loading') : t('matrixChat.clearAllMessages') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.clear-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.clear-dialog {
  width: 420px;
  max-width: 90vw;
  background: $bg-card;
  border-radius: $radius-lg;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.clear-dialog-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;
}

.clear-dialog-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--error, #ef4444);
  margin: 0;
}

.clear-dialog-close {
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

  &:hover { background: rgba(var(--text-muted-rgb), 0.08); color: $text-primary; }
}

.clear-dialog-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.clear-description {
  font-size: 13px;
  color: $text-secondary;
  margin: 0;
  line-height: 1.5;
}

.clear-warning {
  font-size: 12px;
  color: var(--warning, #f59e0b);
  margin: 0;
  line-height: 1.5;
}

.clear-result {
  font-size: 13px;
  color: var(--success, #22c55e);
  margin: 0;
}

.clear-error {
  font-size: 12px;
  color: var(--error, #ef4444);
  margin: 0;
}

.clear-dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.clear-cancel-btn {
  font-size: 13px;
  padding: 6px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: none;
  color: $text-secondary;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.clear-submit-btn {
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

  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.clear-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: clear-spin 0.6s linear infinite;
}

@keyframes clear-spin { to { transform: rotate(360deg); } }
</style>
