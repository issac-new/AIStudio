<!-- overlay/custom/client/governance/components/CapabilitySupplySection.vue -->
<!-- 能力供需（批二点五）：能力标签是否进入派单决策——需求/供给/缺口/跨板复用/供给时效。
     纪律：源缺席显示 available:false 与 note，不把未知渲染成 0；缺口只标“有需求但完全无供给”。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchCapabilityMetrics, fetchCapabilitySupplyDemand,
  type CapabilityGapRowDto, type CapabilitySupplyReportDto,
} from '@/custom/governance/api/capability-pool'
import type { DerivedReadingDto } from '@/custom/governance/api/org-governance'

const report = ref<CapabilitySupplyReportDto | null>(null)
const readings = ref<DerivedReadingDto[]>([])
const loading = ref(false)
const errorMsg = ref('')

const SOURCE_LABELS: Record<string, string> = {
  'capability-ledger': '能力台账',
  'capability-graph': '能力图',
  'skill-provisioning': '技能清单',
  profiles: 'profile 声明',
  'fleet-directory': '舰队上报',
}

const TOP_N = 20

const topRows = computed<CapabilityGapRowDto[]>(() =>
  [...(report.value?.rows ?? [])]
    .sort((a, b) => b.gap - a.gap || b.demand - a.demand || a.tag.localeCompare(b.tag))
    .slice(0, TOP_N))

const totalRows = computed(() => report.value?.rows.length ?? 0)
const gapRows = computed(() => (report.value?.rows ?? []).filter((row) => row.gap > 0).length)
const unavailableSources = computed(() =>
  Object.entries(report.value?.sources ?? {}).filter(([, source]) => !source.available))

