<!-- overlay/custom/client/eval/views/EvalView.vue -->
<!-- 评测工作台主视图（M2）：双页签（评测集 / 运行中心）+ 内联报告面板。
     文案单一事实源=custom/client/eval/i18n.ts（governance 同款 locale 选表）。
     路由：/app/eval（ia2.eval），features.eval 门控（VITE_CUSTOM_EVAL=true 开）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type EvalSetMetaDto, type RunSummaryDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'
import EvalReportPanel from '@/custom/eval/components/EvalReportPanel.vue'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

type Tab = 'sets' | 'runs'
const tab = ref<Tab>('sets')
const sets = ref<EvalSetMetaDto[]>([])
const runs = ref<RunSummaryDto[]>([])
const loadError = ref('')
const busy = ref(false)

// —— 建集表单 ——
const showCreate = ref(false)
const createName = ref('')
const createTrack = ref<'e2e' | 'process'>('e2e')
const createModule = ref('')
const createTasksJson = ref('')
const createError = ref('')

// —— 发起运行 ——
const launchSetId = ref('')
const launchSamplesJson = ref('')
const launchNote = ref('')
const launchCross = ref(false)
const launchError = ref('')

const selectedRunId = ref('')

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  try {
    const [s, r] = await Promise.all([evalApi.listSets(), evalApi.listRuns()])
    sets.value = s.sets
    runs.value = r.runs
    if (!launchSetId.value && sets.value.length > 0) launchSetId.value = sets.value[0].id
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(() => void refresh())

async function createSet(): Promise<void> {
  createError.value = ''
  let tasks: unknown
  try {
    tasks = JSON.parse(createTasksJson.value)
  } catch {
    createError.value = 'tasks JSON 解析失败'
    return
  }
  try {
    await evalApi.createSet({
      name: createName.value.trim(),
      track: createTrack.value,
      ...(createTrack.value === 'process' && createModule.value.trim() ? { module: createModule.value.trim() } : {}),
      tasks,
    })
    showCreate.value = false
    createName.value = ''
    createModule.value = ''
    createTasksJson.value = ''
    await refresh()
  } catch (e) {
    createError.value = (e as Error).message
  }
}

async function sealSet(id: string): Promise<void> {
  if (!window.confirm(L.value.sets.sealConfirm)) return
  try {
    await evalApi.sealSet(id)
    await refresh()
  } catch (e) {
    loadError.value = (e as Error).message
  }
}

async function exportSet(id: string): Promise<void> {
  try {
    const { set } = await evalApi.exportSet(id)
    await navigator.clipboard.writeText(JSON.stringify(set, null, 2))
  } catch (e) {
    loadError.value = (e as Error).message || '导出失败（密封集不可导出）'
  }
}

async function launch(): Promise<void> {
  launchError.value = ''
  let samples: Record<string, Array<{ sessionId?: string; evidence?: { transcript?: string } }>>
  try {
    samples = JSON.parse(launchSamplesJson.value)
  } catch {
    launchError.value = 'samples JSON 解析失败'
    return
  }
  try {
    const { run } = await evalApi.launchRun({
      setId: launchSetId.value,
      samples,
      ...(launchNote.value.trim() ? { note: launchNote.value.trim() } : {}),
      ...(launchCross.value ? { crossValidate: true } : {}),
    })
    launchSamplesJson.value = ''
    launchNote.value = ''
    await refresh()
    selectedRunId.value = run.id
    tab.value = 'runs'
  } catch (e) {
    launchError.value = (e as Error).message
  }
}

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`
}

function riskText(r: RunSummaryDto): string {
  const state = r.aggregates.byLayer.risk
  if (state === 'violated') return L.value.runs.riskViolated
  if (state === 'unknown') return L.value.runs.riskUnknown
  return L.value.runs.riskClean
}

function selectRun(id: string): void {
  selectedRunId.value = selectedRunId.value === id ? '' : id
}
</script>

<template>
  <section class="eval-view" data-testid="eval-view">
    <header class="eval-view__head">
      <div>
        <h1 class="eval-view__title">{{ L.navTitle }}</h1>
        <p class="eval-view__tag">{{ L.tagline }}</p>
      </div>
      <nav class="eval-view__tabs">
        <button type="button" :class="{ active: tab === 'sets' }" data-testid="eval-tab-sets" @click="tab = 'sets'">{{ L.tabs.sets }}</button>
        <button type="button" :class="{ active: tab === 'runs' }" data-testid="eval-tab-runs" @click="tab = 'runs'">{{ L.tabs.runs }}</button>
      </nav>
    </header>

    <p v-if="loadError" class="eval-view__error" data-testid="eval-load-error">{{ L.loadedFail }}：{{ loadError }}</p>

    <!-- ── 评测集页签 ── -->
    <div v-if="tab === 'sets'" class="eval-sets">
      <div class="eval-sets__bar">
        <div>
          <h2>{{ L.sets.title }}</h2>
          <p class="muted">{{ L.sets.sub }}</p>
        </div>
        <button type="button" class="primary" data-testid="eval-create-toggle" @click="showCreate = !showCreate">
          {{ L.sets.createTitle }}
        </button>
      </div>

      <form v-if="showCreate" class="eval-sets__form card" data-testid="eval-create-form" @submit.prevent="createSet">
        <label>
          {{ L.sets.name }}
          <input v-model="createName" :placeholder="L.sets.createNamePh" data-testid="eval-create-name" required maxlength="64" />
        </label>
        <label>
          {{ L.sets.track }}
          <select v-model="createTrack" data-testid="eval-create-track">
            <option value="e2e">{{ L.sets.trackE2e }}</option>
            <option value="process">{{ L.sets.trackProcess }}</option>
          </select>
        </label>
        <label v-if="createTrack === 'process'">
          {{ L.sets.module }}
          <input v-model="createModule" :placeholder="L.sets.createModulePh" data-testid="eval-create-module" />
        </label>
        <label class="wide">
          {{ L.sets.createTasksLabel }}
          <textarea v-model="createTasksJson" :placeholder="L.sets.createTasksPh" rows="8" data-testid="eval-create-tasks" required />
        </label>
        <p v-if="createError" class="eval-view__error">{{ createError }}</p>
        <div class="actions">
          <button type="submit" class="primary" data-testid="eval-create-submit">{{ L.sets.create }}</button>
        </div>
      </form>

      <p v-if="!busy && sets.length === 0" class="muted">{{ L.sets.empty }}</p>
      <table v-if="sets.length > 0" class="eval-table" data-testid="eval-sets-table">
        <thead>
          <tr>
            <th>{{ L.sets.name }}</th>
            <th>{{ L.sets.track }}</th>
            <th>{{ L.sets.module }}</th>
            <th>{{ L.sets.taskCount }}</th>
            <th>{{ L.sets.runCount }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sets" :key="s.id" :data-testid="`eval-set-row-${s.id}`">
            <td>{{ s.name }}</td>
            <td>{{ s.track === 'e2e' ? L.sets.trackE2e : L.sets.trackProcess }}</td>
            <td>{{ s.module ?? '—' }}</td>
            <td>{{ s.taskCount }}</td>
            <td>{{ s.runCount }}</td>
            <td class="row-actions">
              <span v-if="s.sealed" class="chip chip-sealed">{{ L.sets.sealed }}</span>
              <button v-else type="button" :data-testid="`eval-seal-${s.id}`" @click="sealSet(s.id)">{{ L.sets.seal }}</button>
              <button v-if="!s.sealed" type="button" :data-testid="`eval-export-${s.id}`" @click="exportSet(s.id)">{{ L.sets.export }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── 运行中心页签 ── -->
    <div v-if="tab === 'runs'" class="eval-runs">
      <div class="eval-sets__bar">
        <div>
          <h2>{{ L.runs.title }}</h2>
          <p class="muted">{{ L.runs.sub }}</p>
        </div>
      </div>

      <form class="eval-sets__form card" data-testid="eval-launch-form" @submit.prevent="launch">
        <label>
          {{ L.runs.launchSet }}
          <select v-model="launchSetId" data-testid="eval-launch-set">
            <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}{{ s.sealed ? ` · ${L.sets.sealed}` : '' }}</option>
          </select>
        </label>
        <label class="wide">
          {{ L.runs.launchSamplesLabel }}
          <textarea v-model="launchSamplesJson" :placeholder="L.runs.launchSamplesPh" rows="5" data-testid="eval-launch-samples" required />
        </label>
        <label>
          {{ L.runs.launchNote }}
          <input v-model="launchNote" data-testid="eval-launch-note" />
        </label>
        <label class="check">
          <input v-model="launchCross" type="checkbox" data-testid="eval-launch-cross" />
          {{ L.runs.launchCross }}
        </label>
        <p v-if="launchError" class="eval-view__error">{{ launchError }}</p>
        <div class="actions">
          <button type="submit" class="primary" data-testid="eval-launch-submit">{{ L.runs.go }}</button>
        </div>
      </form>

      <p v-if="!busy && runs.length === 0" class="muted">{{ L.runs.empty }}</p>
      <table v-if="runs.length > 0" class="eval-table" data-testid="eval-runs-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{{ L.sets.name }}</th>
            <th>{{ L.runs.passAt1 }}</th>
            <th>{{ L.runs.passAtK }}</th>
            <th>{{ L.runs.risk }}</th>
            <th>{{ L.runs.unknownRatio }}</th>
            <th>k</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in runs"
            :key="r.id"
            :class="{ selected: r.id === selectedRunId }"
            :data-testid="`eval-run-row-${r.id}`"
            @click="selectRun(r.id)"
          >
            <td class="mono">{{ r.id.slice(-6) }}</td>
            <td>{{ sets.find((s) => s.id === r.setId)?.name ?? r.setId }}</td>
            <td>{{ pct(r.aggregates.passAt1) }}</td>
            <td :class="{ ok: (r.aggregates.passAtK ?? 0) >= 0.8 }">{{ pct(r.aggregates.passAtK) }}</td>
            <td :class="{ danger: r.aggregates.byLayer.risk === 'violated' }">{{ riskText(r) }}</td>
            <td>{{ pct(r.aggregates.unknownRatio) }}</td>
            <td>{{ r.k }}<span v-if="r.aggregates.statisticallyInsufficient" class="chip chip-warn" title="{{ L.runs.insufficient }}">1?</span></td>
            <td><span v-if="!r.aggregates.judgeOnline" class="chip chip-warn">{{ L.runs.judgeOffline }}</span></td>
          </tr>
        </tbody>
      </table>

      <EvalReportPanel v-if="selectedRunId" :run-id="selectedRunId" @changed="refresh" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.eval-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  max-width: 1080px;
  margin: 0 auto;
}
.eval-view__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.eval-view__title { font-size: 20px; margin: 0; }
.eval-view__tag { margin: 4px 0 0; font-size: 12px; opacity: 0.7; }
.eval-view__tabs {
  display: flex;
  gap: 4px;
  button {
    border: 1px solid var(--border-color, #e5e7eb);
    background: transparent;
    border-radius: 8px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 13px;
    &.active { background: var(--accent, #4f6ef7); color: var(--text-on-accent, #fff); }
  }
}
.eval-view__error { color: var(--danger, #dc2626); font-size: 13px; }
.eval-sets__bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  h2 { font-size: 15px; margin: 0 0 4px; }
  .muted { margin: 0; }
}
.eval-sets__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .wide { grid-column: 1 / -1; }
  .check { flex-direction: row; align-items: center; gap: 8px; }
  input, select, textarea {
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    background: var(--bg-primary, #fff);
    color: inherit;
    font-family: inherit;
  }
  textarea { font-family: var(--font-mono, monospace); font-size: 12px; }
  .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
}
.card {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 14px;
  background: var(--bg-secondary, rgba(255, 255, 255, 0.55));
}
button.primary {
  background: var(--accent, #4f6ef7);
  color: var(--text-on-accent, #fff);
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
}
.eval-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  th { font-weight: 600; opacity: 0.75; }
  tbody tr { cursor: default; &.selected { background: var(--bg-tertiary, #f1f2f4); } }
  .ok { color: var(--success, #16a34a); font-weight: 600; }
  .danger { color: var(--danger, #dc2626); font-weight: 600; }
  .mono { font-family: var(--font-mono, monospace); }
  .row-actions { display: flex; gap: 6px; justify-content: flex-end;
    button { border: 1px solid var(--border-color, #e5e7eb); background: transparent; border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
  }
}
.chip {
  border-radius: 9px;
  padding: 1px 7px;
  font-size: 11px;
  white-space: nowrap;
  &.chip-sealed { background: var(--bg-tertiary, #eef0f3); }
  &.chip-warn { background: var(--warning, #f59e0b); color: var(--text-on-warning, #fff); }
}
.muted { opacity: 0.65; font-size: 12px; }
</style>
