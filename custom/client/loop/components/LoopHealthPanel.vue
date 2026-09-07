// overlay/custom/client/loop/components/LoopHealthPanel.vue
// LoopHealthPanel — 循环健康度面板（观测治理层补齐组件 1）
//
// 在 LoopDetailView 中展示 loop 的实时健康指标：
//   - iteration 进度（currentIteration / 预算上限）
//   - 预算消耗（totalCost / maxCostTotal + 预警阈值）
//   - stuck/repair/budget-warning 计数（从事件流聚合）
//   - 熔断历史（最近 N 条 loop.stuck / loop.budget-warning 事件）
//
// 数据源：loop store 的 currentLoop + currentEvents（WS 实时推送）
// 无需新增后端 API——纯前端聚合。
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import type { LoopEvent } from '@/custom/loop/types'

const store = useLoopStore()
const { t } = useI18n()

const loop = computed(() => store.currentLoop)
const events = computed(() => store.currentEvents)

// ── 迭代健康度 ──
const iterPct = computed(() => {
  if (!loop.value) return 0
  // 用已发现任务数作为软上限参考（stats.tasksDiscovered），无发现则用固定 50 迭代视窗
  const softMax = Math.max(loop.value.stats.tasksDiscovered, 10)
  return Math.min(100, Math.round((loop.value.stats.currentIteration / softMax) * 100))
})

const iterColor = computed(() => {
  if (iterPct.value >= 90) return 'var(--color-danger, #e11d48)'
  if (iterPct.value >= 70) return 'var(--color-warning, #f59e0b)'
  return 'var(--color-success, #28bf5c)'
})

// ── 预算健康度 ──
const budgetPct = computed(() => {
  if (!loop.value?.budget?.maxCostTotal) return 0
  return Math.min(100, Math.round((loop.value.stats.totalCost / loop.value.budget.maxCostTotal) * 100))
})

const budgetColor = computed(() => {
  if (budgetPct.value >= 90) return 'var(--color-danger, #e11d48)'
  if (budgetPct.value >= 80) return 'var(--color-warning, #f59e0b)'
  return 'var(--color-primary, #3b82f6)'
})

// ── 事件计数（从事件流聚合）──
const stuckCount = computed(() => events.value.filter(e => e.type === 'loop.stuck').length)
const repairCount = computed(() => events.value.filter(e =>
  e.type === 'loop.stage-transition' && (e as any).from === 'validation' && (e as any).to === 'handoff',
).length)
const budgetWarnCount = computed(() => events.value.filter(e => e.type === 'loop.budget-warning').length)

// 熔断风险评分：0-100，越高越危险
const riskScore = computed(() => {
  if (!loop.value) return 0
  let score = 0
  score += Math.min(40, stuckCount.value * 15)            // stuck 权重最高
  score += Math.min(25, repairCount.value * 8)             // repair 次数
  score += Math.min(20, budgetWarnCount.value * 10)        // 预算告警
  score += Math.round(budgetPct.value * 0.15)              // 预算消耗占比
  return Math.min(100, score)
})

const riskLevel = computed(() => {
  if (riskScore.value >= 70) return { label: t('loopHealth.riskHigh'), color: 'var(--color-danger, #e11d48)' }
  if (riskScore.value >= 40) return { label: t('loopHealth.riskMedium'), color: 'var(--color-warning, #f59e0b)' }
  return { label: t('loopHealth.riskLow'), color: 'var(--color-success, #28bf5c)' }
})

// ── 熔断历史（最近 5 条异常事件）──
const anomalyHistory = computed(() => {
  return events.value
    .filter(e => e.type === 'loop.stuck' || e.type === 'loop.budget-warning' ||
      (e.type === 'loop.stage-transition' && (e as any).from === 'validation' && (e as any).to === 'handoff'))
    .slice(-5)
    .reverse()
})

function eventLabel(e: LoopEvent): string {
  const ts = (e as any).ts?.slice(11, 19) ?? ''
  switch (e.type) {
    case 'loop.stuck': return `⛔ ${t('loopHealth.stuck')}: ${(e as any).reason ?? ''}`
    case 'loop.budget-warning': return `💰 ${t('loopHealth.budgetWarn')}: $${(e as any).spent?.toFixed?.(2) ?? (e as any).spent} / $${(e as any).limit}`
    case 'loop.stage-transition': return `↩ ${t('loopHealth.repair')}: validation → handoff`
    default: return e.type
  }
}

function eventTs(e: LoopEvent): string {
  return (e as any).ts?.slice(11, 19) ?? ''
}
</script>

