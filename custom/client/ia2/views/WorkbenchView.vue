<!-- overlay/custom/client/ia2/views/WorkbenchView.vue -->
<!-- v12 沟通协作工作台（2026-09-19 统一视图重构）：三栏唯一职责——
     左=工作流导航（会话∪循环统一列表）；中=对象工作区（会话→对话画布；
     循环→运行画布[实时|历史]）；右=任务与决策（等我队列+挂接任务+动态）恒驻。
     选择态经路由子路径承载（s/chat/:sessionId | s/room/:roomId | l/:loopId），
     '' 无选择时自动选首个会话（不写 URL）。Task 2 为占位骨架，Task 4 起填充。 -->
<script setup lang="ts">
</script>

<template>
  <div class="wb" data-testid="wb-root">
    <aside class="wb__left" data-testid="wb-left" />
    <section class="wb__center" data-testid="wb-center" />
    <aside class="wb__right" data-testid="wb-right" />
  </div>
</template>

<style scoped lang="scss">
/* v12 三栏铁律：250 | 自适应(≥320) | 240，永不换列不堆叠（窄屏由外层整体缩放） */
.wb {
  display: grid;
  grid-template-columns: 250px minmax(320px, 1fr) 240px;
  gap: 10px;
  height: 100%;
  min-width: 0;
}
</style>
