<!-- overlay/custom/client/governance/components/CostAccountsSection.vue -->
<!-- 驾驭工程 B2：六类成本账（六卡片 + 口径提示）。每卡：主值 + 关键副值 + 可用性徽标；
     口径（_defs.definition + 源锚点）随卡片折叠展开，可对账到源。缺席=unavailable 不猜数。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import { fetchCostAccounts, type AccountKey, type CostAccountDto, type CostAccountsDto } from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const data = ref<CostAccountsDto | null>(null)
const error = ref('')
const busy = ref(false)
const days = ref(7)

const TITLE_KEYS = computed<Record<AccountKey, string>>(() => ({
  token: L.value.accToken,
  humanIntervention: L.value.accHuman,
  toolExecution: L.value.accTool,
  waitLatency: L.value.accWait,
  rework: L.value.accRework,
  securityGovernance: L.value.accSecurity,
}))

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchCostAccounts(days.value)
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

const accounts = computed<CostAccountDto[]>(() => data.value?.accounts ?? [])
const fmtNum = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString()

/** 各账主值行（键值对，按账型挑选关键数字；缺席账返回空数组） */
function rowsOf(acc: CostAccountDto): Array<{ label: string; value: string }> {
  const d = acc.data
  switch (acc.key) {
    case 'token': {
      const t = d as { sessionsCount: number | null; totalTokens: number | null }
      return [
        { label: L.value.totalTokens, value: fmtNum(t.totalTokens) },
        { label: L.value.sessions, value: fmtNum(t.sessionsCount) },
      ]
    }
    case 'humanIntervention': {
      const t = d as { events: number | null; byAction: Array<{ action: string; count: number }>; sampleCap: number }
      const top = t.byAction.slice(0, 2).map((a) => `${a.action}×${a.count}`).join(' · ')
      return [
        { label: L.value.events, value: fmtNum(t.events) },
        { label: L.value.sampleCapNote, value: String(t.sampleCap) },
        ...(top ? [{ label: 'Top', value: top }] : []),
      ]
    }
    case 'toolExecution': {
      const t = d as { auditToolActions: number | null; traceSpanCount: number | null }
      return [
        { label: L.value.events, value: fmtNum(t.auditToolActions) },
        { label: `${L.value.traceSpans}`, value: fmtNum(t.traceSpanCount) },
      ]
    }
    case 'waitLatency': {
      const t = d as { tasksDone: number | null; avgSeconds: number | null; medianSeconds: number | null }
      return [
        { label: L.value.doneTasks, value: fmtNum(t.tasksDone) },
        { label: L.value.avg, value: t.avgSeconds == null ? '—' : `${t.avgSeconds}s` },
        { label: L.value.median, value: t.medianSeconds == null ? '—' : `${t.medianSeconds}s` },
      ]
    }
    case 'rework': {
      const t = d as { requests: number | null; reworkHours: number | null }
      return [
        { label: L.value.reworkHours, value: t.reworkHours == null ? '—' : `${Math.round(t.reworkHours * 10) / 10}h` },
        { label: L.value.requests, value: fmtNum(t.requests) },
      ]
    }
    case 'securityGovernance': {
      const t = d as { severityBuckets: { high: number; medium: number; low: number }; freezeWindows: { total: number | null; active: number | null } }
      return [
        { label: `${L.value.severityHigh}/${L.value.severityMedium}/${L.value.severityLow}`, value: `${t.severityBuckets.high}/${t.severityBuckets.medium}/${t.severityBuckets.low}` },
        { label: L.value.freezeWindows, value: t.freezeWindows.total == null ? '—' : `${t.freezeWindows.total}（${L.value.active} ${t.freezeWindows.active ?? '—'}）` },
      ]
    }
    default:
      return []
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="hcost" data-testid="harness-cost">
    <div class="hcost__bar">
      <h3 class="hcost__title">{{ L?.costTitle }}</h3>
      <span v-if="data" class="hcost__chip">{{ L?.costWindow }}：{{ data.days }} {{ L?.days }}</span>
      <div class="hcost__days" role="tablist">
        <button
          v-for="d in [7, 30, 90]" :key="d" type="button"
          class="hcost__day" :class="{ 'hcost__day--active': days === d }"
          :data-testid="`harness-cost-days-${d}`"
          @click="setDays(d)"
        >{{ d }}{{ L?.days }}</button>
      </div>
      <button type="button" class="hcost__refresh" data-testid="harness-cost-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="hcost__sub">{{ L?.costSub }}</p>
    <div v-if="error" class="hcost__error">{{ L?.loadFailed }}：{{ error }}</div>

    <div class="hcost__grid" data-testid="harness-cost-grid">
      <div
        v-for="acc in accounts" :key="acc.key"
        class="hcost__card" :class="{ 'hcost__card--off': !acc.available }"
        :data-testid="`harness-cost-card-${acc.key}`"
      >
        <div class="hcost__cardhead">
          <b>{{ data?._defs[acc.key]?.title ?? TITLE_KEYS[acc.key] }}</b>
          <span class="hcost__avail" :class="acc.available ? 'hcost__avail--ok' : 'hcost__avail--off'">
            {{ acc.available ? 'OK' : L?.accountUnavailable }}
          </span>
        </div>
        <div class="hcost__rows">
          <div v-for="row in rowsOf(acc)" :key="row.label" class="hcost__row">
            <span class="hcost__rowlabel">{{ row.label }}</span>
            <span class="hcost__rowvalue">{{ row.value }}</span>
          </div>
          <div v-if="!acc.available && acc.note" class="hcost__note">{{ acc.note }}</div>
        </div>
        <details v-if="data" class="hcost__def">
          <summary>{{ L?.caliber }}</summary>
          <p class="hcost__deftext">{{ data._defs[acc.key]?.definition }}</p>
          <ul class="hcost__defsrc">
            <li v-for="s in data._defs[acc.key]?.sources ?? []" :key="s"><code>{{ s }}</code></li>
          </ul>
        </details>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hcost { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.hcost__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hcost__title { margin: 0; font-size: 14px; }
.hcost__chip { font-size: 12px; opacity: 0.85; }
.hcost__days { display: flex; gap: 4px; margin-left: 8px; }
.hcost__day { font-size: 11px; padding: 1px 7px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; background: transparent; cursor: pointer; &--active { background: var(--accent-primary, #3b82f6); color: #fff; border-color: transparent; } }
.hcost__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.hcost__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.hcost__error { color: var(--danger, #dc2626); font-size: 12px; }
.hcost__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
.hcost__card { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.hcost__card--off { opacity: 0.75; }
.hcost__cardhead { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 13px; }
.hcost__avail { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid; }
.hcost__avail--ok { color: var(--ok-ink, #166534); border-color: var(--ok, #16a34a); }
.hcost__avail--off { color: var(--warning-ink, #92400e); border-color: var(--warning, #f59e0b); border-style: dashed; }
.hcost__rows { display: flex; flex-direction: column; gap: 2px; }
.hcost__row { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; }
.hcost__rowlabel { opacity: 0.7; }
.hcost__rowvalue { font-variant-numeric: tabular-nums; }
.hcost__note { font-size: 11px; opacity: 0.7; }
.hcost__def { font-size: 11px; border-top: 1px dashed var(--border-color, #e5e7eb); padding-top: 4px; }
.hcost__def summary { cursor: pointer; opacity: 0.75; }
.hcost__deftext { margin: 4px 0 2px; }
.hcost__defsrc { margin: 0; padding-left: 14px; }
.hcost__defsrc code { font-size: 10px; word-break: break-all; }
</style>
