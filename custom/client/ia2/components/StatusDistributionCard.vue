<!-- overlay/custom/client/ia2/components/StatusDistributionCard.vue -->
<!-- 观察者聚合最小版（P3 Task 8，§9 观察能力并入总览）：
     跨任务状态分布条形图——TaskLifecycleView 生命周期漏斗的等价收编。
     数据层 = cockpit/composables/useTaskLifecycle（保留资产，statusCounts 纯前端
     聚合，零新 API）；行点击 → 工作项区带 status 预选（/app/tasks?status=）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskLifecycle } from '@/custom/cockpit/composables/useTaskLifecycle'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const props = defineProps<{ tasks: CockpitTask[] }>()
const emit = defineEmits<{ open: [status: string] }>()
const { t } = useI18n()

const tasksRef = computed(() => props.tasks)
const { statusCounts } = useTaskLifecycle(tasksRef, computed(() => ({})))

const total = computed(() => statusCounts.value.reduce((n, c) => n + c.count, 0))

function barWidth(count: number): string {
  if (!total.value) return '0%'
  return `${Math.round((count / total.value) * 100)}%`
}
</script>

<template>
  <section class="ia-card ia-status-dist" data-testid="ia-status-dist">
    <div class="ia-status-dist__head">
      <span class="ia-card__label">{{ t('ia2.overview.statusDistTitle') }}</span>
      <span
        v-if="total > 0"
        class="ia-status-dist__total"
        data-testid="ia-status-dist-total"
      >{{ total }}</span>
    </div>

    <div v-if="total === 0" class="ia-status-dist__empty" data-testid="ia-status-dist-empty">
      {{ t('ia2.overview.statusDistEmpty') }}
    </div>

    <div v-else class="ia-status-dist__rows">
      <button
        v-for="c in statusCounts"
        :key="c.status"
        type="button"
        class="ia-status-dist__row"
        :data-status="c.status"
        :title="t('ia2.overview.statusDistFilterHint')"
        @click="emit('open', c.status)"
      >
        <span class="ia-status-dist__key">{{ t(`ia2.overview.status.${c.status}`) }}</span>
        <span class="ia-status-dist__track">
          <span class="ia-status-dist__bar" :style="{ width: barWidth(c.count) }" />
        </span>
        <span class="ia-status-dist__count">{{ c.count }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.ia-status-dist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ia-status-dist__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.ia-status-dist__total {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.ia-status-dist__empty {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ia-status-dist__rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ia-status-dist__row {
  display: grid;
  grid-template-columns: 64px 1fr 28px;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 2px 0;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}
.ia-status-dist__row:hover {
  color: var(--text-primary);
}
.ia-status-dist__row:focus-visible {
  outline: 2px solid var(--primary-color, var(--text-primary));
  outline-offset: -2px;
}
.ia-status-dist__key {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ia-status-dist__track {
  display: block;
  height: 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-secondary);
  overflow: hidden;
}
.ia-status-dist__bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent-primary, var(--color-primary, #3b82f6));
  transition: width 0.2s ease;
}
.ia-status-dist__count {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
</style>
