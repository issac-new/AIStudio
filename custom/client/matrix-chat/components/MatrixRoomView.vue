<script setup lang="ts">
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
import MatrixMessageInput from './MatrixMessageInput.vue'
</script>

<template>
  <div class="matrix-room-view">
    <MatrixTimelinePanel />
    <MatrixMessageInput />
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
