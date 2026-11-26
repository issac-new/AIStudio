<!-- overlay/custom/client/governance/components/RsiLifecycleSection.vue -->
<!-- RSI 生命周期审计（2026-11-20 综述吸收轮 A）：五条更新环路 × 七阶段矩阵。
     与 RsiMaturitySection 分工：分级 vs 缺段。NR＝未实现该阶段操作≠无最终评估；
     缺口行定性真缺口/论文允许省略/另批在途。数据来自 GET /api/harness/rsi-lifecycle。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

interface Cell { stage: string; status: 'implemented' | 'partial' | 'nr'; anchor: string; note: string }
interface Loop { key: string; title: string; what: string; component: string; cells: Cell[] }
interface GapLine { loop: string; stage: string; status: 'implemented' | 'partial' | 'nr'; note: string }
type ClaimStatus = 'examined' | 'partial' | 'not_evaluated'
type ClaimLevel = 'update' | 'successor' | 'meta'
type ClaimRequirement = 'validity' | 'behavioral' | 'fairness' | 'security' | 'privacy' | 'transparency' | 'control' | 'accountability'
interface ClaimCell { requirement: ClaimRequirement; level: ClaimLevel; status: ClaimStatus; anchor: string; note: string }
interface Report {
  loops: Loop[]
  summary: { implemented: number; partial: number; nr: number; total: number }
  gapLines: GapLine[]
  /** 旧服务端不带该字段，表格按缺席处理。 */
  claimLevels?: { cells: ClaimCell[]; summary: Record<ClaimStatus, number>; source: string; boundary: string }
  meta: { source: string; criteria: string; boundary: string }
}

const CLAIM_LEVELS: readonly ClaimLevel[] = ['update', 'successor', 'meta']
const CLAIM_REQUIREMENTS: readonly ClaimRequirement[] = ['validity', 'behavioral', 'fairness', 'security', 'privacy', 'transparency', 'control', 'accountability']

const data = ref<Report | null>(null)
const error = ref('')
const busy = ref(false)

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/api/harness/rsi-lifecycle', { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data.value = await res.json()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function authHeaders(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

function statusLabel(s: Cell['status']): string {
  return s === 'implemented' ? (L.value?.rsiLcImplemented ?? 'implemented') : s === 'partial' ? (L.value?.rsiLcPartial ?? 'partial') : 'NR'
}

/** 证据图里的一格；缺格返回 null，表格显示「—」，不补成任何格态。 */
function claimCell(requirement: ClaimRequirement, level: ClaimLevel): ClaimCell | null {
  return data.value?.claimLevels?.cells.find((c) => c.requirement === requirement && c.level === level) ?? null
}

function claimStatusLabel(s: ClaimStatus): string {
  return s === 'examined'
    ? (L.value?.rsiClaimExamined ?? 'examined')
    : s === 'partial'
      ? (L.value?.rsiClaimPartial ?? 'partial')
      : (L.value?.rsiClaimUnevaluated ?? 'not_evaluated')
}

function claimLevelLabel(level: ClaimLevel): string {
  return level === 'update'
    ? (L.value?.rsiClaimLevelUpdate ?? 'update')
    : level === 'successor'
      ? (L.value?.rsiClaimLevelSuccessor ?? 'successor')
      : (L.value?.rsiClaimLevelMeta ?? 'meta')
}

function requirementLabel(requirement: ClaimRequirement): string {
  const key = `rsiReq${requirement.charAt(0).toUpperCase()}${requirement.slice(1)}` as
    | 'rsiReqValidity' | 'rsiReqBehavioral' | 'rsiReqFairness' | 'rsiReqSecurity'
    | 'rsiReqPrivacy' | 'rsiReqTransparency' | 'rsiReqControl' | 'rsiReqAccountability'
  return L.value?.[key] ?? requirement
}

onMounted(() => void refresh())
</script>

