<!-- overlay/custom/client/ia2/components/flow/RunCanvas.vue -->
<!-- v12 中栏 · 对象工作区之循环面（2026-09-19 统一视图）：链路条 + 视图条
     （●实时 / 🕘历史·回放 / ▦看板→/app/board）+ LIVE 徽章。
     实时 = 阶段流 + 最新 run 迷你图（RunGraphCanvas，无 run 时阶段卡占位）+
     挂接任务 + 参与方；历史 = 回放条（j/k 步进）+ 事件编年 + 导出归档。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { LoopInstance } from '@/custom/loop/types'
import { runRest } from '@/custom/loop/runcenter/api'
import { useRunReplay } from '@/custom/loop/runcenter/composables/useRunReplay'
import { buildRunGraph, projectEvents, type ReplayEventLike } from '@/custom/loop/runcenter/adapters/run-graph'
import ChainBar from './ChainBar.vue'
import StageFlow from './StageFlow.vue'
import LinkedTaskList from './LinkedTaskList.vue'
import RunGraphCanvas from '@/custom/loop/runcenter/components/RunGraphCanvas.vue'
import type { FlowLoopRow } from '../../adapters/flow'

const props = defineProps<{
  loop: LoopInstance
  loopRow: FlowLoopRow
  linkedTasks: CockpitTask[]
  /** 该循环最新 run（graphId === loop-<id>；无 run 为 null） */
  latestRunId: string | null
  liveConnected: boolean
  participants: Array<{ kind: 'human' | 'agent'; name: string; team?: string; role?: string }>
}>()

const emit = defineEmits<{
  (e: 'open-task', taskId: string): void
  (e: 'open-timeline'): void
  (e: 'open-ide', taskId: string): void
  (e: 'reassign', taskId: string): void
  (e: 'handle-task', taskId: string): void
  (e: 'goto-board'): void
}>()

const { t } = useI18n()
const viewMode = ref<'live' | 'hist'>('live')

// ── 最新 run 图数据（spec + replay → buildRunGraph；无 run 时阶段卡占位）──

const spec = ref<{ nodes: Array<{ id: string; type: string }>; edges: Array<{ from: string; to: string }>; entryNode?: string } | null>(null)
const events = ref<ReplayEventLike[]>([])
const loadingGraph = ref(false)

const graph = computed(() => spec.value ? buildRunGraph(spec.value, events.value) : null)

async function loadGraph(): Promise<void> {
  spec.value = null
  events.value = []
  if (!props.latestRunId) return
  loadingGraph.value = true
  try {
    const [specRes, replay] = await Promise.all([
      runRest.getSpec(`loop-${props.loop.id}`),
      runRest.replay(props.latestRunId),
    ])
    spec.value = (specRes ?? null) as typeof spec.value
    events.value = (replay ?? []) as ReplayEventLike[]
  } catch {
    // 图/回放不可得（引擎未启用等）——保留阶段卡占位，不阻塞画布
  } finally {
    loadingGraph.value = false
  }
}

watch(() => [props.loop.id, props.latestRunId], () => { void loadGraph() }, { immediate: true })

// ── 历史 · 回放（j/k 步进 + 事件编年 + 导出）──

const replay = useRunReplay(events)
// verbose 全量（事件编年=完整史册，summary/normal 会折叠 result/raw 级）
const chronicle = computed(() => projectEvents(replay.visibleEvents.value, 'verbose'))

