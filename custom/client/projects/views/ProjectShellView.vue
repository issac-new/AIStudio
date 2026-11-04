<!-- overlay/custom/client/projects/views/ProjectShellView.vue
     项目工作台壳层包装（IaFeatureShell 先例，2026-10-18 统一壳裁定）：顶层
     fullscreen 路由装回 IaShell（IaGlobalTop + IaSideNav + ia2.scss token），
     避免独立页与工作台布局断裂；真实视图按 view prop 懒加载（chunk 不变）。 -->
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import IaShell from '../../ia2/views/IaShell.vue'

const props = defineProps<{ view: 'list' | 'detail' }>()

const VIEWS = {
  list: defineAsyncComponent(() => import('./ProjectsView.vue')),
  detail: defineAsyncComponent(() => import('./ProjectDetailView.vue')),
} as const
</script>

<template>
  <IaShell :feature-view="VIEWS[props.view]" />
</template>
