<!-- 全流程推演·业务地图（挂账清偿批 B5）：需求 × 四路知识面多图层叠加画布。
     JoyAI ONE「多维图层可视化对齐」的可视化层——影响推演结果画布化：需求中心
     +本体实例/板级图谱/FIBO 术语/历史 spec/建议模块五层节点，图层可独立开关；
     实体↔spec 共现边（docs 字段）。只读画布（协同编辑挂账，spec D6）。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import { analyzeRequirementImpact, type RequirementImpactDto } from '../../api/sim-director'

const title = ref('')
const description = ref('')
const impact = ref<RequirementImpactDto | null>(null)
const loading = ref(false)
const loadError = ref('')

// 图层开关（默认全开；每层独立过滤 nodes/edges——叠加语义由观看者裁剪）
const layers = ref({ ontology: true, boardKg: true, fibo: true, specs: true, modules: true })
const LAYER_META = [
  { key: 'ontology' as const, label: '本体实例', color: 'var(--accent-primary, #6366f1)' },
  { key: 'boardKg' as const, label: '板级图谱', color: 'var(--ia-fresh, #14b8a6)' },
  { key: 'fibo' as const, label: 'FIBO 术语', color: 'var(--ia-stale, #f59e0b)' },
  { key: 'specs' as const, label: '历史 spec', color: 'var(--accent-info, #8b5cf6)' },
  { key: 'modules' as const, label: '建议模块', color: 'var(--ia-fail, #2e9e5b)' },
]

