<!-- overlay/custom/client/ia2/views/IaLegacyShell.vue -->
<!-- 收编页统一壳（2026-09-30 用户裁定：「左边栏功能点开后右边又出现一个边栏」
     根治）——设置页与原 hermes-studio 各功能页（模型/技能/插件/...）统一进
     驾驶舱壳：IaGlobalTop（页头+注意力条，全宽）+ IaSettingsSidebar（注意力
     条下方，功能面=原三侧栏并集）+ 右侧内容区渲染被收编的上游视图。
     替换上游同名路由（registerRoute → addRoute 同名先删旧记录，路径不变、
     上游按名跳零改动），meta.fullscreen=true 使 App.vue 不再挂 AppSidebar/
     HermesConfigSidebar——双栏根治，点开侧栏条目只有内容区变化。
     页面组件按路由名懒加载（VIEW_LOADERS 单一映射表）；hermes.browser
     不收编（上游桌面桥运行时条件注册，保持桌面专属语义与 hasRoute 门控）。 -->
<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { defineAsyncComponent, markRaw, type Component } from 'vue'
import IaGlobalTop from '../components/IaGlobalTop.vue'
import IaSettingsSidebar from '../components/IaSettingsSidebar.vue'

/** 收编页视图装载表（路由名 → 懒加载工厂；与 routes.ts 收编记录一一对应） */
const VIEW_LOADERS: Record<string, () => Promise<unknown>> = {
  'hermes.settings': () => import('@/views/hermes/SettingsView.vue'),
  // ChatView 族（页面内自持会话列/页签；路径不变 → ChatView 按 path 分派行为不变）
  'hermes.chat': () => import('@/views/hermes/ChatView.vue'),
  'hermes.session': () => import('@/views/hermes/ChatView.vue'),
  'hermes.globalAgent': () => import('@/views/hermes/ChatView.vue'),
  'hermes.globalAgentSession': () => import('@/views/hermes/ChatView.vue'),
  'hermes.models': () => import('@/views/hermes/ChatView.vue'),
  'hermes.connections': () => import('@/views/hermes/ChatView.vue'),
  'hermes.agentManager': () => import('@/views/hermes/ChatView.vue'),
  'hermes.groupChat': () => import('@/views/hermes/GroupChatView.vue'),
  'hermes.groupChatRoom': () => import('@/views/hermes/GroupChatView.vue'),
  // 工具/配置/系统页（上游独立视图）
  'hermes.workflow': () => import('@/views/hermes/WorkflowView.vue'),
  'hermes.files': () => import('@/views/hermes/FilesView.vue'),
  'hermes.skills': () => import('@/views/hermes/SkillsView.vue'),
  'hermes.plugins': () => import('@/views/hermes/PluginsView.vue'),
  'hermes.mcp': () => import('@/views/hermes/McpManagerView.vue'),
  'hermes.memory': () => import('@/views/hermes/MemoryView.vue'),
  'hermes.channels': () => import('@/views/hermes/ChannelsView.vue'),
  'hermes.jobs': () => import('@/views/hermes/JobsView.vue'),
  'hermes.kanban': () => import('@/views/hermes/KanbanView.vue'),
  'hermes.journey': () => import('@/views/hermes/JourneyView.vue'),
  'hermes.logs': () => import('@/views/hermes/LogsView.vue'),
  'hermes.usage': () => import('@/views/hermes/UsageView.vue'),
  'hermes.performance': () => import('@/views/hermes/PerformanceView.vue'),
  'hermes.profiles': () => import('@/views/hermes/ProfilesView.vue'),
  'hermes.theme': () => import('@/views/hermes/ThemeView.vue'),
  'hermes.petdex': () => import('@/views/hermes/PetdexView.vue'),
  'hermes.skillsUsage': () => import('@/views/hermes/SkillsUsageView.vue'),
  'hermes.configSettings': () => import('@/views/hermes/HermesSettingsView.vue'),
  'hermes.versionPreview': () => import('@/views/hermes/VersionPreviewView.vue'),
}

const route = useRoute()

const pageComp = shallowRef<Component | null>(null)

watch(() => route.name, name => {
  const loader = VIEW_LOADERS[String(name ?? '')]
  pageComp.value = loader ? markRaw(defineAsyncComponent(loader)) : null
}, { immediate: true })

const pageKey = computed(() => String(route.name ?? ''))
</script>

<template>
  <div class="ia-lshell" :data-page="pageKey">
    <IaGlobalTop />
    <div class="ia-lshell__main">
      <IaSettingsSidebar />
      <div class="ia-lshell__content" data-testid="ia-legacy-content">
        <component :is="pageComp" v-if="pageComp" :key="pageKey" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 与 IaShell 同构：全高列，IaGlobalTop 在顶（页头+注意力条全宽），主区
 * [侧栏 | 内容]。上游视图根节点多为固定 100vh 高度，经内容列 flex 收缩
 * （与壳内其他上游视图同款语义），页面自持滚动。 */
.ia-lshell { height: calc(100 * var(--vh, 1vh)); display: flex; flex-direction: column; overflow: hidden; background: var(--bg-primary); color: var(--text-primary); }
.ia-lshell__main { flex: 1; min-height: 0; display: flex; }
.ia-lshell__content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
</style>
