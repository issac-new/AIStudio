<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const emit = defineEmits<{
  close: []
}>()

const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const roomName = ref('')
const isPublic = ref(false)
const creating = ref(false)

async function handleCreate() {
  if (!roomName.value.trim()) return
  creating.value = true
  try {
    await roomStore.createRoom({
      name: roomName.value.trim(),
      isPublic: isPublic.value,
    })
    emit('close')
  } catch (err: any) {
    console.error('Failed to create room:', err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog-card">
      <h3 class="dialog-title">{{ t('matrixChat.createRoom') }}</h3>
      <input
        v-model="roomName"
        type="text"
        class="dialog-input"
        :placeholder="t('matrixChat.roomName')"
      />
      <label class="dialog-checkbox">
        <input type="checkbox" v-model="isPublic" />
        {{ t('matrixChat.publicRoom') }}
      </label>
      <div class="dialog-actions">
        <button class="dialog-btn cancel" type="button" @click="emit('close')">
          {{ t('matrixChat.cancel') }}
        </button>
        <button
          class="dialog-btn primary"
          type="button"
          :disabled="!roomName.trim() || creating"
          @click="handleCreate"
        >
          {{ creating ? '...' : t('matrixChat.createRoom') }}
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
  margin: 0 0 16px;
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

.dialog-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 12px;
  cursor: pointer;
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

  &.primary {
    background: var(--accent-primary);
    color: var(--text-on-accent);
  }

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
}
</style>
