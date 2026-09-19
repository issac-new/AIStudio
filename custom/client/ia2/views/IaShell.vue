<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 驾驶舱统一壳（2026-09-19 v12.1 壳层重排）：全局顶区 IaGlobalTop（页头 +
     注意力条 + 右上角视图切换器，用户裁定双视图常驻）+ router-view。
     数据面武装走 useSharedArm 引用计数（与 IDE 壳共享单份流/调度器）；
     壳私有逻辑保留：Esc（管理台优先/退出最大化）、standalone 补标、
     merge-back 监听（IDE 窗口不得响应）。全局弹窗：通知/日程/RunTrace/管理台。
     窗口管理（/goal 追加）：standalone=1 → 精简独立窗口壳（IaPopoutBar）；
     max=1 → 最大化（隐藏壳页，浮动还原胶囊 + Esc 退出）；最小化面板收 dock。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useFlowStore } from '@/custom/ia2/store/flow'
import { useWorkspaceStore } from '../store/workspace'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import IaGlobalTop from '../components/IaGlobalTop.vue'
import IaPopoutBar from '../components/IaPopoutBar.vue'
import IaMinimizedDock from '../components/IaMinimizedDock.vue'
import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
import GovOverlay from '../components/gov/GovOverlay.vue'
import { useSharedArm } from '../composables/useSharedArm'
import { listenMergeBack } from '../wm/popout'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const store = useIaStore()
const flow = useFlowStore()
const workspace = useWorkspaceStore()
const cockpit = useCockpitStore()

useSharedArm()

let mergeBackOff: (() => void) | null = null

/** 独立窗口态（query standalone=1）：本窗口内导航后保持标记不丢 */
const isStandalone = computed(() => route.query.standalone === '1')
let standaloneActive = isStandalone.value
/** 最大化态（query max=1）：壳顶区隐藏，主区满幅 */
const isMaximized = computed(() => route.query.max === '1')

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

function exitMaximize(): void {
  const query = { ...route.query }
  delete query.max
  void router.replace({ query })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 管理台覆盖层优先吃 Esc（v12：⚙ 是全局覆盖层，Esc 即收）
    if (flow.govOpen) { flow.closeGov(); return }
    if (route.query.max === '1') exitMaximize()
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
    <IaGlobalTop v-else-if="!isMaximized" @notify="cockpit.openNotify()" />
    <div class="ia-shell__main">
      <router-view />
    </div>
    <button v-if="isMaximized" type="button" class="ia-shell__restore"
      data-testid="ia-wm-restore-pill" :title="t('ia2.wm.restore')" @click="exitMaximize"
    >⤡ {{ t('ia2.wm.restore') }}</button>
    <IaMinimizedDock v-if="!isStandalone" />

    <div v-if="cockpit.notifyOpen" class="ia-overlay" @click="cockpit.closeNotify()" />
    <CockpitNotifyModal v-if="cockpit.notifyOpen" />
    <div v-if="workspace.scheduleOpen" class="ia-overlay" @click="workspace.closeSchedule()" />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
    <div v-if="cockpit.runTraceOpen" class="ia-overlay" @click="cockpit.closeRunTrace()" />
    <CockpitRunTraceModal />
    <!-- v12 ⚙管理台：全局覆盖层（Esc/⇠返回/backdrop 关闭） -->
    <GovOverlay v-if="flow.govOpen" />
  </div>
</template>

<style scoped lang="scss">
.ia-shell__restore {
  position: fixed; top: 10px; right: 14px; z-index: 40;
  height: 28px; padding: 0 12px; display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--border-color); border-radius: 14px;
  background: var(--bg-card); color: var(--text-secondary);
  cursor: pointer; font-size: 12px; font-family: inherit;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  opacity: 0.55; transition: opacity 0.15s ease;
  &:hover { opacity: 1; color: var(--text-primary); }
}
</style>