async function analyze(): Promise<void> {
  if (!title.value.trim() || !description.value.trim()) { loadError.value = '需求标题和描述不能为空。'; return }
  loading.value = true
  loadError.value = ''
  try {
    impact.value = await analyzeRequirementImpact(title.value.trim(), description.value.trim())
  } catch (e) {
    impact.value = null
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const SOURCE_LAYER: Record<string, 'ontology' | 'boardKg' | 'fibo'> = {
  'ontology-instance': 'ontology', 'board-kg': 'boardKg', 'fibo-term': 'fibo',
}
const layerColor = (k: string): string => LAYER_META.find((m) => m.key === k)?.color ?? 'var(--text-muted, #94a3b8)'

// 网格分层布局（OntologyView 模式）：需求居中，各知识层一列，spec 一列，模块一列
const graphNodes = computed<Node[]>(() => {
  const imp = impact.value
  if (!imp) return []
  const out: Node[] = [{
    id: 'req-center',
    position: { x: 0, y: 240 },
    data: { label: `【需求】${imp.title}` },
    style: { borderColor: 'var(--accent-info, #0ea5e9)', borderWidth: '2px', borderRadius: '12px', padding: '8px 12px', fontSize: '13px', fontWeight: '600', background: 'color-mix(in srgb, var(--accent-info, #0ea5e9) 8%, transparent)', whiteSpace: 'pre-line' },
  }]
  const byLayer = new Map<string, typeof imp.entities>()
  for (const e of imp.entities) {
    const lk = SOURCE_LAYER[e.source]
    if (!byLayer.has(lk)) byLayer.set(lk, [])
    byLayer.get(lk)!.push(e)
  }
  let col = 1
  for (const [lk, ents] of byLayer) {
    if (!layers.value[lk]) continue
    ents.forEach((e, row) => {
      out.push({
        id: `ent-${e.source}-${e.id}`,
        position: { x: col * 280, y: row * 96 },
        data: { label: `${e.label}\n命中「${e.matchedTerm}」` },
        style: { borderColor: layerColor(lk), borderRadius: '10px', padding: '6px 10px', fontSize: '12px', whiteSpace: 'pre-line' },
      })
    })
    col += 1
  }
  if (layers.value.specs) {
    imp.relatedSpecs.forEach((s, row) => {
      out.push({
        id: `spec-${s.file}`,
        position: { x: col * 280, y: row * 96 },
        data: { label: `[spec] ${s.title}\n${s.date ?? ''}` },
        style: { borderColor: layerColor('specs'), borderRadius: '10px', padding: '6px 10px', fontSize: '11px', whiteSpace: 'pre-line', opacity: '.92' },
      })
    })
    col += 1
  }
  if (layers.value.modules) {
    imp.suggestedModules.forEach((m, row) => {
      out.push({
        id: `mod-${m}`,
        position: { x: col * 280, y: row * 96 },
        data: { label: `[模块] ${m}` },
        style: { borderColor: layerColor('modules'), borderRadius: '10px', padding: '6px 10px', fontSize: '12px' },
      })
    })
  }
  return out
})

const graphEdges = computed<Edge[]>(() => {
  const imp = impact.value
  if (!imp) return []
  const out: Edge[] = []
  for (const e of imp.entities) {
    const lk = SOURCE_LAYER[e.source]
    if (!layers.value[lk]) continue
    out.push({ id: `e-req-${e.source}-${e.id}`, source: 'req-center', target: `ent-${e.source}-${e.id}`, animated: false, style: { stroke: layerColor(lk), strokeWidth: 1.2 } })
    // 实体↔spec 共现边（docs 字段，B5 服务端现算）
    if (layers.value.specs && e.docs) {
      for (const d of e.docs) {
        if (!imp.relatedSpecs.some((s) => s.file === d)) continue
        out.push({ id: `e-doc-${e.source}-${e.id}-${d}`, source: `ent-${e.source}-${e.id}`, target: `spec-${d}`, animated: false, style: { stroke: 'var(--accent-info, #c4b5fd)', strokeWidth: 1, strokeDasharray: '4 3' } })
      }
    }
  }
  if (layers.value.specs) {
    for (const s of imp.relatedSpecs) {
      out.push({ id: `e-req-spec-${s.file}`, source: 'req-center', target: `spec-${s.file}`, animated: false, style: { stroke: layerColor('specs'), strokeWidth: 1, strokeDasharray: '2 4' } })
    }
  }
  if (layers.value.modules) {
    for (const m of imp.suggestedModules) {
      out.push({ id: `e-req-mod-${m}`, source: 'req-center', target: `mod-${m}`, animated: false, style: { stroke: layerColor('modules'), strokeWidth: 1.2 } })
    }
  }
  return out
})
</script>

<template>
  <div class="bmap" data-testid="sim-map-page">
    <IaBreadcrumb :items="[{ label: '全流程推演' }, { label: '业务地图' }]" />
    <header class="bmap__head">
      <div>
        <h2 class="bmap__title">业务地图</h2>
        <p class="bmap__sub">需求 × 知识面多图层叠加——词面命中画布化（只读）；改造范围须人工确认。</p>
      </div>
    </header>

    <div class="bmap__form">
      <label class="bmap__field">需求标题<input v-model="title" data-testid="sim-map-title" /></label>
      <label class="bmap__field bmap__field--wide">需求描述<textarea v-model="description" rows="2" data-testid="sim-map-desc" /></label>
      <button type="button" class="bmap__btn" :disabled="loading" data-testid="sim-map-analyze" @click="analyze">
        {{ loading ? '推演中…' : '生成业务地图' }}
      </button>
    </div>
    <p v-if="loadError" class="bmap__error" data-testid="sim-map-error">{{ loadError }}</p>

    <template v-if="impact">
      <div class="bmap__layers" role="group" aria-label="图层开关" data-testid="sim-map-layers">
        <button
          v-for="m in LAYER_META" :key="m.key" type="button"
          class="bmap__layer" :class="{ 'is-on': layers[m.key] }"
          :data-testid="`sim-map-layer-${m.key}`"
          :style="{ borderColor: layerColor(m.key) }"
          @click="layers[m.key] = !layers[m.key]"
        >{{ m.label }}</button>
      </div>
      <p class="bmap__hint">{{ impact.boundary }}</p>
      <div class="bmap__canvas" data-testid="sim-map-canvas">
        <VueFlow :nodes="graphNodes" :edges="graphEdges" :fit-view-on-init="true" :zoom-on-scroll="true" :pan-on-scroll="true" />
      </div>
    </template>
    <p v-else class="bmap__empty" data-testid="sim-map-empty">输入需求后生成叠加视图——本体实例、板级图谱、FIBO 术语、历史 spec 与建议模块分层呈现。</p>
  </div>
</template>

<style scoped lang="scss">
.bmap { display: flex; flex-direction: column; gap: 12px; }
.bmap__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.bmap__title { margin: 0; font-size: 16px; }
.bmap__sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
.bmap__form { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(320px, 2fr) auto; gap: 8px; align-items: end; }
.bmap__field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--text-muted); }
.bmap__field input, .bmap__field textarea {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px;
  font-family: inherit; font-size: 12px; background: transparent; color: var(--text-primary); resize: vertical;
}
.bmap__btn {
  border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent;
  border-radius: 6px; padding: 6px 14px; font-family: inherit; font-size: 12px; cursor: pointer;
}
.bmap__btn:disabled { opacity: .55; cursor: default; }
.bmap__layers { display: flex; gap: 6px; flex-wrap: wrap; }
.bmap__layer {
  border: 1px solid; border-radius: 999px; padding: 2px 12px; font-size: 11.5px;
  background: transparent; color: var(--text-muted); cursor: pointer; opacity: .45;
}
.bmap__layer.is-on { opacity: 1; color: var(--text-primary); }
.bmap__hint { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.bmap__error { color: var(--ia-fail); font-size: 12px; margin: 0; }
.bmap__empty { border: 1px dashed var(--border-color); border-radius: 8px; padding: 24px; text-align: center; font-size: 12.5px; color: var(--text-muted); margin: 0; }
.bmap__canvas { height: 520px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
</style>
