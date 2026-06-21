<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import MatrixRoomView from './MatrixRoomView.vue'

const { t } = useI18n()
const clientStore = useMatrixClientStore()
const roomStore = useMatrixRoomStore()
</script>

<template>
  <div class="matrix-message-panel">
    <!-- Not authenticated -->
    <template v-if="!clientStore.authenticated">
      <div class="panel-empty">
        <p>{{ t('matrixChat.notAuthenticated') }}</p>
      </div>
    </template>
    <!-- Syncing -->
    <template v-else-if="clientStore.syncState !== 'PREPARED' && clientStore.syncState !== 'SYNCING'">
      <div class="panel-empty">
        <div class="spinner" />
        <p>{{ t('matrixChat.syncConnecting') }}</p>
      </div>
    </template>
    <!-- No room selected -->
    <template v-else-if="!roomStore.activeRoomId">
      <div class="panel-empty">
        <p>{{ t('matrixChat.noRoomSelected') }}</p>
      </div>
    </template>
    <!-- Room content -->
    <template v-else>
      <MatrixRoomView />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-message-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: $text-muted;
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
