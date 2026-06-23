<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const wrapEl = ref<HTMLElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let cw = 320
let ch = 140

// 视口变换（pan + zoom）
const view = ref({ x: 0, y: 0, scale: 1 })
let dragging = false
let lastX = 0, lastY = 0
const hoverNode = ref<GraphNode | null>(null)

// 字体配置（增大便于阅读）
const FONT_CENTER = 'bold 14px sans-serif'
const FONT_NODE = '13px sans-serif'

// 节点尺寸（ctx 就绪用 measureText，否则估算）
function nodeSize(label: string, isCenter = false): { w: number; h: number } {
  const font = isCenter ? FONT_CENTER : FONT_NODE
  let tw: number
  if (ctx) {
    ctx.font = font
    tw = ctx.measureText(label).width
  } else {
    tw = label.length * 8
  }
  return { w: Math.min(isCenter ? 200 : 150, Math.max(60, tw + 24)), h: isCenter ? 34 : 28 }
}

// 布局：中心居中，四方向直线延伸再分支（避免交叉）
const layout = computed(() => {
  const topo = store.topologyForSelectedTask
  const pos: Record<string, { x: number; y: number; w: number; h: number }> = {}
  const cx = cw / 2
  const cy = ch / 2

  const center = topo.nodes.find(n => n.kind === 'center')
  if (center) {
    const s = nodeSize(center.label, true)
    pos[center.id] = { x: cx, y: cy, w: s.w, h: s.h }
  }

  // 直线延伸距离（中心到第一层节点的间距）
  const trunkLen = Math.max(70, Math.min(cw, ch) * 0.2)
  // 层间距（同方向多层级）
  const layerH = 48
  // 同层水平间距
  const nodeHGap = 14

  // 按深度分组（祖先 depth<0，后代 depth>0）
  const ancestors = topo.nodes.filter(n => n.kind === 'ancestor')
  const descendants = topo.nodes.filter(n => n.kind === 'descendant')
  const persons = topo.nodes.filter(n => n.kind === 'person')
  const channels = topo.nodes.filter(n => n.kind === 'channel')

  // 祖先：上方。按 depth 分层，同层水平排列。
  // depth=-1 在 trunkLen 上方，depth=-2 在 2*layerH 上方...
  const ancestorDepths = new Map<number, GraphNode[]>()
  for (const n of ancestors) {
    if (!ancestorDepths.has(n.depth)) ancestorDepths.set(n.depth, [])
    ancestorDepths.get(n.depth)!.push(n)
  }
  for (const [depth, list] of ancestorDepths) {
    const sizes = list.map(n => nodeSize(n.label))
    const totalW = sizes.reduce((s, sz) => s + sz.w, 0) + (list.length - 1) * nodeHGap
    let x = cx - totalW / 2
    // depth=-1 → trunkLen, depth=-2 → trunkLen + layerH
    const yOff = trunkLen + (Math.abs(depth) - 1) * layerH
    list.forEach((n, i) => {
      const sz = sizes[i]
      pos[n.id] = { x: x + sz.w / 2, y: cy - yOff, w: sz.w, h: sz.h }
      x += sz.w + nodeHGap
    })
  }

  // 后代：下方。同理。
  const descendantDepths = new Map<number, GraphNode[]>()
  for (const n of descendants) {
    if (!descendantDepths.has(n.depth)) descendantDepths.set(n.depth, [])
    descendantDepths.get(n.depth)!.push(n)
  }
  for (const [depth, list] of descendantDepths) {
    const sizes = list.map(n => nodeSize(n.label))
    const totalW = sizes.reduce((s, sz) => s + sz.w, 0) + (list.length - 1) * nodeHGap
    let x = cx - totalW / 2
    const yOff = trunkLen + (depth - 1) * layerH
    list.forEach((n, i) => {
      const sz = sizes[i]
      pos[n.id] = { x: x + sz.w / 2, y: cy + yOff, w: sz.w, h: sz.h }
      x += sz.w + nodeHGap
    })
  }

  // 频道：左侧，水平向左直线延伸
  const channelGap = Math.max(100, cw / 5)
  channels.forEach((n, i) => {
    const s = nodeSize(n.label)
    pos[n.id] = { x: cx - trunkLen - i * channelGap, y: cy, w: s.w, h: s.h }
  })
  // 人员：右侧，水平向右直线延伸
  const personGap = Math.max(100, cw / 5)
  persons.forEach((n, i) => {
    const s = nodeSize(n.label)
    pos[n.id] = { x: cx + trunkLen + i * personGap, y: cy, w: s.w, h: s.h }
  })

  // folded
  const folded = topo.nodes.find(n => n.kind === 'folded')
  if (folded) {
    const s = nodeSize(folded.label)
    pos[folded.id] = { x: cx + 100, y: cy + 80, w: s.w, h: s.h }
  }
  return pos
})