<template>
  <div class="rl" data-testid="harness-rsi-lifecycle">
    <div class="rl__bar">
      <h3 class="rl__title">{{ L?.rsiLcTitle }}</h3>
      <button type="button" class="rl__refresh" data-testid="harness-rsi-lc-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.rsiLcLoading : L?.rsiLcRefresh }}
      </button>
    </div>
    <p class="rl__sub">{{ L?.rsiLcSub }}</p>
    <div v-if="error" class="rl__error">{{ L?.rsiLcLoadFailed }}：{{ error }}</div>

    <div v-if="data" class="rl__summary" data-testid="harness-rsi-lc-summary">
      <span class="rl__chip rl__chip--ok">{{ L?.rsiLcImplemented }} {{ data.summary.implemented }}</span>
      <span class="rl__chip rl__chip--partial">{{ L?.rsiLcPartial }} {{ data.summary.partial }}</span>
      <span class="rl__chip rl__chip--nr">NR {{ data.summary.nr }}</span>
      <span class="rl__chip rl__chip--total">/ {{ data.summary.total }}</span>
    </div>

    <div v-if="data" class="rl__loops" data-testid="harness-rsi-lc-loops">
      <details v-for="lp in data.loops" :key="lp.key" class="rl__loop" :data-testid="`harness-rsi-lc-loop-${lp.key}`">
        <summary>
          <span class="rl__loopkey">{{ lp.component }}</span>
          <span class="rl__looptitle">{{ lp.title }}</span>
          <span class="rl__loopwhat">{{ lp.what }}</span>
        </summary>
        <div class="rl__grid">
          <div
            v-for="c in lp.cells" :key="c.stage"
            class="rl__cell" :class="`rl__cell--${c.status}`"
            :data-testid="`harness-rsi-lc-cell-${lp.key}-${c.stage}`"
          >
            <span class="rl__stage">{{ c.stage }}</span>
            <span class="rl__state">{{ statusLabel(c.status) }}</span>
            <code v-if="c.anchor" class="rl__anchor">{{ c.anchor }}</code>
            <span class="rl__note">{{ c.note }}</span>
          </div>
        </div>
      </details>
    </div>

    <div v-if="data && data.gapLines.length" class="rl__gaps" data-testid="harness-rsi-lc-gaps">
      <div class="rl__gaptitle">{{ L?.rsiLcGaps }}</div>
      <ul class="rl__gaplist">
        <li v-for="(g, i) in data.gapLines" :key="i" :class="`rl__gap--${g.status}`">
          <code>{{ g.loop }}</code> · {{ g.stage }} · {{ statusLabel(g.status) }} — {{ g.note }}
        </li>
      </ul>
    </div>
    <div v-if="data?.claimLevels" class="rl__claims" data-testid="harness-rsi-claims">
      <div class="rl__gaptitle">{{ L?.rsiClaimTitle }}</div>
      <p class="rl__claimsub">{{ L?.rsiClaimSub }}</p>
      <div class="rl__summary" data-testid="harness-rsi-claims-summary">
        <span class="rl__chip rl__chip--ok">{{ L?.rsiClaimExamined }} {{ data.claimLevels.summary.examined }}</span>
        <span class="rl__chip rl__chip--partial">{{ L?.rsiClaimPartial }} {{ data.claimLevels.summary.partial }}</span>
        <span class="rl__chip rl__chip--nr">{{ L?.rsiClaimUnevaluated }} {{ data.claimLevels.summary.not_evaluated }}</span>
        <span class="rl__chip rl__chip--total">/ {{ data.claimLevels.cells.length }}</span>
      </div>
      <table class="rl__claimtable">
        <thead>
          <tr>
            <th scope="col"></th>
            <th v-for="lv in CLAIM_LEVELS" :key="lv" scope="col">{{ claimLevelLabel(lv) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="req in CLAIM_REQUIREMENTS" :key="req" :data-testid="`harness-rsi-claim-row-${req}`">
            <th scope="row">{{ requirementLabel(req) }}</th>
            <td
              v-for="lv in CLAIM_LEVELS" :key="lv"
              :class="claimCell(req, lv) ? `rl__claimcell--${claimCell(req, lv)!.status}` : ''"
              :title="claimCell(req, lv)?.note"
              :data-testid="`harness-rsi-claim-${req}-${lv}`"
            >{{ claimCell(req, lv) ? claimStatusLabel(claimCell(req, lv)!.status) : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="rl__meta" data-testid="harness-rsi-claims-note">{{ data.claimLevels.boundary }}</p>
    </div>
    <div v-if="data" class="rl__meta" data-testid="harness-rsi-lc-note">{{ data.meta.criteria }}｜{{ data.meta.boundary }}</div>
  </div>
</template>

<style scoped lang="scss">
.rl { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.rl__bar { display: flex; align-items: center; gap: 8px; }
.rl__title { margin: 0; font-size: 14px; }
.rl__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.rl__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.rl__error { color: var(--danger); font-size: 12px; }
.rl__summary { display: flex; gap: 6px; flex-wrap: wrap; }
.rl__chip { font-size: 11px; padding: 0 6px; border-radius: 8px; border: 1px solid; }
.rl__chip--ok { color: var(--success); border-color: var(--success); }
.rl__chip--partial { color: var(--ia-stale); border-style: dashed; border-color: currentColor; }
.rl__chip--nr { color: var(--danger); border-color: currentColor; }
.rl__chip--total { color: var(--text-muted); border-color: var(--border-color); }
.rl__loops { display: flex; flex-direction: column; gap: 4px; }
.rl__loop { border: 1px solid var(--border-color); border-radius: 8px; padding: 4px 8px; }
.rl__loop summary { display: flex; align-items: baseline; gap: 8px; cursor: pointer; font-size: 13px; list-style: none; flex-wrap: wrap; }
.rl__loop summary::-webkit-details-marker { display: none; }
.rl__loopkey { font-size: 10.5px; font-weight: 600; background: rgb(0 0 0 / 5%); padding: 0 4px; border-radius: 3px; }
.rl__looptitle { font-size: 12px; }
.rl__loopwhat { font-size: 11px; opacity: 0.65; }
.rl__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px; margin-top: 4px; }
.rl__cell { border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 6px; font-size: 11px; display: flex; flex-direction: column; gap: 2px; }
.rl__cell--implemented { border-left: 2px solid var(--success); }
.rl__cell--partial { border-left: 2px solid var(--ia-stale); }
.rl__cell--nr { border-left: 2px solid var(--danger); }
.rl__stage { font-weight: 600; font-size: 11px; }
.rl__state { font-size: 10px; color: var(--text-muted); }
.rl__anchor { background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; font-size: 10px; word-break: break-all; }
.rl__note { opacity: 0.8; }
.rl__gaps { border: 1px solid rgba(var(--warning-rgb), 0.6); border-radius: 8px; padding: 4px 8px; }
.rl__gaptitle { font-size: 12px; font-weight: 600; }
.rl__gaplist { margin: 2px 0; padding: 0 0 0 14px; display: flex; flex-direction: column; gap: 2px; }
.rl__gaplist li { font-size: 11px; }
.rl__gap--nr { color: var(--danger); }
.rl__gap--partial { color: var(--ia-stale); }
/* 主张层级证据图：三种格态用颜色加边线样式双重区分（实线/虚线/点线），格态文字本身写明，与上方环路矩阵同一套读法。
   格态选择器带上 td：单元格通用规则是「类＋元素」且写了 border-left 简写，单个类选择器压不过它，
   边线会停在透明实线（浏览器走查读计算样式抓出）。 */
.rl__claims { border: 1px solid var(--border-color); border-radius: 8px; padding: 4px 8px; display: flex; flex-direction: column; gap: 4px; }
.rl__claimsub { margin: 0; font-size: 11px; opacity: 0.7; }
.rl__claimtable { width: 100%; border-collapse: collapse; font-size: 11px; }
.rl__claimtable th { text-align: left; font-weight: 600; opacity: 0.75; border-bottom: 1px solid var(--border-color); padding: 3px 4px; }
.rl__claimtable td { border-bottom: 1px solid rgb(0 0 0 / 4%); padding: 3px 6px; border-left: 2px solid transparent; }
.rl__claimtable td.rl__claimcell--examined { color: var(--success); border-left-color: var(--success); }
.rl__claimtable td.rl__claimcell--partial { color: var(--ia-stale); border-left-color: var(--ia-stale); border-left-style: dashed; }
.rl__claimtable td.rl__claimcell--not_evaluated { color: var(--danger); border-left-color: var(--danger); border-left-style: dotted; }
.rl__meta { font-size: 11px; color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.5); border-radius: 6px; padding: 4px 8px; }
</style>
