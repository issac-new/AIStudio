<!-- overlay/custom/client/ia2/views/scenes/EngScene.vue -->
<!-- 工程场景（2026-09-18 统一导航 Task 4 实装）：二级 tab 枢纽——
     tab1 编排 = OrchestrateView 整体内嵌（组件自带头部与列表⇄编辑器模式态，
     路由耦合已在视图内收敛为 ia2.runDetail / ia2.ops 深链）；
     tab2 Teams 管理 = TeamsManagePanel 异步组件（同旧管理场景做法，
     matrix-teams 依赖面与编排页隔离，不渲染不评估模块）。
     tab 条样式与运行场景 OpsScene 同款类名（.ia-tabs__btn，各自 scoped 复制）。 -->
<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import OrchestrateView from '../OrchestrateView.vue'

const TeamsManagePanel = defineAsyncComponent(() =>
  import('@/custom/matrix-teams/views/TeamsManagePanel.vue'))

const { t } = useI18n()

type EngTab = 'orchestrate' | 'teams'
const ENG_TABS: Array<{ key: EngTab; label: string }> = [
  { key: 'orchestrate', label: t('ia2.nav.orchestrate') },
  { key: 'teams', label: t('loopScenes.manage.tabTeams') },
]
const activeTab = ref<EngTab>('orchestrate')
</script>

<template>
  <section class="escene" data-testid="scene-eng">
    <div class="ia-tabs" data-testid="eng-tabs">
      <button
        v-for="tab in ENG_TABS"
        :key="tab.key"
        type="button"
        class="ia-tabs__btn"
        :class="{ 'ia-tabs__btn--on': activeTab === tab.key }"
        :data-testid="`eng-tab-${tab.key}`"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <OrchestrateView v-if="activeTab === 'orchestrate'" class="escene__pane" />
    <TeamsManagePanel v-else class="escene__pane" />
  </section>
</template>

<style scoped>
.escene { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.escene__pane { flex: 1 1 auto; min-height: 0; }
/* 场景二级 tab 条（与 OpsScene 同款类名，样式各自 scoped 复制——模式承旧管理场景 .mscene__tabs） */
.ia-tabs { flex: 0 0 auto; display: flex; gap: 6px; padding: 10px 12px 0; }
.ia-tabs__btn {
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  border-radius: var(--radius-standard); padding: 3px 14px; cursor: pointer;
  font-size: 12px; font-family: inherit;
}
.ia-tabs__btn--on { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); font-weight: 600; }
</style>
