<!-- overlay/custom/client/governance/components/NineLayersSection.vue -->
<!-- 驾驭工程 B7：九层运行体检（2026-10-18 Harness 可靠性轮）。
     骨架来自《Harness Engineering 从零到生产》：Tools/Loop/Memory/Context/Sandbox/
     Verification/Permissions/Observability/Evals。逐层给真实证据、差距与建议动作；
     自检清单非认证，数据缺席按 partial/missing 显示，不造数。自取数 /api/harness/nine-layers。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import { fetchNineLayers, type NineLayersDto, type NineLayerKeyDto } from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const data = ref<NineLayersDto | null>(null)
const error = ref('')
const busy = ref(false)
const days = ref(7)

const layerNames = computed(() => String(L.value.nineLayerNames ?? '').split('|'))
const ORDER: NineLayerKeyDto[] = ['tools', 'loop', 'memory', 'context', 'sandbox', 'verification', 'permissions', 'observability', 'evals']

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchNineLayers(days.value)
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

function layerOf(key: NineLayerKeyDto) {
  return data.value?.layers.find((l) => l.key === key)
}

function statusLabel(status: 'covered' | 'partial' | 'missing' | undefined): string {
  if (status === 'covered') return String(L.value.nineStatusCovered ?? 'covered')
  if (status === 'partial') return String(L.value.nineStatusPartial ?? 'partial')
  return String(L.value.nineStatusMissing ?? 'missing')
}

function checkMark(status: 'yes' | 'partial' | 'no'): string {
  return status === 'yes' ? '✓' : status === 'partial' ? '◐' : '✗'
}

onMounted(() => void refresh())
</script>

<template>
  <div class="nl" data-testid="harness-nine-layers">
    <div class="nl__bar">
      <h3 class="nl__title">{{ L?.nineLayersTitle }}</h3>
      <div class="nl__days" role="tablist">
        <button
          v-for="d in [7, 30, 90]" :key="d" type="button"
          class="nl__day" :class="{ 'nl__day--active': days === d }"
          :data-testid="`harness-nine-days-${d}`"
          @click="setDays(d)"
        >{{ d }}{{ L?.days }}</button>
      </div>
      <button type="button" class="nl__refresh" data-testid="harness-nine-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="nl__sub">{{ L?.nineLayersSub }}</p>
    <div v-if="error" class="nl__error">{{ L?.loadFailed }}：{{ error }}</div>

    <div v-if="data" class="nl__summary" data-testid="harness-nine-summary">
      <span class="nl__chip nl__chip--covered">{{ statusLabel('covered') }} {{ data.counts.covered }}</span>
      <span class="nl__chip nl__chip--partial">{{ statusLabel('partial') }} {{ data.counts.partial }}</span>
      <span class="nl__chip nl__chip--missing">{{ statusLabel('missing') }} {{ data.counts.missing }}</span>
    </div>

    <div v-if="data" class="nl__grid">
      <section
        v-for="(lk, idx) in ORDER" :key="lk"
        class="nl__layer"
        :class="`nl__layer--${layerOf(lk)?.status ?? 'missing'}`"
        :data-testid="`harness-nine-layer-${lk}`"
      >
        <header class="nl__head">
          <span class="nl__idx">{{ idx + 1 }}</span>
          <span class="nl__name">{{ layerNames[idx] ?? lk }}</span>
          <span class="nl__score">{{ layerOf(lk)?.score ?? 0 }}</span>
          <span class="nl__badge" :class="`nl__badge--${layerOf(lk)?.status ?? 'missing'}`">
            {{ statusLabel(layerOf(lk)?.status) }}
          </span>
        </header>

        <ul class="nl__checks">
          <li
            v-for="check in layerOf(lk)?.checks ?? []" :key="check.key"
            class="nl__check" :class="`nl__check--${check.status}`"
            :data-testid="`harness-nine-check-${lk}-${check.key}`"
          >
            <span class="nl__mark">{{ checkMark(check.status) }}</span>
            <span class="nl__checkbody">
              <span class="nl__checklabel">{{ check.label ?? check.key }}<span v-if="check.critical" class="nl__critical" title="critical">*</span></span>
              <span class="nl__evidence">{{ L?.nineEvidence }}：{{ check.evidence }}</span>
            </span>
          </li>
        </ul>

        <div v-if="(layerOf(lk)?.gaps.length ?? 0) > 0" class="nl__block">
          <div class="nl__blocktitle">{{ L?.nineGaps }}</div>
          <ul class="nl__gaplist">
            <li v-for="(gap, gi) in layerOf(lk)?.gaps ?? []" :key="gi">{{ gap }}</li>
          </ul>
        </div>
        <div v-if="(layerOf(lk)?.actions.length ?? 0) > 0" class="nl__block nl__block--actions">
          <div class="nl__blocktitle">{{ L?.nineActions }}</div>
          <ul class="nl__gaplist">
            <li v-for="(action, ai) in layerOf(lk)?.actions ?? []" :key="ai">{{ action }}</li>
          </ul>
        </div>
      </section>
    </div>

    <div v-if="data" class="nl__note" data-testid="harness-nine-note">{{ data.meta.note }}</div>
  </div>
