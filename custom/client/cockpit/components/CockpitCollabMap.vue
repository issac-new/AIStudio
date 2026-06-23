<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

// Canvas 元素与上下文
const canvasEl = ref<HTMLCanvasElement | null>(null)
const wrapEl = ref<HTMLElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null

// 画布逻辑尺寸（CSS 像素，DPR 缩放在 resize 时处理）
let cw = 320
let ch = 140

// 视口变换（pan + zoom）
const view = ref({ x: 0, y: 0, scale: 1 })
let dragging = false
let lastX = 0, lastY = 0

// hover 节点（用于光标提示）
const hoverNode = ref<GraphNode | null>(null)

// 节点布局：分支式（中心居中，四方向延伸）
// 上方：父任务（垂直向上）；下方：子任务（垂直向下）；左侧：频道（水平向左）；右侧：人员（水平向右）
const layout = computed(() => {
  const topo = store.topologyForSelectedTask
  const pos: Record<string, { x: number; y: number; w: number; h: number }> = {}
  const cx = cw / 2
  const cy = ch / 2

  // 节点框尺寸
  const nodeSize = (label: string, isCenter = false) => {
    let tw: number
    if (ctx) {
      ctx.font = isCenter ? 'bold 12px sans-serif' : '11px sans-serif'
      tw = ctx.measureText(label).width
    } else {
      tw = label.length * 7
    }
    return { w: Math.min(isCenter ? 170 : 130, Math.max(50, tw + 20)), h: isCenter ? 30 : 24 }
  }

  const center = topo.nodes.find(n => n.kind === 'center')
  if (center) {
    const s = nodeSize(center.label, true)
    pos[center.id] = { x: cx, y: cy, w: s.w, h: s.h }
  }

  // 按类型分组
  const parents = topo.nodes.filter(n => n.kind === 'parent')
  const children = topo.nodes.filter(n => n.kind === 'child')
  const persons = topo.nodes.filter(n => n.kind === 'person')
  const channels = topo.nodes.filter(n => n.kind === 'channel')

  // 分支间距：节点高度 + 间隙（垂直分支）；节点宽度 + 间隙（水平分支）
  const vGap = 34   // 垂直方向节点间距
  const hGap = 100  // 水平方向节点间距（留连线空间）

  // 父任务：上方，垂直向上排列（第一个离 center 最近）
  parents.forEach((node, i) => {
    const s = nodeSize(node.label)
    pos[node.id] = { x: cx, y: cy - (i + 1) * vGap - s.h / 2, w: s.w, h: s.h }
  })
  // 子任务：下方，垂直向下排列
  children.forEach((node, i) => {
    const s = nodeSize(node.label)
    pos[node.id] = { x: cx, y: cy + (i + 1) * vGap + s.h / 2, w: s.w, h: s.h }
  })
  // 频道：左侧，水平向左排列
  channels.forEach((node, i) => {
    const s = nodeSize(node.label)
    pos[node.id] = { x: cx - (i + 1) * hGap - s.w / 2, y: cy, w: s.w, h: s.h }
  })
  // 人员：右侧，水平向右排列
  persons.forEach((node, i) => {
    const s = nodeSize(node.label)
    pos[node.id] = { x: cx + (i + 1) * hGap + s.w / 2, y: cy, w: s.w, h: s.h }
  })

  // folded 放右下角
  const folded = topo.nodes.find(n => n.kind === 'folded')
  if (folded) {
    const s = nodeSize(folded.label)
    pos[folded.id] = { x: cx + 80, y: cy + 60, w: s.w, h: s.h }
  }
  return pos
})

