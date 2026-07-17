<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TraceNode } from '../adapters/run-trace-adapter'

const props = defineProps<{
  nodes: TraceNode[]
  minTime: number
  maxTime: number
  currentTime: number
}>()
const emit = defineEmits<{ (e: 'focus-node', id: string): void }>()

const { t } = useI18n()

// 按任务聚类分组，每个 cluster 一行泳道
const lanes = computed(() => {
  const span = Math.max(1, props.maxTime - props.minTime)
  const byCluster = new Map<string, TraceNode[]>()
  for (const n of props.nodes) {
    const key = n.cluster ?? n.ref?.sessionId ?? 'default'
    if (!byCluster.has(key)) byCluster.set(key, [])
    byCluster.get(key)!.push(n)
  }
  return [...byCluster.entries()].map(([cluster, ns]) => {
    const start = Math.min(...ns.map(n => n.startedAt))
    const end = Math.max(...ns.map(n => n.endedAt ?? n.startedAt))
    return {
      cluster,
      bars: ns.map(n => ({
        id: n.id,
        label: n.label,
        kind: n.kind,
        status: n.status,
        profile: n.profile,
        leftPct: ((n.startedAt - props.minTime) / span) * 100,
        widthPct: (Math.max(1, (n.endedAt ?? n.startedAt + 1000) - n.startedAt) / span) * 100,
      })),
      startLanes: start,
    }
  })
})

// 时间游标位置百分比
const cursorPct = computed(() => {
  const span = Math.max(1, props.maxTime - props.minTime)
  return Math.min(100, Math.max(0, ((props.currentTime - props.minTime) / span) * 100))
})

// profile → 颜色
const PROFILE_COLORS: Record<string, string> = {
  orchestrator: 'var(--accent-primary)',
  'worker-coder': 'var(--success)',
  'worker-researcher': 'var(--accent-info)',
  default: 'var(--text-muted)',
}
function profileColor(p?: string) { return (p && PROFILE_COLORS[p]) || PROFILE_COLORS.default }

const tickMarks = computed(() => {
  const span = Math.max(1, props.maxTime - props.minTime)
  const ticks: { pct: number; label: string }[] = []
  for (let i = 0; i <= 4; i++) {
    const t = props.minTime + (i / 4) * span
    const d = new Date(t)
    const pad = (n: number) => String(n).padStart(2, '0')
    ticks.push({ pct: (i / 4) * 100, label: `${pad(d.getHours())}:${pad(d.getMinutes())}` })
  }
  return ticks
})
</script>

<template>
  <div class="run-trace-timeband" data-run-trace-timeband>
    <div class="run-trace-timeband__header">
      <span class="run-trace-timeband__label">{{ t('cockpit.taskSwimlane') }}</span>
      <div class="run-trace-timeband__ticks">
        <span v-for="tick in tickMarks" :key="tick.pct" class="run-trace-timeband__tick" :style="{ left: `${tick.pct}%` }">{{ tick.label }}</span>
      </div>
    </div>
    <div class="run-trace-timeband__lanes">
      <div v-for="lane in lanes" :key="lane.cluster" class="run-trace-timeband__lane">
        <span class="run-trace-timeband__lane-label" :title="lane.cluster">{{ lane.cluster.slice(0, 12) }}</span>
        <div class="run-trace-timeband__lane-track">
          <button
            v-for="bar in lane.bars"
            :key="bar.id"
            type="button"
            class="run-trace-timeband__bar"
            :class="[`is-${bar.kind}`, `is-${bar.status}`]"
            :style="{ left: `${bar.leftPct}%`, width: `${Math.max(0.8, bar.widthPct)}%`, background: profileColor(bar.profile) }"
            :title="bar.label"
            @click="emit('focus-node', bar.id)"
          ></button>
        </div>
      </div>
      <!-- 时间游标垂直线 -->
      <div class="run-trace-timeband__cursor" :style="{ left: `${cursorPct}%` }"></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.run-trace-timeband { padding: 8px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); max-height: 180px; overflow-y: auto; }
.run-trace-timeband__header { display: grid; grid-template-columns: 92px 1fr; gap: 8px; align-items: center; margin-bottom: 6px; }
.run-trace-timeband__label { font-size: 9px; color: var(--text-muted); letter-spacing: 1px; }
.run-trace-timeband__ticks { position: relative; height: 12px; }
.run-trace-timeband__tick { position: absolute; top: 0; transform: translateX(-50%); font-size: 8px; color: var(--text-muted); white-space: nowrap; }
.run-trace-timeband__lanes { position: relative; }
.run-trace-timeband__lane { display: grid; grid-template-columns: 92px 1fr; gap: 8px; align-items: center; height: 18px; margin-bottom: 3px; }
.run-trace-timeband__lane-label { font-size: 8px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; }
.run-trace-timeband__lane-track { position: relative; height: 10px; background: var(--bg-card); border-radius: 2px; }
.run-trace-timeband__bar { position: absolute; top: 0; bottom: 0; min-width: 3px; border: none; border-radius: 2px; cursor: pointer; padding: 0; opacity: 0.85; }
.run-trace-timeband__bar:hover { opacity: 1; outline: 1px solid var(--text-primary); }
.run-trace-timeband__bar.is-running { animation: trace-bar-pulse 1.5s ease-in-out infinite; }
.run-trace-timeband__bar.is-error { outline: 1px solid var(--error); }
.run-trace-timeband__cursor { position: absolute; top: 0; bottom: 0; width: 1.5px; background: var(--accent-primary); z-index: 2; pointer-events: none; box-shadow: 0 0 4px rgba(107,163,214,0.6); }
@keyframes trace-bar-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
</style>
