<!-- overlay/custom/client/governance/components/ObsSignalsSection.vue -->
<!-- 观测信号与漂移告警（2026-10-19 观测层轮，spec 2026-10-19-observability-signals-round）：
     左=信号卡（请求量/TTFT p95/工具成功率/429 率/缓存命中率/token），右=四类基线
     漂移告警列表（成本/延迟/错误率/质量，带基线证据句）。缺席如实降级不猜数。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import {
  fetchObsAlerts,
  fetchObsSignals,
  type ObsAlertsDto,
  type ObsSignalsDto,
} from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const signals = ref<ObsSignalsDto | null>(null)
const alerts = ref<ObsAlertsDto | null>(null)
const error = ref('')
const busy = ref(false)
const days = ref(7)

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const [s, a] = await Promise.all([fetchObsSignals(days.value), fetchObsAlerts(days.value)])
    signals.value = s
    alerts.value = a
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function setDays(d: number): void {
  days.value = d
  void refresh()
}

const fmtNum = (n: number | null | undefined): string => (n == null ? '—' : n.toLocaleString())
const fmtMs = (n: number | null | undefined): string => (n == null ? '—' : `${n}ms`)
const fmtPct = (n: number | null | undefined): string => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)

const toolSuccessRate = computed(() => {
  const t = signals.value?.totals
  if (!t || t.toolFailureRate == null) return null
  return 1 - t.toolFailureRate
})

const ALERT_KIND_LABEL: Record<string, string> = {
  'cost-spike': '💰',
  'latency-spike': '⏱',
  'error-rate': '⚠️',
  'quality-drift': '📉',
}

onMounted(() => void refresh())
</script>

<template>
  <div class="hobs" data-testid="harness-obs">
    <div class="hobs__bar">
      <h3 class="hobs__title">{{ L?.obsTitle }}</h3>
      <div class="hobs__days" role="tablist">
        <button
          v-for="d in [7, 30]" :key="d" type="button"
          class="hobs__day" :class="{ 'hobs__day--active': days === d }"
          :data-testid="`harness-obs-days-${d}`"
          @click="setDays(d)"
        >{{ d }}{{ L?.days }}</button>
      </div>
      <button type="button" class="hobs__refresh" data-testid="harness-obs-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="hobs__sub">{{ L?.obsSub }}</p>
    <div v-if="error" class="hobs__error">{{ L?.loadFailed }}：{{ error }}</div>

    <template v-if="signals">
      <div v-if="!signals.available" class="hobs__note" data-testid="harness-obs-unavailable">
        {{ L?.obsUnavailable }}<span v-if="signals.notes.length"> — {{ signals.notes[0] }}</span>
      </div>
      <div class="hobs__grid" data-testid="harness-obs-grid">
        <div class="hobs__card">
          <div class="hobs__cardlabel">{{ L?.obsRequests }} / {{ L?.obsSessions }}</div>
          <div class="hobs__cardvalue" data-testid="harness-obs-llmcalls">{{ fmtNum(signals.totals.llmCalls) }} / {{ fmtNum(signals.totals.sessions) }}</div>
        </div>
        <div class="hobs__card">
          <div class="hobs__cardlabel">{{ L?.obsTtftP95 }}</div>
          <div class="hobs__cardvalue" data-testid="harness-obs-ttft">{{ fmtMs(signals.totals.ttftMs.p95) }}</div>
        </div>
        <div class="hobs__card">
          <div class="hobs__cardlabel">{{ L?.obsToolSuccess }}</div>
          <div class="hobs__cardvalue" data-testid="harness-obs-toolsuccess">{{ fmtPct(toolSuccessRate) }}</div>
        </div>
        <div class="hobs__card">
          <div class="hobs__cardlabel">{{ L?.obs429Rate }}</div>
          <div class="hobs__cardvalue" data-testid="harness-obs-429">{{ fmtPct(signals.totals.rateLimit429Rate) }}</div>
        </div>
        <div class="hobs__card">
          <div class="hobs__cardlabel">{{ L?.obsCacheHit }}</div>
          <div class="hobs__cardvalue" data-testid="harness-obs-cache">{{ fmtPct(signals.totals.cacheHitRate) }}</div>
        </div>
        <div class="hobs__card">
          <div class="hobs__cardlabel">{{ L?.obsTokens }}</div>
          <div class="hobs__cardvalue" data-testid="harness-obs-tokens">{{ fmtNum(signals.totals.tokens.input + signals.totals.tokens.output + signals.totals.tokens.cacheRead + signals.totals.tokens.cacheWrite + signals.totals.tokens.reasoning) }}</div>
        </div>
      </div>
    </template>

    <div class="hobs__alerts" data-testid="harness-obs-alerts">
      <div class="hobs__alertstitle">{{ L?.obsAlerts }}<span v-if="alerts">（{{ L?.obsBaseline }} {{ alerts.baselineDays }}{{ L?.days }}）</span></div>
      <div v-if="alerts && alerts.alerts.length === 0" class="hobs__note" data-testid="harness-obs-noalerts">{{ L?.obsNoAlerts }}</div>
      <div
        v-for="(a, i) in alerts?.alerts ?? []" :key="`${a.kind}-${i}`"
        class="hobs__alert" :class="`hobs__alert--${a.severity}`"
        :data-testid="`harness-obs-alert-${a.kind}`"
      >
        <span class="hobs__alerticon">{{ ALERT_KIND_LABEL[a.kind] ?? '⚠️' }}</span>
        <span class="hobs__alerttext">{{ a.evidence }}</span>
        <span class="hobs__alertsev">{{ a.severity }}</span>
      </div>
      <div v-if="alerts && alerts.skipped.length" class="hobs__skipped" data-testid="harness-obs-skipped">
        {{ L?.obsSkipped }}：{{ alerts.skipped.map((s) => `${s.kind}(${s.reason})`).join(' · ') }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hobs { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.hobs__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hobs__title { margin: 0; font-size: 14px; }
.hobs__days { display: flex; gap: 4px; margin-left: 8px; }
.hobs__day { font-size: 11px; padding: 1px 7px; border: 1px solid var(--border-color); border-radius: 10px; background: transparent; cursor: pointer; &--active { background: var(--accent-primary); color: var(--text-on-accent); border-color: transparent; } }
.hobs__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.hobs__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.hobs__error { color: var(--danger); font-size: 12px; }
.hobs__note { font-size: 12px; opacity: 0.75; }
.hobs__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.hobs__card { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.hobs__cardlabel { font-size: 11px; opacity: 0.7; }
.hobs__cardvalue { font-size: 15px; font-variant-numeric: tabular-nums; }
.hobs__alerts { border-top: 1px dashed var(--border-color); padding-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.hobs__alertstitle { font-size: 12px; font-weight: 600; }
.hobs__alert { display: flex; align-items: center; gap: 6px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; }
.hobs__alert--critical { border-color: var(--danger); }
.hobs__alert--warn { border-color: var(--warning); }
.hobs__alerticon { flex-shrink: 0; }
.hobs__alerttext { flex: 1; }
.hobs__alertsev { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid; text-transform: uppercase; }
.hobs__alert--critical .hobs__alertsev { color: var(--danger); border-color: var(--danger); }
.hobs__alert--warn .hobs__alertsev { color: var(--warning); border-color: var(--warning); }
.hobs__skipped { font-size: 11px; opacity: 0.65; }
</style>
