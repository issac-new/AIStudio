<!-- overlay/custom/client/governance/components/MaturitySection.vue -->
<!-- 驾驭工程 B3：L1-L5 成熟度自检（阶梯 + 达成项证据 + 指标表）。
     自检清单非认证：达成项必须带证据；指标缺数据标 unavailable（不造数）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import { fetchMaturity, type MaturityDto, type MaturityLevelDto } from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const data = ref<MaturityDto | null>(null)
const error = ref('')
const busy = ref(false)
const days = ref(7)

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchMaturity(days.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function setDays(d: number): void {
  days.value = d
  void refresh()
}

const levels = computed<MaturityLevelDto[]>(() => data.value?.levels ?? [])
const fmtMetric = (v: number | null, unit: string): string => {
  if (v == null) return L.value.unavailableShort
  if (unit === 'ratio') return `${Math.round(v * 1000) / 10}%`
  return `${Math.round(v * 100) / 100} ${unit}`
}

onMounted(() => void refresh())
</script>

<template>
  <div class="hm" data-testid="harness-maturity">
    <div class="hm__bar">
      <h3 class="hm__title">{{ L?.maturityTitle }}</h3>
      <div class="hm__days" role="tablist">
        <button
          v-for="d in [7, 30, 90]" :key="d" type="button"
          class="hm__day" :class="{ 'hm__day--active': days === d }"
          :data-testid="`harness-maturity-days-${d}`"
          @click="setDays(d)"
        >{{ d }}{{ L?.days }}</button>
      </div>
      <button type="button" class="hm__refresh" data-testid="harness-maturity-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="hm__sub">{{ L?.maturitySub }}</p>
    <div v-if="error" class="hm__error">{{ L?.loadFailed }}：{{ error }}</div>
    <div v-if="data" class="hm__meta" data-testid="harness-maturity-note">{{ data.meta.note }}</div>

    <!-- L1-L5 阶梯 -->
    <div class="hm__ladder" data-testid="harness-maturity-ladder">
      <details
        v-for="lv in levels" :key="lv.key"
        class="hm__level" :class="{ 'hm__level--ok': lv.achieved === true, 'hm__level--fail': lv.achieved === false }"
        :data-testid="`harness-maturity-level-${lv.key}`"
      >
        <summary>
          <span class="hm__lvkey">{{ lv.key }}</span>
          <span class="hm__lvname">{{ lv.name }}</span>
          <span class="hm__lvstate" :class="`hm__lvstate--${lv.achieved === true ? 'ok' : lv.achieved === false ? 'fail' : 'na'}`">
            {{ lv.achieved === true ? L?.achieved : lv.achieved === false ? L?.notAchieved : L?.undetermined }}
          </span>
        </summary>
        <ul class="hm__items">
          <li v-for="(it, idx) in lv.items" :key="idx" class="hm__item" :data-testid="`harness-maturity-item-${lv.key}-${idx}`">
            <span class="hm__mark" :class="`hm__mark--${it.passed === true ? 'ok' : it.passed === false ? 'fail' : 'na'}`">
              {{ it.passed === true ? '✓' : it.passed === false ? '✗' : '?' }}
            </span>
            <div class="hm__itembody">
              <div class="hm__itemtitle">{{ it.title }}</div>
              <div class="hm__evidence">{{ L?.evidence }}：{{ it.evidence }}</div>
            </div>
          </li>
        </ul>
      </details>
    </div>

    <!-- 指标表 -->
    <div class="hm__tablewrap" data-testid="harness-maturity-metrics">
      <table class="hm__table">
        <thead>
          <tr>
            <th>{{ L?.metric }}</th>
            <th>{{ L?.value }}</th>
            <th>{{ L?.sourceCol }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in data?.metrics ?? []" :key="m.key" :data-testid="`harness-maturity-metric-${m.key}`">
            <td><code>{{ m.key }}</code></td>
            <td :class="{ 'hm__na': m.value == null }">{{ fmtMetric(m.value, m.unit) }}</td>
            <td class="hm__src">
              {{ m.source }}
              <span v-if="m.note" class="hm__metricnote">（{{ m.note }}）</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hm { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.hm__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hm__title { margin: 0; font-size: 14px; }
.hm__days { display: flex; gap: 4px; }
.hm__day { font-size: 11px; padding: 1px 7px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; background: transparent; cursor: pointer; &--active { background: var(--accent-primary, #3b82f6); color: #fff; border-color: transparent; } }
.hm__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.hm__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.hm__error { color: var(--danger, #dc2626); font-size: 12px; }
.hm__meta { font-size: 11.5px; color: var(--warning-ink, #92400e); background: rgb(254 243 199); border-radius: 6px; padding: 4px 8px; }
.hm__ladder { display: flex; flex-direction: column; gap: 4px; }
.hm__level { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 4px 8px; }
.hm__level--ok { border-color: var(--ok, #16a34a); }
.hm__level--fail { border-color: var(--danger, #dc2626); }
.hm__level summary { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; list-style: none; }
.hm__level summary::-webkit-details-marker { display: none; }
.hm__lvkey { font-weight: 600; font-size: 12px; }
.hm__lvstate { margin-left: auto; font-size: 11px; padding: 0 6px; border-radius: 8px; border: 1px solid; }
.hm__lvstate--ok { color: var(--ok-ink, #166534); border-color: var(--ok, #16a34a); }
.hm__lvstate--fail { color: var(--danger, #dc2626); border-color: currentColor; }
.hm__lvstate--na { color: var(--text-muted, #878c99); border-style: dashed; border-color: currentColor; }
.hm__items { margin: 6px 0 2px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.hm__item { display: flex; gap: 6px; align-items: flex-start; }
.hm__mark { font-size: 12px; width: 14px; flex-shrink: 0; text-align: center; }
.hm__mark--ok { color: var(--ok, #16a34a); }
.hm__mark--fail { color: var(--danger, #dc2626); }
.hm__mark--na { color: var(--text-muted, #878c99); }
.hm__itembody { display: flex; flex-direction: column; gap: 1px; }
.hm__itemtitle { font-size: 12.5px; }
.hm__evidence { font-size: 11px; opacity: 0.7; }
.hm__tablewrap { overflow: auto; }
.hm__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.hm__table th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--border-color, #e5e7eb); padding: 4px 6px; white-space: nowrap; }
.hm__table td { border-bottom: 1px solid var(--border-color, rgb(0 0 0 / 5%)); padding: 4px 6px; vertical-align: top; }
.hm__table code { font-size: 11px; background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; }
.hm__na { opacity: 0.55; font-style: italic; }
.hm__src { font-size: 11px; opacity: 0.75; }
.hm__metricnote { opacity: 0.8; }
</style>
