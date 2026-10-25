<!-- overlay/custom/client/eval/components/FlywheelPanel.vue
     数据飞轮运营面（2026-10-25 吸收轮）：转化漏斗（错误转化率）+ 根因聚类 +
     坏例通过率退化门 + 反事实五维变体批量扩产。数据源 GET /api/hermes/eval/flywheel。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type FlywheelReadoutDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

const readout = ref<FlywheelReadoutDto | null>(null)
const loading = ref(false)
const error = ref('')
const expanding = ref(false)
const expandNote = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    readout.value = await evalApi.flywheel()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function expandVariants(): Promise<void> {
  expanding.value = true
  expandNote.value = ''
  error.value = ''
  try {
    const res = await evalApi.expandBadcaseVariants({ allFromRegression: true })
    expandNote.value = res.appended > 0
      ? L.value.flywheel.expandDone.replace('{n}', String(res.appended))
      : L.value.flywheel.expandZero
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    expanding.value = false
  }
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`
}

const gateStatusLabel = computed(() => {
  const gate = readout.value?.gate
  if (!gate) return ''
  const f = L.value.flywheel
  if (gate.status === 'no_data') return f.gateNoData
  if (gate.status === 'insufficient') return f.gateInsufficient
  if (gate.status === 'fail') return f.gateFail
  return f.gatePass
})

const rootCauseMax = computed(() => Math.max(1, ...(readout.value?.byRootCause ?? []).map((r) => r.count)))
</script>

<template>
  <section class="eval-flywheel" data-testid="eval-flywheel">
    <header class="eval-flywheel__head">
      <div>
        <h2>{{ L.flywheel.title }}</h2>
        <p class="muted">{{ L.flywheel.sub }}</p>
      </div>
      <button type="button" data-testid="eval-flywheel-reload" :disabled="loading" @click="load">{{ L.flywheel.reload }}</button>
    </header>

    <p v-if="error" class="eval-view__error" data-testid="eval-flywheel-error">{{ error }}</p>

    <template v-if="readout">
      <!-- 转化漏斗 -->
      <h3>{{ L.flywheel.funnelTitle }}</h3>
      <div class="eval-flywheel__cards" data-testid="eval-flywheel-funnel">
        <div class="eval-flywheel__card">
          <span class="num">{{ readout.funnel.badCases }}</span>
          <span class="lbl">{{ L.flywheel.badCases }}</span>
        </div>
        <div class="eval-flywheel__card">
          <span class="num">{{ readout.funnel.reflowed }}</span>
          <span class="lbl">{{ L.flywheel.reflowed }}</span>
        </div>
        <div class="eval-flywheel__card">
          <span class="num">{{ readout.funnel.distilled }}</span>
          <span class="lbl">{{ L.flywheel.distilled }}</span>
        </div>
        <div class="eval-flywheel__card">
          <span class="num">{{ readout.funnel.variantTasks }}</span>
          <span class="lbl">{{ L.flywheel.variantTasks }}</span>
        </div>
        <div class="eval-flywheel__card">
          <span class="num">{{ readout.funnel.remediationOpen }} / {{ readout.funnel.remediationClosed }}</span>
          <span class="lbl">{{ L.flywheel.remediation }}</span>
        </div>
        <div class="eval-flywheel__card eval-flywheel__card--rate" data-testid="eval-flywheel-rate">
          <span class="num">{{ pct(readout.funnel.conversionRate) }}</span>
          <span class="lbl">{{ L.flywheel.conversionRate }}</span>
        </div>
      </div>

      <!-- 根因聚类 -->
      <h3>{{ L.flywheel.rootCauseTitle }}</h3>
      <p v-if="readout.byRootCause.length === 0" class="muted" data-testid="eval-flywheel-roots-empty">{{ L.flywheel.empty }}</p>
      <ul v-else class="eval-flywheel__roots" data-testid="eval-flywheel-roots">
        <li v-for="r in readout.byRootCause" :key="r.rootCause" :data-testid="`eval-flywheel-root-${r.rootCause}`">
          <span class="eval-flywheel__root-label">{{ r.label }}（{{ r.rootCause }}）</span>
          <span class="eval-flywheel__root-bar" :style="{ width: `${Math.round((r.count / rootCauseMax) * 100)}%` }" />
          <span class="eval-flywheel__root-count">{{ r.count }} {{ L.flywheel.rootCauseCount }}</span>
        </li>
      </ul>

      <!-- 通过率退化门 -->
      <h3>{{ L.flywheel.gateTitle }}</h3>
      <p
        class="eval-flywheel__gate-status"
        :class="`eval-flywheel__gate-status--${readout.gate.status}`"
        :data-testid="`eval-flywheel-gate-${readout.gate.status}`"
      >
        {{ gateStatusLabel }}（{{ L.flywheel.gateMin }} ≥{{ Math.round(readout.gate.minPassRate * 100) }}% × {{ readout.gate.minSamples }}）
        <template v-if="readout.gate.runId"> · run {{ readout.gate.runId }}<template v-if="readout.gate.k">（k={{ readout.gate.k }}）</template></template>
      </p>
      <table v-if="readout.gate.tasks.length > 0" class="eval-table" data-testid="eval-flywheel-gate-table">
        <thead>
          <tr>
            <th>{{ L.flywheel.gateTaskCol }}</th>
            <th>{{ L.flywheel.gateSamplesCol }}</th>
            <th>{{ L.flywheel.gatePassedCol }}</th>
            <th>{{ L.flywheel.gateRateCol }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in readout.gate.tasks" :key="t.taskId">
            <td>{{ t.taskId }}</td>
            <td>{{ t.samples }}</td>
            <td>{{ t.passed }}</td>
            <td :class="{ 'eval-flywheel__rate-bad': readout.gate.reproduced.includes(t.taskId) }">{{ pct(t.passRate) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">{{ L.flywheel.gateEmpty }}</p>

      <!-- 变体扩产动作 -->
      <h3>{{ L.flywheel.expandTitle }}</h3>
      <p class="muted">{{ L.flywheel.expandHint }}</p>
      <div class="eval-flywheel__actions">
        <button
          type="button"
          class="primary"
          data-testid="eval-flywheel-expand"
          :disabled="expanding"
          @click="expandVariants"
        >{{ L.flywheel.expandBtn }}</button>
        <span v-if="expandNote" class="eval-flywheel__note" data-testid="eval-flywheel-expand-note">{{ expandNote }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.eval-flywheel__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.eval-flywheel__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px; }
.eval-flywheel__card { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--border, #ddd); border-radius: 8px; }
.eval-flywheel__card .num { font-size: 20px; font-weight: 600; }
.eval-flywheel__card .lbl { color: var(--muted, #888); font-size: 12px; }
.eval-flywheel__card--rate { border-color: var(--success, green); }
.eval-flywheel__roots { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 6px; }
.eval-flywheel__roots li { display: grid; grid-template-columns: 200px 1fr 64px; align-items: center; gap: 8px; }
.eval-flywheel__root-bar { display: inline-block; height: 10px; background: var(--primary, #4a7dff); border-radius: 4px; }
.eval-flywheel__gate-status { padding: 6px 10px; border-radius: 6px; font-weight: 600; }
.eval-flywheel__gate-status--pass { background: rgba(46, 160, 67, 0.12); color: #2ea043; }
.eval-flywheel__gate-status--fail { background: rgba(248, 81, 73, 0.12); color: #f85149; }
.eval-flywheel__gate-status--no_data, .eval-flywheel__gate-status--insufficient { background: rgba(139, 148, 158, 0.12); color: #8b949e; }
.eval-flywheel__rate-bad { color: #f85149; font-weight: 600; }
.eval-flywheel__actions { display: flex; align-items: center; gap: 10px; }
.eval-flywheel__note { color: var(--success, green); }
</style>
