<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 驾驶舱统一壳（2026-09-18 统一导航重构）：全局页头 IaShellHeader + 六场景条 + router-view。
     共享武装（workspace 聚合/runs/loops）自 LoopCockpitView 上移；cockpit store 在此
     bootstrap（页头通知/搜索依赖），卸载 disconnect。全局弹窗：通知/日程/RunTrace。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { IA_AREAS } from '@/custom/ia2/routes'
import IaShellHeader from '../components/IaShellHeader.vue'
import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const { t } = useI18n()
const store = useIaStore()
const workspace = useWorkspaceStore()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const cockpit = useCockpitStore()

const SUBSCRIBE_CAP = 30
let shellDisposed = false

watch(() => route.path, path => store.syncFromPath(path), { immediate: true })

onMounted(() => {
  workspace.loadTodos()
  workspace.startReminderScheduler()
  workspace.watchKanbanTasks()
  workspace.initFleetStream()
  void workspace.refreshAllBoards()
  void bootShared()
  void cockpit.bootstrap()
})
onUnmounted(() => {
  shellDisposed = true
  workspace.unwatchKanbanTasks()
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
  cockpit.disconnectOnUnmount()
})

async function bootShared(): Promise<void> {
  await runsStore.fetchRuns()
  if (shellDisposed) return
  const awaiting = runsStore.awaitingRuns.map(r => r.runId)
  const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
  runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
}

const activeArea = computed(() => store.currentArea)
</script>

<template>
  <div class="ia-shell">
    <IaShellHeader
      :notify-count="cockpit.inboxCount"
      :user-name="cockpit.currentUserName"
      @notify="cockpit.openNotify()"
    />
    <nav class="ia-scenes" data-testid="ia-scenes">
      <router-link
        v-for="area in IA_AREAS"
        :key="area.key"
        :to="{ name: area.name }"
        class="ia-scenes__btn"
        :class="{ 'ia-scenes__btn--on': activeArea === area.key }"
        :data-testid="`ia-scene-${area.key}`"
      >{{ t(area.labelKey) }}</router-link>
    </nav>
    <div class="ia-shell__main">
      <router-view />
    </div>

    <div v-if="cockpit.notifyOpen" class="ia-overlay" @click="cockpit.closeNotify()" />
    <CockpitNotifyModal v-if="cockpit.notifyOpen" />
    <div v-if="workspace.scheduleOpen" class="ia-overlay" @click="workspace.closeSchedule()" />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
    <div v-if="cockpit.runTraceOpen" class="ia-overlay" @click="cockpit.closeRunTrace()" />
    <CockpitRunTraceModal />
  </div>
</template>
