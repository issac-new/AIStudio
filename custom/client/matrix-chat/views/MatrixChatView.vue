<script setup lang="ts">
import MatrixChatPanel from '@/custom/matrix-chat/components/MatrixChatPanel.vue'
</script>

<template>
  <div class="matrix-chat-view">
    <MatrixChatPanel />
  </div>
</template>

<style scoped lang="scss">
.matrix-chat-view {
  height: calc(100 * var(--vh));
  display: flex;
  flex-direction: column;
}
</style>
