<!-- overlay/custom/client/ia2/components/MetricsCards.vue -->
<!-- 关键指标卡（负责人视角）：近 7 天 run 成功率 / 平均耗时 / 熔断次数。
     纯展示：数字来自 adapters/overview.ts aggregateMetrics（输入 runs store
     fetchMetrics 采集包）。只聚合不推送（R4/§7B.1），不可点击。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDuration, type OverviewMetrics } from '../adapters/overview'

const props = defineProps<{
  metrics: OverviewMetrics | null
  loading?: boolean
}>()

const { t } = useI18n()

const successLabel = computed(() => {
  if (props.loading) return t('ia2.overview.metricLoading')
  if (!props.metrics || props.metrics.successRate === null) return '—'
  return `${Math.round(props.metrics.successRate * 100)}%`
})

const durationLabel = computed(() => {
  if (props.loading) return t('ia2.overview.metricLoading')
  return formatDuration(props.metrics?.avgDurationMs ?? null) ?? '—'
})

const stuckLabel = computed(() => {
  if (props.loading) return t('ia2.overview.metricLoading')
  return String(props.metrics?.stuckCount ?? 0)
})
</script>

<template>
  <div class="ia-card ia-card--static ia-metrics" data-testid="ia-metrics">
    <span class="ia-card__label">{{ t('ia2.overview.cardMetrics') }}</span>
    <div class="ia-metrics__rows">
      <div class="ia-metrics__row">
        <span class="ia-metrics__key">{{ t('ia2.overview.metricSuccess') }}</span>
        <span class="ia-metrics__val">{{ successLabel }}</span>
      </div>
      <div class="ia-metrics__row">
        <span class="ia-metrics__key">{{ t('ia2.overview.metricDuration') }}</span>
        <span class="ia-metrics__val">{{ durationLabel }}</span>
      </div>
      <div class="ia-metrics__row">
        <span class="ia-metrics__key">{{ t('ia2.overview.metricStuck') }}</span>
        <span class="ia-metrics__val">{{ stuckLabel }}</span>
      </div>
    </div>
  </div>
</template>