// 绘制
function draw() {
  if (!ctx) return
  const c = canvasEl.value!
  ctx.save()
  ctx.clearRect(0, 0, c.width, c.height)
  // 应用 DPR：ctx 已在 resize 时 scale(dpr,dpr)，这里只做视口变换
  ctx.translate(view.value.x, view.value.y)
  ctx.scale(view.value.scale, view.value.scale)

  const topo = store.topologyForSelectedTask
  const pos = layout.value

  // 背景点阵（可选，视觉提示）
  ctx.fillStyle = 'rgba(0,0,0,0.04)'
  // 画连线（center → 辐射）
  ctx.strokeStyle = 'rgba(128,128,128,0.35)'
  ctx.lineWidth = 1
  const centerPos = pos['g-center']
  for (const r of topo.relations) {
    const from = pos[r.from]
    const to = pos[r.to]
    if (!from || !to) continue
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  // 画节点
  for (const n of topo.nodes) {
    const p = pos[n.id]
    if (!p) continue
    const isFocus = n.focus
    const isHover = hoverNode.value?.id === n.id
    // 节点背景
    ctx.fillStyle = n.kind === 'folded' ? 'rgba(0,0,0,0.04)' : (isFocus ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.9)')
    ctx.strokeStyle = isFocus ? 'rgba(0,0,0,0.8)' : (isHover ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)')
    ctx.lineWidth = isFocus ? 2 : 1
    const radius = 6
    roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, radius)
    ctx.fill()
    ctx.stroke()
    // 文字
    ctx.fillStyle = n.kind === 'folded' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.85)'
    ctx.font = isFocus ? 'bold 12px sans-serif' : '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 截断长 label
    let label = n.label
    const maxW = p.w - 12
    while (ctx.measureText(label).width > maxW && label.length > 1) {
      label = label.slice(0, -1)
    }
    if (label !== n.label) label = label.slice(0, -1) + '…'
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

// 命中检测：屏幕坐标 → 逻辑坐标 → 找节点
function hitTest(clientX: number, clientY: number): GraphNode | null {
  const c = canvasEl.value!
  const rect = c.getBoundingClientRect()
  const x = (clientX - rect.left - view.value.x) / view.value.scale
  const y = (clientY - rect.top - view.value.y) / view.value.scale
  const pos = layout.value
  const topo = store.topologyForSelectedTask
  for (const n of topo.nodes) {
    const p = pos[n.id]
    if (!p) continue
    if (x >= p.x - p.w / 2 && x <= p.x + p.w / 2 && y >= p.y - p.h / 2 && y <= p.y + p.h / 2) {
      return n
    }
  }
  return null
}

// 交互
function onDown(e: MouseEvent) {
  const hit = hitTest(e.clientX, e.clientY)
  if (hit) {
    // 点击节点：不拖拽，由 click 处理
    return
  }
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
  ;(e.target as HTMLElement).style.cursor = 'grabbing'
}
function onMove(e: MouseEvent) {
  if (dragging) {
    view.value = {
      ...view.value,
      x: view.value.x + (e.clientX - lastX),
      y: view.value.y + (e.clientY - lastY),
    }
    lastX = e.clientX
    lastY = e.clientY
    draw()
    return
  }
  // hover 检测
  const hit = hitTest(e.clientX, e.clientY)
  const prev = hoverNode.value
  hoverNode.value = hit
  if (prev?.id !== hit?.id) {
    ;(e.target as HTMLElement).style.cursor = hit ? 'pointer' : 'grab'
    draw()
  }
}
function onUp() {
  dragging = false
  if (canvasEl.value) canvasEl.value.style.cursor = 'grab'
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY < 0 ? 0.1 : -0.1
  view.value = { ...view.value, scale: Math.min(2, Math.max(0.5, view.value.scale + delta)) }
  draw()
}
function onClick(e: MouseEvent) {
  const hit = hitTest(e.clientX, e.clientY)
  if (!hit) return
  if (hit.kind === 'center' || hit.kind === 'folded') return
  if (hit.target?.taskId) {
    store.selectTask(hit.target.taskId)
  } else if (hit.kind === 'channel' && hit.target?.routeTarget) {
    const ch = store.channelsForSelectedTask.find(c => c.taskId === hit.taskId)
    if (ch) store.selectChannel(ch.id)
  }
}

// 缩放按钮
function zoomBy(delta: number) {
  view.value = { ...view.value, scale: Math.min(2, Math.max(0.5, view.value.scale + delta)) }
  draw()
}

// resize：DPR 处理
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
  if (ctx) {
    ctx.scale(dpr, dpr)
    draw()
  }
}

const hasTask = computed(() => !!store.selectedTask)

// 数据变化时重绘
watch(() => store.topologyForSelectedTask, () => draw(), { deep: true })
watch(() => store.selectedTaskId, () => { view.value = { x: 0, y: 0, scale: 1 }; nextTick(draw) })
// 任务首次就绪时强制重绘（确保 canvas 已 mount 后重绘一次）
watch(hasTask, (v) => { if (v) nextTick(() => { resize(); draw() }) })

onMounted(() => {
  // 用 requestAnimationFrame 确保父级 flex 布局完成后再测量尺寸
  requestAnimationFrame(() => {
    resize()
    // 二次 raf 兜底（某些布局需两帧才稳定）
    requestAnimationFrame(() => {
      if (cw < 50 || ch < 50) resize()
    })
    if (wrapEl.value && typeof ResizeObserver !== 'undefined') {
      try {
        ro = new ResizeObserver(() => resize())
        ro.observe(wrapEl.value)
      } catch { /* ignore */ }
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
        <button type="button" class="cockpit-map__tool" data-canvas-zoom-in :title="'放大'" @click="zoomBy(0.1)">+</button>
        <button type="button" class="cockpit-map__tool" data-canvas-zoom-out :title="'缩小'" @click="zoomBy(-0.1)">−</button>
      </div>
    </div>
    <div v-if="hasTask" ref="wrapEl" class="cockpit-map__canvas"
      @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp" @wheel="onWheel" @click="onClick">
      <canvas ref="canvasEl" class="cockpit-map__canvas-el"></canvas>
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
}
.cockpit-map__canvas-el { display: block; }
.cockpit-map__hint { position: absolute; bottom: 4px; left: 8px; font-size: 8px; color: var(--text-muted); pointer-events: none; }
.cockpit-map__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
