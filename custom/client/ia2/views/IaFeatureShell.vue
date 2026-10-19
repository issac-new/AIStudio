<!-- overlay/custom/client/ia2/views/IaFeatureShell.vue
     专题工作台统一壳（2026-10-18 用户裁定）：流程架构/本体/评测/技能治理此前是
     独立 fullscreen 路由，没有左侧栏和顶部栏，与「沟通协作」布局断裂。本壳把
     专题视图装进 IaShell（IaGlobalTop + IaSideNav + 同一内容区），四个模块的
     路由只需传 feature，不再各自维护布局。
     2026-10-19 P1-5：feature 开关关闭时渲染说明页（FeatureDisabledView），
     不把深链静默送走；路由注册本身与开关解耦（见 registries/client/bootstrap.ts）。 -->
<script setup lang="ts">
import { computed, defineAsyncComponent, h, type Component } from 'vue'
import IaShell from './IaShell.vue'
import FeatureDisabledView from './FeatureDisabledView.vue'
import { features } from '../../../../config/features'

type FeatureKey = 'bpa' | 'ontology' | 'eval' | 'skillgov'
const props = defineProps<{ feature: FeatureKey }>()

const VIEWS: Record<FeatureKey, Component> = {
  bpa: defineAsyncComponent(() => import('@/custom/bpa/views/BpaView.vue')),
  ontology: defineAsyncComponent(() => import('@/custom/ontology/views/OntologyView.vue')),
  eval: defineAsyncComponent(() => import('@/custom/eval/views/EvalView.vue')),
  skillgov: defineAsyncComponent(() => import('@/custom/skillgov/views/SkillgovView.vue')),
}
const ENABLED: Record<FeatureKey, boolean> = {
  bpa: features.bpa,
  ontology: features.ontology,
  eval: features.eval,
  skillgov: features.skillgov,
}

const disabled = computed(() => !ENABLED[props.feature])
const view = computed<Component>(() => (disabled.value
  ? h(FeatureDisabledView, { feature: props.feature })
  : VIEWS[props.feature]))
</script>

<template>
  <IaShell :feature-view="view" />
</template>
