<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import MatrixRoomSummaryCard from './MatrixRoomSummaryCard.vue'
import MatrixMemberList from './MatrixMemberList.vue'
import MatrixMemberInfo from './MatrixMemberInfo.vue'
import MatrixThreadPanel from './MatrixThreadPanel.vue'
import MatrixThreadView from './MatrixThreadView.vue'
import MatrixPinnedMessagesCard from './MatrixPinnedMessagesCard.vue'
import MatrixFilePanel from './MatrixFilePanel.vue'
import MatrixExtensionsCard from './MatrixExtensionsCard.vue'
import MatrixRoomSettingsPanel from './MatrixRoomSettingsPanel.vue'
import MatrixPollHistoryPanel from './MatrixPollHistoryPanel.vue'

const rightPanelStore = useMatrixRightPanelStore()
const { t } = useI18n()

const phase = computed(() => rightPanelStore.rightPanelPhase)
const canGoBack = computed(() => rightPanelStore.rightPanelPhase !== null)

// ThreadPanel / ThreadView / PinnedMessages 自带 header(含 back/close),跳过通用 header
const hasOwnHeader = computed(
  () =>
    phase.value === 'ThreadPanel' ||
    phase.value === 'ThreadView' ||
    phase.value === 'PinnedMessages',
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
    case 'FilePanel':
      return t('matrixChat.filesMenu')
    case 'Extensions':
      return t('matrixChat.extensionsMenu')
    case 'RoomSettings':
      return t('matrixChat.roomSettings')
    case 'PollHistory':
      return t('matrixChat.pollsMenu')
    default:
      return ''
  }
})
</script>

<template>
  <div v-if="phase" class="matrix-right-panel">
    <!-- Phases with own header: ThreadPanel / ThreadView / PinnedMessages -->
    <MatrixThreadPanel v-if="phase === 'ThreadPanel'" />
    <MatrixThreadView v-else-if="phase === 'ThreadView'" />
    <MatrixPinnedMessagesCard v-else-if="phase === 'PinnedMessages'" />

    <!-- Other phases: use generic header -->
    <template v-else>
      <div class="right-panel-header">
        <button v-if="canGoBack" class="back-btn" @click="rightPanelStore.rightPanelBack()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {{ t('matrixChat.cancel') }}
        </button>
        <span class="right-panel-title">{{ panelTitle }}</span>
        <button class="close-btn" @click="rightPanelStore.closeRightPanel()" :title="t('matrixChat.cancel')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="right-panel-content">
        <MatrixRoomSummaryCard v-if="phase === 'RoomSummary'" />
        <MatrixMemberList v-if="phase === 'MemberList'" />
        <MatrixMemberInfo v-if="phase === 'MemberInfo'" />
        <MatrixFilePanel v-if="phase === 'FilePanel'" />
        <MatrixExtensionsCard v-if="phase === 'Extensions'" />
        <MatrixRoomSettingsPanel v-if="phase === 'RoomSettings'" />
        <MatrixPollHistoryPanel v-if="phase === 'PollHistory'" />
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
  overflow: hidden;
}

.right-panel-header {
  height: 44px;
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
  display: flex;
  align-items: center;
  gap: 4px;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.04);
  }
}

.right-panel-title {
  flex: 1;
  font-size: 14px;
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
