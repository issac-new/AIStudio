<!-- overlay/custom/client/loop/components/LoopDetailPanel.vue -->
<!-- LoopDetailPanel — 循环工程详情面板（弹窗内，实时直播运行过程） -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopGraph from '@/custom/loop/components/LoopGraph.vue'
import type { LoopEvent, TaskContract } from '@/custom/loop/types'

const props = defineProps<{ loopId: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()
const { t } = useI18n()
const store = useLoopStore()

onMounted(() => {
  store.fetchLoop(props.loopId)
  store.connectSocket(props.loopId)
})
onUnmounted(() => { store.disconnectSocket() })

const loop = computed(() => store.currentLoop)
const events = computed(() => store.currentEvents)

// 最近事件的友好描述（直播模式）
const recentActivity = computed(() => {
  const recent = events.value.slice(-5).reverse()
  return recent.map(e => describeEvent(e)).filter(Boolean)
})

function describeEvent(e: LoopEvent): string | null {
  switch (e.type) {
    case 'loop.stage-transition': {
      const from = (e as any).from as string
      const to = (e as any).to as string
      return t('loop.activity.stageTransition', { from: t(`loop.stages.${from}`), to: t(`loop.stages.${to}`) })
    }
    case 'loop.task-discovered':
      return t('loop.activity.taskDiscovered', { summary: (e as any).contract?.source?.summary ?? '' })
    case 'loop.task-handed-off':
      return t('loop.activity.taskHandedOff', { worktree: (e as any).worktreeId ?? '' })
    case 'loop.verification-complete': {
      const passed = (e as any).passed
      return passed ? t('loop.activity.verifyPass') : t('loop.activity.verifyFail')
    }
    case 'loop.persisted':
      return t('loop.activity.persisted', { artifact: (e as any).artifact ?? '' })
    case 'loop.tick-complete':
      return t('loop.activity.tickComplete', { iteration: (e as any).iteration ?? 0 })
    case 'loop.budget-warning':
      return t('loop.activity.budgetWarning', { pct: (((e as any).spent / (e as any).limit) * 100).toFixed(0) })
    case 'loop.stuck':
      return t('loop.activity.stuck', { reason: (e as any).reason ?? '' })
    case 'loop.completed':
      return t('loop.activity.completed')
    default:
      return null
  }
}

// 当前正在做什么（直播状态）
const currentActivity = computed(() => {
  if (!loop.value) return ''
  if (loop.value.status === 'running') {
    return t('loop.activity.running', { stage: t(`loop.stages.${loop.value.stage}`) })
  }
  if (loop.value.status === 'awaiting-review') return t('loop.activity.awaitingReview')
  if (loop.value.status === 'idle') return t('loop.activity.idle', { next: loop.value.nextTickAt?.slice(5, 16).replace('T', ' ') ?? '—' })
  return ''
})

// 审批面板
const pendingContracts = computed<TaskContract[]>(() =>
  (store.currentContracts || []).filter(c => c.status === 'pending' || c.status === 'awaiting-review'),
)

async function onApprove(contractId: string) {
  // 调用审批 API（目前是 stub，但先接线）
  try {
    await fetch(`/api/loop/contracts/${contractId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', approver: 'user', comment: '' }),
    })
    await store.fetchLoop(props.loopId)
  } catch {}
}

async function onReject(contractId: string) {
  try {
    await fetch(`/api/loop/contracts/${contractId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'rejected', approver: 'user', comment: '' }),
    })
    await store.fetchLoop(props.loopId)
  } catch {}
}

const costPct = computed(() => {
  if (!loop.value?.budget?.maxCostTotal) return 0
  return Math.min(100, Math.round((loop.value.stats.totalCost / loop.value.budget.maxCostTotal) * 100))
})
</script>

