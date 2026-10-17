<!-- overlay/custom/client/bpa/components/BpaLinkPanel.vue -->
<!-- 端到端链路：L3 关系图（echarts 定向布局：箭头=驱动/支撑，色=分区）+ 端到端
     路径表（逐跳交接物）+ 孤岛/断头/环路警示。三要素之末的产品面。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { bpaApi, type BpaArchitectureDto, type E2eReport } from '@/custom/bpa/api'
import type { BpaMessages } from '@/custom/bpa/i18n'

const props = defineProps<{ L: BpaMessages; dto: BpaArchitectureDto }>()

const report = ref<E2eReport | null>(null)
const error = ref('')
const containerRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

const SECTION_COLOR: Record<string, string> = {
  OPERATING: '#4f6ef7',
  ENABLING: '#10b981',
  SUPPORTING: '#f59e0b',
  MANAGING: '#8b5cf6',
}

const l3s = computed(() => props.dto.nodes.filter((n) => n.level === 3))
const l1SectionOf = computed(() => {
  // L3 → 其 L1 祖先的分区（着色用）
  const byId = new Map(props.dto.nodes.map((n) => [n.id, n]))
  const sectionOf = (id: string): string => {
    let cur = byId.get(id)
    while (cur && cur.level > 1) cur = cur.parentId ? byId.get(cur.parentId) : undefined
    return cur?.section ?? 'OPERATING'
  }
  return sectionOf
})

async function load(): Promise<void> {
  error.value = ''
  try {
    const r = await bpaApi.e2e()
    report.value = r.e2e
  } catch (e) {
    error.value = (e as Error).message
  }
}

/** 分层坐标：按「距最浅上游的跳数」分层，同层横排。 */
function layout(): Map<string, { x: number; y: number }> {
  const nodes = l3s.value
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const upstream = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  const nexts = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const n of nodes) {
    for (const s of n.supports ?? []) {
      if (!byId.has(s) || upstream.get(s)!.includes(n.id)) continue
      upstream.get(s)!.push(n.id)
      nexts.get(n.id)!.push(s)
    }
    for (const d of n.drivers ?? []) {
      if (!byId.has(d) || nexts.get(d)!.includes(n.id)) continue
      upstream.get(n.id)!.push(d)
      nexts.get(d)!.push(n.id)
    }
  }
  const depth = new Map<string, number>()
  const queue = nodes.filter((n) => (upstream.get(n.id)?.length ?? 0) === 0).map((n) => n.id)
  for (const id of queue) depth.set(id, 0)
  for (let i = 0; i < queue.length && i < 512; i++) {
    const u = queue[i]
    for (const v of nexts.get(u) ?? []) {
      const d = (depth.get(u) ?? 0) + 1
      if (!depth.has(v) || d < depth.get(v)!) {
        depth.set(v, d)
        queue.push(v)
      }
    }
  }
  const layers = new Map<number, string[]>()
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0
    if (!layers.has(d)) layers.set(d, [])
    layers.get(d)!.push(n.id)
  }
  const pos = new Map<string, { x: number; y: number }>()
  for (const [d, ids] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, i) => pos.set(id, { x: i * 190 + 40, y: d * 120 + 30 }))
  }
  return pos
}

