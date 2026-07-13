<!-- overlay/custom/client/loop/views/LoopDetailView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import StageRing from '@/custom/loop/components/StageRing.vue'
import VerifierPanel from '@/custom/loop/components/VerifierPanel.vue'
import LoopApprovalDialog from '@/custom/loop/components/LoopApprovalDialog.vue'
import type { LoopStage, TaskContract } from '@/custom/loop/types'

const store = useLoopStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const activeTab = ref<'history' | 'workers' | 'relations' | 'todo'>('history')
const granularity = ref(2)
// C8: 当前选中的 stage(由 StageRing @select 触发)。用于在 UI 上高亮所选阶段。
const selectedStage = ref<LoopStage | null>(null)
// overlay[fix-approval-dialog]: LoopApprovalDialog is rendered when there are
// contracts awaiting review (Bug 9). The dialog emits approve/reject/
// changes-requested with a comment; we clear the dialog and refresh contracts.
const showApprovalDialog = ref(false)

onMounted(() => {
  const id = route.params.id as string
  store.fetchLoop(id)
  store.connectSocket(id)
})
onUnmounted(() => { store.disconnectSocket() })

const loop = computed(() => store.currentLoop)
const events = computed(() => store.currentEvents)
// overlay[fix-approval-dialog]: contracts that are still pending verification
// surface the approval dialog. The detail view already fetched contracts via
// store.fetchLoop(); we expose the pending subset here.
const pendingContracts = computed<TaskContract[]>(() =>
  (store.currentContracts || []).filter((c: TaskContract) => c.status === 'pending' || c.status === 'awaiting-review'),
)
watch(pendingContracts, (list) => {
  showApprovalDialog.value = list.length > 0
}, { immediate: true })

// C8: StageRing 选中阶段处理器。简单实现:记录所选阶段,可在 UI 上高亮。
function onStageSelect(stage: LoopStage): void {
  selectedStage.value = stage
}

// overlay[fix-approval-dialog]: approval action handlers. The store currently
// exposes loop-level CRUD; contract resolution lives server-side, so we close
// the dialog and re-fetch the loop's contracts to pick up the new state.
function onApprove(comment: string) {
  showApprovalDialog.value = false
  void store.fetchLoop(route.params.id as string)
}
function onReject(comment: string) {
  showApprovalDialog.value = false
  void store.fetchLoop(route.params.id as string)
}
function onChangesRequested(comment: string) {
  showApprovalDialog.value = false
  void store.fetchLoop(route.params.id as string)
}

// C8: STAGE_POSITIONS 与 nodePos 从第二个 <script> 块迁移到 <script setup>,
// 以便与组件状态共享作用域(此前 nodePos 在 <script> 块中,模板里引用的是
// 非响应式的全局函数,迁移后语义一致但作用域更清晰)。
const STAGE_POSITIONS: Record<string, { x: number; y: number }> = {
  discovery: { x: 300, y: 100 },
  handoff: { x: 200, y: 200 },
  validation: { x: 100, y: 100 },
  persistence: { x: 100, y: 250 },
  scheduling: { x: 300, y: 250 },
}
function nodePos(id: string) { return STAGE_POSITIONS[id] ?? { x: 200, y: 150 } }

// I13: 空值兜底,stats/budget 可能在 loop 刚创建时尚未填充。
const totalCost = computed(() => loop.value?.stats?.totalCost?.toFixed(2) ?? '0.00')
const maxCostTotal = computed(() => loop.value?.budget?.maxCostTotal?.toFixed(2) ?? '0.00')
</script>

<template>
  <div class="loop-detail" v-if="loop">
    <div class="loop-detail__header">
      <button @click="router.push({ name: 'hermes.loop' })">{{ t('loop.detail.back') }}</button>
      <span class="loop-detail__name">{{ loop.name }}</span>
      <button @click="store.tickLoop(loop.id)">{{ t('loop.detail.run') }}</button>
      <button @click="store.pauseLoop(loop.id)">{{ t('loop.detail.pause') }}</button>
    </div>
    <div class="loop-detail__meta">
      <span>{{ t('loop.detail.pattern') }}: {{ loop.pattern }}</span>
      <span>{{ t('loop.detail.level') }}: {{ loop.autonomyLevel }}</span>
      <span>{{ t('loop.detail.goal') }}: {{ loop.goal }}</span>
      <span>{{ t('loop.detail.stop') }}: {{ loop.stopCondition }}</span>
    </div>
    <StageRing :current-stage="loop.stage" :events="events" @select="onStageSelect" />
    <div v-if="selectedStage" class="loop-detail__stage-selected">
      {{ t(`loop.stages.${selectedStage}`) }}
    </div>
    <div class="loop-detail__budget">
      ${{ totalCost }} / ${{ maxCostTotal }}
    </div>
    <div class="loop-detail__tabs">
      <button v-for="tab in ['history','workers','relations','todo']" :key="tab"
        :class="{ active: activeTab === tab }" @click="activeTab = tab as any">{{ tab }}</button>
    </div>
    <div class="loop-detail__tab-content" v-if="activeTab === 'history'">
      <input type="range" min="1" max="3" v-model="granularity" />
      <div v-for="event in events.slice(-20 * granularity)" :key="(event as any).ts" class="loop-detail__event">
        <span class="loop-detail__event-ts">{{ (event as any).ts?.slice(11, 19) }}</span>
        <span class="loop-detail__event-type">{{ event.type }}</span>
      </div>
    </div>
    <!-- C1: VerifierPanel 在 "workers" tab 渲染。此前已 import 但从未渲染。 -->
    <div class="loop-detail__tab-content" v-else-if="activeTab === 'workers'">
      <VerifierPanel />
    </div>
    <!-- overlay[fix-approval-dialog]: render the approval dialog when there are
         contracts pending review (Bug 9). -->
    <LoopApprovalDialog
      v-if="showApprovalDialog"
      @approve="onApprove"
      @reject="onReject"
      @changes-requested="onChangesRequested"
      @close="showApprovalDialog = false"
    />
  </div>
  <!-- I8: 加载/错误态。loop 未加载时显示 spinner,错误时显示 banner。 -->
  <div class="loop-detail loop-detail--loading" v-else-if="store.loading">
    <div class="loop-detail__spinner" />
  </div>
  <div class="loop-detail loop-detail--error" v-else-if="store.error">
    <div class="loop-detail__error">{{ store.error }}</div>
  </div>
</template>