async function refresh(): Promise<void> {
  loading.value = true
  errorMsg.value = ''
  try {
    const [supply, metrics] = await Promise.all([fetchCapabilitySupplyDemand(), fetchCapabilityMetrics()])
    report.value = supply.report
    readings.value = metrics.readings
  } catch (e) {
    errorMsg.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function fmtReading(reading: DerivedReadingDto): string {
  if (!reading.available || reading.value === null) return '—'
  if (reading.unit === '%') return `${(reading.value * 100).toFixed(1)}%`
  return `${Number(reading.value).toLocaleString()}${reading.unit ? ` ${reading.unit}` : ''}`
}

function fmtMs(value: number | null): string {
  if (value === null) return '—'
  if (value < 1000) return `${value}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`
  if (value < 3_600_000) return `${(value / 60_000).toFixed(1)}m`
  return `${(value / 3_600_000).toFixed(1)}h`
}

function fmtTime(value: number | null): string {
  if (value === null) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 16).replace('T', ' ')
}

onMounted(refresh)
</script>

<template>
  <div class="cp" data-testid="capability-supply-section">
    <div class="cp__bar">
      <h3 class="cp__title">能力供需</h3>
      <span class="cp__hint">能力标签是调度单元——有需求、有供给、有缺口，才谈得上能力调度</span>
    </div>

    <div v-if="errorMsg" class="cp__err" data-testid="cp-error">{{ errorMsg }}</div>
    <div v-if="loading" class="cp__muted" data-testid="cp-loading">读取中…</div>

    <div class="cp__metrics" data-testid="cp-metrics">
      <div v-for="r in readings" :key="r.key" class="cp__card" :class="r.available ? '' : 'is-gap'">
        <div class="cp__card-title">{{ r.title }}</div>
        <div class="cp__card-value">{{ fmtReading(r) }}</div>
        <div class="cp__card-def">{{ r.definition }}</div>
        <div class="cp__card-meta">样本 {{ r.sample }}</div>
        <div v-if="r.gap" class="cp__card-gap">{{ r.gap }}</div>
      </div>
    </div>

    <div class="cp__sources" data-testid="cp-sources">
      <span v-for="(label, key) in SOURCE_LABELS" :key="key" class="cp__chip"
        :class="report?.sources?.[key]?.available ? 'is-ok' : 'is-unknown'">
        {{ label }} {{ report?.sources?.[key]?.available ? '在位' : '未知' }}
      </span>
      <span v-if="gapRows > 0" class="cp__chip is-bad">缺口 {{ gapRows }}</span>
      <span class="cp__muted">标签 {{ totalRows }}，显示前 {{ Math.min(TOP_N, totalRows) }}</span>
    </div>

    <div v-if="unavailableSources.length > 0" class="cp__block" data-testid="cp-source-gaps">
      <div class="cp__block-title">源缺席（不猜数）</div>
      <div v-for="[key, source] in unavailableSources" :key="key" class="cp__gap-line">
        {{ SOURCE_LABELS[key] ?? key }}：{{ source.note || '源不可用' }}
      </div>
    </div>

    <table v-if="topRows.length > 0" class="cp__table" data-testid="cp-table">
      <thead>
        <tr>
          <th>能力标签</th>
          <th>需求</th>
          <th>单元</th>
          <th>Agent</th>
          <th>技能包</th>
          <th>缺口</th>
          <th>跨板</th>
          <th>供给时效</th>
          <th>最近使用</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in topRows" :key="row.tag" :class="row.gap > 0 ? 'is-gap' : ''" :data-testid="`cp-row-${row.tag}`">
          <td class="cp__tag">{{ row.tag }}</td>
          <td>{{ row.demand }}</td>
          <td>{{ row.supplyUnits }}</td>
          <td>{{ row.supplyAgents }}</td>
          <td>{{ row.supplySkills }}</td>
          <td :class="row.gap > 0 ? 'cp__bad' : ''">{{ row.gap }}</td>
          <td>{{ row.distinctBoards }}</td>
          <td>{{ fmtMs(row.supplyLeadTimeMedianMs) }}</td>
          <td>{{ fmtTime(row.lastUsedAt) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else-if="!loading && !errorMsg" class="cp__muted" data-testid="cp-empty">
      没有带能力声明的任务——这是暂无需求，不是 0 供给。
    </div>

    <div v-if="report?.tagIssues?.length" class="cp__block" data-testid="cp-tag-issues">
      <div class="cp__block-title">标签词法问题（{{ report.tagIssues.length }}）</div>
      <div v-for="issue in report.tagIssues.slice(0, 10)" :key="`${issue.reason}:${issue.tag}`" class="cp__gap-line">
        {{ issue.tag || '(空)' }}：{{ issue.reason }}
      </div>
    </div>

    <div v-if="report?.unknowns?.length" class="cp__block" data-testid="cp-unknowns">
      <div class="cp__block-title">未知与采集缺口</div>
      <div v-for="note in report.unknowns" :key="note" class="cp__gap-line">{{ note }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cp { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.cp__bar { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.cp__title { margin: 0; font-size: 14px; font-weight: 600; }
.cp__hint { font-size: 11.5px; color: var(--text-muted); }
.cp__err { color: var(--danger, #d03050); font-size: 12px; }
.cp__muted { font-size: 11.5px; color: var(--text-muted); }
.cp__metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.cp__card { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
.cp__card.is-gap { border-style: dashed; }
.cp__card-title { font-size: 12px; font-weight: 600; }
.cp__card-value { font-size: 18px; font-weight: 600; }
.cp__card-def { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.cp__card-meta { font-size: 11px; color: var(--text-muted); }
.cp__card-gap { font-size: 11px; color: var(--warning, #d08a00); }
.cp__sources { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cp__chip { font-size: 11px; border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; }
.cp__chip.is-ok { color: var(--success, #18a058); border-color: currentColor; }
.cp__chip.is-unknown { color: var(--text-muted); border-style: dashed; }
.cp__chip.is-bad { color: var(--danger, #d03050); border-color: currentColor; }
.cp__table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cp__table th, .cp__table td { border-bottom: 1px solid var(--border); padding: 4px 6px; text-align: right; }
.cp__table th:first-child, .cp__table td:first-child { text-align: left; }
.cp__table tr.is-gap { background: rgba(208, 48, 80, 0.06); }
.cp__tag { font-family: monospace; }
.cp__bad { color: var(--danger, #d03050); font-weight: 600; }
.cp__block { display: flex; flex-direction: column; gap: 3px; }
.cp__block-title { font-size: 12px; font-weight: 600; }
.cp__gap-line { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
</style>
