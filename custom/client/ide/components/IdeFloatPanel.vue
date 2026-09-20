<script setup lang="ts">
// IdeFloatPanel — 中栏浮窗壳（对标 zcode 浮窗模式，09-20 裁定）：
// 标题栏 pointer 拖拽（钳制在宿主内）、关闭按钮、默认锚定右下角。
// 宿主须 position:relative（挂在 IdeChatPane body 内）；样式对齐上游
// MessageQueueFloatPanel 浮卡（backdrop-filter + shadow）。
import { ref } from 'vue'

defineProps<{ title: string; testid?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

// 拖拽（pointer 事件）：未拖拽前锚定右下角；一旦拖拽转 left/top 定位
const pos = ref<{ x: number; y: number } | null>(null)
const panelEl = ref<HTMLElement | null>(null)
let dragOrigin: { px: number; py: number; x: number; y: number } | null = null

function onPointerDown(event: PointerEvent): void {
  const panel = panelEl.value
  const parent = (panel?.offsetParent as HTMLElement | null) ?? null
  if (!panel || !parent) return
  if ((event.target as HTMLElement).closest('.ide-float__close')) return
  const rect = panel.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()
  const current = pos.value ?? {
    x: rect.left - parentRect.left,
    y: rect.top - parentRect.top,
  }
  pos.value = current
  dragOrigin = { px: event.clientX, py: event.clientY, x: current.x, y: current.y }
  panel.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  const panel = panelEl.value
  const parent = (panel?.offsetParent as HTMLElement | null) ?? null
  if (!dragOrigin || !panel || !parent) return
  const nextX = dragOrigin.x + (event.clientX - dragOrigin.px)
  const nextY = dragOrigin.y + (event.clientY - dragOrigin.py)
  const maxX = Math.max(0, parent.clientWidth - panel.offsetWidth)
  const maxY = Math.max(0, parent.clientHeight - panel.offsetHeight)
  pos.value = {
    x: Math.min(Math.max(0, nextX), maxX),
    y: Math.min(Math.max(0, nextY), maxY),
  }
}

function onPointerUp(event: PointerEvent): void {
  dragOrigin = null
  panelEl.value?.releasePointerCapture?.(event.pointerId)
}
</script>

<template>
  <div
    ref="panelEl"
    class="ide-float"
    :style="pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : undefined"
    :data-testid="testid"
  >
    <header
      class="ide-float__head"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="ide-float__title">{{ title }}</span>
      <button type="button" class="ide-float__close" aria-label="✕" data-testid="ide-float-close" @click="emit('close')">✕</button>
    </header>
    <div class="ide-float__body">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-float {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 20;
  width: min(380px, 100%);
  max-height: 62%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color, #26292f);
  border-radius: 10px;
  background: var(--bg-secondary, #1b1e24);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  overflow: hidden;
}

.ide-float__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-color, #26292f);
  cursor: grab;
  user-select: none;
  touch-action: none;

  &:active { cursor: grabbing; }
}

.ide-float__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #e6e6e6);
}

.ide-float__close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #ebebeb); }
}

.ide-float__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
}

.ide-float__empty {
  margin: 0;
  padding: 14px 4px;
  color: var(--text-muted, #9aa0aa);
  font-size: 12px;
  text-align: center;
}
</style>
