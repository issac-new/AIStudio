<!-- overlay/custom/client/governance/components/EvalLayersSection.vue -->
<!-- 驾驭工程 B5：四层评估读模型（2026-10-04 九源调研落地项②）。
     既有仪表按 结果/执行/资源/治理 四层归位；五治理量化指标 gap 立账
     （口径原文展示，数据未采标 gap 不造数）。自取数 /api/harness/eval-layers。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import { fetchEvalLayers, type EvalLayersDto, type EvalLayerKey } from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})
const layerNames = computed(() => String(L.value.evalLayerNames ?? '').split('|'))

const data = ref<EvalLayersDto | null>(null)
const error = ref('')
const busy = ref(false)
const days = ref(7)

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchEvalLayers(days.value)
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

const fmt = (v: number | null, unit: string): string => {
  if (v == null) return '—'
  if (unit === 'ratio') return `${Math.round(v * 1000) / 10}%`
  if (unit === 'tokens') return `${(v / 1000).toFixed(1)}k`
  return `${Math.round(v * 100) / 100} ${unit}`
}

const layerOf = (key: EvalLayerKey) => data.value?.layers.find((l) => l.key === key)

onMounted(() => void refresh())
</script>

<template>
  <div class="el" data-testid="harness-eval-layers">
    <div class="el__bar">
      <h3 class="el__title">{{ L?.evalLayersTitle }}</h3>
      <div class="el__days" role="tablist">
        <button
          v-for="d in [7, 30, 90]" :key="d" type="button"
          class="el__day" :class="{ 'el__day--active': days === d }"
          :data-testid="`harness-eval-days-${d}`"
          @click="setDays(d)"
        >{{ d }}{{ L?.days }}</button>
      </div>
      <button type="button" class="el__refresh" data-testid="harness-eval-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="el__sub">{{ L?.evalLayersSub }}</p>
    <div v-if="error" class="el__error">{{ L?.loadFailed }}：{{ error }}</div>

    <div v-if="data" class="el__grid">
      <section
        v-for="(lk, idx) in (['result','execution','resource','governance'] as const)"
        :key="lk"
        class="el__layer"
        :data-testid="`harness-eval-layer-${lk}`"
      >
        <h4 class="el__layername">{{ layerNames[idx] ?? lk }}</h4>
        <div
          v-for="m in layerOf(lk)?.metrics ?? []" :key="m.key"
          class="el__metric"
          :class="{ 'el__metric--gap': m.status === 'gap' }"
          :data-testid="`harness-eval-metric-${m.key}`"
        >
          <div class="el__metrichead">
            <code class="el__metrickey">{{ m.key }}</code>
            <span class="el__metricvalue" :class="{ 'el__na': m.value == null }">{{ fmt(m.value, m.unit) }}</span>
            <span class="el__badge" :class="`el__badge--${m.status}`">
              {{ m.status === 'gap' ? L?.evalStatusGap : L?.evalStatusInstrumented }}
            </span>
          </div>
          <div v-if="m.definition" class="el__def">{{ L?.evalDefinition }}：{{ m.definition }}</div>
          <div class="el__src">{{ L?.evalSource }}：{{ m.source }}<template v-if="m.note">（{{ m.note }}）</template></div>
        </div>
      </section>
    </div>
    <div v-if="data" class="el__gapnote" data-testid="harness-eval-gapnote">
      {{ L?.evalGapNote }} · instrumented {{ data.counts.instrumented }} / gap {{ data.counts.gap }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.el { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.el__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.el__title { margin: 0; font-size: 14px; }
.el__days { display: flex; gap: 4px; }
.el__day { font-size: 11px; padding: 1px 7px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; background: transparent; cursor: pointer; &--active { background: var(--accent-primary, #3b82f6); color: #fff; border-color: transparent; } }
.el__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.el__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.el__error { color: var(--danger, #dc2626); font-size: 12px; }
.el__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; }
.el__layer { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 5px; }
.el__layername { margin: 0; font-size: 12.5px; font-weight: 600; }
.el__metric { display: flex; flex-direction: column; gap: 1px; padding: 3px 4px; border-radius: 6px; }
.el__metric--gap { background: rgb(254 243 199 / 30%); }
.el__metrichead { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.el__metrickey { font-size: 11px; background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; }
.el__metricvalue { font-size: 12px; font-weight: 600; }
.el__na { opacity: 0.55; font-style: italic; font-weight: 400; }
.el__badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid currentColor; }
.el__badge--instrumented { color: var(--ok-ink, #166534); }
.el__badge--gap { color: var(--warning-ink, #92400e); border-style: dashed; }
.el__def { font-size: 11px; color: var(--warning-ink, #92400e); }
.el__src { font-size: 10.5px; opacity: 0.7; }
.el__gapnote { font-size: 11px; color: var(--text-muted, #878c99); }
</style>
