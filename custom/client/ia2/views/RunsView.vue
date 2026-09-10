<!-- overlay/custom/client/ia2/views/RunsView.vue -->
<!-- 运行区：wrapper 内嵌 runcenter RunCenterView 既有内容（不复制逻辑）。
     运行详情走兄弟路由 ia2.runDetail → RunDetailView。 -->
<script setup lang="ts">
import RunCenterView from '@/custom/loop/runcenter/views/RunCenterView.vue'
</script>

<template>
  <div class="ia-area">
    <RunCenterView />
  </div>
</template>
