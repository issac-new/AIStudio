<!-- overlay/custom/client/matrix-chat/components/MatrixRoomCanvas.vue -->
<!-- v12 对话画布的 matrix 房间面（2026-09-19 统一视图）：MatrixChatPanel 的
     chat-main 子集——房间头 + 消息面板（含输入）+ 右侧信息面板，**无房间列表**
     （工作台左栏即导航）。roomId 经 route.params.roomId 绑定（与 MatrixChatPanel
     同一约定，深链/选中一致）；客户端生命周期与原面板同构（跨导航保活）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import MatrixMessagePanel from './MatrixMessagePanel.vue'
import MatrixRightPanel from './MatrixRightPanel.vue'
import MatrixRoomHeader from './MatrixRoomHeader.vue'
import MatrixRedactDialog from './MatrixRedactDialog.vue'
import '../styles/matrix-chat.scss'

const clientStore = useMatrixClientStore()
const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const composerStore = useMatrixComposerStore()
const route = useRoute()
const { t } = useI18n()

const routeRoomId = computed(() => {
  const value = route.params.roomId
  return typeof value === 'string' && value.trim() ? value : null
})

watch(routeRoomId, (roomId) => {
  if (roomId && roomStore.activeRoomId !== roomId) {
    roomStore.selectRoom(roomId)
  }
}, { immediate: true })

function openPageSidebar(): void {
  window.dispatchEvent(new CustomEvent('hermes:open-page-sidebar'))
}

onMounted(() => {
  window.addEventListener('hermes:open-page-sidebar', openPageSidebar)
  clientStore.refreshCredentials()
  if (clientStore.authenticated && !clientStore.client) {
    clientStore.initClient()
  }
})

onUnmounted(() => {
  window.removeEventListener('hermes:open-page-sidebar', openPageSidebar)
  // 与 MatrixChatPanel 同律：Matrix 客户端跨导航保活，仅显式登出时断开
})
</script>

<template>
  <div class="matrix-room-canvas" data-testid="room-canvas">
    <MatrixRedactDialog v-if="composerStore.showRedactDialog" />
    <div class="chat-header">
      <template v-if="roomStore.activeRoomId && roomStore.activeRoom">
        <MatrixRoomHeader />
      </template>
      <template v-else>
        <span class="header-title-placeholder" data-testid="room-canvas-empty">{{ t('ia2.canvas.noRoom') }}</span>
      </template>
    </div>
    <div class="chat-content-wrapper">
      <div class="chat-main-content">
        <MatrixMessagePanel />
      </div>
      <MatrixRightPanel v-if="rightPanelStore.rightPanelPhase" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.matrix-room-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
}
.chat-header {
  display: flex; align-items: center; gap: 8px; padding: 0 12px;
  height: 52px; border-bottom: 1px solid $border-color; flex-shrink: 0;
}
.header-title-placeholder {
  font-size: 13px; color: $text-secondary;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chat-content-wrapper {
  flex: 1; display: flex; overflow: hidden; position: relative; min-width: 0;
}
.chat-main-content {
  flex: 1; overflow: hidden; display: flex; flex-direction: column; min-width: 0;
}
</style>
