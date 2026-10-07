<!-- overlay/custom/client/eval/components/EvalReportPanel.vue -->
<!-- 运行报告面板：四层卡（Result/Trajectory/Efficiency/Risk）+ 样本明细 +
     人工仲裁（conflict/unknown 终裁）+ 归因双 Loop（Agent→review 域 / Rubric→迭代账本）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type EvalRunDto, type EvalSetDto, type IterationDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const props = defineProps<{ runId: string }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

const run = ref<EvalRunDto | null>(null)
const setDto = ref<EvalSetDto | null>(null)
const iterations = ref<IterationDto[]>([])
const error = ref('')
const note = ref('')

async function load(): Promise<void> {
  error.value = ''
  try {
    const [r, it] = await Promise.all([evalApi.getRun(props.runId), evalApi.listIterations(props.runId)])
    run.value = r.run
    iterations.value = it.iterations
    // 断言期望值（判词配色用）：非密封集取任务内容；密封集 404/元数据态降级
    try {
      const s = await evalApi.getSet(r.run.setId)
      setDto.value = s.set
    } catch {
      setDto.value = null
    }
  } catch (e) {
    error.value = (e as Error).message
  }
}

onMounted(() => void load())
watch(() => props.runId, () => void load())

async function arbitrate(taskId: string, sampleIdx: number, assertionId: string, value: 'yes' | 'no'): Promise<void> {
  try {
    await evalApi.humanVerdict(props.runId, { taskId, sampleIdx, assertionId, value })
    await load()
    emit('changed')
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function attributeAgent(): Promise<void> {
  try {
    await evalApi.attribute(props.runId, { route: 'agent' })
    error.value = L.value.runs.attrAgentHint
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function attributeRubric(taskId: string, assertionId: string, finding: 'judge_wrong' | 'rubric_ambiguous'): Promise<void> {
  try {
    await evalApi.attribute(props.runId, { taskId, assertionId, finding, ...(note.value.trim() ? { note: note.value.trim() } : {}) })
    note.value = ''
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`
}

function verdictClass(value: string, expect?: string): string {
  if (value === 'unknown') return 'v-unknown'
  if (expect !== undefined && value === expect) return 'v-pass'
  return 'v-fail'
}

/** taskId/assertionId → 期望答案（判词配色）。密封集取不到任务内容时空查：仅按 unknown/conflict 高亮。 */
const expectMap = computed(() => {
  const map = new Map<string, string>()
  for (const task of setDto.value?.tasks ?? []) {
    for (const a of task.rubric) map.set(`${task.id}/${a.id}`, a.expect)
  }
  return map
})

function expectOf(taskId: string, assertionId: string): string | undefined {
  return expectMap.value.get(`${taskId}/${assertionId}`)
}

function durationText(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}min`
}
</script>

<template>
  <section v-if="run" class="eval-report card" :data-testid="`eval-report-${run.id}`">
    <header class="eval-report__head">
      <h3>{{ L.runs.report }} · {{ run.id.slice(-6) }}</h3>
      <span v-if="run.note" class="muted">{{ run.note }}</span>
      <span v-if="run.aggregates.statisticallyInsufficient" class="chip chip-warn">{{ L.runs.insufficient }}</span>
      <span v-if="!run.aggregates.judgeOnline" class="chip chip-warn">{{ L.runs.judgeOffline }}</span>
    </header>
    <p v-if="error" class="eval-report__error">{{ error }}</p>

    <!-- 四层卡 -->
    <div class="eval-report__layers" data-testid="eval-report-layers">
      <div class="layer">
        <span class="layer__name">{{ L.runs.layerResult }}</span>
        <span class="layer__value" :class="{ ok: (run.aggregates.byLayer.result ?? 0) >= 0.8 }">{{ pct(run.aggregates.byLayer.result) }}</span>
      </div>
      <div class="layer">
        <span class="layer__name">{{ L.runs.layerTrajectory }}</span>
        <span class="layer__value" :class="{ ok: (run.aggregates.byLayer.trajectory ?? 0) >= 0.8 }">{{ pct(run.aggregates.byLayer.trajectory) }}</span>
      </div>
      <div class="layer">
        <span class="layer__name">{{ L.runs.layerEfficiency }}</span>
        <span class="layer__value small">
          {{ L.runs.avgTokens }} {{ run.aggregates.byLayer.efficiency.avgTokens?.toLocaleString() ?? '—' }} ·
          {{ L.runs.avgSteps }} {{ run.aggregates.byLayer.efficiency.avgSteps ?? '—' }} ·
          {{ L.runs.avgDuration }} {{ durationText(run.aggregates.byLayer.efficiency.avgDurationMs) }}
        </span>
      </div>
      <div class="layer" :class="{ 'layer-risk': run.aggregates.byLayer.risk === 'violated' }">
        <span class="layer__name">{{ L.runs.layerRisk }}</span>
        <span class="layer__value">
          {{ run.aggregates.byLayer.risk === 'violated' ? L.runs.riskViolated : run.aggregates.byLayer.risk === 'unknown' ? L.runs.riskUnknown : L.runs.riskClean }}
        </span>
      </div>
    </div>

    <p v-if="run.aggregates.rubricDrilldownHint" class="eval-report__hint" data-testid="eval-drilldown-hint">
      ⚠ {{ L.runs.drilldownHint }}（{{ pct(run.aggregates.unknownRatio) }}）
    </p>

    <!-- 样本明细（密封集无明细：只回聚合） -->
    <template v-if="run.attempts && run.attempts.length > 0">
      <h4>{{ L.runs.attempts }}</h4>
      <div v-for="a in run.attempts" :key="`${a.taskId}#${a.sampleIdx}`" class="attempt" :data-testid="`eval-attempt-${a.taskId}-${a.sampleIdx}`">
        <div class="attempt__head">
          <strong class="mono">{{ a.taskId }}#{{ a.sampleIdx }}</strong>
          <span v-if="a.sessionId" class="mono muted">{{ a.sessionId }}</span>
          <span :class="a.passed ? 'v-pass' : 'v-fail'">{{ a.passed ? 'PASS' : 'FAIL' }}</span>
          <span v-if="a.outcome" :class="a.outcome.ok ? 'v-pass' : 'v-fail'" :title="a.outcome?.detail">
            {{ L.runs.outcome }}：{{ a.outcome?.ok ? L.runs.outcomeOk : L.runs.outcomeFail }}
          </span>
          <span v-if="a.judgeMeta && !a.judgeMeta.online" class="chip chip-warn">{{ L.runs.judgeOffline }}</span>
        </div>
        <table class="verdicts">
          <tbody>
            <tr v-for="v in a.verdicts" :key="v.assertionId" :class="{ conflict: v.conflict }">
              <td class="mono">{{ v.assertionId }}</td>
              <td :class="verdictClass(v.value, expectOf(a.taskId, v.assertionId))">
                {{ v.value === 'yes' ? L.runs.yes : v.value === 'no' ? L.runs.no : L.runs.unknown }}
                <span v-if="v.conflict" class="chip chip-warn">{{ L.runs.conflict }}</span>
              </td>
              <td class="muted">{{ v.source }}<span v-if="v.p !== undefined"> p={{ v.p.toFixed(2) }}</span></td>
              <td class="row-actions">
                <template v-if="v.value === 'unknown' || v.conflict">
                  <button type="button" :data-testid="`arb-${a.taskId}-${a.sampleIdx}-${v.assertionId}-yes`" @click="arbitrate(a.taskId, a.sampleIdx, v.assertionId, 'yes')">✓ {{ L.runs.yes }}</button>
                  <button type="button" :data-testid="`arb-${a.taskId}-${a.sampleIdx}-${v.assertionId}-no`" @click="arbitrate(a.taskId, a.sampleIdx, v.assertionId, 'no')">✗ {{ L.runs.no }}</button>
                </template>
                <button
                  type="button"
                  class="ghost"
                  :data-testid="`attr-${a.taskId}-${v.assertionId}`"
                  :title="L.runs.attrRubricHint"
                  @click="attributeRubric(a.taskId, v.assertionId, 'judge_wrong')"
                >{{ L.runs.attrRubric }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <input v-model="note" class="attr-note" :placeholder="L.runs.attrNotePh" data-testid="eval-attr-note" />
    </template>

    <!-- 归因双 Loop -->
    <div class="eval-report__loops">
      <button type="button" class="ghost" data-testid="eval-attr-agent" :title="L.runs.attrAgentHint" @click="attributeAgent">
        {{ L.runs.attribute }} → {{ L.runs.attrAgent }}
      </button>
    </div>

    <!-- Rubric 迭代账本 -->
    <div class="eval-report__iterations">
      <h4>{{ L.runs.iterations }}</h4>
      <p v-if="iterations.length === 0" class="muted">{{ L.runs.noIterations }}</p>
      <ul v-else>
        <li v-for="it in iterations" :key="it.id" :data-testid="`eval-iteration-${it.id}`">
          <span class="mono">{{ it.taskId }}/{{ it.assertionId }}</span>
          <span class="chip">{{ it.finding === 'judge_wrong' ? L.runs.attrFindingJudgeWrong : L.runs.attrFindingAmbiguous }}</span>
          <span v-if="it.note" class="muted">{{ it.note }}</span>
          <span v-if="it.revision" class="muted">{{ L.runs.iterRevision }}：{{ it.revision }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
.eval-report {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}
.eval-report__head { display: flex; align-items: center; gap: 10px; h3 { margin: 0; font-size: 14px; } }
.eval-report__error { color: var(--danger, #dc2626); font-size: 13px; margin: 0; }
.eval-report__hint { color: var(--warning, #b45309); font-size: 13px; margin: 0; }
.eval-report__layers { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.layer {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  &.layer-risk { border-color: var(--danger, #dc2626); }
}
.layer__name { font-size: 12px; opacity: 0.7; }
.layer__value { font-size: 18px; font-weight: 600; &.small { font-size: 12px; font-weight: 400; } &.ok { color: var(--success, #16a34a); } }
.attempt { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 8px 10px; }
.attempt__head { display: flex; align-items: center; gap: 10px; font-size: 13px; margin-bottom: 6px; }
.verdicts { width: 100%; border-collapse: collapse; font-size: 12px;
  td { padding: 4px 8px; border-top: 1px solid var(--border-color, #f0f0f0); }
  tr.conflict { background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent); }
}
.v-pass { color: var(--success, #16a34a); font-weight: 600; }
.v-fail { color: var(--danger, #dc2626); font-weight: 600; }
.v-unknown { color: var(--warning, #b45309); font-weight: 600; }
.row-actions { display: flex; gap: 6px; justify-content: flex-end;
  button { border: 1px solid var(--border-color, #e5e7eb); background: transparent; border-radius: 6px; padding: 2px 7px; cursor: pointer; font-size: 11px;
    &.ghost { border-style: dashed; opacity: 0.8; } }
}
.attr-note { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 12px; background: var(--bg-primary, #fff); color: inherit; }
.eval-report__loops { display: flex; gap: 8px;
  button.ghost { border: 1px dashed var(--border-color, #e5e7eb); background: transparent; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
}
.eval-report__iterations {
  h4 { margin: 0 0 6px; font-size: 13px; }
  ul { margin: 0; padding-left: 18px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
}
.chip { border-radius: 9px; padding: 1px 7px; font-size: 11px; background: var(--bg-tertiary, #eef0f3); margin-right: 4px;
  &.chip-warn { background: var(--warning, #f59e0b); color: var(--text-on-warning, #fff); } }
.muted { opacity: 0.65; }
.mono { font-family: var(--font-mono, monospace); }
h4 { font-size: 13px; margin: 4px 0 0; }
</style>
