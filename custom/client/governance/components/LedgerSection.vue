<!-- overlay/custom/client/governance/components/LedgerSection.vue -->
<!-- 能力台账区（4A 治理层，spec 2026-09-29 §3.5）：治理中心的第三区块。
     能力树（L1 域→L2 能力项→L3 单元）+ 生命周期/SLO 徽标 + 保鲜告警 +
     主承载缺口 + 语义指标层（判定词表 + 指标定义）。
     数据全真实：/api/governance/ledger 与 /api/governance/metrics-defs，
     单一事实源 runtime/governance/*.yaml（git 内）；缺失如实空态不编造。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchGovernanceLedger, fetchMetricsDefs,
  type GovernanceLedger, type GovernanceMetricsDefs,
  type LedgerUnit,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { ledger: Record<string, string> }).ledger
})

const ledger = ref<GovernanceLedger | null>(null)
const metrics = ref<GovernanceMetricsDefs | null>(null)
const error = ref('')

/** L1→L2→L3 树（服务端已校验，这里纯投影）。 */
const tree = computed(() => {
  const doc = ledger.value?.doc
  if (!doc) return []
  return doc.domains.map((d) => ({
    ...d,
    capabilities: doc.capabilities
      .filter((c) => c.domain === d.id)
      .map((c) => ({
        ...c,
        units: doc.units.filter((u) => u.capability === c.id),
      })),
  }))
})

const LIFECYCLE_KEYS: Record<string, string> = {
  introduced: 'lcIntroduced', active: 'lcActive', sustaining: 'lcSustaining',
  'retire-candidate': 'lcRetireCandidate', retired: 'lcRetired',
}
function lifecycleLabel(u: LedgerUnit): string {
  const key = LIFECYCLE_KEYS[u.lifecycle]
  return key ? (L.value?.[key] ?? u.lifecycle) : u.lifecycle
}

