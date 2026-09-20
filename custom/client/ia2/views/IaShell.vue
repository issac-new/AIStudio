<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 驾驶舱统一壳（2026-09-19 v12.1 壳层重排）：全局顶区 IaGlobalTop（页头 +
     注意力条）+ router-view。数据面武装走 useSharedArm 引用计数（与 IDE 壳
     共享单份流/调度器）；壳私有逻辑保留：Esc（管理台收起）、standalone 补标、
     merge-back 监听（IDE 窗口不得响应）。全局弹窗：日程/RunTrace/管理台。
     v12.3（2026-09-20 用户裁定）：通知居中模态 CockpitNotifyModal 退役
     （改页头下拉双页签）；窗控改三栏栏控后页级 max=1 最大化与最小化任务栏
     （IaMinimizedDock + wm store）链路一并退役——最大化=栏控中栏最大化，
     独立窗口走 ⧉ 栏控（standalone=1 精简壳 IaPopoutBar）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useFlowStore } from '@/custom/ia2/store/flow'
import { useWorkspaceStore } from '../store/workspace'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import IaGlobalTop from '../components/IaGlobalTop.vue'
import IaPopoutBar from '../components/IaPopoutBar.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
import GovOverlay from '../components/gov/GovOverlay.vue'
import { useSharedArm } from '../composables/useSharedArm'
import { listenMergeBack } from '../wm/popout'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const router = useRouter()
const store = useIaStore()
const flow = useFlowStore()
const workspace = useWorkspaceStore()
const cockpit = useCockpitStore()

useSharedArm()

let mergeBackOff: (() => void) | null = null

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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 管理台覆盖层优先吃 Esc（v12：⚙ 是全局覆盖层，Esc 即收）
    if (flow.govOpen) flow.closeGov()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // 独立窗口「合并回驾驶舱」：storage 事件跨窗口广播，仅主壳导航。
  // standalone 面板窗不得响应——否则别的面板合并回时本面板被导航劫持串台
  mergeBackOff = listenMergeBack(path => {
    if (!standaloneActive) void router.push(path)
  })
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  mergeBackOff?.()
  mergeBackOff = null
})
</script>

<template>
  <div class="ia-shell">
    <IaPopoutBar v-if="isStandalone" />
    <IaGlobalTop v-else />
    <div class="ia-shell__main">
      <router-view />
    </div>

    <div v-if="workspace.scheduleOpen" class="ia-overlay" @click="workspace.closeSchedule()" />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
    <div v-if="cockpit.runTraceOpen" class="ia-overlay" @click="cockpit.closeRunTrace()" />
    <CockpitRunTraceModal />
    <!-- v12 ⚙管理台：全局覆盖层（Esc/⇠返回/backdrop 关闭） -->
    <GovOverlay v-if="flow.govOpen" />
  </div>
</template>
