<!-- overlay/custom/client/loop/views/LoopDetailView.vue -->
<!-- LoopDetailView — 单 loop 详情（统一有向图 + 实时事件 + 检查点/fork） -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopGraph from '@/custom/loop/components/LoopGraph.vue'
import VerifierPanel from '@/custom/loop/components/VerifierPanel.vue'
import LoopApprovalDialog from '@/custom/loop/components/LoopApprovalDialog.vue'
import { request } from '@/api/client'
import type { LoopStage, TaskContract } from '@/custom/loop/types'

const store = useLoopStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const activeTab = ref<'graph' | 'history' | 'workers' | 'state'>('graph')
const granularity = ref(2)
const selectedStage = ref<LoopStage | null>(null)
const showApprovalDialog = ref(false)
const showForkDialog = ref(false)
const forkName = ref('')

onMounted(() => {
  const id = route.params.id as string
  store.fetchLoop(id)
  store.connectSocket(id)
})
onUnmounted(() => { store.disconnectSocket() })

const loop = computed(() => store.currentLoop)
const events = computed(() => store.currentEvents)

const pendingContracts = computed<TaskContract[]>(() =>
  (store.currentContracts || []).filter((c: TaskContract) => c.status === 'pending' || c.status === 'awaiting-review'),
)
watch(pendingContracts, (list) => {
  showApprovalDialog.value = list.length > 0
}, { immediate: true })

// 检查点：从事件流中提取 tick-complete 作为检查点
const checkpoints = computed(() =>
  events.value.filter(e => e.type === 'loop.tick-complete'),
)

function onStageSelect(stage: LoopStage): void {
  selectedStage.value = stage
  activeTab.value = 'history'
}

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

const totalCost = computed(() => loop.value?.stats?.totalCost?.toFixed(2) ?? '0.00')
const maxCostTotal = computed(() => loop.value?.budget?.maxCostTotal?.toFixed(2) ?? '0.00')
const costPct = computed(() => {
  if (!loop.value?.budget?.maxCostTotal) return 0
  return Math.round((loop.value.stats.totalCost / loop.value.budget.maxCostTotal) * 100)
})

async function onFork() {
  if (!loop.value) return
  try {
    const res = await request<{ graph: { id: string } }>(`/api/graph/graphs/graph-${loop.value.id}/fork`, {
      method: 'POST',
      body: JSON.stringify({ name: forkName.value || undefined }),
    })
    showForkDialog.value = false
    forkName.value = ''
    const forkedId = res.graph.id.replace(/^graph-/, '')
    router.push({ name: 'hermes.loopDetail', params: { id: forkedId } })
  } catch (e: any) {
    store.error = e.message
  }
}

const statusColor = computed(() => {
  switch (loop.value?.status) {
    case 'running': return 'var(--color-primary, #3b82f6)'
    case 'awaiting-review': return 'var(--color-warning, #f59e0b)'
    case 'blocked': return 'var(--color-danger, #e11d48)'
    case 'completed': return 'var(--color-success, #28bf5c)'
    case 'failed': return 'var(--color-danger, #e11d48)'
    default: return 'var(--color-text-secondary, #878c99)'
  }
})
</script>

