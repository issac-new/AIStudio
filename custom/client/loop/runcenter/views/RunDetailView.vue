<!-- overlay/custom/client/loop/runcenter/views/RunDetailView.vue -->
<!-- RunDetailView — 运行详情页（task-6，路由 /hermes/loop/runs/:runId）。
     左图右流：执行图画布（vue-flow 只读，B7 检查器经 select-node 预留口消费选中）
     + 时间轴回放（useRunReplay 游标 = 重放至第 N 事件，图与事件流共用前缀投影）。
     数据：GET /api/graph/runs/:id（instance.graphDefId → 图规格）+
     GET /api/graph/runs/:id/replay（P2 规模内一次拉全量）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import RunStageBadge from '@/custom/loop/runcenter/components/RunStageBadge.vue'
import RunGraphCanvas from '@/custom/loop/runcenter/components/RunGraphCanvas.vue'
import RunTimeline from '@/custom/loop/runcenter/components/RunTimeline.vue'
import { useRunReplay } from '@/custom/loop/runcenter/composables/useRunReplay'
import { buildRunGraph, projectEvents } from '@/custom/loop/runcenter/adapters/run-graph'
import type { RunGraphData, RunGraphTopologyLike, ReplayEventLike, TimelineMode } from '@/custom/loop/runcenter/adapters/run-graph'
import { runRest } from '@/custom/loop/runcenter/api'
import type { RunStatus } from '@/custom/loop/runcenter/types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const runId = computed(() => String(route.params.runId ?? ''))

// ── 数据 ──
const loading = ref(true)
const error = ref<string | null>(null)
const status = ref<RunStatus>('unknown')
const spec = ref<RunGraphTopologyLike | null>(null)
const specMissing = ref(false)
const events = ref<ReplayEventLike[]>([])

// ── 回放（游标持有者；图与时间轴共用 visibleEvents 前缀）──
const {
  cursorIndex, total, playing, speed, visibleEvents, seek, toggle, setSpeed,
} = useRunReplay(events)
const mode = ref<TimelineMode>('normal')
const selectedNodeId = ref<string | null>(null)

/** 空图（spec 缺失/未载入时的画布占位） */
const EMPTY_GRAPH: RunGraphData = { nodes: [], edges: [] }

const graph = computed<RunGraphData>(() =>
  spec.value ? buildRunGraph(spec.value, visibleEvents.value) : EMPTY_GRAPH,
)
const rows = computed(() => projectEvents(visibleEvents.value, mode.value))

async function load(): Promise<void> {
  const id = runId.value
  if (!id) return
  loading.value = true
  error.value = null
  specMissing.value = false
  selectedNodeId.value = null
  try {
    // 详情（状态 + graphDefId）与回放事件并行拉取
    const [detail, replayEvents] = await Promise.all([
      runRest.getRun(id),
      runRest.replay(id),
    ])
    events.value = replayEvents
    // 初始游标落全量：打开详情先看当前状态，回放是显式动作
    seek(replayEvents.length)
    status.value = ((detail.instance as { status?: RunStatus }).status) ?? 'unknown'
    const specId = ((detail.instance as { graphDefId?: string }).graphDefId) || detail.graphId
    spec.value = await runRest.getSpec(specId)
    if (!spec.value) specMissing.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(runId, () => { void load() })

function goBack(): void {
  router.push({ name: 'hermes.loopRuns' })
}

function onSelectNode(id: string): void {
  selectedNodeId.value = id
}
</script>

<template>
  <div class="rd-view" data-run-detail-view>
    <!-- 头部：返回 + run 标识 + 状态 -->
    <div class="rd-view__header">
      <button class="rd-view__back" :title="t('runcenter.detail.back')" @click="goBack">
        <CockpitIcon name="back" :size="13" />
        <span>{{ t('runcenter.detail.back') }}</span>
      </button>
      <h2 class="rd-view__title">{{ runId }}</h2>
      <RunStageBadge :status="status" />
      <span v-if="!loading && total > 0" class="rd-view__count">
        {{ t('runcenter.replay.count', { n: total }) }}
      </span>
    </div>

    <div v-if="error" class="rd-view__error">
      <span>{{ t('runcenter.detail.loadFailed') }}</span>
      <code>{{ error }}</code>
    </div>

    <!-- 左图右流（窄屏纵叠） -->
    <div class="rd-view__main">
      <div class="rd-view__graph">
        <div v-if="specMissing" class="rd-view__nospec">{{ t('runcenter.detail.noSpec') }}</div>
        <RunGraphCanvas
          v-else
          :graph="graph"
          :entry-node="spec?.entryNode"
          :selected-node-id="selectedNodeId"
          @select-node="onSelectNode"
        />
      </div>

      <div class="rd-view__timeline">
        <RunTimeline
          :rows="rows"
          :cursor-index="cursorIndex"
          :total="total"
          :playing="playing"
          :speed="speed"
          :mode="mode"
          :loading="loading"
          @seek="seek"
          @toggle-play="toggle"
          @set-speed="setSpeed"
          @set-mode="(m: TimelineMode) => (mode = m)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.rd-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 12px;
  overflow: auto;
}

.rd-view__header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.rd-view__back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.rd-view__title {
  margin: 0;
  font-size: 15px;
  font-family: var(--font-mono, ui-monospace, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rd-view__count {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}

.rd-view__error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid var(--color-danger, #e11d48);
  border-radius: var(--radius-micro, 3px);
  color: var(--color-danger, #e11d48);
  font-size: 12px;
}
.rd-view__error code {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  word-break: break-all;
}

.rd-view__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 440px;
  gap: 12px;
  flex: 1;
  min-height: 480px;
}
/* 窄屏纵叠 */
@media (max-width: 960px) {
  .rd-view__main { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .rd-view__graph { min-height: 320px; }
}

.rd-view__graph { position: relative; min-height: 0; }
.rd-view__nospec {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-standard, 6px);
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-size: 12px;
}

.rd-view__timeline { min-height: 0; }
</style>
