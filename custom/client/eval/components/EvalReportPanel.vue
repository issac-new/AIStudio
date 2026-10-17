<!-- overlay/custom/client/eval/components/EvalReportPanel.vue -->
<!-- 运行报告面板：四层卡（Result/Trajectory/Efficiency/Risk）+ 样本明细 +
     人工仲裁（conflict/unknown 终裁）+ 归因双 Loop（Agent→review 域 / Rubric→迭代账本）。
     腾讯评测体系轮增面：六环节分段 / 过程双指标 / 六维分面 / 发布门禁 / 异常分桶 /
     失败样本回流回归库。 -->
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
const reflowMsg = ref('')

/** 六环节呈现固定顺序（与服务端 EVAL_LINKS 同序）。 */
const LINK_ORDER = ['intent', 'tool_choice', 'params', 'evidence', 'state', 'expression'] as const

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

async function reflow(taskId: string, sampleIdx: number): Promise<void> {
  reflowMsg.value = ''
  try {
    const result = await evalApi.reflow(props.runId, { taskId, sampleIdx })
    reflowMsg.value = result.created ? `${L.value.runs.reflowDone}：${result.set.name}（${result.taskId}）` : L.value.runs.reflowDup
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

    <!-- 六环节分段 + 过程双指标（腾讯评测体系轮） -->
    <div v-if="run.aggregates.byLink" class="eval-report__seg" data-testid="eval-report-bylink">
      <span class="seg__title">{{ L.runs.linkTitle }}</span>
      <span v-for="link in LINK_ORDER" :key="link" class="seg__chip" :data-testid="`eval-link-${link}`">
        {{ L.runs.linkNames[link] }} {{ run.aggregates.byLink[link] ? pct(run.aggregates.byLink[link]!.passRate) : '—' }}
        <em v-if="run.aggregates.byLink[link]?.unknown" class="muted">({{ L.runs.unknown }} {{ run.aggregates.byLink[link]!.unknown }})</em>
      </span>
    </div>
    <div v-if="run.aggregates.processMetrics" class="eval-report__layers" data-testid="eval-report-process">
      <div class="layer">
        <span class="layer__name" :title="L.runs.procToolHeadHint">{{ L.runs.procToolHead }} ↑</span>
        <span class="layer__value" :class="{ ok: (run.aggregates.processMetrics.toolHeadAccuracy ?? 0) >= 0.9 }">
          {{ pct(run.aggregates.processMetrics.toolHeadAccuracy) }}
        </span>
      </div>
      <div class="layer">
        <span class="layer__name" :title="L.runs.procTrajectoryHint">{{ L.runs.procTrajectory }} ↓</span>
        <span class="layer__value" :class="{ ok: (run.aggregates.processMetrics.trajectoryMatchScore ?? 1) <= 0.2 }">
          {{ run.aggregates.processMetrics.trajectoryMatchScore === null ? '—' : run.aggregates.processMetrics.trajectoryMatchScore.toFixed(2) }}
        </span>
      </div>
      <div class="layer">
        <span class="layer__name">{{ L.runs.procSamples }}</span>
        <span class="layer__value">{{ run.aggregates.processMetrics.attemptsCompared }}</span>
      </div>
    </div>

    <!-- 发布门禁（实测项机械执行；缺口项如实呈现） -->
    <div v-if="run.aggregates.releaseGate" class="eval-report__gate" :data-testid="`eval-gate-${run.aggregates.releaseGate.verdict}`">
      <div class="gate__head">
        <span class="seg__title">{{ L.runs.gateTitle }}</span>
        <span class="chip" :class="run.aggregates.releaseGate.verdict === 'fail' ? 'chip-warn' : run.aggregates.releaseGate.verdict === 'pass' ? 'v-pass' : ''">
          {{ L.runs.gateVerdict[run.aggregates.releaseGate.verdict] }}（{{ run.aggregates.releaseGate.measuredCount }}）
        </span>
      </div>
      <table class="verdicts">
        <thead>
          <tr>
            <th>{{ L.runs.gateCols.check }}</th>
            <th>{{ L.runs.gateCols.threshold }}</th>
            <th>{{ L.runs.gateCols.measured }}</th>
            <th>{{ L.runs.gateCols.status }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in run.aggregates.releaseGate.checks" :key="c.key" :data-testid="`eval-gate-row-${c.key}`">
            <td class="mono">{{ c.key }}</td>
            <td>{{ c.threshold }}</td>
            <td :title="c.gap">{{ c.measured ?? '—' }}</td>
            <td :class="c.status === 'pass' ? 'v-pass' : c.status === 'fail' ? 'v-fail' : 'v-unknown'">
              {{ L.runs.gateStatus[c.status] }}<span v-if="c.status === 'no_data'" class="muted">（{{ c.gap }}）</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted gate__basis">{{ run.aggregates.releaseGate.basis }}</p>
    </div>

    <!-- 六维分面（未采集维如实立账） -->
    <div v-if="run.aggregates.sixDimensions" class="eval-report__sixdim" data-testid="eval-report-sixdim">
      <span class="seg__title">{{ L.runs.sixDimTitle }}</span>
      <span
        v-for="d in run.aggregates.sixDimensions"
        :key="d.dim"
        class="seg__chip"
        :class="{ 'seg__chip--gap': !d.instrumented }"
        :title="d.basis"
        :data-testid="`eval-dim-${d.dim}`"
      >
        {{ L.runs.sixDimNames[d.dim as keyof typeof L.runs.sixDimNames] }}：
        <template v-if="d.instrumented && d.value !== null">{{ d.value.toFixed(2) }}</template>
        <template v-else>{{ L.runs.sixDimNotMeasured }}</template>
      </span>
    </div>

    <!-- 异常场景分桶 -->
    <div v-if="run.aggregates.byException?.length" class="eval-report__exc" data-testid="eval-report-byexception">
      <span class="seg__title">{{ L.runs.excTitle }}</span>
      <table class="verdicts">
        <thead>
          <tr>
            <th>{{ L.runs.excCols.type }}</th>
            <th>{{ L.runs.excCols.taskCount }}</th>
            <th>{{ L.runs.excCols.passAtK }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in run.aggregates.byException" :key="b.type">
            <td>{{ L.runs.excNames[b.type as keyof typeof L.runs.excNames] ?? b.type }}</td>
            <td>{{ b.taskCount }}</td>
            <td :class="{ ok: b.passAtK !== null && b.passAtK >= 0.8, danger: b.passAtK !== null && b.passAtK < 0.5 }">{{ pct(b.passAtK) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

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
          <button
            v-if="!a.passed"
            type="button"
            class="ghost"
            :title="L.runs.reflowHint"
            :data-testid="`reflow-${a.taskId}-${a.sampleIdx}`"
            @click="reflow(a.taskId, a.sampleIdx)"
          >{{ L.runs.reflow }}</button>
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
      <p v-if="reflowMsg" class="eval-report__reflow-msg" data-testid="eval-reflow-msg">{{ reflowMsg }}</p>
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
.eval-report__error { color: var(--danger); font-size: 13px; margin: 0; }
.eval-report__hint { color: var(--warning); font-size: 13px; margin: 0; }
.eval-report__seg, .eval-report__sixdim {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  .seg__title { font-size: 12px; opacity: 0.7; margin-right: 4px; }
}
.seg__chip {
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 2px 8px;
  font-size: 12px;
  em { font-style: normal; }
  &.seg__chip--gap { opacity: 0.6; border-style: dashed; }
}
.eval-report__gate {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 6px;
  .gate__head { display: flex; align-items: center; gap: 8px; }
  .gate__basis { margin: 0; font-size: 11px; }
}
.eval-report__exc {
  display: flex; flex-direction: column; gap: 6px;
  .seg__title { font-size: 12px; opacity: 0.7; }
}
.eval-report__reflow-msg { color: var(--success); font-size: 12px; margin: 0; }
.eval-report__layers { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.layer {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  &.layer-risk { border-color: var(--danger); }
}
.layer__name { font-size: 12px; opacity: 0.7; }
.layer__value { font-size: 18px; font-weight: 600; &.small { font-size: 12px; font-weight: 400; } &.ok { color: var(--success); } }
.attempt { border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 10px; }
.attempt__head { display: flex; align-items: center; gap: 10px; font-size: 13px; margin-bottom: 6px; }
.verdicts { width: 100%; border-collapse: collapse; font-size: 12px;
  td { padding: 4px 8px; border-top: 1px solid var(--border-color); }
  tr.conflict { background: color-mix(in srgb, var(--warning) 12%, transparent); }
}
.v-pass { color: var(--success); font-weight: 600; }
.v-fail { color: var(--danger); font-weight: 600; }
.v-unknown { color: var(--warning); font-weight: 600; }
.row-actions { display: flex; gap: 6px; justify-content: flex-end;
  button { border: 1px solid var(--border-color); background: transparent; border-radius: 6px; padding: 2px 7px; cursor: pointer; font-size: 11px;
    &.ghost { border-style: dashed; opacity: 0.8; } }
}
.attr-note { border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 10px; font-size: 12px; background: var(--bg-primary); color: inherit; }
.eval-report__loops { display: flex; gap: 8px;
  button.ghost { border: 1px dashed var(--border-color); background: transparent; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
}
.eval-report__iterations {
  h4 { margin: 0 0 6px; font-size: 13px; }
  ul { margin: 0; padding-left: 18px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
}
.chip { border-radius: 9px; padding: 1px 7px; font-size: 11px; background: var(--bg-tertiary); margin-right: 4px;
  &.chip-warn { background: var(--warning); color: var(--text-on-warning); } }
.muted { opacity: 0.65; }
.mono { font-family: var(--font-mono); }
h4 { font-size: 13px; margin: 4px 0 0; }
</style>
