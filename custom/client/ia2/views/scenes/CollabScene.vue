<!-- overlay/custom/client/ia2/views/scenes/CollabScene.vue -->
<!-- 协作场景占位（2026-09-18 统一导航 Task 1 纯路由层落地）：
     cockpit 三栏迁入由后续任务实装；本占位仅保证路由树可加载——
     必须有 <router-view /> 承载 chat/history/global-agent 子路由。 -->
<script setup lang="ts">
</script>

<template>
  <section class="collab-scene" data-testid="scene-collab">
    <router-view />
  </section>
</template>

<style scoped>
.collab-scene { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
</style>
