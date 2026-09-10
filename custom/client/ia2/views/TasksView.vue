<!-- overlay/custom/client/ia2/views/TasksView.vue -->
<!-- 工作项区：内嵌 SwarmKanbanView 既有看板（swarm-kanban 吸收进 /app/tasks）。 -->
<script setup lang="ts">
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
</script>

<template>
  <div class="ia-area">
    <SwarmKanbanView />
  </div>
</template>