// 绘制
function draw() {
  if (!ctx || !canvasEl.value) return
  const c = canvasEl.value
  ctx.save()
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.translate(view.value.x, view.value.y)
  ctx.scale(view.value.scale, view.value.scale)

  const topo = store.topologyForSelectedTask
  const pos = layout.value

  // 画连线（直角折线）
  ctx.strokeStyle = 'rgba(128,128,128,0.35)'
  ctx.lineWidth = 1
  for (const r of topo.relations) {
    const from = pos[r.from]
    const to = pos[r.to]
    if (!from || !to) continue
    ctx.beginPath()
    const dy = Math.abs(from.y - to.y)
    const dx = Math.abs(from.x - to.x)
    if (dy > dx) {
      // 垂直直角
      const midY = (from.y + to.y) / 2
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(from.x, midY)
      ctx.lineTo(to.x, midY)
      ctx.lineTo(to.x, to.y)
    } else {
      // 水平直线（频道/人员）
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
    }
    ctx.stroke()
  }

  // 画节点
  for (const n of topo.nodes) {
    const p = pos[n.id]
    if (!p) continue
    const isFocus = n.focus
    const isHover = hoverNode.value?.id === n.id
    // 背景
    ctx.fillStyle = n.kind === 'folded' ? 'rgba(0,0,0,0.04)'
      : isFocus ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = isFocus ? 'rgba(0,0,0,0.8)'
      : isHover ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.22)'
    ctx.lineWidth = isFocus ? 2 : 1
    roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 7)
    ctx.fill()
    ctx.stroke()
    // 文字（增大字号）
    ctx.fillStyle = n.kind === 'folded' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.88)'
    ctx.font = isFocus ? FONT_CENTER : FONT_NODE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let label = n.label
    const maxW = p.w - 14
    if (ctx.measureText(label).width > maxW) {
      while (ctx.measureText(label + '…').width > maxW && label.length > 1) label = label.slice(0, -1)
      label += '…'
    }
    ctx.fillText(label, p.x, p.y)
  }
  ctx.restore()
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

// 命中检测
function hitTest(clientX: number, clientY: number): GraphNode | null {
  const c = canvasEl.value!
  const rect = c.getBoundingClientRect()
  const x = (clientX - rect.left - view.value.x) / view.value.scale
  const y = (clientY - rect.top - view.value.y) / view.value.scale
  const pos = layout.value
  for (const n of store.topologyForSelectedTask.nodes) {
    const p = pos[n.id]
    if (!p) continue
    if (x >= p.x - p.w / 2 && x <= p.x + p.w / 2 && y >= p.y - p.h / 2 && y <= p.y + p.h / 2) return n
  }
  return null
}

