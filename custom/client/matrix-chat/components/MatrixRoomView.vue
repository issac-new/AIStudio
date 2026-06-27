<script setup lang="ts">
import { computed } from 'vue'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
import MatrixMessageInput from './MatrixMessageInput.vue'
import MatrixRoomSearchView from './MatrixRoomSearchView.vue'

const roomStore = useMatrixRoomStore()

const isSearching = computed(() => roomStore.isSearching)
</script>

<template>
  <div class="matrix-room-view">
    <!-- Search mode: replace timeline with search results (element-web TimelineRenderingType.Search) -->
    <MatrixRoomSearchView v-if="isSearching" />
    <!-- Normal mode: timeline + composer -->
    <template v-else>
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
}
</style>
