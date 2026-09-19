<!-- overlay/custom/client/ia2/components/GanttPanel.vue -->
<!-- M-D 甘特视图：dueAt 时间轴（逾期着色）+ dependsOn 依赖连线 + 无 dueAt 回落列表。
     投影单一事实源 = matrix-teams/gantt.ts（纯函数），本组件只渲染。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { projectGantt, type GanttTask } from '@/custom/matrix-teams/gantt'

const props = defineProps<{
  tasks: readonly GanttTask[]
  now?: number
}>()
const { t } = useI18n()

const projection = computed(() => projectGantt(props.tasks, props.now ?? Date.now()))

const DAY_MS = 86_400_000
// 时间轴窗口：最早到期前 1 天 ~ 最晚到期后 1 天（像素/天定宽）。
const layout = computed(() => {
  const rows = projection.value.rows
  if (rows.length === 0) return null
  const min = Math.min(...rows.map(r => r.dueAt)) - DAY_MS
  const max = Math.max(...rows.map(r => r.dueAt)) + DAY_MS
  const span = Math.max(max - min, DAY_MS)
  return { min, span, rowH: 26, laneW: 640 }
})

function barLeft(dueAt: number): number {
  const l = layout.value
  if (!l) return 0
  return ((dueAt - l.min) / l.span) * l.laneW
}

/** 行号索引（依赖连线端点定位用）。 */
const rowIndex = computed(() => {
  const m = new Map<string, number>()
  projection.value.rows.forEach((r, i) => m.set(r.task.taskId, i))
  return m
})
</script>

<template>
  <div class="gtp" data-testid="gantt-panel">
    <div class="gtp__head">
      <span class="gtp__title">{{ t('ia2.gantt.title') }}</span>
      <span class="gtp__sub">{{ projection.rows.length }} {{ t('ia2.gantt.timed') }} · {{ projection.edges.length }} {{ t('ia2.gantt.deps') }}</span>
    </div>
    <div v-if="layout" class="gtp__chart" data-testid="gantt-chart">
      <div
        v-for="r in projection.rows" :key="r.task.taskId"
        class="gtp__row" :data-testid="`gantt-row-${r.task.taskId}`"
      >
        <div class="gtp__lane">
          <div
            class="gtp__bar" :class="{ 'gtp__bar--over': r.overdue }"
            :data-testid="`gantt-bar-${r.task.taskId}`"
            :style="{ left: `${barLeft(r.dueAt)}px` }"
          />
        </div>
        <span class="gtp__label" :class="{ 'gtp__label--over': r.overdue }">{{ r.task.title }}</span>
      </div>
      <svg
        v-if="projection.edges.length" class="gtp__edges" :data-testid="gantt-edges"
        :width="layout.laneW" :height="projection.rows.length * layout.rowH"
      >
        <line
          v-for="(e, i) in projection.edges" :key="i"
          class="gtp__edge" :class="{ 'gtp__edge--over': true }"
          :data-testid="`gantt-edge-${e.from}-${e.to}`"
          :x1="4" :y1="(rowIndex.get(e.from) ?? 0) * layout.rowH + layout.rowH / 2"
          :x2="layout.laneW - 8" :y2="(rowIndex.get(e.to) ?? 0) * layout.rowH + layout.rowH / 2"
        />
      </svg>
    </div>
    <div v-else class="gtp__empty">{{ t('ia2.gantt.noTimed') }}</div>
    <div v-if="projection.listOnly.length" class="gtp__list">
      <div class="gtp__list-head">{{ t('ia2.gantt.listOnly') }}</div>
      <div v-for="task in projection.listOnly" :key="task.taskId" class="gtp__list-row" :data-testid="`gantt-list-${task.taskId}`">
        {{ task.title }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gtp { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.gtp__head { display: flex; align-items: baseline; gap: 8px; }
.gtp__title { font-weight: 700; color: var(--text-primary); }
.gtp__sub { font-size: 10px; color: var(--text-muted); }
.gtp__chart { position: relative; display: flex; flex-direction: column; }
.gtp__row { display: flex; align-items: center; gap: 8px; height: 26px; }
.gtp__lane { position: relative; width: 640px; height: 100%; border-bottom: 1px dashed var(--border-color); flex: none; }
.gtp__bar { position: absolute; top: 8px; width: 10px; height: 10px; border-radius: 5px; background: var(--primary); }
.gtp__bar--over { background: var(--error, #e05656); }
.gtp__label { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gtp__label--over { color: var(--error, #e05656); font-weight: 700; }
.gtp__edges { position: absolute; left: 0; top: 0; pointer-events: none; }
.gtp__edge { stroke: var(--text-muted); stroke-width: 1; opacity: .55; }
.gtp__empty { color: var(--text-muted); font-size: 11px; }
.gtp__list { border-top: 1px solid var(--border-color); padding-top: 6px; }
.gtp__list-head { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.gtp__list-row { font-size: 11px; color: var(--text-secondary); padding: 2px 0; }
</style>