function onDown(e: MouseEvent) {
  if (hitTest(e.clientX, e.clientY)) return
  dragging = true
  lastX = e.clientX; lastY = e.clientY
  ;(e.target as HTMLElement).style.cursor = 'grabbing'
}
function onMove(e: MouseEvent) {
  if (dragging) {
    view.value = { ...view.value, x: view.value.x + (e.clientX - lastX), y: view.value.y + (e.clientY - lastY) }
    lastX = e.clientX; lastY = e.clientY
    draw()
    return
  }
  const hit = hitTest(e.clientX, e.clientY)
  const prev = hoverNode.value
  hoverNode.value = hit
  if (prev?.id !== hit?.id) {
    ;(e.target as HTMLElement).style.cursor = hit ? 'pointer' : 'grab'
    draw()
  }
}
function onUp() { dragging = false; if (canvasEl.value) canvasEl.value.style.cursor = 'grab' }
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY < 0 ? 0.1 : -0.1
  view.value = { ...view.value, scale: Math.min(2.5, Math.max(0.5, view.value.scale + delta)) }
  draw()
}
function onClick(e: MouseEvent) {
  const hit = hitTest(e.clientX, e.clientY)
  if (!hit || hit.kind === 'center' || hit.kind === 'folded') return
  if (hit.target?.taskId) store.selectTask(hit.target.taskId)
  else if (hit.kind === 'channel' && hit.target?.routeTarget) {
    const ch = store.channelsForSelectedTask.find(c => c.taskId === hit.taskId)
    if (ch) store.selectChannel(ch.id)
  }
}
function zoomBy(delta: number) {
  view.value = { ...view.value, scale: Math.min(2.5, Math.max(0.5, view.value.scale + delta)) }
  draw()
}

// resize + DPR
let ro: ResizeObserver | null = null
function resize() {
  const c = canvasEl.value
  const wrap = wrapEl.value
  if (!c || !wrap) return
  const rect = wrap.getBoundingClientRect()
  cw = rect.width || 320
  ch = rect.height || 140
  const dpr = window.devicePixelRatio || 1
  c.width = cw * dpr
  c.height = ch * dpr
  c.style.width = cw + 'px'
  c.style.height = ch + 'px'
  ctx = c.getContext('2d')
  if (ctx) { ctx.scale(dpr, dpr); draw() }
}

const hasTask = computed(() => !!store.selectedTask)

watch(() => store.topologyForSelectedTask, () => draw(), { deep: true })
watch(() => store.selectedTaskId, () => { view.value = { x: 0, y: 0, scale: 1 }; nextTick(draw) })
watch(hasTask, (v) => { if (v) nextTick(() => { resize(); draw() }) })

onMounted(() => {
  requestAnimationFrame(() => {
    resize()
    requestAnimationFrame(() => { if (cw < 50 || ch < 50) resize() })
    if (wrapEl.value && typeof ResizeObserver !== 'undefined') {
      try { ro = new ResizeObserver(() => resize()); ro.observe(wrapEl.value) } catch { /* ignore */ }
    }
  })
})
onUnmounted(() => { try { ro?.disconnect() } catch { /* ignore */ } })
</script>

<template>
  <div class="cockpit-map">
    <div class="cockpit-map__head">
      <span class="cockpit-map__title">{{ t('cockpit.collaborationMap') }}</span>
      <div class="cockpit-map__tools">
        <button type="button" class="cockpit-map__tool" data-canvas-zoom-in title="放大" @click="zoomBy(0.15)">+</button>
        <button type="button" class="cockpit-map__tool" data-canvas-zoom-out title="缩小" @click="zoomBy(-0.15)">−</button>
      </div>
    </div>
    <div v-if="hasTask" ref="wrapEl" class="cockpit-map__canvas"
      @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp" @wheel="onWheel" @click="onClick">
      <canvas ref="canvasEl"></canvas>
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
  width: 24px; height: 22px; font-size: 14px; padding: 0;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}
.cockpit-map__canvas {
  position: relative; flex: 1 1 0; min-height: 100px;
  overflow: hidden; cursor: grab;
  background: var(--bg-secondary);
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 14px 14px;
}
.cockpit-map__canvas canvas { display: block; }
.cockpit-map__hint { position: absolute; bottom: 4px; left: 8px; font-size: 8px; color: var(--text-muted); pointer-events: none; }
.cockpit-map__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
