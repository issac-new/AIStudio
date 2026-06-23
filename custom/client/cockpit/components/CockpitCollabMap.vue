<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'
import CockpitGraphNode from './CockpitGraphNode.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

// 画布尺寸（中心点）
const CX = 160, CY = 70, R = 52

// 中心 + 辐射节点位置（中心居中，辐射按扇区均分）
const nodePos = computed<Record<string, { x: number; y: number }>>(() => {
  const out: Record<string, { x: number; y: number }> = {}
  const topo = store.topologyForSelectedTask
  const center = topo.nodes.find(n => n.kind === 'center')
  const radiate = topo.nodes.filter(n => n.kind !== 'center' && n.kind !== 'folded')
  if (center) out[center.id] = { x: CX, y: CY }
  const n = radiate.length || 1
  radiate.forEach((node, i) => {
    // 三扇区：parent 在上、person/channel 在下、child 居中环形
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    out[node.id] = { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) }
  })
  // folded 节点放右下角
  const folded = topo.nodes.find(nn => nn.kind === 'folded')
  if (folded) out[folded.id] = { x: CX + R + 20, y: CY + R }
  return out
})

// 画布变换（pan + zoom），存 store.canvasTransform
const tf = computed(() => store.canvasTransform)

function zoomBy(delta: number) {
  const next = Math.min(2, Math.max(0.5, tf.value.scale + delta))
  store.canvasTransform = { ...tf.value, scale: next }
}
// 全屏/最小化已移至 CockpitView 的栏位控件（store.toggleMaximized / toggleCollapsed）

// 拖拽画布 pan
const dragging = ref(false)
let startX = 0, startY = 0, startTx = 0, startTy = 0
function onCanvasDown(e: MouseEvent) {
  // 仅左键 + 空白处（target = canvas 本身）
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
    // 频道节点 → 切右栏协作模式（cockpit 内嵌聊天，不跳转）
    // channels computed 每次返回新 routeTarget 对象，用 taskId 匹配 channel
    const ch = store.channelsForSelectedTask.find(c => c.taskId === node.taskId)
    if (ch) store.selectChannel(ch.id)
  }
}

const hasTask = computed(() => !!store.selectedTask)
const nodes = computed(() => store.topologyForSelectedTask.nodes)
const relations = computed(() => store.topologyForSelectedTask.relations)
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
    <div v-if="hasTask" class="cockpit-map__canvas"
      @mousedown="onCanvasDown" @mousemove="onCanvasMove" @mouseup="onCanvasUp" @mouseleave="onCanvasUp" @wheel="onWheel">
      <svg class="cockpit-map__svg" viewBox="0 0 320 140" preserveAspectRatio="none">
        <g :transform="`translate(${tf.x},${tf.y}) scale(${tf.scale})`" style="transform-origin: 160px 70px">
          <line v-for="r in relations" :key="r.id"
            :x1="nodePos[r.from]?.x ?? CX" :y1="nodePos[r.from]?.y ?? CY"
            :x2="nodePos[r.to]?.x ?? CX" :y2="nodePos[r.to]?.y ?? CY"
            stroke="var(--text-muted)" stroke-width="1.5" />
        </g>
      </svg>
      <div class="cockpit-map__nodes" :style="{ transform: `translate(${tf.x}px,${tf.y}px) scale(${tf.scale})`, transformOrigin: '160px 70px' }">
        <CockpitGraphNode
          v-for="n in nodes" :key="n.id"
          :node="n"
          :x="nodePos[n.id]?.x ?? CX"
          :y="nodePos[n.id]?.y ?? CY"
          @click="onNodeClick"
        />
      </div>
      <span class="cockpit-map__hint">拖拽空白处平移 · 滚轮缩放 · 点节点联动</span>
    </div>
    <div v-else class="cockpit-map__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-map { display: flex; flex-direction: column; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
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
  position: relative; height: 140px;
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