<template>
  <div class="loop-detail" v-if="loop">
    <div class="loop-detail__header">
      <button @click="router.push({ name: 'hermes.loop' })">{{ t('loop.detail.back') }}</button>
      <span class="loop-detail__name">{{ loop.name }}</span>
      <span class="loop-detail__status" :style="{ color: statusColor }">{{ loop.status }}</span>
      <button @click="store.tickLoop(loop.id)">{{ t('loop.detail.run') }}</button>
      <button @click="store.pauseLoop(loop.id)">{{ t('loop.detail.pause') }}</button>
      <button @click="showForkDialog = true">{{ t('graph.fork') }}</button>
    </div>

    <div class="loop-detail__meta">
      <span>{{ t('loop.detail.pattern') }}: {{ loop.pattern }}</span>
      <span>{{ t('loop.detail.level') }}: {{ loop.autonomyLevel }}</span>
      <span>{{ t('loop.detail.goal') }}: {{ loop.goal }}</span>
      <span>{{ t('loop.detail.stop') }}: {{ loop.stopCondition }}</span>
    </div>

    <!-- 统一有向图（实时反映当前阶段 + 事件流） -->
    <LoopGraph
      :current-stage="loop.stage"
      :status="loop.status"
      :events="events"
      @select="onStageSelect"
    />

    <!-- 预算进度条 -->
    <div class="loop-detail__budget">
      <div class="loop-detail__budget-bar">
        <div class="loop-detail__budget-fill" :style="{ width: `${Math.min(costPct, 100)}%` }" />
      </div>
      <span>${{ totalCost }} / ${{ maxCostTotal }} ({{ costPct }}%)</span>
    </div>

    <div class="loop-detail__tabs">
      <button v-for="tab in ['graph','history','workers','state']" :key="tab"
        :class="{ active: activeTab === tab }" @click="activeTab = tab as any">
        {{ t(`loop.tabs.${tab}`) }}
      </button>
    </div>

    <!-- Graph tab = 图说明（当前阶段 + 选中阶段详情） -->
    <div class="loop-detail__tab-content" v-if="activeTab === 'graph'">
      <div v-if="selectedStage" class="loop-detail__stage-info">
        <h4>{{ t(`loop.stages.${selectedStage}`) }}</h4>
        <p>{{ t(`loop.stagesDesc.${selectedStage}`) }}</p>
      </div>
      <div v-else class="loop-detail__stage-info">
        <p>{{ t('loop.stageHint') }}</p>
      </div>
    </div>

    <!-- History tab = 事件流 -->
    <div class="loop-detail__tab-content" v-else-if="activeTab === 'history'">
      <input type="range" min="1" max="5" v-model="granularity" :title="t('loop.granularity')" />
      <div v-for="event in events.slice(-20 * granularity)" :key="(event as any).ts + event.type" class="loop-detail__event">
        <span class="loop-detail__event-ts">{{ (event as any).ts?.slice(11, 19) }}</span>
        <span class="loop-detail__event-type">{{ event.type }}</span>
      </div>
      <div v-if="events.length === 0" class="loop-detail__empty">{{ t('loop.eventsEmpty') }}</div>
    </div>

    <!-- Workers tab = 验证面板 -->
    <div class="loop-detail__tab-content" v-else-if="activeTab === 'workers'">
      <VerifierPanel />
    </div>

    <!-- State tab = 状态检视 -->
    <div class="loop-detail__tab-content" v-else-if="activeTab === 'state'">
      <div class="loop-detail__state-row"><span>{{ t('loop.detail.iteration') }}</span><span>#{{ loop.stats.currentIteration }}</span></div>
      <div class="loop-detail__state-row"><span>{{ t('loop.detail.discovered') }}</span><span>{{ loop.stats.tasksDiscovered }}</span></div>
      <div class="loop-detail__state-row"><span>{{ t('loop.detail.completedTasks') }}</span><span>{{ loop.stats.tasksCompleted }}</span></div>
      <div class="loop-detail__state-row"><span>{{ t('loop.detail.blockedTasks') }}</span><span>{{ loop.stats.tasksBlocked }}</span></div>
      <div class="loop-detail__state-row"><span>{{ t('loop.detail.nextTick') }}</span><span>{{ loop.nextTickAt ?? '—' }}</span></div>
      <div class="loop-detail__state-row"><span>{{ t('loop.detail.checkpoints') }}</span><span>{{ checkpoints.length }}</span></div>
    </div>

    <!-- Fork dialog -->
    <div v-if="showForkDialog" class="loop-detail__fork-dialog">
      <div class="loop-detail__fork-overlay" @click="showForkDialog = false"></div>
      <div class="loop-detail__fork-content">
        <h3>{{ t('graphFork.title') }}</h3>
        <label>{{ t('graphFork.name') }} <input v-model="forkName" /></label>
        <div class="loop-detail__fork-actions">
          <button @click="onFork">{{ t('graphFork.confirm') }}</button>
          <button @click="showForkDialog = false">{{ t('graphFork.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Approval dialog -->
    <LoopApprovalDialog
      v-if="showApprovalDialog"
      @approve="onApprove"
      @reject="onReject"
      @changes-requested="onChangesRequested"
      @close="showApprovalDialog = false"
    />
  </div>

  <div class="loop-detail loop-detail--loading" v-else-if="store.loading">
    <div class="loop-detail__spinner" />
  </div>
  <div class="loop-detail loop-detail--error" v-else-if="store.error">
    <div class="loop-detail__error">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.loop-detail { padding: 1rem; }
.loop-detail__header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.loop-detail__name { font-size: 1.2rem; font-weight: bold; flex: 1; }
.loop-detail__status { font-size: 0.85rem; font-weight: 600; }
.loop-detail__meta { display: flex; gap: 1.5rem; margin-bottom: 1rem; font-size: 0.85rem; opacity: 0.8; flex-wrap: wrap; }

.loop-detail__budget { display: flex; align-items: center; gap: 1rem; margin: 1rem 0; font-size: 0.85rem; }
.loop-detail__budget-bar { flex: 0 0 200px; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
.loop-detail__budget-fill { height: 100%; background: var(--color-primary, #3b82f6); transition: width 0.3s; }

.loop-detail__tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); margin-bottom: 1rem; }
.loop-detail__tabs button { padding: 0.5rem 1rem; border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent; }
.loop-detail__tabs button.active { border-bottom-color: var(--color-primary, #3b82f6); }
.loop-detail__tab-content { min-height: 200px; }
.loop-detail__stage-info h4 { margin: 0 0 0.5rem; }
.loop-detail__stage-info p { opacity: 0.7; }
.loop-detail__event { display: flex; gap: 1rem; padding: 0.25rem; font-size: 0.85rem; }
.loop-detail__event-ts { color: var(--color-text-secondary, #878c99); min-width: 70px; }
.loop-detail__event-type { font-family: monospace; font-size: 0.8rem; }
.loop-detail__empty { padding: 2rem; text-align: center; opacity: 0.5; }
.loop-detail__state-row { display: flex; gap: 1rem; padding: 0.5rem; border-bottom: 1px solid var(--border-color); }
.loop-detail__state-row span:first-child { min-width: 150px; font-weight: 500; }

.loop-detail__fork-dialog { position: fixed; inset: 0; z-index: 1000; }
.loop-detail__fork-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
.loop-detail__fork-content { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); background: var(--bg-card, var(--color-bg-primary)); border-radius: 8px; padding: 1.5rem; min-width: 400px; z-index: 1001; }
.loop-detail__fork-content h3 { margin: 0 0 1rem; }
.loop-detail__fork-content label { display: block; margin-bottom: 0.5rem; font-size: 0.85rem; }
.loop-detail__fork-content input { width: 100%; padding: 0.4rem; margin-top: 0.25rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--color-bg-input, transparent); color: inherit; }
.loop-detail__fork-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
.loop-detail__spinner { padding: 3rem; text-align: center; }
.loop-detail__error { padding: 1rem; color: var(--color-danger, #e11d48); }
</style>
