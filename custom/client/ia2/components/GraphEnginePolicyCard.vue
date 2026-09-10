<!-- overlay/custom/client/ia2/components/GraphEnginePolicyCard.vue -->
<!-- 策略下发最小版（P3 Task 8，spec §7B.4）：设置页"图引擎策略"卡——
     GRAPH_ENGINE 当前模式 + 默认审批超时/熔断阈值，全部只读展示。
     数据源：GET /api/graph/engine（graph-assembly 装配事实导出）；
     策略文件化（可编辑下发）随 P4，本期先可见。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { runRest, type GraphEnginePolicy } from '@/custom/loop/runcenter/api'

const { t } = useI18n()

const policy = ref<GraphEnginePolicy | null>(null)
const error = ref(false)
const loading = ref(true)

onMounted(async () => {
  try {
    policy.value = await runRest.getEnginePolicy()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})

function formatHours(ms: number): string {
  return `${Math.round(ms / 3_600_000)}h`
}
</script>

<template>
  <div class="ia-engine-card">
    <div class="ia-engine-card__head">
      <span class="ia-engine-card__title">{{ t('ia2.engine.title') }}</span>
      <span
        v-if="policy"
        class="ia-engine-card__mode"
        :class="`ia-engine-card__mode--${policy.mode}`"
        data-testid="ia-engine-mode"
      >{{ policy.mode }}</span>
    </div>

    <div v-if="loading" class="ia-engine-card__hint" data-testid="ia-engine-loading">
      {{ t('ia2.engine.loading') }}
    </div>
    <div v-else-if="error" class="ia-engine-card__hint" data-testid="ia-engine-error">
      {{ t('ia2.engine.unavailable') }}
    </div>
    <template v-else-if="policy">
      <div class="ia-engine-card__desc">{{ t('ia2.engine.desc') }}</div>
      <div class="ia-engine-card__rows">
        <div class="ia-engine-card__row">
          <span class="ia-engine-card__key">{{ t('ia2.engine.failureBreaker') }}</span>
          <span class="ia-engine-card__val">{{ policy.policy.failureBreakerLimit }}</span>
        </div>
        <div class="ia-engine-card__row">
          <span class="ia-engine-card__key">{{ t('ia2.engine.stagnation') }}</span>
          <span class="ia-engine-card__val">{{ policy.policy.stagnationLimit }}</span>
        </div>
        <div class="ia-engine-card__row">
          <span class="ia-engine-card__key">{{ t('ia2.engine.interruptTimeout') }}</span>
          <span class="ia-engine-card__val">{{ formatHours(policy.policy.interruptTimeoutMs) }}</span>
        </div>
        <div class="ia-engine-card__row">
          <span class="ia-engine-card__key">{{ t('ia2.engine.escalationResend') }}</span>
          <span class="ia-engine-card__val">{{ formatHours(policy.policy.escalationResendMs) }}</span>
        </div>
      </div>
      <div class="ia-engine-card__foot">{{ t('ia2.engine.readonlyHint') }}</div>
    </template>
  </div>
</template>

<style scoped>
.ia-engine-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 560px;
}
.ia-engine-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ia-engine-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.ia-engine-card__mode {
  padding: 1px 10px;
  border-radius: var(--radius-pill, 999px);
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: var(--color-on-accent, #fff);
  background: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ia-engine-card__mode--on {
  background: var(--success, var(--color-success, #10b981));
}
.ia-engine-card__mode--shadow {
  background: var(--warning, var(--color-warning, #f59e0b));
}
.ia-engine-card__mode--legacy {
  background: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ia-engine-card__desc {
  font-size: 12px;
  color: var(--text-secondary);
}
.ia-engine-card__rows {
  display: flex;
  flex-direction: column;
}
.ia-engine-card__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}
.ia-engine-card__row:last-child {
  border-bottom: none;
}
.ia-engine-card__key {
  color: var(--text-secondary);
}
.ia-engine-card__val {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-primary);
}
.ia-engine-card__foot {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ia-engine-card__hint {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
</style>
