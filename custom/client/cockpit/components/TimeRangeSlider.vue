<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  minTime: number
  maxTime: number
  windowStart: number
  windowEnd: number
}>()
const emit = defineEmits<{
  (e: 'update:window', payload: { start: number; end: number }): void
  (e: 'apply', payload: { start: number; end: number }): void
}>()

const trackRef = ref<HTMLDivElement | null>(null)
const dragging = ref<'start' | 'end' | null>(null)

const totalSpan = computed(() => Math.max(1, props.maxTime - props.minTime))

const startPct = computed(() => {
  const v = Math.min(props.maxTime, Math.max(props.minTime, props.windowStart))
  return ((v - props.minTime) / totalSpan.value) * 100
})
const endPct = computed(() => {
  const v = Math.min(props.maxTime, Math.max(props.minTime, props.windowEnd))
  return ((v - props.maxTime) / totalSpan.value) * 100 + 100
})

function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d${h % 24}h`
}

function timeFromEvent(clientX: number): number {
  const track = trackRef.value
  if (!track) return props.minTime
  const rect = track.getBoundingClientRect()
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return Math.round(props.minTime + pct * totalSpan.value)
}

function onHandleDown(which: 'start' | 'end', e: PointerEvent) {
  dragging.value = which
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const t = timeFromEvent(e.clientX)
  if (dragging.value === 'start') {
    const ns = Math.min(t, props.windowEnd - 1000)
    emit('update:window', { start: ns, end: props.windowEnd })
  } else {
    const ne = Math.max(t, props.windowStart + 1000)
    emit('update:window', { start: props.windowStart, end: ne })
  }
}
function onPointerUp() {
  if (!dragging.value) return
  emit('apply', { start: props.windowStart, end: props.windowEnd })
  dragging.value = null
}

const winDuration = computed(() => Math.max(0, props.windowEnd - props.windowStart))
</script>

<template>
  <div class="time-range-slider" data-time-range-slider>
    <span class="time-range-slider__label">时间窗</span>
    <span class="time-range-slider__time">{{ fmtDateTime(windowStart) }}</span>
    <div class="time-range-slider__track" ref="trackRef" @pointermove="onPointerMove" @pointerup="onPointerUp">
      <!-- 选中区间高亮 -->
      <div class="time-range-slider__range" :style="{ left: startPct + '%', width: (endPct - startPct) + '%' }"></div>
      <!-- 起始拖柄 -->
      <div
        class="time-range-slider__handle time-range-slider__handle--start"
        :style="{ left: startPct + '%' }"
        @pointerdown.stop="onHandleDown('start', $event)"
      ></div>
      <!-- 结束拖柄 -->
      <div
        class="time-range-slider__handle time-range-slider__handle--end"
        :style="{ left: endPct + '%' }"
        @pointerdown.stop="onHandleDown('end', $event)"
      ></div>
    </div>
    <span class="time-range-slider__time">{{ fmtDateTime(windowEnd) }}</span>
    <span class="time-range-slider__duration">{{ fmtDuration(winDuration) }}</span>
  </div>
</template>

<style scoped lang="scss">
.time-range-slider { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.time-range-slider__label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; flex-shrink: 0; }
.time-range-slider__time { font-size: 10px; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.time-range-slider__track { position: relative; flex: 1; height: 22px; background: var(--bg-secondary); border-radius: 11px; cursor: pointer; touch-action: none; }
.time-range-slider__range { position: absolute; top: 2px; bottom: 2px; background: rgba(var(--accent-primary-rgb, 64,120,192), 0.22); border: 1px solid var(--accent-primary); border-radius: 9px; }
.time-range-slider__handle {
  position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 12px; height: 22px; border-radius: 4px;
  background: var(--accent-primary); border: 2px solid var(--bg-card);
  cursor: ew-resize; z-index: 2; touch-action: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  &:hover { background: var(--accent-primary); filter: brightness(1.1); }
}
.time-range-slider__duration { font-size: 10px; color: var(--accent-primary); font-weight: 600; white-space: nowrap; flex-shrink: 0; }
</style>
