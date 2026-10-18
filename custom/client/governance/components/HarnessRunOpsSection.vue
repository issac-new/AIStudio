<!-- overlay/custom/client/governance/components/HarnessRunOpsSection.vue -->
<!-- 运行运维面（2026-10-18 残余项）：过程质量 / 执法决策账 / 运行清单 / 预算状态 /
     恢复判定。各块独立取数、独立失败态；数据缺席显示占位，不编造。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import {
  fetchBudgetStatus,
  fetchPolicyDecisions,
  fetchProcessQuality,
  fetchResumePlan,
  fetchRunManifests,
  type BudgetStatusDto,
  type PolicyDecisionsDto,
  type ProcessQualityDto,
  type ResumePlanDto,
  type RunManifestsDto,
} from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const days = ref(7)
const busy = ref(false)
const quality = ref<ProcessQualityDto | null>(null)
const policy = ref<PolicyDecisionsDto | null>(null)
const manifests = ref<RunManifestsDto | null>(null)
const budget = ref<BudgetStatusDto | null>(null)
const errors = ref<Record<string, string>>({})

const resumeInput = ref('')
const resume = ref<ResumePlanDto | null>(null)
const resumeError = ref('')
const resumeBusy = ref(false)

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v * 1000) / 10}%`
}

function usd(v: number | null | undefined): string {
  return v == null ? '—' : `$${v.toFixed(4)}`
}

function timeOf(ts: number): string {
  try { return new Date(ts).toLocaleTimeString() } catch { return '—' }
}

async function refresh(): Promise<void> {
  busy.value = true
  errors.value = {}
  const results = await Promise.allSettled([
    fetchProcessQuality(days.value),
    fetchPolicyDecisions(days.value),
    fetchRunManifests(days.value),
    fetchBudgetStatus(),
  ])
  const keys = ['quality', 'policy', 'manifests', 'budget'] as const
  const setters = [
    (v: unknown) => { quality.value = v as ProcessQualityDto },
    (v: unknown) => { policy.value = v as PolicyDecisionsDto },
    (v: unknown) => { manifests.value = v as RunManifestsDto },
    (v: unknown) => { budget.value = v as BudgetStatusDto },
  ]
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') setters[i](r.value)
    else errors.value[keys[i]] = r.reason instanceof Error ? r.reason.message : String(r.reason)
  })
  busy.value = false
}

function setDays(d: number): void {
  days.value = d
  void refresh()
}

async function checkResume(): Promise<void> {
  const key = resumeInput.value.trim()
  if (!key) return
  resumeBusy.value = true
  resumeError.value = ''
  try {
    // 输入框不区分 run/session：同时按两个键查询，图检查点与交接检查点各取所需。
    resume.value = await fetchResumePlan({ runId: key, sessionId: key })
  } catch (e) {
    resumeError.value = e instanceof Error ? e.message : String(e)
  } finally {
    resumeBusy.value = false
  }
}

function resumeLabel(decision: string | undefined): string {
  if (decision === 'auto_resume') return String(L.value.runOpsResumeAuto ?? 'auto')
  if (decision === 'manual_gate') return String(L.value.runOpsResumeManual ?? 'manual')
  return String(L.value.runOpsResumeNew ?? 'new')
}

onMounted(() => void refresh())
</script>

<template>
  <div class="ro" data-testid="harness-run-ops">
    <div class="ro__bar">
      <h3 class="ro__title">{{ L?.runOpsTitle }}</h3>
      <div class="ro__days" role="tablist">
        <button
          v-for="d in [7, 30, 90]" :key="d" type="button"
          class="ro__day" :class="{ 'ro__day--active': days === d }"
          :data-testid="`harness-runops-days-${d}`"
          @click="setDays(d)"
        >{{ d }}{{ L?.days }}</button>
      </div>
      <button type="button" class="ro__refresh" data-testid="harness-runops-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="ro__sub">{{ L?.runOpsSub }}</p>

    <div class="ro__grid">
      <section class="ro__card" data-testid="harness-runops-quality">
        <h4 class="ro__cardtitle">{{ L?.runOpsQuality }}</h4>
        <div v-if="errors.quality" class="ro__error">{{ errors.quality }}</div>
        <template v-if="quality">
          <div class="ro__metrics">
            <div class="ro__metric" data-testid="runops-metric-duplicate">
              <span class="ro__mname">{{ L?.runOpsDuplicate }}</span><span class="ro__mval">{{ pct(quality.metrics.duplicateCallRate) }}</span>
            </div>
            <div class="ro__metric" data-testid="runops-metric-failure">
              <span class="ro__mname">{{ L?.runOpsFailure }}</span><span class="ro__mval">{{ pct(quality.metrics.toolFailureRate) }}</span>
            </div>
            <div class="ro__metric" data-testid="runops-metric-longchain">
              <span class="ro__mname">{{ L?.runOpsLongChain }}</span><span class="ro__mval">{{ pct(quality.metrics.longChainRate) }}</span>
            </div>
            <div class="ro__metric" data-testid="runops-metric-firstpass">
              <span class="ro__mname">{{ L?.runOpsFirstPass }}</span><span class="ro__mval">{{ pct(quality.metrics.firstPassSuccessRate) }}</span>
            </div>
            <div class="ro__metric" data-testid="runops-metric-compliance">
              <span class="ro__mname">{{ L?.runOpsCompliance }}</span><span class="ro__mval">{{ pct(quality.metrics.specComplianceRate) }}</span>
            </div>
          </div>
          <div class="ro__meta" data-testid="runops-quality-meta">
            runs {{ quality.metrics.runs }} · calls {{ quality.metrics.toolCalls }} · failed {{ quality.metrics.failedCalls }}
            · steps p50 {{ quality.steps.p50 ?? '—' }} / p95 {{ quality.steps.p95 ?? '—' }} / max {{ quality.steps.max ?? '—' }}
            · qgate {{ quality.qgate.pass }}/{{ quality.qgate.total }}
          </div>
          <ul class="ro__notes"><li v-for="(n, i) in quality.notes" :key="i">{{ n }}</li></ul>
        </template>
        <div v-else-if="!errors.quality" class="ro__empty">{{ L?.runOpsNoData }}</div>
      </section>

      <section class="ro__card" data-testid="harness-runops-policy">
        <h4 class="ro__cardtitle">{{ L?.runOpsPolicy }}</h4>
        <div v-if="errors.policy" class="ro__error">{{ errors.policy }}</div>
        <template v-if="policy">
          <div class="ro__meta" data-testid="runops-policy-summary">
            {{ L?.runOpsAllow }} {{ policy.byOutcome.allow }} · {{ L?.runOpsDeny }} {{ policy.byOutcome.deny }} · total {{ policy.total }}
          </div>
          <ul class="ro__rows">
            <li v-for="(e, i) in policy.entries.slice(0, 8)" :key="i" class="ro__row" :data-testid="`runops-policy-row-${i}`">
              <span class="ro__badge" :class="e.allow ? 'ro__badge--ok' : 'ro__badge--bad'">{{ e.allow ? L?.runOpsAllow : L?.runOpsDeny }}</span>
              <span class="ro__tool">{{ e.tool }}</span>
              <span class="ro__rule">{{ e.rule }}</span>
              <span class="ro__who">{{ e.userId || e.profileId || '—' }}</span>
              <span class="ro__ts">{{ timeOf(e.ts) }}</span>
            </li>
          </ul>
          <div v-if="policy.entries.length === 0" class="ro__empty">{{ L?.runOpsNoData }}</div>
        </template>
      </section>

      <section class="ro__card" data-testid="harness-runops-manifests">
        <h4 class="ro__cardtitle">{{ L?.runOpsManifests }}</h4>
        <div v-if="errors.manifests" class="ro__error">{{ errors.manifests }}</div>
        <template v-if="manifests">
          <ul class="ro__rows">
            <li v-for="(m, i) in manifests.entries.slice(0, 8)" :key="i" class="ro__manrow" :data-testid="`runops-manifest-row-${i}`">
              <div class="ro__mantop">
                <span class="ro__tool">{{ m.model }}</span>
                <span class="ro__who">{{ m.provider }}</span>
                <span class="ro__ts">{{ timeOf(m.startedAt) }}</span>
              </div>
              <div class="ro__manmeta">
                <span>{{ L?.runOpsPermission }}: {{ m.permissionMode || '—' }}</span>
                <span>{{ L?.runOpsPromptHash }}: {{ m.promptHash || '—' }}</span>
                <span>contract {{ m.toolContractVersion }}</span>
                <span v-if="m.cost">cost {{ m.cost.priced ? usd(m.cost.costIdleUsd) : (m.cost.traceFound ? 'unpriced' : 'no trace') }}</span>
              </div>
            </li>
          </ul>
          <div v-if="manifests.entries.length === 0" class="ro__empty">{{ L?.runOpsNoData }}</div>
        </template>
      </section>

      <section class="ro__card" data-testid="harness-runops-budget">
        <h4 class="ro__cardtitle">{{ L?.runOpsBudget }}</h4>
        <div v-if="errors.budget" class="ro__error">{{ errors.budget }}</div>
        <template v-if="budget">
          <div class="ro__budget" data-testid="runops-budget-line">
            {{ L?.runOpsSpent }} {{ usd(budget.status.spentUsd) }} · {{ L?.runOpsLimit }} {{ usd(budget.status.limitUsd) }}
            · {{ L?.runOpsAction }} {{ budget.status.action }} · runs {{ budget.status.runs }}
          </div>
          <div class="ro__meta">{{ budget.status.note }}</div>
        </template>

        <div class="ro__resume" data-testid="harness-runops-resume">
          <h5 class="ro__subtitle">{{ L?.runOpsResume }}</h5>
          <div class="ro__resumeform">
            <input
              v-model="resumeInput" type="text" class="ro__input" data-testid="runops-resume-input"
              :placeholder="L?.runOpsResumeHint" @keyup.enter="checkResume()"
            >
            <button type="button" class="ro__go" data-testid="runops-resume-btn" :disabled="resumeBusy" @click="checkResume()">
              {{ L?.runOpsResumeRun }}
            </button>
          </div>
          <div v-if="resumeError" class="ro__error">{{ resumeError }}</div>
          <div v-if="resume" class="ro__resumeresult" data-testid="runops-resume-result">
            <span class="ro__badge" :class="`ro__badge--${resume.plan.decision}`">{{ resumeLabel(resume.plan.decision) }}</span>
            <ul class="ro__notes"><li v-for="(r, i) in resume.plan.reasons" :key="i">{{ r }}</li></ul>
            <div v-if="resume.plan.next" class="ro__meta">next: {{ resume.plan.next }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ro { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.ro__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ro__title { margin: 0; font-size: 14px; }
.ro__days { display: flex; gap: 4px; }
.ro__day { font-size: 11px; padding: 1px 7px; border: 1px solid var(--border-color); border-radius: 10px; background: transparent; cursor: pointer; }
.ro__day--active { background: var(--accent-primary); color: var(--text-on-accent); border-color: transparent; }
.ro__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.ro__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.ro__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 8px; }
.ro__card { border: 1px solid var(--border-color); border-radius: 8px; padding: 7px 9px; display: flex; flex-direction: column; gap: 6px; }
.ro__cardtitle { margin: 0; font-size: 13px; font-weight: 600; }
.ro__metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px; }
.ro__metric { display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 6px; }
.ro__mname { font-size: 10.5px; opacity: 0.7; }
.ro__mval { font-size: 13px; font-weight: 600; }
.ro__meta { font-size: 10.5px; opacity: 0.7; }
.ro__notes { margin: 0; padding-left: 14px; font-size: 10.5px; opacity: 0.7; display: flex; flex-direction: column; gap: 1px; }
.ro__rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.ro__row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.ro__tool { font-weight: 600; }
.ro__rule { opacity: 0.75; }
.ro__who { opacity: 0.6; }
.ro__ts { margin-left: auto; opacity: 0.55; font-size: 10px; }
.ro__badge { font-size: 9.5px; padding: 0 5px; border-radius: 8px; border: 1px solid var(--border-color); }
.ro__badge--ok, .ro__badge--auto_resume { color: var(--success); }
.ro__badge--bad, .ro__badge--manual_gate { color: var(--danger); }
.ro__badge--new_session { color: var(--warning); }
.ro__manrow { border-top: 1px dashed var(--border-color); padding-top: 3px; font-size: 11px; }
.ro__mantop { display: flex; align-items: center; gap: 6px; }
.ro__manmeta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; opacity: 0.65; }
.ro__budget { font-size: 11.5px; }
.ro__resume { border-top: 1px dashed var(--border-color); padding-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.ro__subtitle { margin: 0; font-size: 12px; font-weight: 600; }
.ro__resumeform { display: flex; gap: 6px; }
.ro__input { flex: 1; font-size: 11.5px; padding: 2px 6px; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: inherit; }
.ro__go { font-size: 11.5px; cursor: pointer; }
.ro__resumeresult { display: flex; flex-direction: column; gap: 3px; }
.ro__empty { font-size: 11px; opacity: 0.55; font-style: italic; }
.ro__error { color: var(--danger); font-size: 11px; }
</style>
