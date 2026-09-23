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

// 去同 id 守卫：selectRoom 幂等可重入（matrix-room.ts selectRoom 无同房间早退），
// 路由层对"点已选房间"是空转（router.push 同路由被去重），守卫只会把恢复后的
// 时间线永久拦在"未选择房间"。客户端未就绪时 selectRoom 会打到空——靠下面
// syncState PREPARED 兜底重选（对齐 MatrixChatPanel）。
watch(routeRoomId, (roomId) => {
  if (roomId) {
    roomStore.selectRoom(roomId)
  }
}, { immediate: true })

// client 就绪兜底：冷启动/深链时上面的 immediate watcher 跑在 initClient 之前，
// activeRoom 因 client 未就绪缓存 null 且再无响应式依赖翻案；sync 完成 PREPARED
// 时房间已入 client，重选一次让时间线自愈。
watch(() => clientStore.syncState, (s) => {
  if (s === 'PREPARED' && routeRoomId.value) {
    roomStore.selectRoom(routeRoomId.value)
  }
})

// hermes:open-page-sidebar 只由上游 App.vue 的移动端汉堡按钮发出；本画布无侧栏，
// 不需要转发——原实现监听后同步再发同名事件会自激递归（Maximum call stack）。

onMounted(() => {
  clientStore.refreshCredentials()
  if (clientStore.authenticated && !clientStore.client) {
    clientStore.initClient()
  }
})

onUnmounted(() => {
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
