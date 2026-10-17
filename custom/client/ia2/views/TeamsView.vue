<!-- overlay/custom/client/ia2/views/TeamsView.vue -->
<!-- D18 团队管理工作页（2026-10-17 设计正本 §5.3）：TeamsManagePanel 薄壳挂载。
     原唯一挂载点 EngScene 被 /app/eng 重定向架空后，领导邀请、值守分派、派发列表
     整块不可达；本路由让它重新可达。零新端点——面板全走 Matrix 注册房与看板 API，
     PL0 自写、PL50 领导层，管理区按 isLeader 门控，非领导只见自声明区与账号树。 -->
<script setup lang="ts">
import IaBreadcrumb from '../components/IaBreadcrumb.vue'
import TabIntroBanner from '../components/TabIntroBanner.vue'
import { defineAsyncComponent } from 'vue'

// 异步隔离同 EngScene 手法：matrix-teams 依赖面不渲染不评估，按需加载
const TeamsManagePanel = defineAsyncComponent(() =>
  import('@/custom/matrix-teams/views/TeamsManagePanel.vue'))
</script>

<template>
  <section class="teams-view" data-testid="teams-page">
  <IaBreadcrumb />
  <TabIntroBanner tab="teams" />
    <TeamsManagePanel />
  </section>
</template>

<style scoped>
.teams-view { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
</style>
