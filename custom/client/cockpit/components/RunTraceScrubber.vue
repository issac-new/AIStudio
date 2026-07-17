<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  minTime: number          // session startedAt (ms)
  maxTime: number          // now or session endedAt (ms)
  currentTime: number      // scrubber position (ms)
  mode: 'live' | 'replay'
  replayProgress: number   // 0-100
}>()
const emit = defineEmits<{
  (e: 'scrub', timeMs: number): void
  (e: 'switch-live'): void
  (e: 'start-replay', fromMs: number): void
  (e: 'scrub-end'): void
}>()

const { t } = useI18n()

const dragging = ref(false)
const trackRef = ref<HTMLDivElement | null>(null)

const totalSpan = computed(() => Math.max(1, props.maxTime - props.minTime))
const scrubberPct = computed(() => {
  const pos = Math.min(props.maxTime, Math.max(props.minTime, props.currentTime))
  return ((pos - props.minTime) / totalSpan.value) * 100
})

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}

function timeFromEvent(clientX: number): number {
  const track = trackRef.value
  if (!track) return props.minTime
  const rect = track.getBoundingClientRect()
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return props.minTime + pct * totalSpan.value
}

function onPointerDown(e: PointerEvent) {
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  emit('scrub', timeFromEvent(e.clientX))
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  emit('scrub', timeFromEvent(e.clientX))
}
function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  // 拖动结束后通知父组件从当前位置重建 trace
  emit('scrub-end')
}

// Tick labels: 5 evenly-spaced timestamps
const tickMarks = computed(() => {
  const ticks: { pct: number; label: string }[] = []
  for (let i = 0; i <= 4; i++) {
    const t = props.minTime + (i / 4) * totalSpan.value
    ticks.push({ pct: (i / 4) * 100, label: fmtTime(t) })
  }
  return ticks
})

const durationLabel = computed(() => fmtDuration(totalSpan.value))
</script>

<template>
  <div class="run-trace-scrubber" data-run-trace-scrubber>
    <div class="run-trace-scrubber__controls">
      <span class="run-trace-scrubber__mode" :class="'is-' + mode">
        {{ mode === 'live' ? '● ' + t('cockpit.liveMode') : '⟲ ' + t('cockpit.replayMode') }}
      </span>
      <span class="run-trace-scrubber__time">{{ fmtTime(currentTime) }}</span>
      <span class="run-trace-scrubber__dur">{{ t('cockpit.duration') }} {{ durationLabel }}</span>
      <span v-if="mode === 'replay' && replayProgress > 0" class="run-trace-scrubber__progress">
        {{ Math.round(replayProgress) }}%
      </span>
      <span class="run-trace-scrubber__hint">{{ t('cockpit.playbackHint') }}</span>
    </div>
    <div
      ref="trackRef"
      class="run-trace-scrubber__track"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <!-- Progress fill -->
      <div
        class="run-trace-scrubber__fill"
        :style="{ width: mode === 'replay' ? `${replayProgress}%` : '100%' }"
      />
      <!-- Tick marks -->
      <div
        v-for="tick in tickMarks"
        :key="tick.pct"
        class="run-trace-scrubber__tick"
        :style="{ left: `${tick.pct}%` }"
      >
        <span class="run-trace-scrubber__tick-label">{{ tick.label }}</span>
      </div>
      <!-- Scrubber handle -->
      <div
        class="run-trace-scrubber__handle"
        :class="{ 'is-live': mode === 'live', 'is-dragging': dragging }"
        :style="{ left: `${scrubberPct}%` }"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.run-trace-scrubber { padding: 8px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.run-trace-scrubber__controls { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.run-trace-scrubber__mode { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
  &.is-live { color: var(--success); background: rgba(76,175,80,0.1); }
  &.is-replay { color: var(--accent-info); background: rgba(107,163,214,0.1); }
}
.run-trace-scrubber__time { font-size: 11px; font-weight: 600; color: var(--text-primary); font-family: ui-monospace, 'SF Mono', monospace; font-variant-numeric: tabular-nums; }
.run-trace-scrubber__dur { font-size: 10px; color: var(--text-muted); }
.run-trace-scrubber__progress { font-size: 10px; color: var(--accent-info); }
.run-trace-scrubber__hint { font-size: 9px; color: var(--text-muted); margin-left: auto; }
.run-trace-scrubber__track { position: relative; height: 24px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px; overflow: visible; cursor: ew-resize; }
.run-trace-scrubber__fill { position: absolute; top: 0; left: 0; bottom: 0; background: linear-gradient(to right, var(--accent-info-alpha, rgba(107,163,214,0.15)), rgba(107,163,214,0.25)); border-radius: 3px 0 0 3px; transition: width 0.15s ease; }
.run-trace-scrubber__tick { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--border-color); pointer-events: none; }
.run-trace-scrubber__tick-label { position: absolute; top: 100%; left: 0; transform: translateX(-50%); margin-top: 2px; font-size: 8px; color: var(--text-muted); white-space: nowrap; }
.run-trace-scrubber__handle { position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%; background: var(--accent-primary); border: 2px solid var(--bg-card); transform: translate(-50%, -50%); box-shadow: 0 1px 3px rgba(0,0,0,0.2); cursor: grab; z-index: 2;
  &.is-live { background: var(--success); animation: run-trace-pulse 1.5s ease-in-out infinite; }
  &.is-dragging { cursor: grabbing; transform: translate(-50%, -50%) scale(1.3); }
}
@keyframes run-trace-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); } 50% { box-shadow: 0 0 0 6px rgba(76, 175, 80, 0); } }
</style>