async function refresh(): Promise<void> {
  error.value = ''
  try {
    ledger.value = await fetchGovernanceLedger()
    metrics.value = await fetchMetricsDefs()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="ledger" data-testid="gov-ledger">
    <div class="ledger__bar">
      <h3 class="ledger__title">{{ L?.title }}</h3>
      <template v-if="ledger?.stats">
        <span class="ledger__chip" data-testid="ledger-counts">
          {{ ledger.stats.counts.domains }} {{ L?.domains }} · {{ ledger.stats.counts.capabilities }} {{ L?.capabilities }} · {{ ledger.stats.counts.units }} {{ L?.units }}
        </span>
        <span v-if="ledger.stats.stale.length" class="ledger__chip is-warn" data-testid="ledger-stale">
          ⚠ {{ ledger.stats.stale.length }} {{ L?.stale }}
        </span>
        <span v-if="ledger.stats.primaryGaps.length" class="ledger__chip is-bad" data-testid="ledger-gaps">
          ✕ {{ ledger.stats.primaryGaps.length }} {{ L?.primaryGaps }}
        </span>
        <span v-if="ledger.problems.length" class="ledger__chip is-bad" data-testid="ledger-problems">
          ✕ {{ ledger.problems.length }} {{ L?.problems }}
        </span>
      </template>
      <span v-if="ledger?.doc" class="ledger__reviewed">{{ L?.reviewedAt }}: {{ ledger.doc.reviewedAt }}</span>
    </div>
    <div v-if="error" class="ledger__error">{{ error }}</div>
    <div v-else-if="ledger && !ledger.exists" class="ledger__empty">{{ L?.missing }}</div>
    <div v-else-if="!ledger" class="ledger__empty">…</div>

    <template v-else>
      <!-- 能力树 -->
      <div class="ledger__tree">
        <div v-for="d in tree" :key="d.id" class="ledger__domain" :data-testid="`ledger-domain-${d.id}`">
          <div class="ledger__domain-name">{{ d.name }}<span class="ledger__owner">{{ d.owner }}</span></div>
          <div v-for="c in d.capabilities" :key="c.id" class="ledger__cap">
            <div class="ledger__cap-head">
              <span class="ledger__cap-name">{{ c.name }}</span>
              <span class="ledger__cap-id">{{ c.id }}</span>
              <span class="ledger__cap-oa">{{ c.object }} · {{ c.action }}</span>
            </div>
            <div class="ledger__units">
              <div
                v-for="u in c.units"
                :key="u.id"
                class="ledger__unit"
                :class="{ 'is-primary': u.primary }"
                :data-testid="`ledger-unit-${u.id}`"
                :title="u.refs?.note || u.refs?.file || ''"
              >
                <span class="ledger__unit-id">{{ u.id }}</span>
                <span v-if="u.primary" class="ledger__badge is-primary">{{ L?.primary }}</span>
                <span class="ledger__badge" :class="`is-lc-${u.lifecycle}`">{{ lifecycleLabel(u) }}</span>
                <span class="ledger__badge" :class="`is-slo-${u.sloTier}`">{{ u.sloTier }}</span>
                <span class="ledger__unit-meta">{{ u.kind }} · {{ u.owner }} · {{ u.reviewedAt }}</span>
              </div>
              <div v-if="!c.units.length" class="ledger__gap">{{ L?.noUnit }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 语义指标层 -->
      <div v-if="metrics?.doc" class="ledger__metrics" data-testid="ledger-metrics">
        <h4 class="ledger__sub-title">{{ L?.metricsTitle }}<span class="ledger__reviewed">{{ L?.reviewedAt }}: {{ metrics.doc.reviewedAt }}</span></h4>
        <div class="ledger__verdicts">
          <span
            v-for="v in metrics.doc.verdicts"
            :key="v.id"
            class="ledger__badge is-verdict"
            :title="v.semantics"
            :data-testid="`ledger-verdict-${v.id}`"
          >{{ v.id }} · {{ v.label }}</span>
        </div>
        <table class="ledger__table">
          <thead>
            <tr><th>{{ L?.colMetric }}</th><th>{{ L?.colFormula }}</th><th>{{ L?.colDimensions }}</th><th>{{ L?.colAuthority }}</th><th>{{ L?.colStatus }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in metrics.doc.metrics" :key="m.id" :data-testid="`ledger-metric-${m.id}`">
              <td><b>{{ m.name }}</b><div class="ledger__cap-id">{{ m.id }}</div></td>
              <td class="ledger__formula">{{ m.formula }}</td>
              <td>{{ m.dimensions.join(' / ') }}</td>
              <td>{{ m.authority }}</td>
              <td><span class="ledger__badge" :class="m.status === 'live' ? 'is-lc-active' : 'is-lc-sustaining'">{{ m.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ledger {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ledger__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ledger__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #878c99);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ledger__sub-title { margin: 4px 0; font-size: 12px; font-weight: 600; display: flex; gap: 10px; align-items: baseline; }
.ledger__chip { font-size: 10.5px; color: var(--text-muted, #878c99); border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 1px 8px;
  &.is-warn { color: #b45309; border-color: #b4530955; background: #fef3c7; }
  &.is-bad { color: #b91c1c; border-color: #b91c1c55; background: #fee2e2; } }
.ledger__reviewed { margin-left: auto; font-size: 10px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.ledger__error { color: #dc2626; font-size: 12px; }
.ledger__empty { border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 16px; text-align: center; font-size: 12px; color: var(--text-muted, #878c99); }

.ledger__tree { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px; }
.ledger__domain { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px 10px; }
.ledger__domain-name { font-size: 12px; font-weight: 700; display: flex; gap: 8px; align-items: baseline; }
.ledger__owner { font-size: 10px; color: var(--text-muted, #878c99); font-weight: 400; }
.ledger__cap { margin-top: 6px; }
.ledger__cap-head { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.ledger__cap-name { font-size: 11.5px; font-weight: 600; }
.ledger__cap-id { font-size: 9.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.ledger__cap-oa { font-size: 10px; color: var(--text-muted, #878c99); }
.ledger__units { margin: 3px 0 0 8px; display: flex; flex-direction: column; gap: 3px; }
.ledger__unit { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; font-size: 11px; padding: 2px 6px; border-radius: 5px;
  &.is-primary { background: rgba(22, 163, 74, 0.06); } }
.ledger__unit-id { font-family: ui-monospace, monospace; font-size: 10.5px; font-weight: 600; }
.ledger__unit-meta { font-size: 9.5px; color: var(--text-muted, #878c99); }
.ledger__gap { font-size: 10.5px; color: #b91c1c; }
.ledger__badge { font-size: 9.5px; font-weight: 700; border-radius: 4px; padding: 0 6px; line-height: 1.6;
  &.is-primary { color: #15803d; background: #dcfce7; }
  &.is-lc-introduced { color: #1d4ed8; background: #dbeafe; }
  &.is-lc-active { color: #15803d; background: #dcfce7; }
  &.is-lc-sustaining { color: #64748b; background: #f1f5f9; }
  &.is-lc-retire-candidate { color: #b45309; background: #fef3c7; }
  &.is-lc-retired { color: #6b7280; background: #e5e7eb; text-decoration: line-through; }
  &.is-slo-core { color: #b91c1c; background: #fee2e2; }
  &.is-slo-important { color: #b45309; background: #fef3c7; }
  &.is-slo-general { color: #64748b; background: #f1f5f9; }
  &.is-verdict { color: #334155; background: #f1f5f9; font-family: ui-monospace, monospace; } }

.ledger__metrics { border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 8px; }
.ledger__verdicts { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px; }
.ledger__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted, #878c99); font-weight: 600; padding: 3px 8px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  td { padding: 4px 8px 4px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); vertical-align: top; } }
.ledger__formula { max-width: 420px; }
</style>
