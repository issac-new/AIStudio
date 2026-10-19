<!-- overlay/custom/client/ia2/views/gov/EvalOpsSection.vue
     ⑥治理·度量检查里的评测运营卡（百度评测范式轮 §7：评估织进全流程）。
     只读聚合：评测集/运行/门禁/unknown/能力维度覆盖/最近红队；不复制评测域逻辑。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  evalApi,
  type CoverageDto,
  type EvalSetMetaDto,
  type RedteamRunSummaryDto,
  type RunSummaryDto,
} from '@/custom/eval/api'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => (zh.value
  ? {
      title: '评测运营',
      sub: '评测集 → 运行 → 门禁 → 消费；详细操作在评测工作台',
      sets: '评测集',
      runs: '运行',
      latestPassK: '最近 pass@k',
      latestGate: '最近门禁',
      unknown: 'unknown 率',
      coverage: '维度覆盖',
      redteam: '最近红队逃逸率',
      redteamFp: '良性误报',
      open: '打开评测工作台',
      empty: '还没有评测运行——先建集并跑一次回放判分，评测运营卡才有账可读。',
      loading: '加载中…',
      failed: '读取失败',
      gateNames: { pass: '实测全过', fail: '有不过', no_data: '无实测证据' },
    }
  : {
      title: 'Eval operations',
      sub: 'Sets → runs → gate → consumption; operate in the Eval Studio',
      sets: 'Sets',
      runs: 'Runs',
      latestPassK: 'Latest pass@k',
      latestGate: 'Latest gate',
      unknown: 'Unknown ratio',
      coverage: 'Dimension coverage',
      redteam: 'Latest red-team evasion',
      redteamFp: 'Benign FP',
      open: 'Open Eval Studio',
      empty: 'No eval runs yet — create a set and run a replay to populate this card.',
      loading: 'Loading…',
      failed: 'Load failed',
      gateNames: { pass: 'all measured pass', fail: 'has failures', no_data: 'no measured evidence' },
    }))

const sets = ref<EvalSetMetaDto[]>([])
const runs = ref<RunSummaryDto[]>([])
const coverage = ref<CoverageDto | null>(null)
const redteam = ref<RedteamRunSummaryDto | null>(null)
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  loading.value = true
  try {
    const [s, r, reg, rt] = await Promise.all([
      evalApi.listSets(),
      evalApi.listRuns(),
      evalApi.metricRegistry(),
      evalApi.listRedteamRuns(1),
    ])
    sets.value = s.sets
    runs.value = r.runs
    coverage.value = reg.coverage
    redteam.value = rt.runs[0] ?? null
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

const latest = computed(() => [...runs.value].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null)

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`
}
</script>

<template>
  <section class="eos card" data-testid="eval-ops-section">
    <header class="eos__head">
      <div>
        <h3>{{ T.title }}</h3>
        <p class="muted">{{ T.sub }}</p>
      </div>
      <router-link class="eos__link" :to="{ name: 'ia2.eval' }" data-testid="eval-ops-open">{{ T.open }} →</router-link>
    </header>

    <p v-if="error" class="eos__error">{{ T.failed }}：{{ error }}</p>
    <p v-else-if="loading" class="muted">{{ T.loading }}</p>
    <p v-else-if="runs.length === 0" class="muted" data-testid="eval-ops-empty">{{ T.empty }}</p>
    <template v-else>
      <div class="eos__grid">
        <div class="stat"><span class="muted">{{ T.sets }}</span><strong>{{ sets.length }}</strong></div>
        <div class="stat"><span class="muted">{{ T.runs }}</span><strong>{{ runs.length }}</strong></div>
        <div class="stat">
          <span class="muted">{{ T.latestPassK }}</span>
          <strong :class="{ ok: (latest?.aggregates.passAtK ?? 0) >= 0.8 }">{{ pct(latest?.aggregates.passAtK) }}</strong>
        </div>
        <div class="stat">
          <span class="muted">{{ T.latestGate }}</span>
          <strong :class="{ danger: latest?.aggregates.releaseGate?.verdict === 'fail' }">
            {{ latest?.aggregates.releaseGate ? T.gateNames[latest.aggregates.releaseGate.verdict] : '—' }}
          </strong>
        </div>
        <div class="stat">
          <span class="muted">{{ T.unknown }}</span>
          <strong :class="{ warn: (latest?.aggregates.unknownRatio ?? 0) > 0.2 }">{{ pct(latest?.aggregates.unknownRatio) }}</strong>
        </div>
        <div class="stat">
          <span class="muted">{{ T.coverage }}</span>
          <strong>{{ coverage ? `${coverage.covered}/${coverage.total}` : '—' }}</strong>
          <span v-if="coverage" class="muted small">untagged {{ coverage.untaggedTasks }}</span>
        </div>
        <div class="stat">
          <span class="muted">{{ T.redteam }}</span>
          <strong :class="{ warn: (redteam?.totals.evasionRate ?? 0) > 0.3 }">{{ pct(redteam?.totals.evasionRate) }}</strong>
          <span v-if="redteam" class="muted small">{{ T.redteamFp }} {{ pct(redteam.benign.falsePositiveRate) }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.eos { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
.eos__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  h3 { margin: 0; font-size: 14px; }
  p { margin: 2px 0 0; font-size: 11px; }
}
.eos__link { font-size: 12px; color: var(--accent-primary); text-decoration: none; white-space: nowrap; }
.eos__error { color: var(--danger); font-size: 12px; margin: 0; }
.eos__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
.stat { border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px;
  strong { font-size: 18px; &.ok { color: var(--success); } &.warn { color: var(--warning); } &.danger { color: var(--danger); } }
}
.small { font-size: 10px; }
</style>
