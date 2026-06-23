<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'
import CockpitGraphNode from './CockpitGraphNode.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

// 画布实际尺寸（ResizeObserver 响应式测量，viewBox 自适应）
const canvasEl = ref<HTMLElement | null>(null)
const canvasW = ref(320)
const canvasH = ref(140)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (canvasEl.value && typeof ResizeObserver !== 'undefined') {
    try {
      ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          canvasW.value = e.contentRect.width || 320
          canvasH.value = e.contentRect.height || 140
        }
      })
      ro.observe(canvasEl.value)
    } catch { /* ResizeObserver 不可用（如 jsdom 测试环境），用默认尺寸 */ }
  }
})
onUnmounted(() => { try { ro?.disconnect() } catch { /* ignore */ } })

// 中心 + 辐射节点位置（120° 三扇区分布）
// center 居中；parent 在上方扇区（-90° ± 60°）；child 在下方扇区（90° ± 60°）；person/channel 在左右扇区
const nodePos = computed<Record<string, { x: number; y: number }>>(() => {
  const out: Record<string, { x: number; y: number }> = {}
  const topo = store.topologyForSelectedTask
  const cx = canvasW.value / 2
  const cy = canvasH.value / 2
  // 半径：取宽高较小者的 35%（留出节点标签空间）
  const R = Math.min(canvasW.value, canvasH.value) * 0.35

  const center = topo.nodes.find(n => n.kind === 'center')
  if (center) out[center.id] = { x: cx, y: cy }

  // 按类型分组辐射节点
  const parents = topo.nodes.filter(n => n.kind === 'parent')
  const children = topo.nodes.filter(n => n.kind === 'child')
  const persons = topo.nodes.filter(n => n.kind === 'person')
  const channels = topo.nodes.filter(n => n.kind === 'channel')

  // 上方扇区（parent）：以 -90°（正上）为中心，±60° 内均分
  const spread = (count: number, centerAngle: number, halfRange: number) => {
    if (count === 0) return [] as number[]
    if (count === 1) return [centerAngle]
    const step = (halfRange * 2) / (count - 1)
    return Array.from({ length: count }, (_, i) => centerAngle - halfRange + step * i)
  }
  // parent：上方（-90°），半范围 60°
  parents.forEach((node, i) => {
    const angles = spread(parents.length, -Math.PI / 2, Math.PI / 3)
    const a = angles[i]
    out[node.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })
  // child：下方（90°），半范围 60°
  children.forEach((node, i) => {
    const angles = spread(children.length, Math.PI / 2, Math.PI / 3)
    const a = angles[i]
    out[node.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })
  // person：左侧（180°），半范围 50°
  persons.forEach((node, i) => {
    const angles = spread(persons.length, Math.PI, Math.PI / 3.6)
    const a = angles[i]
    out[node.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })
  // channel：右侧（0°），半范围 50°
  channels.forEach((node, i) => {
    const angles = spread(channels.length, 0, Math.PI / 3.6)
    const a = angles[i]
    out[node.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })

  // folded 节点放右下角
  const folded = topo.nodes.find(nn => nn.kind === 'folded')
  if (folded) out[folded.id] = { x: cx + R * 0.8, y: cy + R * 0.8 }
  return out
})

// viewBox 响应实际画布尺寸
const viewBoxStr = computed(() => `0 0 ${canvasW.value} ${canvasH.value}`)

// 画布变换（pan + zoom），存 store.canvasTransform
const tf = computed(() => store.canvasTransform)

function zoomBy(delta: number) {
  const next = Math.min(2, Math.max(0.5, tf.value.scale + delta))
  store.canvasTransform = { ...tf.value, scale: next }
}

// 拖拽画布 pan
const dragging = ref(false)
let startX = 0, startY = 0, startTx = 0, startTy = 0
function onCanvasDown(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('cockpit-map__canvas') ||
      (e.target as HTMLElement).classList.contains('cockpit-map__svg')) {
    dragging.value = true
    startX = e.clientX; startY = e.clientY
    startTx = tf.value.x; startTy = tf.value.y
    e.preventDefault()
  }
}
function onCanvasMove(e: MouseEvent) {
  if (!dragging.value) return
  store.canvasTransform = {
    ...tf.value,
    x: startTx + (e.clientX - startX),
    y: startTy + (e.clientY - startY),
  }
}
function onCanvasUp() { dragging.value = false }
function onWheel(e: WheelEvent) {
  e.preventDefault()
  zoomBy(e.deltaY < 0 ? 0.1 : -0.1)
}

// 节点点击：分发到 store
function onNodeClick(node: GraphNode) {
  if (node.kind === 'center' || node.kind === 'folded') return
  if (node.target?.taskId) {
    store.selectTask(node.target.taskId)
  } else if (node.kind === 'channel' && node.target?.routeTarget) {
    const ch = store.channelsForSelectedTask.find(c => c.taskId === node.taskId)
    if (ch) store.selectChannel(ch.id)
  }
}

const hasTask = computed(() => !!store.selectedTask)
const nodes = computed(() => store.topologyForSelectedTask.nodes)
const relations = computed(() => store.topologyForSelectedTask.relations)
const centerX = computed(() => canvasW.value / 2)
const centerY = computed(() => canvasH.value / 2)
</script>

<template>
  <div class="cockpit-map">
    <div class="cockpit-map__head">
      <span class="cockpit-map__title">{{ t('cockpit.collaborationMap') }}</span>
      <div class="cockpit-map__tools">
        <button type="button" class="cockpit-map__tool" data-canvas-zoom-in :title="'放大'" @click="zoomBy(0.1)">+</button>
        <button type="button" class="cockpit-map__tool" data-canvas-zoom-out :title="'缩小'" @click="zoomBy(-0.1)">−</button>
      </div>
    </div>
    <div v-if="hasTask" class="cockpit-map__canvas" ref="canvasEl"
      @mousedown="onCanvasDown" @mousemove="onCanvasMove" @mouseup="onCanvasUp" @mouseleave="onCanvasUp" @wheel="onWheel">
      <svg class="cockpit-map__svg" :viewBox="viewBoxStr" preserveAspectRatio="none">
        <g :transform="`translate(${tf.x},${tf.y}) scale(${tf.scale})`" :style="{ transformOrigin: `${centerX}px ${centerY}px` }">
          <line v-for="r in relations" :key="r.id"
            :x1="nodePos[r.from]?.x ?? centerX" :y1="nodePos[r.from]?.y ?? centerY"
            :x2="nodePos[r.to]?.x ?? centerX" :y2="nodePos[r.to]?.y ?? centerY"
            stroke="var(--text-muted)" stroke-width="1.5" />
        </g>
      </svg>
      <div class="cockpit-map__nodes" :style="{ transform: `translate(${tf.x}px,${tf.y}px) scale(${tf.scale})`, transformOrigin: `${centerX}px ${centerY}px` }">
        <CockpitGraphNode
          v-for="n in nodes" :key="n.id"
          :node="n"
          :x="nodePos[n.id]?.x ?? centerX"
          :y="nodePos[n.id]?.y ?? centerY"
          @click="onNodeClick"
        />
      </div>
      <span class="cockpit-map__hint">拖拽空白处平移 · 滚轮缩放 · 点节点联动</span>
    </div>
    <div v-else class="cockpit-map__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-map { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.cockpit-map__head { display: flex; align-items: center; gap: 8px; padding: 8px 44px 4px 16px; }
.cockpit-map__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-map__tools { display: flex; gap: 3px; margin-left: auto; }
.cockpit-map__tool {
  width: 22px; height: 20px; font-size: 11px; padding: 0;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}
.cockpit-map__canvas {
  position: relative; flex: 1 1 0; min-height: 100px;
  background: var(--bg-secondary);
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 14px 14px;
  overflow: hidden;
  cursor: grab;
  &.is-dragging { cursor: grabbing; }
}
.cockpit-map__svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cockpit-map__nodes { position: absolute; inset: 0; }
.cockpit-map__hint { position: absolute; bottom: 4px; left: 8px; font-size: 8px; color: var(--text-muted); pointer-events: none; }
.cockpit-map__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
