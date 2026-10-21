<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 工作台统一壳（2026-09-19 v12.1 壳层重排）：全局顶区 IaGlobalTop（D18 后 =
     注意力条 + 页头，注意力条置顶）+ router-view。数据面武装走 useSharedArm 引用计数（与 IDE 壳
     共享单份流/调度器）；壳私有逻辑保留：Esc（管理台收起）、standalone 补标、
     merge-back 监听（IDE 窗口不得响应）。全局弹窗：日程/RunTrace/管理台。
     v12.3（2026-09-20 用户裁定）：通知居中模态 CockpitNotifyModal 退役
     （改页头下拉双页签）；窗控改三栏栏控后页级 max=1 最大化与最小化任务栏
     （IaMinimizedDock + wm store）链路一并退役——最大化=栏控中栏最大化，
     独立窗口走 ⧉ 栏控（standalone=1 精简壳 IaPopoutBar）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useSharedArm } from '../composables/useSharedArm'
import { useWorkspaceStore } from '../store/workspace'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import IaGlobalTop from '../components/IaGlobalTop.vue'
import IaSideNav from '../components/IaSideNav.vue'
import IaPopoutBar from '../components/IaPopoutBar.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
import { retainBodyClass } from '../composables/useBodyClass'
import { listenMergeBack } from '../wm/popout'
import '@/custom/ia2/styles/ia2.scss'

/** 专题页复用同一壳：传入 featureView 时内容区渲染它，否则走 /app router-view */
defineProps<{ featureView?: Component }>()

const route = useRoute()
const router = useRouter()
const store = useIaStore()
const workspace = useWorkspaceStore()
const cockpit = useCockpitStore()

useSharedArm()

let mergeBackOff: (() => void) | null = null
let releaseBodyClass: (() => void) | null = null

/** 独立窗口态（query standalone=1）：本窗口内导航后保持标记不丢 */
const isStandalone = computed(() => route.query.standalone === '1')
let standaloneActive = isStandalone.value

watch(() => route.path, path => store.syncFromPath(path), { immediate: true })
watch(() => route.query.standalone, value => {
  if (value === '1') standaloneActive = true
})
// standalone 窗口内跳转（如运行详情）不带 query 传播——补回标记，防退化为全壳
watch(() => route.fullPath, () => {
  if (standaloneActive && route.query.standalone !== '1') {
    void router.replace({ query: { ...route.query, standalone: '1' } })
  }
})

onMounted(() => {
  // 工作台全程隐藏上游 StudioNavigationRail（否则与新 IaSideNav 双左栏）。
  // 引用计数：Workbench/SimCenter 等页内 retain 不互相摘除。
  releaseBodyClass = retainBodyClass('ia-center-full')
  // 独立窗口「合并回工作台」：storage 事件跨窗口广播，仅主壳导航。
  // standalone 面板窗不得响应——否则别的面板合并回时本面板被导航劫持串台
  mergeBackOff = listenMergeBack(path => {
    if (!standaloneActive) void router.push(path)
  })
})
onUnmounted(() => {
  mergeBackOff?.()
  mergeBackOff = null
  releaseBodyClass?.()
  releaseBodyClass = null
})
</script>

<template>
  <div class="ia-shell">
    <IaPopoutBar v-if="isStandalone" />
    <IaGlobalTop v-else />
    <div class="ia-shell__main">
      <!-- 2026-10-18 左侧栏批：六阶段与常用入口常驻左侧；standalone 单面板窗不挂 -->
      <IaSideNav v-if="!isStandalone" />
      <div class="ia-shell__content">
        <div v-if="featureView" class="ia-shell__feature">
          <component :is="featureView" />
        </div>
        <router-view v-else v-slot="{ Component }">
          <!-- W2 加载反馈（2026-10-20 验收挂账清零轮）：重组件页签 chunk 加载期给文字反馈，
               不再留白（冷启动首帧另有 index.html boot-fallback 覆盖） -->
          <Suspense timeout="0">
            <component :is="Component" />
            <template #fallback>
              <div class="ia-shell__loading" role="status">页面加载中…</div>
            </template>
          </Suspense>
        </router-view>
      </div>
    </div>

    <!-- 日程弹窗（2026-10-01 用户裁定还原 S7 摘除；组件与 workspace store 能力原样） -->
    <div v-if="workspace.scheduleOpen" class="ia-overlay" @click="workspace.closeSchedule()" />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
    <div v-if="cockpit.runTraceOpen" class="ia-overlay" @click="cockpit.closeRunTrace()" />
    <!-- v12 性能收敛：仅打开时挂载。曾无条件挂载，其内部 watch(needsSessionSelect,
         immediate) 会在冷启动即跨全 profile 扫会话（数十请求），即使弹窗从未打开。 -->
    <CockpitRunTraceModal v-if="cockpit.runTraceOpen" />
  </div>
</template>

<style scoped>
.ia-shell__loading {
  padding: 64px 24px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
</style>