<template>
  <div class="loop-detail-panel" v-if="loop">
    <!-- 头部 -->
    <div class="loop-detail-panel__header">
      <button class="loop-detail-panel__back" @click="emit('back')">← {{ t('loop.detail.back') }}</button>
      <span class="loop-detail-panel__name">{{ loop.name }}</span>
      <span class="loop-detail-panel__status" :data-status="loop.status">{{ loop.status }}</span>
      <button @click="store.tickLoop(loop.id)" class="loop-detail-panel__btn">{{ t('loop.detail.run') }}</button>
      <button @click="store.pauseLoop(loop.id)" class="loop-detail-panel__btn">{{ t('loop.detail.pause') }}</button>
    </div>

    <!-- 当前活动直播条 -->
    <div v-if="currentActivity" class="loop-detail-panel__live">
      <span class="loop-detail-panel__live-dot" :class="{ 'is-live': loop.status === 'running' }" />
      {{ currentActivity }}
    </div>

    <!-- 审批面板（内联，不弹窗） -->
    <div v-if="pendingContracts.length > 0" class="loop-detail-panel__approval">
      <div v-for="c in pendingContracts" :key="c.id" class="loop-detail-panel__approval-item">
        <div class="loop-detail-panel__approval-info">
          <strong>{{ c.source?.summary ?? c.id }}</strong>
          <span class="loop-detail-panel__approval-src">{{ c.source?.type }} · {{ c.source?.ref }}</span>
        </div>
        <div class="loop-detail-panel__approval-actions">
          <button class="is-approve" @click="onApprove(c.id)">✓ {{ t('loop.approval.approve') }}</button>
          <button class="is-reject" @click="onReject(c.id)">✗ {{ t('loop.approval.reject') }}</button>
        </div>
      </div>
    </div>

    <!-- 主体：图 + 右侧信息 -->
    <div class="loop-detail-panel__body">
      <div class="loop-detail-panel__graph">
        <LoopGraph :current-stage="loop.stage" :status="loop.status" :events="events" />
        <!-- 预算进度条 -->
        <div class="loop-detail-panel__budget">
          <div class="loop-detail-panel__budget-bar">
            <div class="loop-detail-panel__budget-fill" :style="{ width: `${costPct}%` }" />
          </div>
          <span>${{ loop.stats.totalCost.toFixed(2) }} / ${{ loop.budget.maxCostTotal.toFixed(2) }} ({{ costPct }}%)</span>
        </div>
      </div>

      <div class="loop-detail-panel__side">
        <!-- 最近活动 -->
        <div class="loop-detail-panel__section">
          <h4>{{ t('loop.recentActivity') }}</h4>
          <div v-if="recentActivity.length === 0" class="loop-detail-panel__empty">
            {{ t('loop.eventsEmpty') }}
          </div>
          <div v-for="(act, i) in recentActivity" :key="i" class="loop-detail-panel__activity">
            {{ act }}
          </div>
        </div>

        <!-- 元信息 -->
        <div class="loop-detail-panel__section">
          <h4>{{ t('loop.detail.pattern') }}</h4>
          <div class="loop-detail-panel__meta">{{ loop.pattern }} · {{ loop.autonomyLevel }}</div>
          <div class="loop-detail-panel__meta loop-detail-panel__goal">{{ loop.goal }}</div>
        </div>

        <!-- 统计 -->
        <div class="loop-detail-panel__section">
          <h4>{{ t('loop.stats') }}</h4>
          <div class="loop-detail-panel__stat">
            <span>{{ t('loop.detail.iteration') }}</span><span>#{{ loop.stats.currentIteration }}</span>
          </div>
          <div class="loop-detail-panel__stat">
            <span>{{ t('loop.detail.discovered') }}</span><span>{{ loop.stats.tasksDiscovered }}</span>
          </div>
          <div class="loop-detail-panel__stat">
            <span>{{ t('loop.detail.completedTasks') }}</span><span>{{ loop.stats.tasksCompleted }}</span>
          </div>
          <div class="loop-detail-panel__stat">
            <span>{{ t('loop.detail.nextTick') }}</span><span>{{ loop.nextTickAt?.slice(5, 16).replace('T', ' ') ?? '—' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="store.loading" class="loop-detail-panel loop-detail-panel--loading">
    {{ t('loop.detail.loading') }}
  </div>
</template>

<style scoped>
.loop-detail-panel { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.loop-detail-panel__header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; }
.loop-detail-panel__back { border: none; background: transparent; cursor: pointer; font-size: 0.9rem; color: var(--color-primary, #3b82f6); }
.loop-detail-panel__name { font-size: 1.1rem; font-weight: bold; flex: 1; }
.loop-detail-panel__status { font-size: 0.85rem; font-weight: 600; }
.loop-detail-panel__btn { padding: 0.4rem 1rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; cursor: pointer; }

.loop-detail-panel__live { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: rgba(59, 130, 246, 0.06); border-bottom: 1px solid var(--border-color); font-size: 0.9rem; }
.loop-detail-panel__live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-secondary, #878c99); }
.loop-detail-panel__live-dot.is-live { background: var(--color-primary, #3b82f6); animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.loop-detail-panel__approval { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); background: rgba(245, 158, 11, 0.05); }
.loop-detail-panel__approval-item { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0; }
.loop-detail-panel__approval-info { flex: 1; }
.loop-detail-panel__approval-src { display: block; font-size: 0.8rem; opacity: 0.6; }
.loop-detail-panel__approval-actions { display: flex; gap: 0.5rem; }
.loop-detail-panel__approval-actions button { padding: 0.4rem 1rem; border-radius: 4px; cursor: pointer; border: 1px solid var(--border-color); background: transparent; }
.loop-detail-panel__approval-actions .is-approve { border-color: var(--color-success, #28bf5c); color: var(--color-success, #28bf5c); }
.loop-detail-panel__approval-actions .is-reject { border-color: var(--color-danger, #e11d48); color: var(--color-danger, #e11d48); }

.loop-detail-panel__body { display: flex; flex: 1; overflow: auto; }
.loop-detail-panel__graph { flex: 1; padding: 1rem; }
.loop-detail-panel__budget { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; font-size: 0.85rem; }
.loop-detail-panel__budget-bar { flex: 0 0 200px; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
.loop-detail-panel__budget-fill { height: 100%; background: var(--color-primary, #3b82f6); }

.loop-detail-panel__side { flex: 0 0 300px; border-left: 1px solid var(--border-color); padding: 1rem; overflow: auto; }
.loop-detail-panel__section { margin-bottom: 1.5rem; }
.loop-detail-panel__section h4 { margin: 0 0 0.5rem; font-size: 0.85rem; opacity: 0.7; }
.loop-detail-panel__activity { padding: 0.4rem 0; font-size: 0.85rem; border-bottom: 1px solid var(--border-color); }
.loop-detail-panel__empty { opacity: 0.5; font-size: 0.85rem; }
.loop-detail-panel__meta { font-size: 0.85rem; margin-bottom: 0.25rem; }
.loop-detail-panel__goal { opacity: 0.7; }
.loop-detail-panel__stat { display: flex; justify-content: space-between; padding: 0.3rem 0; font-size: 0.85rem; border-bottom: 1px solid var(--border-color); }
.loop-detail-panel--loading { display: flex; align-items: center; justify-content: center; padding: 3rem; opacity: 0.6; }
</style>
