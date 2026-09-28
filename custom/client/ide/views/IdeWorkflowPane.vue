<script setup lang="ts">
// IdeWorkflowPane — 工作流面板（workflow 集成轮；侧栏 workflow 页签）。
// 两段式：
//   ① 会话运行行（数据源=投影 store workflowSessions——sessions-index conflated
//      推送，实时；点行展开该 run 的事件流，走 REST /workflow/run-events 分页拉取）；
//   ② 已保存工作流（REST /workflow/saved：项目档/全局档；选中加载该工作流的
//      历史 runs /workflow/saved-runs）。
// 引擎离线：REST 503 reason=engine_unreachable，面板显示引擎离线占位（不炸）。
import { computed, ref, watch } from 'vue'
import { useIdeStore } from '../store/ide'
import { useZcodeProjection } from '../../zcode/store/zcode-projection'
import IdeWorkflowRunLines from '../components/IdeWorkflowRunLines.vue'
import {
  fetchWorkflowRunEvents,
  fetchSavedWorkflows,
  fetchSavedWorkflowRuns,
  type WorkflowRunEventRecord,
  type SavedWorkflowRecord,
  type WorkflowRunRecord,
} from '../api/workflows'

const ide = useIdeStore()
const zcode = useZcodeProjection()

// ── ① 会话运行行 ──
const workflowSessions = zcode.workflowSessions
const sessionEntries = computed(() =>
  Object.entries(workflowSessions.value).map(([sessionId, activity]) => ({
    sessionId,
    title: zcode.state.sessions[sessionId]?.title ?? sessionId,
    activity,
  })),
)

const expandedRun = ref<{ sessionId: string; runId: string } | null>(null)
const runEvents = ref<WorkflowRunEventRecord[]>([])
const eventsLoading = ref(false)
const eventsError = ref<string | null>(null)
const lastSequence = ref<number | undefined>(undefined)

async function openRun(sessionId: string, runId: string): Promise<void> {
  if (expandedRun.value?.runId === runId) {
    expandedRun.value = null
    return
  }
  expandedRun.value = { sessionId, runId }
  runEvents.value = []
  lastSequence.value = undefined
  await loadEvents()
}

async function loadEvents(): Promise<void> {
  const target = expandedRun.value
  const ws = ide.workspace
  if (!target || !ws) return
  eventsLoading.value = true
  eventsError.value = null
  try {
    const batch = await fetchWorkflowRunEvents(ws, target.sessionId, target.runId, lastSequence.value)
    runEvents.value = [...runEvents.value, ...batch]
    const seqs = batch.map((e) => Number(e.sequence)).filter((n) => Number.isFinite(n))
    if (seqs.length) lastSequence.value = Math.max(...seqs)
  } catch (err) {
    eventsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    eventsLoading.value = false
  }
}

function eventText(e: WorkflowRunEventRecord): string {
  const type = String(e.type ?? e.eventType ?? 'event')
  const at = e.at ? new Date(Number(e.at)).toLocaleTimeString() : ''
  const detail = e.phaseName ?? e.nodeId ?? e.message ?? ''
  return `${at} ${type}${detail ? ' · ' + detail : ''}`.trim()
}

watch(() => ide.workspace, () => {
  expandedRun.value = null
  runEvents.value = []
  savedScope.value = 'project'
  savedList.value = []
  savedRuns.value = []
})

// ── ② 已保存工作流 ──
const savedScope = ref<'project' | 'global'>('project')
const savedList = ref<SavedWorkflowRecord[]>([])
const savedRuns = ref<WorkflowRunRecord[]>([])
const savedLoading = ref(false)
const savedError = ref<string | null>(null)
const selectedSaved = ref<string | null>(null)

async function loadSaved(): Promise<void> {
  const ws = ide.workspace
  if (!ws) return
  savedLoading.value = true
  savedError.value = null
  try {
    savedList.value = await fetchSavedWorkflows(ws, savedScope.value)
    savedRuns.value = []
    selectedSaved.value = null
  } catch (err) {
    savedError.value = err instanceof Error ? err.message : String(err)
  } finally {
    savedLoading.value = false
  }
}

async function loadSavedRuns(name: string): Promise<void> {
  const ws = ide.workspace
  if (!ws) return
  selectedSaved.value = name
  savedLoading.value = true
  try {
    savedRuns.value = await fetchSavedWorkflowRuns(ws, name, 20, savedScope.value)
  } catch (err) {
    savedError.value = err instanceof Error ? err.message : String(err)
  } finally {
    savedLoading.value = false
  }
}

watch([() => ide.workspace, savedScope], () => { void loadSaved() }, { immediate: true })

const STATUS_TEXT: Record<string, string> = {
  pending: '排队中', running: '运行中', completed: '已完成', errored: '失败', stopped: '已停止',
}
function statusText(s?: string): string {
  return (s && STATUS_TEXT[s]) || s || '—'
}
</script>