const chartOption = computed(() => {
  const pos = layout()
  const byId = new Map(props.dto.nodes.map((n) => [n.id, n]))
  const nodes = l3s.value.map((n) => ({
    id: n.id,
    name: `${n.id}\n${n.name}`,
    x: pos.get(n.id)?.x ?? 0,
    y: pos.get(n.id)?.y ?? 0,
    symbolSize: 46,
    itemStyle: { color: SECTION_COLOR[l1SectionOf.value(n.id)] ?? '#4f6ef7' },
    label: { show: true, fontSize: 9, color: 'var(--text-on-accent)', formatter: (p: { name: string }) => p.name.split('\n')[1]?.slice(0, 8) ?? p.name },
  }))
  const seen = new Set<string>()
  const edges: Array<{ source: string; target: string }> = []
  const addEdge = (from: string, to: string): void => {
    const key = `${from}->${to}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ source: from, target: to })
  }
  for (const n of l3s.value) {
    for (const s of n.supports ?? []) if (byId.has(s)) addEdge(n.id, s)
    for (const d of n.drivers ?? []) if (byId.has(d)) addEdge(d, n.id)
  }
  return {
    backgroundColor: 'transparent',
    tooltip: { show: false },
    series: [{
      type: 'graph',
      layout: 'none',
      roam: true,
      data: nodes,
      links: edges.map((e) => ({ ...e, lineStyle: { color: '#94a3b8', width: 1.5, curveness: 0.08 }, symbol: ['none', 'arrow'], symbolSize: 9 })),
      emphasis: { focus: 'adjacency' },
      label: { position: 'inside' },
    }],
  }
})

function render(): void {
  if (!containerRef.value) return
  if (!chart) chart = echarts.init(containerRef.value)
  chart.setOption(chartOption.value, true)
}

onMounted(() => { void load().then(render) })
watch(() => props.dto, () => { void load().then(render) })
onBeforeUnmount(() => { chart?.dispose(); chart = null })

const nameOf = (id: string): string => props.dto.nodes.find((n) => n.id === id)?.name ?? id
</script>

<template>
  <div class="bpa-link" data-testid="bpa-link-panel">
    <p class="muted hint">{{ L.link.hint }}</p>
    <p v-if="error" class="err">{{ error }}</p>

    <section class="block">
      <h3>{{ L.link.graphTitle }}</h3>
      <p class="muted small">{{ L.link.graphHint }}</p>
      <div ref="containerRef" class="graph" data-testid="bpa-link-graph"></div>
    </section>

    <section v-if="report" class="block">
      <h3>{{ L.link.pathsTitle }}（{{ report.paths.length }}）</h3>
      <div v-if="report.paths.length === 0" class="muted">{{ L.link.emptyPaths }}</div>
      <table v-else class="paths" data-testid="bpa-link-paths">
        <thead>
          <tr>
            <th>#</th>
            <th>{{ L.link.pathCol }}</th>
            <th>{{ L.link.handoff }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in report.paths.slice(0, 12)" :key="i">
            <td class="mono muted">{{ i + 1 }} · {{ p.steps.length - 1 }} {{ L.link.hops }}</td>
            <td>
              <template v-for="(s, j) in p.steps" :key="s">
                <span class="chip" :class="`c-${l1SectionOf(s).toLowerCase()}`" :title="s">{{ nameOf(s) }}</span>
                <span v-if="j < p.steps.length - 1" class="arr">→</span>
              </template>
            </td>
            <td class="muted small">
              <template v-for="(h, j) in p.handoffs" :key="j">
                <span v-if="j > 0" class="arr">·</span>
                <span :class="{ miss: !h }">{{ h || L.link.noHandoff }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="health">
        <p v-if="report.unlinkedL3.length" class="warn">
          {{ L.link.unlinked }}：<span v-for="id in report.unlinkedL3" :key="id" class="mono chip-w">{{ id }} {{ nameOf(id) }}</span>
        </p>
        <p v-if="report.strandedL3.length" class="warn">
          {{ L.link.stranded }}：<span v-for="id in report.strandedL3" :key="id" class="mono chip-w">{{ id }} {{ nameOf(id) }}</span>
        </p>
        <p v-if="report.cycleL3.length" class="warn">
          {{ L.link.cycle }}：<span v-for="id in report.cycleL3" :key="id" class="mono chip-w">{{ id }} {{ nameOf(id) }}</span>
        </p>
        <p v-if="report.unlinkedL3.length + report.strandedL3.length + report.cycleL3.length === 0" class="ok" data-testid="bpa-link-clean">✓ {{ L.link.allClean }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.bpa-link {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hint {
  margin: 0;
}
.block {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  h3 {
    margin: 0;
    font-size: 14px;
  }
}
.graph {
  width: 100%;
  height: 320px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
}
.paths {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th, td {
    text-align: left;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-color);
    vertical-align: top;
  }
  th {
    font-weight: 600;
    opacity: 0.75;
  }
  .chip {
    border-radius: 8px;
    padding: 1px 8px;
    font-size: 11px;
    color: var(--text-on-accent);
    margin-right: 2px;
  }
  .c-operating { background: var(--accent-primary); }
  .c-enabling { background: var(--success); }
  .c-supporting { background: var(--warning); }
  .c-managing { background: var(--ia-compensated); }
  .arr { opacity: 0.5; margin: 0 3px; }
  .miss { color: var(--warning); }
}
.health {
  .warn {
    color: var(--warning);
    font-size: 12px;
    margin: 4px 0;
  }
  .chip-w {
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 0 5px;
    margin-right: 4px;
    font-size: 11px;
  }
  .ok { color: var(--success); font-size: 13px; margin: 4px 0; }
}
.err { color: var(--danger); font-size: 13px; margin: 0; }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono); font-size: 11px; }
</style>
