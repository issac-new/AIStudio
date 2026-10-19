<!-- overlay/custom/client/eval/components/MetricRegistryPanel.vue
     指标治理（百度评测范式轮 §4）：指标 → 动作绑定、装饰候选告警、消费证据与
     能力维度覆盖。数据源 GET /api/hermes/eval/metric-registry。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type CoverageDto, type MetricRegistryDto, type MetricDefDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

const registry = ref<MetricRegistryDto | null>(null)
const coverage = ref<CoverageDto | null>(null)
const loading = ref(false)
const error = ref('')

const LAYER_LABELS: Record<string, { zh: string; en: string }> = {
  result: { zh: '结果', en: 'Result' },
  trajectory: { zh: '轨迹', en: 'Trajectory' },
  process: { zh: '过程', en: 'Process' },
  efficiency: { zh: '效率', en: 'Efficiency' },
  risk: { zh: '红线', en: 'Risk' },
  reliability: { zh: '可靠性', en: 'Reliability' },
  safety: { zh: '安全', en: 'Safety' },
  coverage: { zh: '覆盖', en: 'Coverage' },
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await evalApi.metricRegistry()
    registry.value = res.registry
    coverage.value = res.coverage
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

function actionLabel(key: string): string {
  const action = registry.value?.actions.find((a) => a.key === key)
  if (!action) return key
  return zh.value ? action.zh : action.en
}

function metricName(def: MetricDefDto): string {
  return zh.value ? def.zh : def.en
}

function directionLabel(def: MetricDefDto): string {
  return L.value.metrics.direction[def.direction]
}

function observedOf(action: string): number {
  return registry.value?.consumption.observations.find((o) => o.action === action)?.observed ?? 0
}

function evidenceText(def: MetricDefDto): string {
  return def.drives
    .filter((d) => d !== 'report_only')
    .map((d) => `${actionLabel(d)} ${observedOf(d)}`)
    .join(' · ') || '—'
}

const grouped = computed(() => {
  const order = ['result', 'trajectory', 'process', 'efficiency', 'risk', 'reliability', 'safety', 'coverage']
  const groups: Array<{ layer: string; label: string; metrics: MetricDefDto[] }> = []
  for (const layer of order) {
    const metrics = registry.value?.metrics.filter((m) => m.layer === layer) ?? []
    if (!metrics.length) continue
    const label = LAYER_LABELS[layer]
    groups.push({ layer, label: label ? (zh.value ? label.zh : label.en) : layer, metrics })
  }
  return groups
})

const maxCoverageTasks = computed(() => Math.max(1, ...(coverage.value?.dimensions.map((d) => d.taskCount) ?? [1])))
</script>

<template>
  <section class="mr" data-testid="eval-metric-registry">
    <div class="mr__bar">
      <div>
        <h2>{{ L.metrics.title }}</h2>
        <p class="muted">{{ L.metrics.sub }}</p>
      </div>
      <button type="button" data-testid="eval-metric-reload" @click="load">{{ L.advice.reload }}</button>
    </div>

    <p v-if="error" class="mr__error">{{ error }}</p>
    <p v-else-if="loading" class="muted">{{ L.loading }}</p>
    <template v-else-if="registry">
      <div class="mr__summary" data-testid="eval-metric-summary">
        <div class="stat"><span class="muted">{{ L.metrics.total }}</span><strong>{{ registry.consumption.summary.total }}</strong></div>
        <div class="stat"><span class="muted">{{ L.metrics.wired }}</span><strong class="ok">{{ registry.consumption.summary.wired }}</strong></div>
        <div class="stat"><span class="muted">{{ L.metrics.unwired }}</span><strong>{{ registry.consumption.summary.unwired }}</strong></div>
        <div class="stat"><span class="muted">{{ L.metrics.decoration }}</span><strong class="warn">{{ registry.consumption.summary.decoration }}</strong></div>
      </div>

      <p v-if="registry.consumption.summary.wired === 0" class="mr__warn" data-testid="eval-metric-empty-ledger">
        {{ L.metrics.emptyLedger }}
      </p>

      <details class="mr__consumption" data-testid="eval-metric-consumption">
        <summary>{{ L.metrics.consumption }}</summary>
        <table class="mr-table">
          <thead><tr><th>action</th><th>{{ L.metrics.colEvidence }}</th></tr></thead>
          <tbody>
            <tr v-for="o in registry.consumption.observations" :key="o.action">
              <td>{{ actionLabel(o.action) }}</td>
              <td :class="{ muted: o.observed === 0 }">{{ o.observed }} · {{ o.label }}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <p class="mr__boundary muted">{{ L.metrics.boundary }}：{{ registry.boundary }}</p>

      <div v-for="group in grouped" :key="group.layer" class="mr__group">
        <h3>{{ group.label }}</h3>
        <table class="mr-table">
          <thead>
            <tr>
              <th>{{ L.metrics.colMetric }}</th>
              <th>{{ L.metrics.colDirection }}</th>
              <th>{{ L.metrics.colDrives }}</th>
              <th>{{ L.metrics.colEvidence }}</th>
              <th>{{ L.metrics.colStatus }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="def in group.metrics"
              :key="def.key"
              :class="{ decoration: def.decoration }"
              :data-testid="`eval-metric-${def.key}`"
            >
              <td>
                <span class="mono">{{ def.key }}</span>
                <div class="mr__name">{{ metricName(def) }}</div>
              </td>
              <td>{{ directionLabel(def) }}</td>
              <td>
                <span v-for="d in def.drives" :key="d" class="chip chip-action">{{ actionLabel(d) }}</span>
              </td>
              <td class="mono small">{{ evidenceText(def) }}</td>
              <td>
                <span v-if="def.decoration" class="chip chip-warn" :title="def.gap">{{ L.metrics.decorationBadge }}</span>
                <span v-else-if="def.wired" class="chip chip-ok">{{ L.metrics.wiredYes }}</span>
                <span v-else class="chip" :title="def.gap">{{ L.metrics.wiredNo }}</span>
                <div v-if="def.gap" class="mr__gap">{{ L.metrics.gap }}：{{ def.gap }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="coverage" class="mr__coverage" data-testid="eval-dimension-coverage">
        <div class="mr__bar">
          <div>
            <h3>{{ L.metrics.coverageTitle }}</h3>
            <p class="muted">{{ L.metrics.coverageSub }}</p>
          </div>
          <span class="chip">{{ L.metrics.covered }} {{ coverage.covered }}/{{ coverage.total }}</span>
        </div>
        <div class="cov">
          <div v-for="d in coverage.dimensions" :key="d.key" class="cov__row">
            <span class="cov__name">{{ zh ? d.zh : d.en }}</span>
            <div class="cov__bar"><i :style="{ width: `${Math.round((d.taskCount / maxCoverageTasks) * 100)}%` }" /></div>
            <span class="cov__num mono">{{ d.taskCount }}</span>
            <span class="cov__sets muted">{{ L.metrics.setCount }} {{ d.setCount }}</span>
          </div>
        </div>
        <p class="muted" data-testid="eval-untagged">{{ L.metrics.untagged }}：{{ coverage.untaggedTasks }} / {{ coverage.taskTotal }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.mr { display: flex; flex-direction: column; gap: 14px; }
.mr__bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  h2, h3 { margin: 0; font-size: 15px; }
  p { margin: 2px 0 0; font-size: 12px; }
  button { border: 1px solid var(--border-color); background: transparent; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
}
.mr__error { color: var(--danger); }
.mr__warn { color: var(--warning); font-size: 12px; margin: 0; }
.mr__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.stat { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px;
  strong { font-size: 22px; &.ok { color: var(--success); } &.warn { color: var(--warning); } }
}
.mr__consumption { font-size: 12px; summary { cursor: pointer; opacity: 0.85; } }
.mr__boundary { font-size: 11px; }
.mr__group { display: flex; flex-direction: column; gap: 6px;
  h3 { margin: 6px 0 0; font-size: 13px; opacity: 0.8; }
}
.mr-table { width: 100%; border-collapse: collapse; font-size: 12px;
  th, td { text-align: left; padding: 6px 8px; border-top: 1px solid var(--border-color); vertical-align: top; }
  th { font-weight: 500; opacity: 0.7; }
  tr.decoration { background: color-mix(in srgb, var(--warning) 10%, transparent); }
}
.mono { font-family: var(--font-mono, monospace); }
.small { font-size: 11px; }
.mr__name { font-size: 11px; opacity: 0.7; margin-top: 2px; }
.mr__gap { font-size: 10px; opacity: 0.75; margin-top: 3px; }
.chip { border: 1px solid var(--border-color); border-radius: 9px; padding: 1px 7px; font-size: 10px; margin-right: 4px; display: inline-block; }
.chip-action { border-style: dashed; }
.chip-ok { border-color: var(--success); color: var(--success); }
.chip-warn { border-color: var(--warning); color: var(--warning); }
.mr__coverage { border-top: 1px solid var(--border-color); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.cov { display: flex; flex-direction: column; gap: 5px; }
.cov__row { display: grid; grid-template-columns: 120px 1fr 40px 70px; align-items: center; gap: 8px; font-size: 12px; }
.cov__bar { height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--border-color) 45%, transparent); overflow: hidden;
  i { display: block; height: 100%; background: var(--success); }
}
.cov__num { text-align: right; }
.cov__sets { font-size: 11px; }
</style>