<template>
  <div v-if="loop" class="loop-health" data-loop-health-panel>
    <div class="loop-health__title">{{ t('loopHealth.title') }}</div>

    <!-- 风险评分条 -->
    <div class="loop-health__risk">
      <span class="loop-health__risk-label">{{ t('loopHealth.riskScore') }}</span>
      <div class="loop-health__risk-bar">
        <div class="loop-health__risk-fill" :style="{ width: riskScore + '%', background: riskLevel.color }" />
      </div>
      <span class="loop-health__risk-value" :style="{ color: riskLevel.color }">
        {{ riskScore }} · {{ riskLevel.label }}
      </span>
    </div>

    <!-- 双进度条：迭代 + 预算 -->
    <div class="loop-health__meters">
      <div class="loop-health__meter">
        <span class="loop-health__meter-label">{{ t('loopHealth.iteration') }}</span>
        <div class="loop-health__meter-bar">
          <div class="loop-health__meter-fill" :style="{ width: iterPct + '%', background: iterColor }" />
        </div>
        <span class="loop-health__meter-value">#{{ loop.stats.currentIteration }}</span>
      </div>
      <div class="loop-health__meter">
        <span class="loop-health__meter-label">{{ t('loopHealth.budget') }}</span>
        <div class="loop-health__meter-bar">
          <div class="loop-health__meter-fill" :style="{ width: budgetPct + '%', background: budgetColor }" />
        </div>
        <span class="loop-health__meter-value">${{ loop.stats.totalCost.toFixed(2) }}</span>
      </div>
    </div>

    <!-- 三计数器 -->
    <div class="loop-health__counters">
      <div class="loop-health__counter" :class="{ 'is-warn': stuckCount > 0 }">
        <span class="loop-health__counter-num">{{ stuckCount }}</span>
        <span class="loop-health__counter-label">{{ t('loopHealth.stuckCount') }}</span>
      </div>
      <div class="loop-health__counter" :class="{ 'is-warn': repairCount > 2 }">
        <span class="loop-health__counter-num">{{ repairCount }}</span>
        <span class="loop-health__counter-label">{{ t('loopHealth.repairCount') }}</span>
      </div>
      <div class="loop-health__counter" :class="{ 'is-warn': budgetWarnCount > 0 }">
        <span class="loop-health__counter-num">{{ budgetWarnCount }}</span>
        <span class="loop-health__counter-label">{{ t('loopHealth.budgetWarnCount') }}</span>
      </div>
    </div>

    <!-- 熔断历史 -->
    <div v-if="anomalyHistory.length > 0" class="loop-health__history">
      <div class="loop-health__history-title">{{ t('loopHealth.history') }}</div>
      <div v-for="(e, i) in anomalyHistory" :key="i" class="loop-health__history-item">
        <span class="loop-health__history-ts">{{ eventTs(e) }}</span>
        <span class="loop-health__history-text">{{ eventLabel(e) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loop-health { padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; margin: 1rem 0; }
.loop-health__title { font-size: 0.8rem; font-weight: bold; color: var(--color-text-secondary, #878c99); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px; }
.loop-health__risk { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.loop-health__risk-label { font-size: 0.75rem; min-width: 70px; }
.loop-health__risk-bar { flex: 1; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
.loop-health__risk-fill { height: 100%; transition: width 0.3s; }
.loop-health__risk-value { font-size: 0.7rem; font-weight: bold; min-width: 80px; text-align: right; }
.loop-health__meters { display: flex; gap: 1rem; margin-bottom: 0.75rem; }
.loop-health__meter { flex: 1; display: flex; align-items: center; gap: 0.4rem; }
.loop-health__meter-label { font-size: 0.7rem; min-width: 50px; opacity: 0.7; }
.loop-health__meter-bar { flex: 1; height: 5px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
.loop-health__meter-fill { height: 100%; transition: width 0.3s; }
.loop-health__meter-value { font-size: 0.7rem; font-family: monospace; min-width: 50px; text-align: right; }
.loop-health__counters { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
.loop-health__counter { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; }
.loop-health__counter.is-warn { border-color: var(--color-warning, #f59e0b); background: rgba(245, 158, 11, 0.05); }
.loop-health__counter-num { font-size: 1.1rem; font-weight: bold; }
.loop-health__counter-label { font-size: 0.65rem; opacity: 0.6; text-align: center; }
.loop-health__history { border-top: 1px solid var(--border-color); padding-top: 0.5rem; margin-top: 0.5rem; }
.loop-health__history-title { font-size: 0.7rem; font-weight: bold; opacity: 0.6; margin-bottom: 0.25rem; }
.loop-health__history-item { display: flex; gap: 0.5rem; padding: 0.15rem 0; font-size: 0.7rem; }
.loop-health__history-ts { font-family: monospace; opacity: 0.5; min-width: 60px; }
.loop-health__history-text { flex: 1; }
</style>
