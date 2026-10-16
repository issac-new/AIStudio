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
import { VIEW_LOADERS, warmAllLegacyViews } from './legacy-view-loaders'
import IaGlobalTop from '../components/IaGlobalTop.vue'
import IaSettingsSidebar from '../components/IaSettingsSidebar.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import { useWorkspaceStore } from '../store/workspace'


const route = useRoute()
// 页头日程按钮（IaGlobalTop）指向 workspace store——本壳是第三壳，必须像 IaShell/IdeShell
// 一样挂弹窗，否则收编页点 📅 只置 store 状态、无任何 UI 出现（24h 审查 P2）
const workspace = useWorkspaceStore()

// 走查三修：空闲预热全表——后台把设置页分片逐个拉热（错峰 200ms）
warmAllLegacyViews()

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
    <!-- 日程弹窗（与 IaShell.vue:83-84 同款；遮罩 z-index 低于弹窗） -->
    <div v-if="workspace.scheduleOpen" class="ia-overlay" @click="workspace.closeSchedule()" />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
  </div>
</template>

<style scoped lang="scss">
/* 与 IaShell 同构：全高列，IaGlobalTop 在顶（页头+注意力条全宽），主区
 * [侧栏 | 内容]。上游视图根节点多为固定 100vh 高度，经内容列 flex 收缩
 * （与壳内其他上游视图同款语义），页面自持滚动。 */
/* overflow:clip 防编程性滚动上探（同 ia2.scss .ia-shell 2026-10-03 回归实锤）。 */
.ia-lshell { height: calc(100 * var(--vh, 1vh)); display: flex; flex-direction: column; overflow: clip; background: var(--bg-primary); color: var(--text-primary); }
.ia-lshell__main { flex: 1; min-height: 0; display: flex; }
.ia-lshell__content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
</style>
