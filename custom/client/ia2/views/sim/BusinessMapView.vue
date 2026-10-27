<!-- 全流程推演·业务地图（挂账清偿批 B5 + 批二 C1）：需求 × 四路知识面多图层叠加画布。
     JoyAI ONE「多维图层可视化对齐」的可视化层——影响推演结果画布化：需求中心
     +本体实例/板级图谱/FIBO 术语/历史 spec/建议模块五层节点，图层可独立开关；
     实体↔spec 共现边（docs 字段）。C1 标注：节点点击弹标注面板（备注/确认勾选）
     按需求指纹持久化——多用户读写同一存储=异步协同（最后写胜出，实时协议不做）。 -->
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import {
  analyzeRequirementImpact, fetchMapAnnotations, saveMapAnnotation, deleteMapAnnotation,
  type RequirementImpactDto, type MapAnnotationDto,
} from '../../api/sim-director'
import { subscribeMapnotes } from '../../api/mapnotes-socket'

const title = ref('')
const description = ref('')
const impact = ref<RequirementImpactDto | null>(null)
const loading = ref(false)
const loadError = ref('')

// —— 标注（C1）：指纹 key + 节点标注清单 + 选中节点的编辑面板态 ——
const fingerprint = ref('')
const annotations = ref<MapAnnotationDto[]>([])
// 实时协同（批三 D1）：房间在线数提示条 + 订阅清理句柄 + 本端 rev 计数（LWW 写方时钟）
const watchers = ref(0)
let unsubMapnotes: (() => void) | null = null
let myRev = 0
const selectedNodeId = ref('')
const draftNote = ref('')
const draftChecked = ref(false)
const savingNote = ref(false)
const noteMsg = ref('')

onUnmounted(() => { unsubMapnotes?.(); unsubMapnotes = null })

const annotationOf = (nodeId: string): MapAnnotationDto | undefined =>
  annotations.value.find((a) => a.nodeId === nodeId)

