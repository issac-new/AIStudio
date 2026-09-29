<script setup lang="ts">
// IdeWorkflowRunLines — 会话工作流运行行（workflow 集成轮；zcode 侧栏
// TaskWorkflowRunLines 的 Vue 移植）。数据源=投影 store 的 workflowActivity
// 摘要（sessions-index conflated 推送），模型=utils/workflow-run-line.ts。
// 每行 = 状态点 + 展示名 + 迷你轨道（站点灯 + 并行双线段 + +n 尾）+
// agentsWorking/耗时；点击行 emit open-run（打开工作流面板定位该 run）。
// 终态行按「已确认集合」折叠：用户点 × 确认后本组件不再画该行（无时钟）。
import { computed, ref } from 'vue'
import type { ZcodeWorkflowActivity } from '../../zcode/store/zcode-projection'
import { buildRunLineViews, type RunLineView } from '../utils/workflow-run-line'

const props = defineProps<{
  activity: ZcodeWorkflowActivity | undefined
  /** 会话标识（tooltip 与事件用）。 */
  sessionId?: string
}>()

const emit = defineEmits<{
  (e: 'open-run', run: RunLineView): void
}>()

/** 已确认的终态 runId 集（渲染端状态；跨快照持久到组件生命周期）。 */
const confirmed = ref(new Set<string>())

const view = computed(() => buildRunLineViews(props.activity, { confirmedRunIds: confirmed.value }))

const STATUS_TEXT: Record<string, string> = {
  pending: '排队中', running: '运行中', completed: '已完成', errored: '失败', stopped: '已停止',
}

function statusClass(s: string): string {
  return `is-${s}`
}

function elapsed(startedAt?: number): string {
  if (!startedAt) return ''
  const ms = Date.now() - startedAt
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function confirmRun(run: RunLineView): void {
  confirmed.value = new Set(confirmed.value).add(run.runId)
}

function onRow(run: RunLineView): void {
  emit('open-run', run)
}
</script>

<template>
  <div v-if="view.lines.length" class="ide-wf-lines" data-testid="ide-workflow-run-lines">
    <div
      v-for="run in view.lines"
      :key="run.runId"
      class="ide-wf-line"
      :class="[statusClass(run.status), { 'is-settled': run.settled }]"
      :data-testid="`ide-workflow-run-${run.runId}`"
      role="button"
      tabindex="0"
      :title="`${run.label} · ${STATUS_TEXT[run.status] ?? run.status}${run.currentPhase ? ' · ' + run.currentPhase : ''}`"
      @click="onRow(run)"
      @keydown.enter="onRow(run)"
    >
      <span class="ide-wf-dot" />
      <span class="ide-wf-label">{{ run.label }}</span>
      <span v-if="run.rail.implicit" class="ide-wf-rail is-implicit">
        <span class="ide-wf-station is-running" title="Workflow">◆</span>
      </span>
      <span v-else class="ide-wf-rail">
        <template v-for="(st, i) in run.rail.stations" :key="`${run.runId}-${i}`">
          <span v-if="i > 0" class="ide-wf-seg" :class="{ 'is-twin': st.twin, 'is-reached': st.reached }" />
          <span class="ide-wf-station" :class="`is-${st.status}`" :title="st.name">{{ st.status === 'done' ? '●' : st.status === 'failed' ? '✕' : st.status === 'running' ? '◐' : '○' }}</span>
        </template>
        <span v-if="run.rail.hidden > 0" class="ide-wf-more">+{{ run.rail.hidden }}</span>
      </span>
      <span v-if="run.live && run.agentsWorking > 0" class="ide-wf-agents">{{ run.agentsWorking }} agents</span>
      <span v-if="run.startedAt" class="ide-wf-elapsed">{{ elapsed(run.startedAt) }}</span>
      <button
        v-if="!run.live"
        class="ide-wf-confirm"
        title="确认并收起"
        data-testid="wf-confirm"
        @click.stop="confirmRun(run)"
      >×</button>
    </div>
    <div v-if="view.hiddenRuns > 0" class="ide-wf-extra">+{{ view.hiddenRuns }} runs</div>
  </div>
</template>

<style scoped lang="scss">
.ide-wf-lines { display: flex; flex-direction: column; gap: 3px; }
.ide-wf-line {
  display: flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px;
  font-size: 12px; color: var(--text-color-2, #555); cursor: pointer;
  &:hover { background: var(--hover-color, rgba(0, 0, 0, 0.05)); }
}
.ide-wf-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--text-color-3, #999);
}
.ide-wf-line.is-running .ide-wf-dot { background: var(--info-color, #2080f0); animation: ide-wf-pulse 1.6s ease-in-out infinite; }
.ide-wf-line.is-pending .ide-wf-dot { background: var(--warning-color, #f0a020); }
.ide-wf-line.is-completed .ide-wf-dot { background: var(--success-color, #18a058); }
.ide-wf-line.is-errored .ide-wf-dot { background: var(--error-color, #d03050); }
.ide-wf-line.is-stopped .ide-wf-dot { background: var(--text-color-3, #999); }
.ide-wf-line.is-settled { opacity: 0.7; }

.ide-wf-label { max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-wf-rail { display: inline-flex; align-items: center; gap: 0; }
.ide-wf-rail.is-implicit { color: var(--info-color, #2080f0); }
.ide-wf-station { font-size: 9px; line-height: 1; }
.ide-wf-station.is-done { color: var(--success-color, #18a058); }
.ide-wf-station.is-failed { color: var(--error-color, #d03050); }
.ide-wf-station.is-running { color: var(--info-color, #2080f0); }
.ide-wf-station.is-pending { color: var(--text-color-3, #bbb); }
.ide-wf-seg {
  width: 8px; height: 1px; background: var(--text-color-3, #ccc); display: inline-block; margin: 0 1px;
  &.is-reached { background: var(--success-color, #18a058); }
  &.is-twin { height: 3px; border-top: 1px solid currentColor; border-bottom: 1px solid currentColor; background: transparent; }
}
.ide-wf-more { font-size: 10px; color: var(--text-color-3, #999); margin-left: 2px; }
.ide-wf-agents { font-size: 10px; color: var(--info-color, #2080f0); white-space: nowrap; }
.ide-wf-elapsed { font-size: 10px; color: var(--text-color-3, #999); white-space: nowrap; }
.ide-wf-confirm {
  border: none; background: transparent; color: var(--text-color-3, #999); cursor: pointer;
  font-size: 12px; line-height: 1; padding: 0 2px; &:hover { color: var(--text-color-1, #333); }
}
.ide-wf-extra { font-size: 10px; color: var(--text-color-3, #999); padding-left: 16px; }

@keyframes ide-wf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
</style>
