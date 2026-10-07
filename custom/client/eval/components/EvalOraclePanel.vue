<!-- overlay/custom/client/eval/components/EvalOraclePanel.vue -->
<!-- UI Oracle 面板（M3）：用例管理 + 两阶段运行记录（预测 vs 实际）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval.oracle : evalMessages.en.eval.oracle
})

interface OracleCaseDto {
  id: string
  name: string
  targetUrl: string
  action: { kind: string; somIndex?: number; selector?: string }
  expectText?: string
  createdAt: number
}
interface OracleRunDto {
  id: string
  caseId: string
  status: string
  verdict: string
  error?: string
  stage1?: { elementCount: number; target: { index: number; tag: string; text: string } | null; willChange: string; changeKind: string | null; online: boolean }
  stage2?: { pixelUnchanged: boolean | null; domDiff: { added: string[]; removed: string[] }; actualChangeKind: string | null; matchVerdict: string; visionAttempted: boolean; online: boolean }
  frames?: { urlChanged: boolean }
  createdAt: number
}

const cases = ref<OracleCaseDto[]>([])
const runs = ref<OracleRunDto[]>([])
const error = ref('')
const busy = ref(false)

const name = ref('')
const url = ref('')
const selector = ref('')
const somIndex = ref(1)
const expectText = ref('')

