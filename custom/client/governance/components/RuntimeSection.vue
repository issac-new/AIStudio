<!-- overlay/custom/client/governance/components/RuntimeSection.vue -->
<!-- 运行态区（4A 治理层第二期 ②③④）：消费关系（零调用候选/名册外活动）+
     SLO 实况（分档成功率/p95/错误预算）+ 成本归集（provider/profile 分桶）。
     数据全真实：/api/governance/usage、slo、cost-summary；库缺席如实空态。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchUsage, fetchSlo, fetchCostSummary,
  type UsageReport, type SloReport, type CostSummary,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { runtime: Record<string, string> }).runtime
})

const usage = ref<UsageReport | null>(null)
const slo = ref<SloReport | null>(null)
const cost = ref<CostSummary | null>(null)
const error = ref('')

function pct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}
function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  if (s < 3600) return `${Math.round(s / 60)}min`
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`
  return `${(s / 86400).toFixed(1)}d`
}
function fmtDays(d: number | null): string {
  return d == null ? '—' : `${d}d`
}
function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}
function fmtCost(v: number, currency: string): string {
  return `${currency} ${v.toFixed(2)}`
}
function fmtTime(ts: number | null): string {
  return ts ? new Date(ts).toLocaleDateString() : '—'
}

async function refresh(): Promise<void> {
  error.value = ''
  try {
    ;[usage.value, slo.value, cost.value] = await Promise.all([fetchUsage(), fetchSlo(), fetchCostSummary(30)])
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="runtime" data-testid="gov-runtime">
    <div class="runtime__bar">
      <h3 class="runtime__title">{{ L?.title }}</h3>
      <span v-if="slo" class="runtime__chip" data-testid="runtime-budget-mode">SLO {{ L?.budgetMode }}: {{ slo.budgetMode }}</span>
      <span v-if="usage?.zeroUseCandidates.length" class="runtime__chip is-warn" data-testid="runtime-zero-use">
        ⚠ {{ usage.zeroUseCandidates.length }} {{ L?.zeroUse }}
      </span>
      <span v-for="t in (slo?.tiers ?? []).filter(x => x.exhausted)" :key="t.tier" class="runtime__chip is-bad" :data-testid="`runtime-exhausted-${t.tier}`">
        ✕ {{ t.tier }} {{ L?.exhausted }}
      </span>
    </div>
    <div v-if="error" class="runtime__error">{{ error }}</div>

    <div class="runtime__grid">
      <!-- ② 消费关系 -->
      <section class="runtime__card" data-testid="runtime-usage">
        <h4 class="runtime__card-title">{{ L?.usageTitle }}</h4>
        <template v-if="usage">
          <div v-if="usage.zeroUseCandidates.length" class="runtime__row">
            <span class="runtime__label">{{ L?.zeroUse }}</span>
            <span v-for="u in usage.zeroUseCandidates" :key="u.unitId" class="runtime__tag is-warn" :data-testid="`usage-zero-${u.unitId}`">
              {{ u.unitId }}<template v-if="u.daysSinceUse != null"> · {{ fmtDays(u.daysSinceUse) }}</template><template v-else> · {{ L?.neverUsed }}</template>
            </span>
          </div>
          <div v-else class="runtime__ok" data-testid="usage-zero-none">{{ L?.noZeroUse }}</div>
          <div v-if="usage.unmappedAssignees.length" class="runtime__row">
            <span class="runtime__label">{{ L?.unmapped }}</span>
            <span v-for="a in usage.unmappedAssignees.slice(0, 6)" :key="a.assignee" class="runtime__tag is-bad" :data-testid="`usage-unmapped-${a.assignee}`" :title="`${L?.unmappedHint} · ${fmtTime(a.lastActiveAt)}`">
              {{ a.assignee }} · {{ a.total }}
            </span>
          </div>
          <!-- 第三期：dispatch.successRate / gate.passRate 本地实况 -->
          <div v-if="usage.dispatchStats" class="runtime__row" data-testid="runtime-dispatch">
            <span class="runtime__label">{{ L?.dispatch }}</span>
            <span class="runtime__tag">{{ usage.dispatchStats.delivered }}/{{ usage.dispatchStats.dispatched }} {{ L?.delivered }}</span>
            <span class="runtime__tag" :class="usage.dispatchStats.deliveredRate != null && usage.dispatchStats.deliveredRate < 0.9 ? 'is-warn' : 'is-ok'">
              {{ pct(usage.dispatchStats.deliveredRate) }}
            </span>
            <span v-for="b in usage.dispatchStats.byUnit.slice(0, 4)" :key="b.key" class="runtime__tag" :data-testid="`dispatch-unit-${b.key}`">{{ b.key }} {{ pct(b.rate) }}</span>
          </div>
          <div v-if="usage.gateStats && usage.gateStats.runs > 0" class="runtime__row" data-testid="runtime-gate">
            <span class="runtime__label">{{ L?.gate }}</span>
            <span class="runtime__tag" :class="usage.gateStats.passRate != null && usage.gateStats.passRate < 0.9 ? 'is-warn' : 'is-ok'">{{ pct(usage.gateStats.passRate) }}</span>
            <span class="runtime__tag">{{ usage.gateStats.runs }} {{ L?.gateRuns }}</span>
            <span v-if="usage.gateStats.lastAt" class="runtime__tag">{{ fmtTime(usage.gateStats.lastAt) }}</span>
          </div>
        </template>
        <div v-else class="runtime__empty">…</div>
      </section>

      <!-- ③ SLO 实况 -->
      <section class="runtime__card" data-testid="runtime-slo">
        <h4 class="runtime__card-title">{{ L?.sloTitle }}<span class="runtime__window">{{ slo?.windowDays ?? 30 }}d</span></h4>
        <template v-if="slo">
          <div v-if="!slo.dataAvailable" class="runtime__empty">{{ L?.sloNoData }}</div>
          <table v-else class="runtime__table">
            <thead><tr><th>{{ L?.colTier }}</th><th>{{ L?.colRate }}</th><th>{{ L?.colTarget }}</th><th>P95</th><th>{{ L?.colClosed }}</th><th>{{ L?.colBudget }}</th></tr></thead>
            <tbody>
              <tr v-for="t in slo.tiers" :key="t.tier" :class="{ 'is-exhausted': t.exhausted }" :data-testid="`slo-tier-${t.tier}`">
                <td><b>{{ t.tier }}</b></td>
                <td>{{ pct(t.successRate) }}</td>
                <td>{{ t.target ? pct(t.target.successRate) : '—' }}</td>
                <td>{{ fmtDuration(t.p95DurationS) }}</td>
                <td>{{ t.done }}/{{ t.closed }}</td>
                <td>
                  <span v-if="t.exhausted" class="runtime__tag is-bad">{{ L?.exhausted }}</span>
                  <span v-else-if="t.note" class="runtime__tag" :title="t.note">{{ L?.suspended }}</span>
                  <span v-else class="runtime__tag is-ok">{{ L?.inBudget }}</span>
                </td>
              </tr>
              <tr v-if="slo.unmapped.closed > 0" data-testid="slo-unmapped">
                <td>{{ L?.unmappedTier }}</td>
                <td>{{ pct(slo.unmapped.successRate) }}</td>
                <td>—</td><td>—</td>
                <td>{{ slo.unmapped.done }}/{{ slo.unmapped.closed }}</td>
                <td><span class="runtime__tag">{{ slo.unmapped.assignees.length }} {{ L?.assignees }}</span></td>
              </tr>
            </tbody>
          </table>
        </template>
        <div v-else class="runtime__empty">…</div>
      </section>

      <!-- ④ 成本归集 -->
      <section class="runtime__card" data-testid="runtime-cost">
        <h4 class="runtime__card-title">{{ L?.costTitle }}<span class="runtime__window">{{ cost?.days ?? 30 }}d</span></h4>
        <template v-if="cost">
          <div v-if="!cost.dbFound" class="runtime__empty">{{ L?.costNoDb }}</div>
          <div v-else-if="cost.rows === 0" class="runtime__empty" data-testid="cost-empty">{{ L?.costNoRows }}</div>
          <template v-else>
            <div class="runtime__row runtime__total" data-testid="cost-total">
              <b>{{ L?.colTotal }}</b>
              <span>{{ cost.total.calls }} {{ L?.calls }} · {{ fmtTokens(cost.total.inputTokens) }}+{{ fmtTokens(cost.total.outputTokens) }} tok</span>
              <span>{{ fmtCost(cost.total.costIdle, cost.currency) }} ~ {{ fmtCost(cost.total.costPeak, cost.currency) }}</span>
            </div>
            <table class="runtime__table">
              <thead><tr><th>provider</th><th>{{ L?.calls }}</th><th>tokens</th><th>{{ L?.colCost }}</th></tr></thead>
              <tbody>
                <tr v-for="b in cost.byProvider.slice(0, 6)" :key="b.key" :data-testid="`cost-provider-${b.key}`">
                  <td><b>{{ b.key }}</b><span v-if="b.unpricedRows" class="runtime__tag is-warn" :title="L?.unpricedHint">{{ b.unpricedRows }} {{ L?.unpriced }}</span></td>
                  <td>{{ b.calls }}</td>
                  <td>{{ fmtTokens(b.inputTokens) }}+{{ fmtTokens(b.outputTokens) }}</td>
                  <td>{{ fmtCost(b.costIdle, cost.currency) }} ~ {{ fmtCost(b.costPeak, cost.currency) }}</td>
                </tr>
              </tbody>
            </table>
            <table v-if="cost.byCapability?.length" class="runtime__table">
              <thead><tr><th>{{ L?.colCapability }}</th><th>{{ L?.calls }}</th><th>tokens</th><th>{{ L?.colCost }}</th></tr></thead>
              <tbody>
                <tr v-for="b in cost.byCapability.slice(0, 5)" :key="b.key" :data-testid="`cost-capability-${b.key}`">
                  <td><b>{{ b.key }}</b></td>
                  <td>{{ b.calls }}</td>
                  <td>{{ fmtTokens(b.inputTokens) }}+{{ fmtTokens(b.outputTokens) }}</td>
                  <td>{{ fmtCost(b.costIdle, cost.currency) }} ~ {{ fmtCost(b.costPeak, cost.currency) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="cost.pricingMissing.length" class="runtime__missing">{{ L?.pricingMissing }}: {{ cost.pricingMissing.join(', ') }}</div>
          </template>
        </template>
        <div v-else class="runtime__empty">…</div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.runtime {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.runtime__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.runtime__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #878c99);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.runtime__chip { font-size: 10.5px; color: var(--text-muted, #878c99); border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 1px 8px;
  &.is-warn { color: #b45309; border-color: #b4530955; background: #fef3c7; }
  &.is-bad { color: #b91c1c; border-color: #b91c1c55; background: #fee2e2; } }
.runtime__error { color: #dc2626; font-size: 12px; }
.runtime__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 8px; }
.runtime__card { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px 10px; }
.runtime__card-title { margin: 0 0 6px; font-size: 11.5px; font-weight: 700; display: flex; gap: 8px; align-items: baseline; }
.runtime__window { font-size: 9.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.runtime__row { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; margin: 3px 0; }
.runtime__label { font-size: 10.5px; color: var(--text-muted, #878c99); }
.runtime__tag { font-size: 9.5px; font-weight: 700; border-radius: 4px; padding: 0 6px; line-height: 1.6; color: #334155; background: #f1f5f9;
  &.is-warn { color: #b45309; background: #fef3c7; }
  &.is-bad { color: #b91c1c; background: #fee2e2; }
  &.is-ok { color: #15803d; background: #dcfce7; } }
.runtime__ok { font-size: 10.5px; color: #15803d; }
.runtime__empty { font-size: 10.5px; color: var(--text-muted, #878c99); }
.runtime__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted, #878c99); font-weight: 600; padding: 2px 8px 2px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  td { padding: 3px 8px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  tr.is-exhausted td { background: #fef2f2; } }
.runtime__total { font-size: 10.5px; gap: 10px; }
.runtime__missing { font-size: 9.5px; color: #b45309; margin-top: 4px; }
</style>
