<script setup lang="ts">
// IdeWhiteboardPane — 画板（M4e，对标 zcode whiteboard 15 键）：
// canvas 手绘：笔/橡皮/颜色/粗细/撤销/清空/导出 PNG（下载到本机）。
// 独立自包含（sidePane「画板」tab），无服务端依赖。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'

const { t } = useI18n()
const message = useMessage()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const tool = ref<'pen' | 'eraser'>('pen')
const color = ref('#4cc9f0')
const width = ref(3)
const canUndo = ref(false)
const canRedo = ref(false)

/** 笔迹自带属性快照：撤销/重做/导出的重绘必须按落笔时的工具与颜色，
 *  而不是「当前」工具栏状态——否则换色后 undo/redo 会给历史笔迹统一改色，
 *  切橡皮再 undo 甚至会把整幅画按 destination-out 擦掉 */
interface Stroke {
  points: Array<{ x: number; y: number }>
  tool: 'pen' | 'eraser'
  color: string
  width: number
}
const strokes = ref<Stroke[]>([])
const redoStack = ref<Stroke[]>([])
let drawing = false
let currentStroke: Stroke | null = null

function ctx2d(): CanvasRenderingContext2D | null {
  return canvasRef.value?.getContext('2d') ?? null
}

function repaint(): void {
  const canvas = canvasRef.value
  const ctx = ctx2d()
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const stroke of strokes.value) drawStroke(ctx, stroke)
  canUndo.value = strokes.value.length > 0
  canRedo.value = redoStack.value.length > 0
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineWidth = stroke.tool === 'eraser' ? stroke.width * 6 : stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length < 2) {
    if (stroke.points.length === 1) {
      ctx.save()
      applyStrokeStyle(ctx, stroke)
      ctx.beginPath()
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    return
  }
  ctx.save()
  applyStrokeStyle(ctx, stroke)
  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.stroke()
  ctx.restore()
}

function pos(event: PointerEvent): { x: number; y: number } {
  const rect = canvasRef.value!.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvasRef.value!.width,
    y: ((event.clientY - rect.top) / rect.height) * canvasRef.value!.height,
  }
}

function onDown(event: PointerEvent): void {
  drawing = true
  redoStack.value = []
  // 落笔即快照当前工具属性
  currentStroke = { points: [pos(event)], tool: tool.value, color: color.value, width: width.value }
}

function onMove(event: PointerEvent): void {
  if (!drawing || !currentStroke) return
  currentStroke.points.push(pos(event))
  const ctx = ctx2d()
  if (ctx && currentStroke.points.length >= 2) {
    // 增量画最后一段（避免整幅重绘的卡顿），用该笔迹自己的属性快照
    const pts = currentStroke.points
    ctx.save()
    applyStrokeStyle(ctx, currentStroke)
    ctx.beginPath()
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y)
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
    ctx.restore()
  }
}

function onUp(): void {
  if (!drawing) return
  drawing = false
  if (currentStroke) strokes.value = [...strokes.value, currentStroke]
  currentStroke = null
  canUndo.value = true
  canRedo.value = false
}

function undo(): void {
  if (!strokes.value.length) return
  redoStack.value = [...redoStack.value, strokes.value[strokes.value.length - 1]]
  strokes.value = strokes.value.slice(0, -1)
  repaint()
}

function redo(): void {
  if (!redoStack.value.length) return
  strokes.value = [...strokes.value, redoStack.value[redoStack.value.length - 1]]
  redoStack.value = redoStack.value.slice(0, -1)
  repaint()
}

function clearAll(): void {
  strokes.value = []
  redoStack.value = []
  repaint()
}

function exportPng(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `whiteboard-${Date.now()}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  message.success(t('ide.whiteboard.exported'))
}

function resizeCanvas(): void {
  const canvas = canvasRef.value
  if (!canvas?.parentElement) return
  const rect = canvas.parentElement.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return
  const snapshot = document.createElement('canvas')
  snapshot.width = canvas.width
  snapshot.height = canvas.height
  snapshot.getContext('2d')?.drawImage(canvas, 0, 0)
  canvas.width = Math.floor(rect.width)
  canvas.height = Math.floor(rect.height)
  canvas.getContext('2d')?.drawImage(snapshot, 0, 0)
}

// 测试与外部集成暴露（撤销栈操作面；script setup 默认代理只读）
defineExpose({
  strokes,
  redoStack,
  canUndo,
  canRedo,
  undo,
  redo,
  onUp,
  get drawing() { return drawing },
  set drawing(v: boolean) { drawing = v },
  get currentStroke() { return currentStroke },
  set currentStroke(v: Stroke | null) { currentStroke = v },
})

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  resizeCanvas()
  resizeObserver = new ResizeObserver(() => resizeCanvas())
  if (canvasRef.value?.parentElement) resizeObserver.observe(canvasRef.value.parentElement)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="ide-board" data-testid="ide-whiteboard-pane">
    <div class="ide-board__toolbar">
      <button type="button" class="ide-board__btn" :class="{ 'is-active': tool === 'pen' }" :title="t('ide.whiteboard.pen')" data-testid="ide-board-pen" @click="tool = 'pen'">✏️</button>
      <button type="button" class="ide-board__btn" :class="{ 'is-active': tool === 'eraser' }" :title="t('ide.whiteboard.eraser')" data-testid="ide-board-eraser" @click="tool = 'eraser'">🧹</button>
      <input v-model="color" type="color" class="ide-board__color" :title="t('ide.whiteboard.color')" data-testid="ide-board-color">
      <input v-model.number="width" type="range" min="1" max="12" class="ide-board__range" :title="t('ide.whiteboard.width')">
      <span class="ide-board__spacer" />
      <button type="button" class="ide-board__btn" :disabled="!canUndo" :title="t('ide.whiteboard.undo')" data-testid="ide-board-undo" @click="undo">↩</button>
      <button type="button" class="ide-board__btn" :disabled="!canRedo" :title="t('ide.whiteboard.redo')" data-testid="ide-board-redo" @click="redo">↪</button>
      <button type="button" class="ide-board__btn" :title="t('ide.whiteboard.clear')" data-testid="ide-board-clear" @click="clearAll">🗑</button>
      <button type="button" class="ide-board__btn ide-board__btn--primary" :title="t('ide.whiteboard.export')" data-testid="ide-board-export" @click="exportPng">⤓</button>
    </div>
    <div class="ide-board__canvas-wrap">
      <canvas
        ref="canvasRef"
        class="ide-board__canvas"
        data-testid="ide-board-canvas"
        @pointerdown.prevent="onDown"
        @pointermove.prevent="onMove"
        @pointerup="onUp"
        @pointerleave="onUp"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-board {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ide-board__toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-board__btn {
  height: 24px;
  min-width: 26px;
  padding: 0 5px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.35; cursor: not-allowed; }
  &.is-active {
    border-color: var(--accent-primary, #4cc9f0);
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
  }
  &--primary { color: var(--accent-primary, #4cc9f0); }
}

.ide-board__color {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}

.ide-board__range { width: 60px; }

.ide-board__spacer { flex: 1; }

.ide-board__canvas-wrap {
  flex: 1;
  min-height: 0;
  padding: 6px;
}

.ide-board__canvas {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: var(--bg-primary, #14161a);
  border: 1px dashed var(--border-color, #e0e0e0);
  touch-action: none;
  cursor: crosshair;
}
</style>
