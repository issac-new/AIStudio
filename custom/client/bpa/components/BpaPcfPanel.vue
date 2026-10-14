<!-- overlay/custom/client/bpa/components/BpaPcfPanel.vue -->
<!-- 对标与落地：APQC PCF 跨行业参照差距表（显式映射/名称启发双来源）+ 落地五步法
     （判据实时取自当前架构与评估历史的活状态）+ 五大误区自检卡。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { bpaApi, type BpaArchitectureDto, type PcfGapReportDto } from '@/custom/bpa/api'
import type { BpaMessages } from '@/custom/bpa/i18n'

const props = defineProps<{ L: BpaMessages; dto: BpaArchitectureDto }>()
const emit = defineEmits<{ (e: 'goto', tab: 'registry' | 'map' | 'link' | 'governance' | 'maturity'): void }>()

const gap = ref<PcfGapReportDto | null>(null)
const maturityCount = ref(0)
const e2eClean = ref<boolean | null>(null)
const error = ref('')

async function load(): Promise<void> {
  error.value = ''
  try {
    const [p, m, e] = await Promise.all([bpaApi.pcf(), bpaApi.maturityHistory(), bpaApi.e2e()])
    gap.value = p.gap
    maturityCount.value = m.history.length
    e2eClean.value = e.e2e.unlinkedL3.length === 0
  } catch (e2) {
    error.value = (e2 as Error).message
  }
}
onMounted(() => void load())

/** 五步法活状态：判据全部来自当前 dto/评估历史（文档清单≠活状态）。 */
const steps = computed(() => {
  const r = props.dto.report
  const l3ok = r.l3Count > 0
  return [
    { key: 's1', done: props.dto.nodes.length > 0 && l3ok, go: 'registry' as const },
    { key: 's2', done: true, detail: props.dto.config.framework, go: 'map' as const },
    { key: 's3', done: r.ownerCoverage >= 100, detail: `${r.ownerCoverage}%`, go: 'governance' as const },
    { key: 's4', done: r.kpiCoverage >= 100 && e2eClean.value === true, detail: `${r.kpiCoverage}% · E2E ${e2eClean.value === true ? '✓' : '✗'}`, go: 'link' as const },
    { key: 's5', done: maturityCount.value >= 1, detail: `${maturityCount.value} 评估`, go: 'maturity' as const },
  ]
})
const doneCount = computed(() => steps.value.filter((s) => s.done).length)

const missingRows = computed(() => gap.value?.rows.filter((r) => r.status === 'missing') ?? [])
const trapKeys = ['t1', 't2', 't3', 't4', 't5'] as const
</script>

