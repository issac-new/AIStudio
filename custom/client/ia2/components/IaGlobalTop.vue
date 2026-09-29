<!-- overlay/custom/client/ia2/components/IaGlobalTop.vue -->
<!-- v12.3 全局顶区（2026-09-20 用户裁定）：页头 + 注意力条。页头四改见
     IaShellHeader 头注；通知下拉自持于页头（原 @notify 上升链路退役）。
     注意力条（R2 改管理入口）：blocked 梯队收编——blocked 任务 + blocked 循环
     + 等我（review 任务/中断运行/fleet）三梯队经 mergeAttention 统一排序；
     点击条目跳对象，尾部 ⚙管理常驻（空态不消失，条即管理入口）；
     计数随 useNowTick 30s 刷新（经 useSitCounts 共享时钟）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useWorkspaceStore } from '../store/workspace'
import { useSitCounts } from '../composables/useSitCounts'
import type { AttentionRow } from '../adapters/overview'
import { mergeAttention } from '../adapters/overview'
import { useSharedArm } from '../composables/useSharedArm'
import IaShellHeader from './IaShellHeader.vue'
import AttentionStrip from './AttentionStrip.vue'
import { useDeliveryCasesStore } from '@/custom/matrix-teams/stores/delivery-cases'

const router = useRouter()
const { t } = useI18n()
useSharedArm()

const cockpit = useCockpitStore()
const workspace = useWorkspaceStore()
const { waitItems, loopRows } = useSitCounts()
// P1（09-28）：交付网络读数卡（分布式设计 §7 总览三数：在途案例/待审人工门/已完成）
// ——数据来自 delivery-cases store（事件驱动实时投影）；有在途或待审才显示（零噪音）。
const delivery = useDeliveryCasesStore()
void delivery.refresh()
const deliveryReadings = computed(() => delivery.networkReadings)
const showDelivery = computed(() =>
  deliveryReadings.value.inFlight > 0 || deliveryReadings.value.pendingHumanGates > 0)

function openCases(): void {
  void router.push({ name: 'ia2.deliveryCases' })
}

/** 注意力梯队（mergeAttention 单一排序：blocked → review → triage）：
 *  blocked 任务（跨板聚合）+ blocked 循环 + 等我（review 任务/中断运行/fleet）。 */
const attentionRows = computed<AttentionRow[]>(() => {
  const inputs: Array<{ id: string; title: string; status: 'blocked' | 'review' | 'triage'; priority?: number; createdAt?: number }> = []
  for (const t of workspace.tasks) {
    if (t.status === 'blocked') {
      inputs.push({ id: t.id, title: t.title, status: 'blocked', createdAt: t.createdAt })
    }
  }
  for (const l of loopRows.value) {
    if (l.blocked) {
      inputs.push({ id: `loop:${l.id}`, title: l.name, status: 'blocked', priority: 2 })
    }
  }
  for (const w of waitItems.value) {
    inputs.push({ id: w.id, title: w.title, status: w.kind === 'task-review' ? 'review' : 'triage', priority: 1, createdAt: w.ts })
  }
  return mergeAttention(inputs)
})

/** 动线④：注意力条 → 对象（任务→看板预选；循环→运行中心；运行→运行详情；其余→工作台）。
 *  mergeAttention 会把行 id 改写为 att- 前缀（且仅保留源输入 id 于 taskId），
 *  选择时先剥前缀还原源 id，再对 waitItems（task:/run:/fleet: 前缀族）与
 *  blocked 循环（loop: 前缀）分派——直接拿行 id 对 waitItems 查找永远落空。 */
function onAttentionSelect(row: AttentionRow): void {
  const base = row.id.replace(/^att-/, '')
  if (base.startsWith('loop:')) {
    // M6（补遗⑤）：循环行落运行中心（/app/l 画布已退役并入运行详情；
    // loopId 语境的详情解析在 RunCenterView 内按 graphId 归并，此处落列表）
    void router.push({ name: 'ia2.runs' })
    return
  }
  const hit = waitItems.value.find(w => w.id === base)
  if (hit?.taskId) void router.push({ name: 'ia2.board', query: { task: hit.taskId } })
  else if (hit?.runId) void router.push({ name: 'ia2.runDetail', params: { runId: hit.runId } })
  else if (row.status === 'blocked') void router.push({ name: 'ia2.board', query: { task: row.taskId } })
  else void router.push({ path: '/app' })
}

/** v12.4：标签双击 → swarm kanban 看板总览（全部任务，与原 AI协作中心同动线） */
function onOpenBoard(): void {
  void router.push({ name: 'ia2.board' })
}
</script>

<template>
  <div class="ia-gtop" data-testid="ia-global-top">
    <IaShellHeader :user-name="cockpit.currentUserName" />
    <div v-if="showDelivery" class="delivery-strip" data-testid="delivery-readings" @click="openCases">
      <span class="dchip dchip--flight">{{ t('ia2.delivery.inFlight') }} {{ deliveryReadings.inFlight }}</span>
      <span v-for="(n, st) in deliveryReadings.byStage" :key="st" class="dchip">{{ st }} {{ n }}</span>
      <span v-if="deliveryReadings.pendingHumanGates > 0" class="dchip dchip--human">{{ t('ia2.delivery.pendingHuman') }} {{ deliveryReadings.pendingHumanGates }}</span>
      <span v-if="deliveryReadings.completed > 0" class="dchip dchip--done">{{ t('ia2.delivery.completed') }} {{ deliveryReadings.completed }}</span>
    </div>
    <AttentionStrip
      :items="attentionRows"
      @select="onAttentionSelect"
      @open-board="onOpenBoard"
    />
  </div>
</template>

<style scoped>
/* P1 交付网络读数条：单行 chip 流，零在途零待审时整条隐藏（零噪音原则） */
.delivery-strip { display: flex; gap: 6px; align-items: center; padding: 3px 12px 0; cursor: pointer; flex-wrap: wrap; }
.dchip { font-size: 11px; color: #555; background: #f3f4f6; border-radius: 8px; padding: 1px 8px; }
.dchip--flight { background: #dbeafe; color: #1d4ed8; }
.dchip--human { background: #fef3c7; color: #b45309; }
.dchip--done { background: #dcfce7; color: #15803d; }
</style>
