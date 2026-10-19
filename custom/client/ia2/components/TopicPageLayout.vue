<!-- overlay/custom/client/ia2/components/TopicPageLayout.vue
     专题页统一壳（2026-10-19 P2-7）：流程架构/本体/评测/技能治理四页此前各自
     实现「页头 + 页签 + 内容」三段，筛选器散落在各页顶部，重页签（技能治理
     约 6.4 万字符）首屏被工具条与长表挤满。本壳统一结构：
       页头（各页自持）→ 单层页签 → [左栏筛选] + 内容 → 详情抽屉。
     左栏按需开启（rail 属性+ filters 槽）；无集合筛选需求的页单列显示。
     本壳不改各页数据契约与页签语义，只统一骨架与交互语法。 -->
<script setup lang="ts">
withDefaults(defineProps<{ rail?: boolean }>(), { rail: false })
</script>

<template>
  <div class="tp" :class="{ 'tp--rail': rail }" data-testid="topic-page-layout">
    <nav v-if="$slots.tabs" class="tp__tabs"><slot name="tabs" /></nav>
    <div class="tp__body">
      <aside v-if="rail" class="tp__rail" data-testid="topic-page-rail"><slot name="filters" /></aside>
      <div class="tp__main"><slot /></div>
    </div>
    <slot name="drawer" />
  </div>
</template>

<style scoped lang="scss">
.tp {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.tp__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  align-items: start;
}
.tp--rail .tp__body {
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
}
.tp__rail {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  position: sticky;
  top: 8px;
}
.tp__main {
  min-width: 0;
}
/* 窄屏收敛为单列，避免左栏把表格压成横向滚动 */
@media (max-width: 1100px) {
  .tp--rail .tp__body {
    grid-template-columns: minmax(0, 1fr);
  }
  .tp__rail {
    position: static;
  }
}
</style>
