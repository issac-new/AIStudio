<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
import MatrixMessageInput from './MatrixMessageInput.vue'
import MatrixRoomSearchView from './MatrixRoomSearchView.vue'
import MatrixTopUnreadBar from './MatrixTopUnreadBar.vue'

const roomStore = useMatrixRoomStore()

const isSearching = computed(() => roomStore.isSearching)

// 跳未读条「回到底部」：滚动时间线容器贴底（贴底后由 TimelinePanel 的
// sticky-bottom 逻辑接管已读回执）
const viewRef = ref<HTMLElement | null>(null)

function jumpToBottom() {
  const el = viewRef.value?.querySelector('.matrix-timeline-panel')
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}
</script>

<template>
  <div ref="viewRef" class="matrix-room-view">
    <!-- Search mode: replace timeline with search results (element-web TimelineRenderingType.Search) -->
    <MatrixRoomSearchView v-if="isSearching" />
    <!-- Normal mode: timeline + composer -->
    <template v-else>
      <MatrixTopUnreadBar @jump-bottom="jumpToBottom" />
      <MatrixTimelinePanel />
      <MatrixMessageInput />
    </template>
  </div>
</template>

<style scoped lang="scss">
.matrix-room-view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative; /* 跳未读条（TopUnreadBar）绝对定位锚 */
}
</style>
