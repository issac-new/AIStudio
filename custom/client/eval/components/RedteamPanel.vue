<!-- overlay/custom/client/eval/components/RedteamPanel.vue
     安全红队（百度评测范式轮 §8）：攻击向量库 → 确定性变异 → 按逃逸适应度进化
     → 检测评估。v1 检测器=S0 规则层（与生产 ToolResultGuard 同源）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  evalApi,
  type RedteamCorpusDto,
  type RedteamRunDto,
  type RedteamRunSummaryDto,
} from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

const corpus = ref<RedteamCorpusDto | null>(null)
const runs = ref<RedteamRunSummaryDto[]>([])
const current = ref<RedteamRunDto | null>(null)
const loading = ref(false)
const running = ref(false)
const error = ref('')

const form = ref({ generations: 3, population: 20, threshold: 3, seed: 20261019 })

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [c, r] = await Promise.all([evalApi.redteamCorpus(), evalApi.listRedteamRuns(10)])
    corpus.value = c
    runs.value = r.runs
    form.value = { ...c.defaults }
    if (r.runs.length > 0 && !current.value) {
      await openRun(r.runs[0]!.id)
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function run(): Promise<void> {
  running.value = true
  error.value = ''
  try {
    const res = await evalApi.runRedteam({
      generations: Number(form.value.generations),
      population: Number(form.value.population),
      threshold: Number(form.value.threshold),
      seed: Number(form.value.seed),
    })
    current.value = res.run
    const list = await evalApi.listRedteamRuns(10)
    runs.value = list.runs
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    running.value = false
  }
}

async function openRun(id: string): Promise<void> {
  try {
    const res = await evalApi.getRedteamRun(id)
    current.value = res.run
  } catch (e) {
    error.value = (e as Error).message
  }
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`
}

function categoryLabel(key: string): string {
  const c = corpus.value?.categories.find((x) => x.key === key)
  return c ? (zh.value ? c.zh : c.en) : key
}

function operatorLabel(key: string): string {
  if (key === 'seed') return L.value.redteam.seedLabel
  const o = corpus.value?.operators.find((x) => x.key === key)
  return o ? (zh.value ? o.zh : o.en) : key
}

function timeText(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <section class="rt" data-testid="eval-redteam">
    <div class="rt__bar">
      <div>
        <h2>{{ L.redteam.title }}</h2>
        <p class="muted">{{ L.redteam.sub }}</p>
      </div>
      <button type="button" data-testid="eval-redteam-reload" @click="load">{{ L.advice.reload }}</button>
    </div>

    <p v-if="error" class="rt__error">{{ error }}</p>
    <p v-else-if="loading" class="muted">{{ L.loading }}</p>

    <template v-if="corpus">
      <div class="rt__corpus card" data-testid="eval-redteam-corpus">
        <div class="rt__detector">
          <strong>{{ L.redteam.detector }}：</strong>
          <span>{{ zh ? corpus.detector.zh : corpus.detector.en }}</span>
          <span class="chip" :class="{ 'chip-warn': !corpus.detector.s1Wired }">
            {{ L.redteam.s1Wired }}：{{ corpus.detector.s1Wired ? 'on' : L.redteam.s1NotWired }}
          </span>
        </div>
        <p class="muted small">{{ corpus.detector.note }}</p>
        <div class="rt__cats">
          <span v-for="c in corpus.categories" :key="c.key" class="chip chip-weapon">
            {{ zh ? c.zh : c.en }} {{ c.seedCount }}
          </span>
          <span class="chip chip-benign">{{ zh ? '良性难负例' : 'Benign' }} {{ corpus.benignCount }}</span>
        </div>
      </div>

      <form class="rt__form card" data-testid="eval-redteam-form" @submit.prevent="run">
        <label>{{ L.redteam.generations }}<input v-model.number="form.generations" type="number" min="0" :max="corpus.limits.maxGenerations" /></label>
        <label>{{ L.redteam.population }}<input v-model.number="form.population" type="number" min="1" :max="corpus.limits.maxPopulation" /></label>
        <label>{{ L.redteam.threshold }}<input v-model.number="form.threshold" type="number" min="1" :max="corpus.limits.maxThreshold" /></label>
        <label>{{ L.redteam.seed }}<input v-model.number="form.seed" type="number" min="0" /></label>
        <button type="submit" class="primary" :disabled="running" data-testid="eval-redteam-run">
          {{ running ? L.redteam.running : L.redteam.run }}
        </button>
      </form>

      <div v-if="runs.length" class="rt__history" data-testid="eval-redteam-history">
        <span class="muted">{{ L.redteam.history }}：</span>
        <button
          v-for="r in runs"
          :key="r.id"
          type="button"
          class="history-chip"
          :class="{ active: current?.id === r.id }"
          :data-testid="`eval-redteam-history-${r.id}`"
          @click="openRun(r.id)"
        >
          {{ timeText(r.createdAt) }} · {{ pct(r.totals.evasionRate) }}
        </button>
      </div>

      <template v-if="current">
        <div class="rt__summary" data-testid="eval-redteam-summary">
          <div class="stat"><span class="muted">{{ L.redteam.evaluated }}</span><strong>{{ current.totals.evaluated }}</strong></div>
          <div class="stat"><span class="muted">{{ L.redteam.detected }}</span><strong class="ok">{{ current.totals.detected }}</strong></div>
          <div class="stat"><span class="muted">{{ L.redteam.evaded }}</span><strong class="warn">{{ current.totals.evaded }}</strong></div>
          <div class="stat"><span class="muted">{{ L.redteam.evasion }}</span><strong :class="{ warn: (current.totals.evasionRate ?? 0) > 0.3 }">{{ pct(current.totals.evasionRate) }}</strong></div>
          <div class="stat"><span class="muted">{{ L.redteam.fp }}</span><strong>{{ pct(current.benign.falsePositiveRate) }}</strong></div>
        </div>

        <div class="rt__grid">
          <div class="card">
            <h3>{{ L.redteam.byGeneration }}</h3>
            <div class="bars" data-testid="eval-redteam-generations">
              <div v-for="g in current.byGeneration" :key="g.generation" class="bar">
                <span class="bar__label">{{ L.redteam.generation }} {{ g.generation }}</span>
                <div class="bar__track"><i :style="{ width: `${Math.round((g.evasionRate ?? 0) * 100)}%` }" /></div>
                <span class="bar__value mono">{{ pct(g.evasionRate) }}</span>
                <span class="muted mono">{{ g.evaluated }}</span>
              </div>
            </div>
            <p class="muted small">{{ L.redteam.notes }}：{{ current.detector }} · seed {{ current.config.seed }} · threshold {{ current.config.threshold }}</p>
          </div>

          <div class="card">
            <h3>{{ L.redteam.byCategory }}</h3>
            <table class="rt-table">
              <thead><tr><th>{{ L.redteam.category }}</th><th>{{ L.redteam.total }}</th><th>{{ L.redteam.evasionRate }}</th></tr></thead>
              <tbody>
                <tr v-for="row in current.byCategory" :key="row.category">
                  <td>{{ categoryLabel(row.category) }}</td>
                  <td>{{ row.total }}</td>
                  <td :class="{ warn: (row.evasionRate ?? 0) > 0.3 }">{{ pct(row.evasionRate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>{{ L.redteam.byOperator }}</h3>
          <table class="rt-table" data-testid="eval-redteam-operators">
            <thead><tr><th>{{ L.redteam.operator }}</th><th>{{ L.redteam.total }}</th><th>{{ L.redteam.detected }}</th><th>{{ L.redteam.evasionRate }}</th></tr></thead>
            <tbody>
              <tr v-for="row in current.byOperator" :key="row.operator">
                <td>{{ operatorLabel(row.operator) }}</td>
                <td>{{ row.total }}</td>
                <td>{{ row.detected }}</td>
                <td :class="{ warn: (row.evasionRate ?? 0) > 0.5 }">{{ pct(row.evasionRate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>{{ L.redteam.survivors }}</h3>
          <p v-if="current.survivors.length === 0" class="muted">{{ L.redteam.noSurvivors }}</p>
          <table v-else class="rt-table" data-testid="eval-redteam-survivors">
            <thead>
              <tr>
                <th>{{ L.redteam.sample }}</th>
                <th>{{ L.redteam.score }}</th>
                <th>{{ L.redteam.category }}</th>
                <th>{{ L.redteam.lineage }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in current.survivors" :key="s.id">
                <td class="preview mono">{{ s.preview }}</td>
                <td>{{ s.score }}</td>
                <td>{{ categoryLabel(s.category) }}</td>
                <td class="small">{{ s.lineage.length ? s.lineage.map(operatorLabel).join(' → ') : L.redteam.seedLabel }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card" data-testid="eval-redteam-benign">
          <h3>{{ L.redteam.benignTitle }}</h3>
          <p v-if="current.benign.flagged === 0" class="muted">0 / {{ current.benign.total }}</p>
          <table v-else class="rt-table">
            <thead><tr><th>{{ L.redteam.sample }}</th><th>{{ L.redteam.hits }}</th></tr></thead>
            <tbody>
              <tr v-for="b in current.benign.flaggedSamples" :key="b.seedId">
                <td class="preview mono">{{ b.preview }}</td>
                <td class="small">{{ b.hits.join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul class="rt__notes">
          <li v-for="(n, i) in current.notes" :key="i">{{ n }}</li>
        </ul>
      </template>
    </template>
  </section>
</template>

<style scoped lang="scss">
.rt { display: flex; flex-direction: column; gap: 14px; }
.rt__bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  h2 { margin: 0; font-size: 15px; } p { margin: 2px 0 0; font-size: 12px; }
  button { border: 1px solid var(--border-color); background: transparent; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
}
.rt__error { color: var(--danger); }
.rt__corpus { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.rt__detector { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
.rt__cats { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { border: 1px solid var(--border-color); border-radius: 9px; padding: 1px 7px; font-size: 10px; }
.chip-weapon { border-style: dashed; }
.chip-benign { border-color: var(--success); }
.chip-warn { border-color: var(--warning); color: var(--warning); }
.rt__form { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; align-items: end; padding: 10px 12px;
  label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
  input { border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 6px; background: transparent; color: inherit; }
  button { height: 28px; }
}
.rt__history { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; }
.history-chip { border: 1px solid var(--border-color); background: transparent; border-radius: 9px; padding: 1px 8px; cursor: pointer; font-size: 11px;
  &.active { border-color: var(--accent-primary); }
}
.rt__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
.stat { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px;
  strong { font-size: 20px; &.ok { color: var(--success); } &.warn { color: var(--warning); } }
}
.rt__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.card { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
  h3 { margin: 0; font-size: 13px; }
}
.bars { display: flex; flex-direction: column; gap: 5px; }
.bar { display: grid; grid-template-columns: 56px 1fr 48px 40px; align-items: center; gap: 8px; font-size: 11px; }
.bar__track { height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--border-color) 45%, transparent); overflow: hidden;
  i { display: block; height: 100%; background: var(--danger); }
}
.rt-table { width: 100%; border-collapse: collapse; font-size: 12px;
  th, td { text-align: left; padding: 5px 6px; border-top: 1px solid var(--border-color); }
  th { opacity: 0.7; font-weight: 500; }
  .warn { color: var(--warning); }
}
.preview { max-width: 420px; white-space: pre-wrap; word-break: break-all; }
.small { font-size: 11px; }
.rt__notes { font-size: 11px; opacity: 0.8; margin: 0; padding-left: 18px; }
</style>
