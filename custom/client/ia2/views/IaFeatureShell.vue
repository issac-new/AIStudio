<!-- overlay/custom/client/ia2/views/IaFeatureShell.vue
     专题工作台统一壳（2026-10-18 用户裁定）：流程架构/本体/评测/技能治理此前是
     独立 fullscreen 路由，没有左侧栏和顶部栏，与「沟通协作」布局断裂。本壳把
     专题视图装进 IaShell（IaGlobalTop + IaSideNav + 同一内容区），四个模块的
     路由只需传 feature，不再各自维护布局。 -->
<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue'
import IaShell from './IaShell.vue'

const props = defineProps<{ feature: 'bpa' | 'ontology' | 'eval' | 'skillgov' }>()

const VIEWS: Record<string, Component> = {
  bpa: defineAsyncComponent(() => import('@/custom/bpa/views/BpaView.vue')),
  ontology: defineAsyncComponent(() => import('@/custom/ontology/views/OntologyView.vue')),
  eval: defineAsyncComponent(() => import('@/custom/eval/views/EvalView.vue')),
  skillgov: defineAsyncComponent(() => import('@/custom/skillgov/views/SkillgovView.vue')),
}

const view = computed(() => VIEWS[props.feature])
</script>

<template>
  <IaShell :feature-view="view" />
</template>
