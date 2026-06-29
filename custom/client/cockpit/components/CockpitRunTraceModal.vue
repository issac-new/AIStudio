<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCockpitStore } from '../store/cockpit'
import { useRunTrace } from '../composables/useRunTrace'
import { useChatStore } from '@/stores/hermes/chat'
import { fetchHermesSessions, type SessionSummary } from '@/api/hermes/sessions'
import RunTraceGraph from './RunTraceGraph.vue'
import RunTraceTimeBand from './RunTraceTimeBand.vue'
import RunTraceInspector from './RunTraceInspector.vue'
import RunTraceSkillDrilldown from './RunTraceSkillDrilldown.vue'
import RunTraceScrubber from './RunTraceScrubber.vue'

const store = useCockpitStore()
const chatStore = useChatStore()
const sessionId = computed(() => store.runTraceSessionId)
const trace = useRunTrace(sessionId)
const focusedId = ref<string | null>(null)
const drilldownSkillId = ref<string | null>(null)
const focusedNode = computed(() => trace.nodes.value.find(n => n.id === (focusedId.value || trace.focusedNodeId.value)) ?? null)
const drilldownSkill = computed(() => trace.nodes.value.find(n => n.id === drilldownSkillId.value && n.kind === 'skill') ?? null)

// 是否处于"无会话选择"状态（sessionId 为空）
const needsSessionSelect = computed(() => !sessionId.value)

// hermes-agent 原生会话列表（从 state.db 获取，包含完整历史）
const hermesSessions = ref<SessionSummary[]>([])
const loadingSessions = ref(false)

// 会话列表：优先用 hermes-agent 原生会话（更完整），fallback 到 chatStore
const sessionList = computed(() => {
  if (hermesSessions.value.length > 0) {
    return hermesSessions.value
      .sort((a, b) => (b.last_active ?? b.started_at) - (a.last_active ?? a.started_at))
      .slice(0, 50)
      .map(s => ({
        id: s.id,
        title: s.title || '(未命名会话)',
        model: s.model || '',
        isRunning: s.ended_at == null,
        updatedAt: s.last_active ?? s.started_at,
        messageCount: s.message_count,
      }))
  }
  // Fallback: chatStore.sessions（Studio 导入的会话）
  return [...chatStore.sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 50)
    .map(s => ({
      id: s.id,
      title: s.title || '(未命名会话)',
      model: s.model || '',
      isRunning: s.endedAt === null,
      updatedAt: s.updatedAt,
      messageCount: s.messageCount ?? 0,
    }))
})

// 当进入会话选择模式时，加载 hermes-agent 原生会话
watch(needsSessionSelect, async (need) => {
  if (need) {
    loadingSessions.value = true
    try {
      hermesSessions.value = await fetchHermesSessions()
    } catch {
      hermesSessions.value = []
    } finally {
      loadingSessions.value = false
    }
  }
}, { immediate: true })

function selectSession(sid: string) {
  store.openRunTrace({ sessionId: sid })
}

// Time range for scrubber
const minTime = computed(() => trace.sessionStartedAt.value || Date.now() - 3600000)
const maxTime = computed(() => Date.now())

function focusNode(id: string) {
  focusedId.value = id
  const node = trace.nodes.value.find(n => n.id === id)
  if (node?.kind === 'skill') drilldownSkillId.value = id
}

