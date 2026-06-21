<script setup lang="ts">
// MatrixMessageList is now a compatibility alias for MatrixTimelinePanel.
// All timeline logic has been moved to MatrixTimelinePanel (S4).
// Import and use MatrixTimelinePanel directly for new code.
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
</script>

<template>
  <MatrixTimelinePanel />
</template>