<template>
  <div class="bpa-pcf" data-testid="bpa-pcf-panel">
    <p class="muted hint">{{ L.pcf.hint }}</p>
    <p v-if="error" class="err">{{ error }}</p>

    <!-- 落地五步法（活状态） -->
    <section class="block">
      <div class="head-row">
        <h3>{{ L.pcf.roadmapTitle }}</h3>
        <span class="score" :data-testid="bpa-roadmap-count">{{ doneCount }}/5</span>
      </div>
      <p class="muted small">{{ L.pcf.roadmapHint }}</p>
      <ol class="steps">
        <li v-for="s in steps" :key="s.key" :class="{ done: s.done }" :data-testid="`bpa-roadmap-${s.key}`">
          <span class="mark">{{ s.done ? '✓' : '○' }}</span>
          <div class="body">
            <strong>{{ L.pcf.steps[s.key] }}</strong>
            <span class="muted small">{{ L.pcf.steps[`${s.key}d` as keyof typeof L.pcf.steps] }}</span>
            <span v-if="s.detail" class="mono small detail">{{ s.detail }}</span>
          </div>
          <button v-if="!s.done" type="button" class="ghost" @click="emit('goto', s.go)">{{ L.pcf.goTab }}</button>
        </li>
      </ol>
    </section>

    <!-- PCF 对标 -->
    <section class="block" v-if="gap">
      <div class="head-row">
        <h3>{{ L.pcf.title }}</h3>
        <span class="score">{{ gap.summary.covered }}/{{ gap.summary.total }} {{ L.pcf.coverage }}</span>
      </div>
      <table class="pcf" data-testid="bpa-pcf-table">
        <thead>
          <tr>
            <th>PCF</th>
            <th>{{ L.pcf.categories }}</th>
            <th>{{ L.pcf.groups }}</th>
            <th>{{ L.registry.section }}</th>
            <th>{{ L.pcf.coverage }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in gap.rows" :key="r.code" :class="{ miss: r.status === 'missing' }" :data-testid="`bpa-pcf-row-${r.code}`">
            <td class="mono">{{ r.code }}</td>
            <td>{{ r.nameZh }}</td>
            <td class="muted small">{{ r.groupsZh.join(' / ') }}</td>
            <td><span class="chip" :class="`c-${r.section.toLowerCase()}`">{{ L.sectionLetters[r.section] }}</span></td>
            <td>
              <template v-if="r.matched.length">
                <span v-for="m in r.matched" :key="m.id" class="pill" :class="m.by">
                  {{ m.name }}（{{ m.by === 'ref' ? L.pcf.byRef : L.pcf.byName }}）
                </span>
              </template>
              <span v-else class="miss-mark">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="gapbox">
        <h4>{{ L.pcf.gapTitle }}（{{ gap.summary.missing }}）</h4>
        <p class="muted small">{{ L.pcf.gapHint }}</p>
        <p v-if="missingRows.length === 0" class="ok">✓ {{ L.pcf.noGap }}</p>
        <p v-else class="warn" data-testid="bpa-pcf-gaps">
          <span v-for="r in missingRows" :key="r.code" class="mono chip-w">{{ r.code }} {{ r.nameZh }}</span>
        </p>
        <p v-if="gap.unmappedMine.length" class="muted small">
          {{ L.pcf.unmappedMine }}：<span v-for="u in gap.unmappedMine" :key="u.id" class="mono chip-w">{{ u.id }} {{ u.name }}</span>
        </p>
      </div>
    </section>

    <!-- 五大误区 -->
    <section class="block">
      <h3>{{ L.pcf.trapsTitle }}</h3>
      <div class="traps">
        <div v-for="k in trapKeys" :key="k" class="trap" :data-testid="`bpa-trap-${k}`">
          <strong>{{ L.pcf.traps[k].name }}</strong>
          <span class="muted small">{{ L.pcf.traps[k].tip }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.bpa-pcf {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hint { margin: 0; }
.block {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  h3, h4 { margin: 0; font-size: 14px; }
}
.head-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  .score { font-size: 15px; font-weight: 700; color: var(--accent, #4f6ef7); }
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  li {
    display: flex;
    gap: 10px;
    align-items: center;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    padding: 8px 12px;
    &.done { border-color: var(--success, #16a34a); background: rgba(22, 163, 74, 0.06); }
    .mark { font-size: 14px; color: var(--success, #16a34a); }
    .body { flex: 1; display: flex; flex-direction: column; gap: 1px;
      strong { font-size: 13px; } }
    .detail { opacity: 0.75; }
  }
}
.pcf {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); vertical-align: top; }
  th { font-weight: 600; opacity: 0.75; }
  tr.miss td { opacity: 0.75; }
  .chip { border-radius: 6px; padding: 0 5px; font-size: 10px; color: #fff; }
  .c-operating { background: #4f6ef7; }
  .c-enabling { background: #10b981; }
  .c-supporting { background: #f59e0b; }
  .c-managing { background: #8b5cf6; }
  .pill { border: 1px solid var(--accent, #4f6ef7); color: var(--accent, #4f6ef7); border-radius: 8px; padding: 0 6px; font-size: 11px; margin-right: 4px; }
  .miss-mark { color: var(--danger, #dc2626); }
}
.gapbox {
  .warn { color: var(--warning, #b45309); font-size: 12px; margin: 4px 0; }
  .chip-w { border: 1px solid currentColor; border-radius: 6px; padding: 0 5px; margin-right: 4px; font-size: 11px; }
  .ok { color: var(--success, #16a34a); font-size: 13px; margin: 4px 0; }
}
.traps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
  .trap {
    border: 1px dashed var(--border-color, #e5e7eb);
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    strong { font-size: 12.5px; }
  }
}
button.ghost { background: transparent; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 5px 12px; cursor: pointer; font-size: 12px; color: inherit; }
.err { color: var(--danger, #dc2626); font-size: 13px; margin: 0; }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono, monospace); font-size: 11px; }
</style>