<template>
  <div class="ide-wf-pane" data-testid="ide-workflow-pane">
    <section class="ide-wf-section">
      <h4 class="ide-wf-title">会话运行</h4>
      <p v-if="!sessionEntries.length" class="ide-wf-empty" data-testid="ide-workflow-empty">
        当前工作区没有正在跑的工作流运行。会话里 agent 调用工作流工具（或 @zcode 派单触发）后，运行行实时出现在这里。
      </p>
      <div v-for="entry in sessionEntries" :key="entry.sessionId" class="ide-wf-session">
        <p class="ide-wf-session-title" :title="entry.sessionId">{{ entry.title }}</p>
        <IdeWorkflowRunLines
          :activity="entry.activity"
          :session-id="entry.sessionId"
          @open-run="(run) => openRun(entry.sessionId, run.runId)"
        />
        <div
          v-if="expandedRun?.sessionId === entry.sessionId"
          class="ide-wf-events" :data-testid="`ide-workflow-events-${expandedRun.runId}`"
        >
          <p v-if="eventsError" class="ide-wf-error">{{ eventsError }}</p>
          <p v-if="!eventsLoading && !runEvents.length && !eventsError" class="ide-wf-empty">无事件（run 可能早于 journal 窗口）。</p>
          <ul class="ide-wf-event-list">
            <li v-for="(e, i) in runEvents" :key="i">{{ eventText(e) }}</li>
          </ul>
          <button
            v-if="runEvents.length && runEvents.length % 100 === 0"
            class="ide-wf-more-btn" data-testid="wf-events-more"
            :disabled="eventsLoading" @click="loadEvents"
          >{{ eventsLoading ? '加载中…' : '加载更多' }}</button>
        </div>
      </div>
    </section>

    <section class="ide-wf-section">
      <h4 class="ide-wf-title">
        已保存工作流
        <span class="ide-wf-scope">
          <button :class="{ on: savedScope === 'project' }" @click="savedScope = 'project'">项目</button>
          <button :class="{ on: savedScope === 'global' }" @click="savedScope = 'global'">全局</button>
        </span>
      </h4>
      <p v-if="savedError" class="ide-wf-error" data-testid="ide-workflow-saved-error">{{ savedError }}</p>
      <p v-if="savedLoading && !savedList.length" class="ide-wf-empty">加载中…</p>
      <p v-if="!savedLoading && !savedList.length && !savedError" class="ide-wf-empty" data-testid="ide-workflow-saved-empty">
        此档位没有已保存的工作流（agent 会话里用「保存工作流」或 SaveWorkflow 工具产生）。
      </p>
      <ul class="ide-wf-saved-list">
        <li v-for="wf in savedList" :key="wf.name">
          <button
            class="ide-wf-saved-item" :class="{ on: selectedSaved === wf.name }"
            :data-testid="`ide-workflow-saved-${wf.name}`"
            @click="loadSavedRuns(wf.name)"
          >
            <span class="ide-wf-saved-name">{{ wf.name }}</span>
            <span v-if="wf.description" class="ide-wf-saved-desc">{{ wf.description }}</span>
          </button>
        </li>
      </ul>
      <div v-if="selectedSaved" class="ide-wf-saved-runs">
        <p class="ide-wf-session-title">{{ selectedSaved }} · 最近运行</p>
        <p v-if="!savedRuns.length" class="ide-wf-empty">暂无运行记录。</p>
        <ul class="ide-wf-run-list">
          <li v-for="r in savedRuns" :key="String(r.runId)" class="ide-wf-run-row">
            <span class="ide-wf-dot" :class="`is-${r.status}`" />
            <span class="ide-wf-run-id">{{ String(r.runId).slice(0, 18) }}</span>
            <span class="ide-wf-run-status">{{ statusText(r.status) }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ide-wf-pane { height: 100%; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 14px; }
.ide-wf-section { display: flex; flex-direction: column; gap: 6px; }
.ide-wf-title {
  font-size: 12px; font-weight: 600; color: var(--text-color-1, #333); margin: 0;
  display: flex; align-items: center; justify-content: space-between;
}
.ide-wf-scope { display: inline-flex; gap: 2px; }
.ide-wf-scope button {
  border: none; background: transparent; font-size: 11px; padding: 1px 8px; cursor: pointer;
  color: var(--text-color-3, #999); border-radius: 8px;
  &.on { background: var(--hover-color, rgba(0,0,0,0.08)); color: var(--text-color-1, #333); }
}
.ide-wf-empty { font-size: 11px; color: var(--text-color-3, #999); margin: 4px 0; line-height: 1.5; }
.ide-wf-error { font-size: 11px; color: var(--error-color, #d03050); margin: 4px 0; word-break: break-all; }
.ide-wf-session { display: flex; flex-direction: column; gap: 2px; }
.ide-wf-session-title { font-size: 11px; color: var(--text-color-2, #666); margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-wf-events { border-left: 2px solid var(--border-color, #e0e0e0); padding: 4px 8px; margin: 2px 0 4px 8px; }
.ide-wf-event-list { margin: 0; padding: 0; list-style: none; font-size: 10px; color: var(--text-color-2, #666);
  li { font-family: var(--font-family-mono, monospace); line-height: 1.6; } }
.ide-wf-more-btn { border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px; font-size: 11px; padding: 2px 10px; cursor: pointer; color: var(--text-color-2, #666); }
.ide-wf-saved-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.ide-wf-saved-item {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%;
  border: none; background: transparent; text-align: left; padding: 4px 8px; border-radius: 6px; cursor: pointer;
  &:hover { background: var(--hover-color, rgba(0,0,0,0.05)); }
  &.on { background: var(--hover-color, rgba(0,0,0,0.08)); }
}
.ide-wf-saved-name { font-size: 12px; color: var(--text-color-1, #333); }
.ide-wf-saved-desc { font-size: 10px; color: var(--text-color-3, #999); }
.ide-wf-saved-runs { margin-top: 4px; display: flex; flex-direction: column; gap: 2px; }
.ide-wf-run-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.ide-wf-run-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-color-2, #666); }
.ide-wf-run-id { font-family: var(--font-family-mono, monospace); }
.ide-wf-run-status { margin-left: auto; font-size: 10px; color: var(--text-color-3, #999); }
.ide-wf-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--text-color-3, #999);
  &.is-running { background: var(--info-color, #2080f0); }
  &.is-completed { background: var(--success-color, #18a058); }
  &.is-errored { background: var(--error-color, #d03050); }
  &.is-pending { background: var(--warning-color, #f0a020); } }
</style>