function onKeydown(e: KeyboardEvent): void {
  if (viewMode.value !== 'hist') return
  if (e.key === 'j') replay.stepForward()
  else if (e.key === 'k') replay.stepBack()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

async function exportArchive(): Promise<void> {
  if (!props.latestRunId) return
  try {
    const pack = await runRest.exportRun(props.latestRunId)
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `run-${props.latestRunId}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // 导出失败静默（连接态在态势条呈现）
  }
}

function fmtEventTs(ts: string | number | undefined): string {
  if (ts == null) return ''
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts))
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="rc" data-testid="run-canvas">
    <ChainBar
      :object-name="`🔁 ${loop.name}`"
      :linked-tasks="linkedTasks"
      :gate-title="loopRow.awaitingYou ? t('ia2.chain.gateReview') : null"
      @open-task="id => emit('open-task', id)"
      @open-timeline="emit('open-timeline')"
      @open-ide="id => emit('open-ide', id)"
    />
    <div class="rc__viewbar">
      <span class="rc__viewbar-label">{{ t('ia2.rc.view') }}</span>
      <button
        type="button" class="rc__chip" :class="{ 'rc__chip--on': viewMode === 'live' }"
        data-testid="rc-view-live" @click="viewMode = 'live'"
      >● {{ t('ia2.rc.live') }}</button>
      <button
        type="button" class="rc__chip" :class="{ 'rc__chip--on': viewMode === 'hist' }"
        data-testid="rc-view-hist" @click="viewMode = 'hist'"
      >🕘 {{ t('ia2.rc.history') }}</button>
      <button
        type="button" class="rc__chip" data-testid="rc-goto-board"
        @click="emit('goto-board')"
      >▦ {{ t('ia2.rc.board') }}</button>
      <span class="rc__spacer" />
      <span
        v-if="viewMode === 'live' && liveConnected"
        class="rc__livebadge" data-testid="rc-live-badge"
      >● {{ t('ia2.rc.liveOn') }}</span>
    </div>

    <!-- 实时：阶段流 + 最新 run 图 + 挂接任务/参与方 -->
    <div v-if="viewMode === 'live'" class="rc__live" data-testid="rc-live">
      <StageFlow
        :stage-index="loopRow.stageIndex"
        :stage-total="loopRow.stageTotal"
        :stage-tone="loopRow.stageTone"
        :iterations="loop.stats?.totalIterations"
      />
      <div class="rc__graph">
        <RunGraphCanvas
          v-if="graph && graph.nodes.length"
          :graph="graph"
          :entry-node="spec?.entryNode"
        />
        <div v-else class="rc__graph-ph" data-testid="rc-graph-empty">
          {{ loadingGraph ? t('ia2.rc.loading') : t('ia2.rc.noRun') }}
        </div>
      </div>
      <div class="rc__cards">
        <div class="rc__card">
          <div class="rc__card-head">{{ t('ia2.rc.linkedTasks') }}</div>
          <LinkedTaskList
            :tasks="linkedTasks"
            @reassign="id => emit('reassign', id)"
            @open-ide="id => emit('open-ide', id)"
            @handle-task="id => emit('handle-task', id)"
          />
        </div>
        <div class="rc__card">
          <div class="rc__card-head">{{ t('ia2.rc.participants') }}</div>
          <div class="rc__parts">
            <span
              v-for="(p, i) in participants" :key="`${p.name}:${i}`"
              class="rc__part" :data-testid="`rc-part-${p.name}`"
            >{{ p.kind === 'human' ? '👤' : '🤖' }} {{ p.name }}<template v-if="p.role"> · {{ p.role }}</template></span>
            <span v-if="!participants.length" class="rc__part--empty">{{ t('ia2.rc.noParts') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 历史：回放条 + 事件编年 + 导出 -->
    <div v-else class="rc__hist" data-testid="rc-hist">
      <div class="rc__rpl" data-testid="rc-replay">
        <button type="button" class="rc__rbtn" :title="t('ia2.rc.stepBack')" @click="replay.stepBack()">◀</button>
        <button type="button" class="rc__rbtn rc__rbtn--play" :title="t('ia2.rc.play')" @click="replay.toggle()">{{ replay.playing.value ? '⏸' : '▶' }}</button>
        <button type="button" class="rc__rbtn" :title="t('ia2.rc.stepForward')" @click="replay.stepForward()">▶|</button>
        <input
          class="rc__seek" type="range" min="0" :max="replay.total.value"
          :value="replay.cursorIndex.value"
          @input="replay.seek(Number(($event.target as HTMLInputElement).value))"
        >
        <span class="rc__rmeta">
          {{ t('ia2.rc.eventCount', { n: replay.cursorIndex.value, total: replay.total.value }) }}
        </span>
      </div>
      <div class="rc__chron" data-testid="rc-chronicle">
        <div v-if="!chronicle.length" class="rc__chron-empty">{{ t('ia2.rc.noEvents') }}</div>
        <div v-for="row in chronicle" :key="row.index" class="rc__chron-row" :data-testid="`rc-chron-${row.index}`">
          <span class="rc__chron-ico">▶</span>
          <span class="rc__chron-txt">
            {{ row.type }}<template v-if="row.nodeId"> · {{ row.nodeId }}</template><template v-if="row.error"> · {{ row.error }}</template>
          </span>
          <span class="rc__chron-ts">{{ fmtEventTs(row.ts) }}</span>
        </div>
      </div>
      <div class="rc__hist-foot">
        <button type="button" class="rc__chip" data-testid="rc-export" :disabled="!latestRunId" @click="exportArchive">
          {{ t('ia2.rc.export') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.rc {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px;
  overflow: hidden; font-size: 12px;
}
.rc__viewbar {
  display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 3px 10px;
  border-bottom: 1px solid var(--border-color); background: var(--bg-card); flex-shrink: 0;
}
.rc__viewbar-label { color: var(--text-muted); font-weight: 700; font-size: 11px; }
.rc__chip {
  height: 22px; padding: 0 9px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &:disabled { opacity: .5; cursor: not-allowed; }
}
.rc__chip--on { border-color: var(--primary); color: var(--primary); font-weight: 600; }
.rc__spacer { flex: 1; }
.rc__livebadge {
  height: 20px; padding: 0 8px; border: 1px solid var(--success); border-radius: 10px;
  color: var(--success); font-size: 10px; font-weight: 700;
  display: inline-flex; align-items: center; white-space: nowrap;
}
.rc__live, .rc__hist { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 10px; gap: 10px; overflow-y: auto; }
.rc__graph {
  flex: 1; min-height: 140px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-card); overflow: hidden;
}
.rc__graph-ph {
  height: 100%; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 11px;
}
.rc__cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex-shrink: 0; }
.rc__card {
  border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card);
  padding: 8px 10px; min-width: 0;
}
.rc__card-head { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin-bottom: 4px; }
.rc__parts { display: flex; flex-direction: column; gap: 3px; }
.rc__part { font-size: 11px; color: var(--text-secondary); }
.rc__part--empty { color: var(--text-muted); font-size: 11px; }
.rc__rpl { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.rc__rbtn {
  width: 26px; height: 24px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 11px;
  &:hover { color: var(--text-primary); }
}
.rc__rbtn--play { color: var(--primary); border-color: var(--primary); }
.rc__seek { flex: 1; min-width: 0; }
.rc__rmeta { font-size: 10px; color: var(--text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.rc__chron { flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); padding: 6px 8px; }
.rc__chron-empty { color: var(--text-muted); font-size: 11px; padding: 6px; }
.rc__chron-row { display: flex; align-items: baseline; gap: 6px; padding: 3px 2px; font-size: 11px; color: var(--text-secondary); }
.rc__chron-ico { color: var(--info); font-size: 10px; }
.rc__chron-txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc__chron-ts { flex-shrink: 0; font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.rc__hist-foot { display: flex; justify-content: flex-end; flex-shrink: 0; }
</style>
