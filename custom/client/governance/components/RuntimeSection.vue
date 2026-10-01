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
import { fetchCredentialProviders, fetchCronRuns, type CredentialProviderRow, type CronRunRow } from '@/custom/ia2/api/runtime-caps'
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

// ── 模型用量排行榜（2026-10-01 吸收批 #15：multica usage-leaderboard 吸收）──
// 数据源=上游 /api/studio/usage/stats（30 天窗口 model_usage：sessions/token 三分）；
// 按 input+cache_read 折算总吞吐排序，条形长度=占比。失败/空数据如实隐藏小节。
interface ModelUsageRow {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  sessions: number
}
const modelBoard = ref<ModelUsageRow[]>([])

async function loadModelBoard(): Promise<void> {
  try {
    const res = await fetch('/api/studio/usage/stats', { headers: { Authorization: `Bearer ${localStorage.getItem('hermes_api_key') ?? ''}` } })
    if (!res.ok) return
    const data = (await res.json()) as { model_usage?: ModelUsageRow[] }
    modelBoard.value = (data.model_usage ?? [])
      .slice()
      .sort((a, b) => (b.input_tokens + b.cache_read_tokens) - (a.input_tokens + a.cache_read_tokens))
      .slice(0, 6)
  } catch { /* 榜缺席非致命——小节隐藏 */ }
}

const boardMax = computed(() =>
  Math.max(1, ...modelBoard.value.map(m => m.input_tokens + m.cache_read_tokens)))

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
  void loadModelBoard()
  // 凭证池（#17）+ cron 运行史（#7）：暗能力只读代理；失败/通道缺席=null 隐藏小节
  void fetchCredentialProviders().then(v => { credentials.value = v }).catch(() => undefined)
  void fetchCronRuns(8).then(v => { cronRuns.value = v }).catch(() => undefined)
}

const credentials = ref<CredentialProviderRow[] | null>(null)
const cronRuns = ref<CronRunRow[] | null>(null)

const failedCredentials = computed(() => (credentials.value ?? []).filter(c => c.failed))

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

      <!-- ⑤ 模型用量排行榜（multica usage-leaderboard 吸收；30 天窗口） -->
      <section v-if="modelBoard.length" class="runtime__card" data-testid="runtime-model-board">
        <h4 class="runtime__card-title">{{ L?.modelBoardTitle ?? '模型用量排行' }}<span class="runtime__window">30d</span></h4>
        <div v-for="m in modelBoard" :key="m.model" class="runtime__boardrow" :data-testid="`model-board-${m.model}`">
          <span class="runtime__boardname" :title="m.model">{{ m.model }}</span>
          <span class="runtime__boardbar">
            <span
              class="runtime__boardfill"
              :style="{ width: `${Math.max(2, Math.round(((m.input_tokens + m.cache_read_tokens) / boardMax) * 100))}%` }"
            />
          </span>
          <span class="runtime__boardval" :title="`in ${fmtTokens(m.input_tokens)} · cache ${fmtTokens(m.cache_read_tokens)} · out ${fmtTokens(m.output_tokens)}`">
            {{ fmtTokens(m.input_tokens + m.cache_read_tokens) }} · {{ m.sessions }}s
          </span>
        </div>
      </section>

      <!-- ⑥ 凭证池（#17 吸收批 9：hermes auth list 只读代理；run4 通道风暴对策面） -->
      <section v-if="credentials && credentials.length" class="runtime__card" data-testid="runtime-credentials">
        <h4 class="runtime__card-title">
          {{ L?.credentialsTitle ?? '凭证池' }}
          <span class="runtime__window">{{ credentials.length }} providers</span>
          <span v-if="failedCredentials.length" class="runtime__chip is-bad" data-testid="runtime-credentials-failed">
            ✕ {{ failedCredentials.length }} {{ L?.credentialsFailed ?? '失败' }}
          </span>
        </h4>
        <div class="runtime__credrow" v-for="c in credentials.slice(0, 10)" :key="c.provider"
          :data-testid="`credential-${c.provider}`" :title="c.failureDetail ?? c.provider">
          <span class="runtime__boardname">{{ c.provider }}</span>
          <span class="runtime__tag" :class="c.failed ? 'is-bad' : 'is-ok'">
            {{ c.count }} {{ L?.credentialsCount ?? '凭证' }}{{ c.failed ? ' · auth failed' : '' }}
          </span>
        </div>
      </section>

      <!-- ⑦ cron 运行史（#7 吸收批 9：hermes cron runs 只读代理） -->
      <section v-if="cronRuns && cronRuns.length" class="runtime__card" data-testid="runtime-cron-runs">
        <h4 class="runtime__card-title">{{ L?.cronRunsTitle ?? '定时任务运行史' }}<span class="runtime__window">recent</span></h4>
        <div class="runtime__credrow" v-for="r in cronRuns.slice(0, 8)" :key="r.runId + r.ts"
          :data-testid="`cron-run-${r.runId}`">
          <span class="runtime__boardname">{{ r.job }}</span>
          <span class="runtime__tag" :class="r.status === 'completed' ? 'is-ok' : r.status === 'failed' ? 'is-bad' : ''">{{ r.status }}</span>
          <span class="runtime__boardval">{{ r.ts.slice(5, 16).replace('T', ' ') }}</span>
          <span class="runtime__boardval">{{ r.source }}</span>
        </div>
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

/* 模型用量排行榜（#15 multica 吸收） */
.runtime__boardrow { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.runtime__boardname {
  flex-shrink: 0; width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; font-family: var(--font-mono, monospace); color: var(--text-primary, #d7dae0);
}
.runtime__boardbar {
  flex: 1; height: 8px; border-radius: 4px; background: var(--bg-secondary, #f3f4f6); overflow: hidden;
}
.runtime__boardfill { display: block; height: 100%; border-radius: 4px; background: var(--primary, #3b82f6); }
.runtime__boardval { flex-shrink: 0; font-size: 10px; color: var(--text-muted, #878c99); font-variant-numeric: tabular-nums; }

/* 凭证池/cron 运行史行（#7/#17 吸收批 9） */
.runtime__credrow { display: flex; align-items: center; gap: 8px; padding: 2px 0; }

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
