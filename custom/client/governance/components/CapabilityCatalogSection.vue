<!-- overlay/custom/client/governance/components/CapabilityCatalogSection.vue -->
<!-- 驾驭工程 B1：统一能力目录（三系只读聚合 + 登记/权限/版本/审计四要素缺口徽标 +
     分系/总体缺口率汇总）。数据面 /api/harness/capability-catalog；源缺席如实降级。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import {
  fetchCapabilityCatalog, type CapabilityCatalogDto, type CapabilityEntryDto, type CapabilitySourceId, type FactorKey,
} from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const data = ref<CapabilityCatalogDto | null>(null)
const error = ref('')
const busy = ref(false)
const sourceFilter = ref<CapabilitySourceId | 'all'>('all')

const SOURCE_LABELS = computed<Record<string, string>>(() => ({
  mcpcatalog: L.value.sourceMcpcatalog,
  extmarket: L.value.sourceExtmarket,
  'registry-admin': L.value.sourceRegistryAdmin,
}))
const FACTOR_LABELS = computed<Record<FactorKey, string>>(() => ({
  registered: L.value.factorRegistered,
  permission: L.value.factorPermission,
  version: L.value.factorVersion,
  audit: L.value.factorAudit,
}))
const FACTOR_ORDER: FactorKey[] = ['registered', 'permission', 'version', 'audit']

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchCapabilityCatalog(sourceFilter.value === 'all' ? undefined : sourceFilter.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function setFilter(f: CapabilitySourceId | 'all'): void {
  sourceFilter.value = f
  void refresh()
}

const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`
const fmtTime = (ts: number | null | undefined): string =>
  ts == null ? '—' : new Date(ts).toISOString().slice(0, 10)

const entries = computed<CapabilityEntryDto[]>(() => data.value?.entries ?? [])
const summary = computed(() => data.value?.gapSummary)

onMounted(() => void refresh())
</script>

<template>
  <div class="hc" data-testid="harness-catalog">
    <div class="hc__bar">
      <h3 class="hc__title">{{ L?.catalogTitle }}</h3>
      <span v-if="summary" class="hc__chip" data-testid="harness-catalog-summary">
        {{ L?.totalEntries }} {{ summary.totalEntries }} · {{ L?.gapRate }} {{ pct(summary.overall.gapRate) }} ·
        {{ L?.entriesWithAnyGap }} {{ summary.overall.entriesWithAnyGap }}
      </span>
      <button type="button" class="hc__refresh" data-testid="harness-catalog-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="hc__sub">{{ L?.catalogSub }}</p>
    <div v-if="error" class="hc__error">{{ L?.loadFailed }}：{{ error }}</div>

    <div class="hc__filters" role="tablist">
      <button
        v-for="opt in (['all', 'mcpcatalog', 'extmarket', 'registry-admin'] as const)"
        :key="opt" type="button"
        class="hc__filter" :class="{ 'hc__filter--active': sourceFilter === opt }"
        :data-testid="`harness-catalog-filter-${opt}`"
        @click="setFilter(opt)"
      >{{ opt === 'all' ? L?.sourceAll : SOURCE_LABELS[opt] }}</button>
    </div>

    <div v-if="data" class="hc__sources" data-testid="harness-catalog-sources">
      <span
        v-for="s in data.sources" :key="s.id"
        class="hc__sourcechip" :class="{ 'hc__sourcechip--off': !s.available }"
        :title="s.note || ''"
      >{{ SOURCE_LABELS[s.id] ?? s.id }}：{{ s.available ? s.count : L?.unavailable }}</span>
      <span v-for="(st, src) in summary?.bySource" :key="src" class="hc__sourcechip">
        {{ L?.gapRate }} {{ pct(st.gapRate) }}
      </span>
    </div>

    <div class="hc__tablewrap">
      <table class="hc__table" data-testid="harness-catalog-table">
        <thead>
          <tr>
            <th>{{ L?.colSource }}</th>
            <th>{{ L?.colKind }}</th>
            <th>{{ L?.colName }}</th>
            <th>{{ L?.colVersion }}</th>
            <th>{{ L?.colFactors }}</th>
            <th>{{ L?.colRegisteredAt }}</th>
            <th>{{ L?.colNote }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="entries.length === 0">
            <td colspan="7" class="hc__empty">{{ L?.catalogEmpty }}</td>
          </tr>
          <tr v-for="e in entries" :key="`${e.source}:${e.id}`" :data-testid="`harness-catalog-row-${e.id}`">
            <td>{{ SOURCE_LABELS[e.source] ?? e.source }}</td>
            <td><code>{{ e.kind }}</code></td>
            <td class="hc__name" :title="e.id">{{ e.name }}</td>
            <td>{{ e.version || L?.versionNone }}</td>
            <td>
              <span class="hc__factors">
                <span
                  v-for="f in FACTOR_ORDER" :key="f"
                  class="hc__badge" :class="e.factors[f] ? 'hc__badge--ok' : 'hc__badge--gap'"
                >{{ FACTOR_LABELS[f] }}</span>
              </span>
            </td>
            <td>{{ fmtTime(e.registeredAt) }}</td>
            <td class="hc__note">{{ e.note || e.auditTrail || '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data" class="hc__boundary" data-testid="harness-catalog-boundary">
      {{ L?.catalogBoundary }}：{{ data.meta.notDoing }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.hc { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.hc__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hc__title { margin: 0; font-size: 14px; }
.hc__chip { font-size: 12px; opacity: 0.85; }
.hc__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.hc__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.hc__error { color: var(--danger, #dc2626); font-size: 12px; }
.hc__filters { display: flex; gap: 4px; flex-wrap: wrap; }
.hc__filter { font-size: 12px; padding: 2px 8px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; background: transparent; cursor: pointer; &--active { background: var(--accent-primary, #3b82f6); color: #fff; border-color: transparent; } }
.hc__sources { display: flex; gap: 6px; flex-wrap: wrap; }
.hc__sourcechip { font-size: 11px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 0 6px; &--off { opacity: 0.55; border-style: dashed; } }
.hc__tablewrap { overflow: auto; max-height: 320px; }
.hc__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.hc__table th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--border-color, #e5e7eb); padding: 4px 6px; white-space: nowrap; }
.hc__table td { border-bottom: 1px solid var(--border-color, rgb(0 0 0 / 5%)); padding: 4px 6px; vertical-align: top; }
.hc__table code { font-size: 11px; background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; }
.hc__name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc__note { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc__factors { display: inline-flex; gap: 3px; }
.hc__badge { font-size: 10px; padding: 0 5px; border-radius: 8px; border: 1px solid; }
.hc__badge--ok { color: var(--ok-ink, #166534); border-color: var(--ok, #16a34a); background: rgb(134 239 172 / 25%); }
.hc__badge--gap { color: var(--danger, #dc2626); border-color: currentColor; background: rgb(254 202 202 / 25%); }
.hc__empty { text-align: center; opacity: 0.6; padding: 12px 0; }
.hc__boundary { font-size: 11.5px; color: var(--warning-ink, #92400e); background: rgb(254 243 199); border-radius: 6px; padding: 4px 8px; }
</style>