function fmtTime(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts  // 兼容秒级/毫秒级时间戳
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Export trace as JSON dossier for offline analysis / audit */
function exportDossier() {
  const sid = sessionId.value
  if (!sid) return

  const dossier = {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    session_id: sid,
    run_id: store.runTraceRunId,
    task_id: store.runTraceTaskId,
    evidence_tier: trace.l2Available.value ? 'L2' : 'L1',
    mode: trace.mode.value,
    nodes: trace.nodes.value,
    edges: trace.edges.value,
    focused_node_id: focusedNode.value?.id || null,
    active_skill: drilldownSkill.value ? {
      id: drilldownSkill.value.id,
      label: drilldownSkill.value.label,
      children: drilldownSkill.value.children,
    } : null,
  }

  const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trace-dossier-${sid}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
<template>
  <div
    v-if="store.runTraceOpen"
    class="run-trace-modal"
    data-run-trace-modal
    role="dialog"
    aria-modal="true"
    aria-label="Run Observatory"
    tabindex="-1"
    @keydown.esc="store.closeRunTrace"
  >
    <!-- 会话选择器（无 sessionId 时显示） -->
    <div v-if="needsSessionSelect" class="run-trace-session-picker">
      <div class="run-trace-session-picker__head">
        <span>选择会话观察</span>
        <button type="button" @click="store.closeRunTrace">×</button>
      </div>
      <div class="run-trace-session-picker__list">
        <div v-if="loadingSessions" class="run-trace-session-picker__empty">
          加载会话列表…
        </div>
        <div v-else-if="sessionList.length === 0" class="run-trace-session-picker__empty">
          暂无会话记录。请先通过聊天发起一个任务。
        </div>
        <button
          v-for="s in sessionList"
          :key="s.id"
          type="button"
          class="run-trace-session-picker__item"
          :class="{ 'is-running': s.isRunning }"
          @click="selectSession(s.id)"
        >
          <span class="run-trace-session-picker__dot" :class="{ 'is-live': s.isRunning }"></span>
          <span class="run-trace-session-picker__title">{{ s.title }}</span>
          <span class="run-trace-session-picker__meta">{{ s.model }} · {{ s.messageCount }}条 · {{ fmtTime(s.updatedAt) }}</span>
          <span v-if="s.isRunning" class="run-trace-session-picker__badge">运行中</span>
        </button>
      </div>
    </div>

    <!-- 正常 trace 视图（有 sessionId 时显示） -->
    <template v-else>
      <header class="run-trace-modal__top">
        <button type="button" class="run-trace-modal__back" @click="store.openRunTrace({ sessionId: '' })" title="返回会话列表">‹</button>
        <span class="run-trace-modal__dot" :class="trace.mode.value === 'live' ? 'is-live' : ''"></span>
        <div><b>Run Observatory</b><small>{{ sessionId }}</small></div>
        <span v-if="trace.l2Available.value" class="run-trace-modal__l2badge" title="Layer 2 data available">L2</span>
        <button type="button" data-action="export" class="run-trace-modal__export" @click="exportDossier" title="导出证据档案">📥</button>
        <button type="button" data-action="close" @click="store.closeRunTrace">×</button>
      </header>
      <RunTraceScrubber
        :min-time="minTime"
        :max-time="maxTime"
        :current-time="trace.scrubberTime.value"
        :mode="trace.mode.value"
        :replay-progress="trace.replayProgress.value"
        @scrub="trace.scrubTo"
        @switch-live="trace.switchToLive"
        @start-replay="trace.switchToReplay"
      />
      <RunTraceTimeBand :nodes="trace.nodes.value" />
      <main class="run-trace-modal__main">
        <RunTraceSkillDrilldown v-if="drilldownSkill" :skill="drilldownSkill" @back="drilldownSkillId = null" />
        <RunTraceGraph v-else :nodes="trace.nodes.value" :edges="trace.edges.value" :focused-node-id="focusedNode?.id || null" @focus-node="focusNode" />
        <RunTraceInspector :node="focusedNode" />
      </main>
    </template>
  </div>
</template>
<style scoped lang="scss">
/* 内联定位：与协作看板一致，从注意力条下方(top:84px)展开 */
.run-trace-modal { position: fixed; top: 84px; right: 0; bottom: 0; left: 0; z-index: 100; display: grid; grid-template-rows: auto 1fr; background: var(--bg-primary); color: var(--text-primary); border-top: 1px solid var(--border-color); box-shadow: 0 -4px 16px rgba(0,0,0,0.08); }

/* ── 会话选择器 ── */
.run-trace-session-picker { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.run-trace-session-picker__head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--border-color); font-size: 13px; font-weight: 700; color: var(--text-secondary); }
.run-trace-session-picker__head button { width: 28px; height: 28px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); border-radius: 6px; cursor: pointer; }
.run-trace-session-picker__list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.run-trace-session-picker__empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 48px 16px; }
.run-trace-session-picker__item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); cursor: pointer; font-family: inherit; text-align: left; transition: background 0.12s;
  &:hover { background: var(--bg-secondary); border-color: var(--text-muted); }
  &.is-running { border-color: var(--success); }
}
.run-trace-session-picker__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0;
  &.is-live { background: var(--success); animation: run-trace-live-pulse 1.5s ease-in-out infinite; }
}
.run-trace-session-picker__title { flex: 1; min-width: 0; font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-trace-session-picker__meta { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.run-trace-session-picker__badge { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: var(--success); color: #fff; flex-shrink: 0; }

/* ── 正常 trace 视图 ── */
.run-trace-modal__top { display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); }
.run-trace-modal__back { width: 28px; height: 28px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 1; flex-shrink: 0;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}
.run-trace-modal__top b { display: block; font-size: 13px; }
.run-trace-modal__top small { display: block; font-size: 11px; color: var(--text-muted); }
.run-trace-modal__top button { margin-left: auto; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; }
.run-trace-modal__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning);
  &.is-live { background: var(--success); animation: run-trace-live-pulse 1.5s ease-in-out infinite; }
}
.run-trace-modal__l2badge { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: var(--accent-info); color: var(--text-on-accent); font-weight: 600; }
.run-trace-modal__export { margin-left: 8px !important; font-size: 14px; }
.run-trace-modal__main { min-height: 0; display: grid; grid-template-columns: 1fr 320px; }
@keyframes run-trace-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