async function refresh(): Promise<void> {
  busy.value = true
  try {
    const [c, r] = await Promise.all([evalApi.listOracleCases(), evalApi.listOracleRuns()])
    cases.value = (c as { cases: OracleCaseDto[] }).cases
    runs.value = (r as { runs: OracleRunDto[] }).runs
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(() => void refresh())

async function createCase(): Promise<void> {
  error.value = ''
  try {
    await evalApi.createOracleCase({
      name: name.value.trim(),
      targetUrl: url.value.trim(),
      action: selector.value.trim() ? { kind: 'click', selector: selector.value.trim() } : { kind: 'click', somIndex: somIndex.value },
      ...(expectText.value.trim() ? { expectText: expectText.value.trim() } : {}),
    })
    name.value = ''
    url.value = ''
    selector.value = ''
    expectText.value = ''
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function runCase(id: string): Promise<void> {
  error.value = ''
  try {
    await evalApi.runOracleCase(id)
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

function verdictClass(v: string): string {
  if (v === 'clean') return 'v-pass'
  if (v === 'ui_unresponsive' || v === 'mismatch' || v === 'failed') return 'v-fail'
  return 'v-unknown'
}

function verdictText(v: string): string {
  const map: Record<string, string> = {
    clean: L.value.vClean,
    ui_unresponsive: L.value.vUiUnresponsive,
    mismatch: L.value.vMismatch,
    unknown: L.value.vUnknown,
    failed: L.value.vFailed,
  }
  return map[v] ?? v
}

function runsOf(caseId: string): OracleRunDto[] {
  return runs.value.filter((r) => r.caseId === caseId).slice(-3).reverse()
}
</script>

<template>
  <section class="oracle" data-testid="eval-oracle-panel">
    <div class="oracle__bar">
      <div>
        <h2>{{ L.title }}</h2>
        <p class="muted">{{ L.sub }}</p>
      </div>
    </div>

    <form class="card oracle__form" data-testid="oracle-create-form" @submit.prevent="createCase">
      <label>{{ L.name }}<input v-model="name" required maxlength="64" data-testid="oracle-create-name" /></label>
      <label class="wide">{{ L.url }}<input v-model="url" placeholder="http://localhost:8649/#/app" required data-testid="oracle-create-url" /></label>
      <label>{{ L.selector }}<input v-model="selector" placeholder="[data-testid=eval-tab-runs]" data-testid="oracle-create-selector" /></label>
      <label>{{ L.somIndex }}<input v-model.number="somIndex" type="number" min="1" data-testid="oracle-create-som" /></label>
      <label class="wide">{{ L.expectText }}<input v-model="expectText" data-testid="oracle-create-expect" /></label>
      <div class="actions"><button type="submit" class="primary" data-testid="oracle-create-submit">{{ L.create }}</button></div>
    </form>

    <p v-if="error" class="oracle__error">{{ error }}</p>
    <p v-if="!busy && cases.length === 0" class="muted">{{ L.empty }}</p>

    <div v-for="c in cases" :key="c.id" class="card oracle__case" :data-testid="`oracle-case-${c.id}`">
      <div class="oracle__case-head">
        <strong>{{ c.name }}</strong>
        <span class="mono muted">{{ c.targetUrl }}</span>
        <span class="chip">{{ c.action.selector ?? `#${c.action.somIndex}` }}</span>
        <button type="button" class="primary" :data-testid="`oracle-run-${c.id}`" @click="runCase(c.id)">{{ L.run }}</button>
      </div>
      <p v-if="runsOf(c.id).length === 0" class="muted">{{ L.noRuns }}</p>
      <div v-for="r in runsOf(c.id)" :key="r.id" class="oracle__run" :data-testid="`oracle-runrow-${r.id}`">
        <div class="oracle__run-head">
          <span :class="verdictClass(r.verdict)">{{ L.verdict }}：{{ verdictText(r.verdict) }}</span>
          <span v-if="r.stage1 && !r.stage1.online" class="chip chip-warn">{{ L.judgeOffline }}</span>
          <span v-if="r.frames?.urlChanged" class="chip">{{ L.urlChanged }}</span>
          <span class="muted mono">{{ new Date(r.createdAt).toLocaleTimeString() }}</span>
        </div>
        <div v-if="r.error" class="oracle__error">{{ r.error }}</div>
        <div v-if="r.stage1 && r.stage2" class="oracle__stages">
          <div class="stage">
            <span class="stage__name">{{ L.predicted }}</span>
            <span>{{ L.willChange }}: {{ r.stage1.willChange === 'yes' ? '✓' : r.stage1.willChange === 'no' ? '✗' : '?' }} · {{ L.changeKind }}: {{ r.stage1.changeKind ?? '—' }}</span>
          </div>
          <div class="stage">
            <span class="stage__name">{{ L.actual }}</span>
            <span>{{ L.pixel }}: {{ r.stage2.pixelUnchanged ? L.pixelUnchanged : 'diff' }} · {{ L.changeKind }}: {{ r.stage2.actualChangeKind ?? '—' }}</span>
            <div v-if="r.stage2.domDiff.added.length || r.stage2.domDiff.removed.length" class="domdiff">
              <div v-for="a in r.stage2.domDiff.added.slice(0, 3)" :key="'a' + a" class="v-pass">+ {{ a }}</div>
              <div v-for="d in r.stage2.domDiff.removed.slice(0, 3)" :key="'d' + d" class="v-fail">− {{ d }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.oracle { display: flex; flex-direction: column; gap: 12px;
  h2 { font-size: 15px; margin: 0 0 4px; } }
.oracle__bar .muted { margin: 0; }
.oracle__form {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .wide { grid-column: 1 / -1; }
  input { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 13px; background: var(--bg-primary, #fff); color: inherit; }
  .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
}
.oracle__case { display: flex; flex-direction: column; gap: 8px; }
.oracle__case-head { display: flex; align-items: center; gap: 10px; font-size: 13px;
  button.primary { margin-left: auto; } }
.oracle__run { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 8px 10px; font-size: 12px; }
.oracle__run-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.oracle__stages { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stage { border: 1px solid var(--border-color, #eee); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }
.stage__name { font-weight: 600; opacity: 0.75; }
.domdiff { max-height: 90px; overflow: auto; font-family: var(--font-mono, monospace); font-size: 11px; }
.oracle__error { color: var(--danger, #dc2626); font-size: 13px; margin: 0; }
.v-pass { color: var(--success, #16a34a); font-weight: 600; }
.v-fail { color: var(--danger, #dc2626); font-weight: 600; }
.v-unknown { color: var(--warning, #b45309); font-weight: 600; }
.chip { border-radius: 9px; padding: 1px 7px; font-size: 11px; background: var(--bg-tertiary, #eef0f3);
  &.chip-warn { background: var(--warning, #f59e0b); color: var(--text-on-warning, #fff); } }
.muted { opacity: 0.65; font-size: 12px; }
.mono { font-family: var(--font-mono, monospace); }
button.primary { background: var(--accent, #4f6ef7); color: var(--text-on-accent, #fff); border: none; border-radius: 8px; padding: 5px 12px; cursor: pointer; font-size: 12px; }
</style>
