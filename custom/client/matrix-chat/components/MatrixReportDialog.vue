<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

const roomStore = useMatrixRoomStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const emit = defineEmits<{ close: [leave?: boolean] }>()

const reason = ref('')
const leaveAfterReport = ref(false)
const isSubmitting = ref(false)
const error = ref<string | null>(null)

const roomId = computed(() => roomStore.activeRoomId ?? '')

async function handleReport() {
  if (!clientStore.client || !roomId.value) return
  isSubmitting.value = true
  error.value = null
  try {
    // Use client.reportRoom (matches element-web ReportRoomDialog)
    await (clientStore.client as any).reportRoom?.(roomId.value, reason.value.trim())
    emit('close', leaveAfterReport.value)
  } catch (err: any) {
    error.value = err?.message || t('matrixChat.reportFailed')
  } finally {
    isSubmitting.value = false
  }
}

async function handleReportAndLeave() {
  leaveAfterReport.value = true
  await handleReport()
}
</script>

<template>
  <div class="report-dialog-overlay" @click.self="emit('close')">
    <div class="report-dialog">
      <div class="report-dialog-header">
        <h3 class="report-dialog-title">{{ t('matrixChat.reportRoom') }}</h3>
        <button class="report-dialog-close" @click="emit('close')" :title="t('matrixChat.cancel')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="report-dialog-body">
        <p class="report-description">{{ t('matrixChat.reportRoomDescription') }}</p>
        <textarea
          v-model="reason"
          class="report-input"
          :placeholder="t('matrixChat.reportReason')"
          rows="4"
          maxlength="500"
        />
        <label class="report-leave-toggle">
          <input v-model="leaveAfterReport" type="checkbox" :disabled="isSubmitting" />
          <span>{{ t('matrixChat.leaveRoom') }}</span>
        </label>
        <p v-if="error" class="report-error">{{ error }}</p>
      </div>

      <div class="report-dialog-footer">
        <button class="report-cancel-btn" @click="emit('close')" :disabled="isSubmitting">
          {{ t('matrixChat.cancel') }}
        </button>
        <button class="report-submit-btn" @click="handleReport" :disabled="isSubmitting || !reason.trim()">
          <span v-if="isSubmitting" class="report-spinner" />
          {{ isSubmitting ? t('matrixChat.submitting') : t('matrixChat.reportRoom') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.report-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.report-dialog {
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

.report-dialog-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;
}

.report-dialog-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--error, #ef4444);
  margin: 0;
}

.report-dialog-close {
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

.report-dialog-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.report-description {
  font-size: 13px;
  color: $text-secondary;
  margin: 0;
  line-height: 1.5;
}

.report-input {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-primary;
  background: $bg-input;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  line-height: 1.5;

  &:focus {
    border-color: var(--error, #ef4444);
  }
}

.report-error {
  font-size: 12px;
  color: var(--error, #ef4444);
  margin: 0;
}

.report-leave-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: $text-secondary;
  cursor: pointer;

  input[type="checkbox"] {
    accent-color: var(--error, #ef4444);
  }
}

.report-dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.report-cancel-btn {
  font-size: 13px;
  padding: 6px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover:not(:disabled) {
    background: rgba(var(--text-muted-rgb), 0.06);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.report-submit-btn {
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

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.report-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: report-spin 0.6s linear infinite;
}

@keyframes report-spin {
  to { transform: rotate(360deg); }
}
</style>
