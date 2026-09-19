<!-- overlay/custom/client/ia2/components/IaGlobalTop.vue -->
<!-- v12.1 全局顶区（2026-09-19 壳层重排，用户裁定）：页头 + 注意力条 + 右上角
     视图切换器——在驾驶舱双视图（沟通协作 /app + IDE 工作台 /ide）常驻。
     数据武装经 useSharedArm 引用计数（双壳共享单份流/调度器）；注意力条与
     右栏「等我」同源（buildWaiting 单一聚合）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { buildWaiting } from '../adapters/waiting'
import type { WaitItem } from '../adapters/waiting'
import type { AttentionRow } from '../adapters/overview'
import { useSharedArm } from '../composables/useSharedArm'
import IaShellHeader from './IaShellHeader.vue'
import AttentionStrip from './AttentionStrip.vue'
import IaViewSwitcher from './IaViewSwitcher.vue'

const router = useRouter()
useSharedArm()

const workspace = useWorkspaceStore()
const runsStore = useRunCenterStore()
const cockpit = useCockpitStore()

const emit = defineEmits<{ (e: 'notify'): void }>()

const waitItems = computed<WaitItem[]>(() => buildWaiting(
  workspace.tasks.map(x => ({ id: x.id, title: x.title, status: x.status, assignee: x.assignee, createdAt: x.createdAt })),
  runsStore.runs ?? [],
  cockpit.fleetSessions ?? [],
  Date.now(),
))

const attentionRows = computed<AttentionRow[]>(() =>
  waitItems.value.map(w => ({
    id: w.id,
    taskId: w.taskId ?? '',
    title: w.title,
    status: w.kind === 'task-review' ? 'review' : 'triage',
    severity: w.kind === 'task-review' ? 'medium' : 'low',
    priority: 1,
    createdAt: w.ts,
  })))

/** 动线④：注意力条 → 等我对象（任务→看板预选；运行→运行详情；fleet→工作台） */
function onAttentionSelect(row: AttentionRow): void {
  const hit = waitItems.value.find(w => w.id === row.id)
  if (hit?.taskId) void router.push({ name: 'ia2.board', query: { task: hit.taskId } })
  else if (hit?.runId) void router.push({ name: 'ia2.runDetail', params: { runId: hit.runId } })
  else void router.push({ path: '/app' })
}
</script>

<template>
  <div class="ia-gtop" data-testid="ia-global-top">
    <IaShellHeader
      :notify-count="cockpit.inboxCount"
      :user-name="cockpit.currentUserName"
      @notify="emit('notify')"
    />
    <AttentionStrip
      v-if="attentionRows.length > 0"
      :items="attentionRows"
      @select="onAttentionSelect"
    />
    <IaViewSwitcher />
  </div>
</template>