async function analyze(): Promise<void> {
  if (!title.value.trim() || !description.value.trim()) { loadError.value = '需求标题和描述不能为空。'; return }
  loading.value = true
  loadError.value = ''
  try {
    const res = await analyzeRequirementImpact(title.value.trim(), description.value.trim())
    impact.value = res.impact
    fingerprint.value = res.fingerprint
    selectedNodeId.value = ''
    noteMsg.value = ''
    // 同一需求（同指纹）拉回历史标注——人工修正跨会话保留
    try { annotations.value = await fetchMapAnnotations(res.fingerprint) } catch { annotations.value = [] }
    // 订阅指纹房间（换指纹先退旧房；他人变更实时落画布+presence 提示条）
    unsubMapnotes?.()
    unsubMapnotes = subscribeMapnotes(
      res.fingerprint,
      (ev) => {
        if (ev.kind === 'upsert' && ev.annotation) {
          const a = ev.annotation
          const i = annotations.value.findIndex((x) => x.nodeId === a.nodeId)
          if (i >= 0) annotations.value[i] = a
          else annotations.value.push(a)
          if (a.by !== 'map-editor') noteMsg.value = `${a.by} 更新了「${a.nodeId.slice(0, 24)}」的标注`
        } else if (ev.kind === 'delete' && ev.nodeId) {
          annotations.value = annotations.value.filter((x) => x.nodeId !== ev.nodeId)
        }
      },
      (ev) => { watchers.value = ev.watchers },
    )
  } catch (e) {
    impact.value = null
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function selectNode(nodeId: string): void {
  selectedNodeId.value = nodeId
  const existing = annotationOf(nodeId)
  draftNote.value = existing?.note ?? ''
  draftChecked.value = existing?.checked ?? false
  noteMsg.value = ''
}
function onNodeClick(_: unknown, node: Node): void { selectNode(node.id) }

// 兜底：vue-flow click 钩子受 d3 拖拽链阈值影响（nodeDragThreshold=1 且快照对齐时
// 零位移点击被 distance!==0 条件吞掉）——容器级原生监听，closest 找节点取 data-id。
function onCanvasClick(ev: MouseEvent): void {
  const el = (ev.target as HTMLElement).closest('.vue-flow__node')
  if (!el) return
  const id = el.getAttribute('data-id')
  if (id) selectNode(id)
}

async function saveAnnotation(): Promise<void> {
  if (!fingerprint.value || !selectedNodeId.value) return
  savingNote.value = true
  noteMsg.value = ''
  try {
    // rev=写方时钟自增（LWW：本端每次保存+1；被他人更高 rev 压过时 applied:false 如实回显）
    myRev += 1
    const saved = await saveMapAnnotation(fingerprint.value, { nodeId: selectedNodeId.value, note: draftNote.value, checked: draftChecked.value, rev: myRev })
    const idx = annotations.value.findIndex((a) => a.nodeId === saved.nodeId)
    if (idx >= 0) annotations.value[idx] = saved
    else annotations.value.push(saved)
    noteMsg.value = '标注已保存。'
  } catch (e) {
    noteMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    savingNote.value = false
  }
}

async function removeAnnotation(): Promise<void> {
  if (!fingerprint.value || !selectedNodeId.value) return
  try {
    await deleteMapAnnotation(fingerprint.value, selectedNodeId.value)
    annotations.value = annotations.value.filter((a) => a.nodeId !== selectedNodeId.value)
    draftNote.value = ''
    draftChecked.value = false
    noteMsg.value = '标注已删除。'
  } catch (e) {
    noteMsg.value = e instanceof Error ? e.message : String(e)
  }
}

// 图层开关（默认全开；每层独立过滤 nodes/edges——叠加语义由观看者裁剪）
const layers = ref({ ontology: true, boardKg: true, fibo: true, specs: true, modules: true })
const LAYER_META = [
  { key: 'ontology' as const, label: '本体实例', color: 'var(--accent-primary, #6366f1)' },
  { key: 'boardKg' as const, label: '板级图谱', color: 'var(--ia-fresh, #14b8a6)' },
  { key: 'fibo' as const, label: 'FIBO 术语', color: 'var(--ia-stale, #f59e0b)' },
  { key: 'specs' as const, label: '历史 spec', color: 'var(--accent-info, #8b5cf6)' },
  { key: 'modules' as const, label: '建议模块', color: 'var(--ia-fail, #2e9e5b)' },
]

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
      const mark = annotationOf(`ent-${e.source}-${e.id}`)
      out.push({
        id: `ent-${e.source}-${e.id}`,
        position: { x: col * 280, y: row * 96 },
        data: { label: `${mark ? (mark.checked ? '✓ ' : '✎ ') : ''}${e.label}\n命中「${e.matchedTerm}」` },
        style: { borderColor: layerColor(lk), borderRadius: '10px', padding: '6px 10px', fontSize: '12px', whiteSpace: 'pre-line' },
      })
    })
    col += 1
  }
  if (layers.value.specs) {
    imp.relatedSpecs.forEach((sp, row) => {
      const mark = annotationOf(`spec-${sp.file}`)
      out.push({
        id: `spec-${sp.file}`,
        position: { x: col * 280, y: row * 96 },
        data: { label: `${mark ? (mark.checked ? '✓ ' : '✎ ') : ''}[spec] ${sp.title}\n${sp.date ?? ''}` },
        style: { borderColor: layerColor('specs'), borderRadius: '10px', padding: '6px 10px', fontSize: '11px', whiteSpace: 'pre-line', opacity: '.92' },
      })
    })
    col += 1
  }
  if (layers.value.modules) {
    imp.suggestedModules.forEach((m, row) => {
      const mark = annotationOf(`mod-${m}`)
      out.push({
        id: `mod-${m}`,
        position: { x: col * 280, y: row * 96 },
        data: { label: `${mark ? (mark.checked ? '✓ ' : '✎ ') : ''}[模块] ${m}` },
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
      <p class="bmap__hint">{{ impact.boundary }}<span v-if="watchers > 1" class="bmap__watchers" data-testid="sim-map-watchers"> · {{ watchers }} 人正在看</span></p>
      <div class="bmap__body">
        <div class="bmap__canvas" data-testid="sim-map-canvas" @click.capture="onCanvasClick">
          <VueFlow :nodes="graphNodes" :edges="graphEdges" :fit-view-on-init="true" :zoom-on-scroll="true" :pan-on-scroll="true" :elements-selectable="true" :nodes-draggable="false" @node-click="onNodeClick" />
        </div>
        <!-- 标注面板（C1）：点选画布节点后出现——备注+确认勾选，按需求指纹持久化 -->
        <aside v-if="selectedNodeId" class="bmap__note" data-testid="sim-map-note-panel">
          <header class="bmap__note-head">
            <strong>节点标注</strong>
            <code class="bmap__note-id">{{ selectedNodeId }}</code>
            <button type="button" class="bmap__note-close" data-testid="sim-map-note-close" @click="selectedNodeId = ''">✕</button>
          </header>
          <textarea v-model="draftNote" rows="4" class="bmap__note-input" data-testid="sim-map-note-input" placeholder="人工修正/确认备注（持久化，多用户共享）" />
          <label class="bmap__note-check"><input v-model="draftChecked" type="checkbox" data-testid="sim-map-note-checked" /> 已核实该影响点</label>
          <div class="bmap__note-actions">
            <button type="button" class="bmap__btn" :disabled="savingNote" data-testid="sim-map-note-save" @click="saveAnnotation">{{ savingNote ? '保存中…' : '保存标注' }}</button>
            <button type="button" class="bmap__btn" data-testid="sim-map-note-delete" @click="removeAnnotation">删除</button>
          </div>
          <p v-if="noteMsg" class="bmap__hint" data-testid="sim-map-note-msg">{{ noteMsg }}</p>
          <p class="bmap__hint">异步协同：多用户读写同一存储，最后写胜出。</p>
        </aside>
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
.bmap__watchers { color: var(--ia-fresh, #2e9e5b); }
.bmap__error { color: var(--ia-fail); font-size: 12px; margin: 0; }
.bmap__empty { border: 1px dashed var(--border-color); border-radius: 8px; padding: 24px; text-align: center; font-size: 12.5px; color: var(--text-muted); margin: 0; }
.bmap__canvas { height: 520px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.bmap__body { display: grid; grid-template-columns: 1fr 260px; gap: 10px; align-items: start; }
.bmap__note { border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.bmap__note-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bmap__note-id { font-size: 10.5px; opacity: .65; overflow: hidden; text-overflow: ellipsis; }
.bmap__note-close { margin-left: auto; border: none; background: none; cursor: pointer; }
.bmap__note-input { border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-family: inherit; font-size: 12px; background: transparent; color: var(--text-primary); resize: vertical; }
.bmap__note-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
.bmap__note-actions { display: flex; gap: 6px; }
</style>