</template>

<style scoped lang="scss">
.nl { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.nl__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nl__title { margin: 0; font-size: 14px; }
.nl__days { display: flex; gap: 4px; }
.nl__day { font-size: 11px; padding: 1px 7px; border: 1px solid var(--border-color); border-radius: 10px; background: transparent; cursor: pointer; }
.nl__day--active { background: var(--accent-primary); color: var(--text-on-accent); border-color: transparent; }
.nl__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.nl__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.nl__error { color: var(--danger); font-size: 12px; }
.nl__summary { display: flex; gap: 8px; flex-wrap: wrap; }
.nl__chip { font-size: 11px; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--border-color); }
.nl__chip--covered { color: var(--success); }
.nl__chip--partial { color: var(--warning); }
.nl__chip--missing { color: var(--danger); }
.nl__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px; }
.nl__layer { border: 1px solid var(--border-color); border-radius: 8px; padding: 7px 9px; display: flex; flex-direction: column; gap: 6px; }
.nl__layer--covered { border-left: 3px solid var(--success); }
.nl__layer--partial { border-left: 3px solid var(--warning); }
.nl__layer--missing { border-left: 3px solid var(--danger); }
.nl__head { display: flex; align-items: center; gap: 7px; }
.nl__idx { font-size: 10px; opacity: 0.55; width: 12px; }
.nl__name { font-size: 13px; font-weight: 600; }
.nl__score { margin-left: auto; font-size: 12px; font-weight: 600; }
.nl__badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--border-color); }
.nl__badge--covered { color: var(--success); }
.nl__badge--partial { color: var(--warning); }
.nl__badge--missing { color: var(--danger); }
.nl__checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.nl__check { display: flex; gap: 6px; font-size: 11.5px; }
.nl__mark { width: 12px; flex-shrink: 0; }
.nl__check--yes .nl__mark { color: var(--success); }
.nl__check--partial .nl__mark { color: var(--warning); }
.nl__check--no .nl__mark { color: var(--danger); }
.nl__checkbody { display: flex; flex-direction: column; }
.nl__checklabel { font-weight: 500; }
.nl__critical { color: var(--danger); margin-left: 2px; }
.nl__evidence { opacity: 0.65; font-size: 10.5px; }
.nl__block { border-top: 1px dashed var(--border-color); padding-top: 4px; }
.nl__blocktitle { font-size: 10.5px; font-weight: 600; opacity: 0.75; }
.nl__gaplist { margin: 2px 0 0; padding-left: 14px; font-size: 10.5px; opacity: 0.8; display: flex; flex-direction: column; gap: 1px; }
.nl__block--actions { opacity: 0.9; }
.nl__note { font-size: 10.5px; opacity: 0.6; }
</style>
