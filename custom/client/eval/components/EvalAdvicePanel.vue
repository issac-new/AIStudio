<!-- overlay/custom/client/eval/components/EvalAdvicePanel.vue -->
<!-- 优化建议面板（2026-10-14 阿里调研轮 A+F）：烧钱会话/瓶颈阶段/关卡拦截三张
     Top-N 清单 + 交付周期瀑布（CSS 条形）。数据源状态如实呈现（缺席标灰不造数）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type AdviceReportDto, type AdviceSessionDto, type AdviceStageDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval.advice : evalMessages.en.eval.advice
})

const report = ref<AdviceReportDto | null>(null)
const busy = ref(false)
const error = ref('')
const days = ref(7)

async function load(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const res = await evalApi.adviceReport(days.value)
    report.value = res.report
  } catch (e) {
    error.value = String((e as Error).message || e)
  } finally {
    busy.value = false
  }
}
onMounted(load)

function fmtSec(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`
  return `${(sec / 86400).toFixed(1)}d`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

const maxShare = computed(() => {
  const stages = report.value?.waterfall?.stages ?? []
  return Math.max(1, ...stages.map((s: AdviceStageDto) => s.sharePct))
})

const sessions = computed<AdviceSessionDto[]>(() => report.value?.tokenTop ?? [])
const stages = computed<AdviceStageDto[]>(() => report.value?.waterfall?.stages ?? [])
</script>

<template>
  <div class="advice" data-testid="eval-advice">
    <div class="advice__bar">
      <h2>{{ L.title }}</h2>
      <p class="muted">{{ L.sub }}</p>
      <div class="advice__ctrl">
        <select v-model.number="days" data-testid="eval-advice-days">
          <option :value="1">1d</option><option :value="7">7d</option><option :value="30">30d</option>
        </select>
        <button type="button" class="primary" data-testid="eval-advice-reload" :disabled="busy" @click="load">{{ L.reload }}</button>
      </div>
    </div>
    <p v-if="error" class="advice__error" data-testid="eval-advice-error">{{ error }}</p>

    <template v-if="report">
      <p class="advice__sources muted">
        {{ L.sources }}：
        <span v-for="s in report.sources" :key="s.id" :class="{ 'advice__src--off': !s.available }"
          :title="s.note || ''">{{ s.id }}{{ s.available ? '✓' : '✗' }}</span>
      </p>

      <h3>{{ L.tokenTitle }}</h3>
      <table class="advice__table" v-if="sessions.length">
        <thead><tr><th>{{ L.tokCol }}</th><th>{{ L.tokModel }}</th><th>{{ L.tokTokens }}</th><th>{{ L.tokCost }}</th></tr></thead>
        <tbody>
          <tr v-for="s in sessions" :key="s.id" :data-testid="`eval-advice-tok-${s.id}`">
            <td>{{ s.title || s.id }}</td><td>{{ s.model }}</td>
            <td>{{ fmtTokens(s.totalTokens) }}</td>
            <td>{{ s.estimatedCostUsd != null ? `$${s.estimatedCostUsd.toFixed(2)}` : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">{{ L.noData }}</p>

      <h3>{{ L.stageTitle }}</h3>
      <table class="advice__table" v-if="report.slowStages.length">
        <thead><tr><th>{{ L.stgCol }}</th><th>{{ L.stgMedian }}</th><th>{{ L.stgP90 }}</th><th>{{ L.stgTotal }}</th><th>{{ L.stgShare }}</th></tr></thead>
        <tbody>
          <tr v-for="s in report.slowStages" :key="s.stage">
            <td>{{ s.stage }}</td><td>{{ fmtSec(s.medianSec) }}</td><td>{{ fmtSec(s.p90Sec) }}</td>
            <td>{{ fmtSec(s.totalSec) }}</td><td>{{ s.sharePct }}%</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">{{ L.noData }}</p>

      <h3>{{ L.gateTitle }}</h3>
      <table class="advice__table" v-if="report.gateErrorTop.length">
        <thead><tr><th>{{ L.gateCol }}</th><th>{{ L.gateCount }}</th><th>{{ L.gateSample }}</th></tr></thead>
        <tbody>
          <tr v-for="g in report.gateErrorTop" :key="g.key" :data-testid="`eval-advice-gate-${g.key}`">
            <td>{{ g.gate }} / {{ g.reason }}</td><td>{{ g.count }}</td><td class="advice__sample">{{ g.sample }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">{{ L.noData }}</p>

      <h3>{{ L.waterfallTitle }}</h3>
      <div v-if="stages.length" class="advice__falls" data-testid="eval-advice-waterfall">
        <div v-for="s in stages" :key="s.stage" class="advice__fall">
          <span class="advice__fall-label">{{ s.stage }}</span>
          <span class="advice__fall-bar" :style="{ width: `${(s.sharePct / maxShare) * 100}%` }"></span>
          <span class="advice__fall-val">{{ s.sharePct }}% · {{ fmtSec(s.medianSec) }}</span>
        </div>
      </div>
      <p v-else class="muted">{{ L.noData }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.advice {
  display: flex; flex-direction: column; gap: 10px;
  &__bar { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  &__ctrl { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  &__error { color: #dc2626; }
  &__sources span { margin-right: 10px; font-size: 12px; }
  &__src--off { opacity: 0.45; text-decoration: line-through; }
  &__table { border-collapse: collapse; font-size: 13px; width: 100%;
    th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; } }
  &__sample { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__falls { display: flex; flex-direction: column; gap: 4px; max-width: 720px; }
  &__fall { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  &__fall-label { width: 110px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__fall-bar { height: 14px; background: #3b82f6; border-radius: 3px; min-width: 2px; }
  &__fall-val { white-space: nowrap; }
}
</style>
