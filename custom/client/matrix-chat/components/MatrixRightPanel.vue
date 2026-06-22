<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import MatrixRoomSummaryCard from './MatrixRoomSummaryCard.vue'
import MatrixThreadPanel from './MatrixThreadPanel.vue'
import MatrixThreadView from './MatrixThreadView.vue'

const rightPanelStore = useMatrixRightPanelStore()
const { t } = useI18n()

const phase = computed(() => rightPanelStore.rightPanelPhase)
const canGoBack = computed(() => rightPanelStore.rightPanelPhase !== null)

// ThreadPanel / ThreadView 自带 header(含 back/close),跳过通用 header
const hasOwnHeader = computed(
  () => phase.value === 'ThreadPanel' || phase.value === 'ThreadView',
)

// Panel title based on phase
const panelTitle = computed(() => {
  switch (phase.value) {
    case 'RoomSummary':
      return t('matrixChat.roomInfo')
    case 'MemberList':
      return t('matrixChat.roomMembers')
    case 'MemberInfo':
      return t('matrixChat.roomMembers')
    default:
      return ''
  }
})
</script>

<template>
  <div v-if="phase" class="matrix-right-panel">
    <!-- ThreadPanel / ThreadView:自带 header,直接渲染组件 -->
    <MatrixThreadPanel v-if="phase === 'ThreadPanel'" />
    <MatrixThreadView v-else-if="phase === 'ThreadView'" />

    <!-- 其他 phase:用通用 header -->
    <template v-else>
      <div class="right-panel-header">
        <button v-if="canGoBack" class="back-btn" @click="rightPanelStore.rightPanelBack()">
          ← {{ t('matrixChat.cancel') }}
        </button>
        <span class="right-panel-title">{{ panelTitle }}</span>
        <button class="close-btn" @click="rightPanelStore.closeRightPanel()">✕</button>
      </div>
      <div class="right-panel-content">
        <MatrixRoomSummaryCard v-if="phase === 'RoomSummary'" />
        <MatrixMemberList v-if="phase === 'MemberList'" />
        <MatrixMemberInfo v-if="phase === 'MemberInfo'" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-right-panel {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  background: $bg-card;
}

.right-panel-header {
  height: 52px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.back-btn {
  height: 28px;
  padding: 0 8px;
  border: none;
  background: none;
  color: $accent-primary;
  font-size: 13px;
  cursor: pointer;
  border-radius: $radius-sm;
  transition: background-color $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.04);
  }
}

.right-panel-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  font-size: 16px;
  cursor: pointer;
  border-radius: $radius-sm;
  transition: background-color $transition-fast;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(var(--text-muted-rgb), 0.06);
    color: $text-primary;
  }
}

.right-panel-content {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}
</style>
