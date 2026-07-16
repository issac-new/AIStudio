<script setup lang="ts">
import { computed, ref, watch, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '../store/cockpit'
import { useRunTrace, extractKanbanTaskId } from '../composables/useRunTrace'
import { useChatStore } from '@/stores/hermes/chat'
import { useProfilesStore } from '@/stores/hermes/profiles'
import { fetchHermesSessions, type SessionSummary } from '@/api/hermes/sessions'
import RunTraceGraph from './RunTraceGraph.vue'
import RunTraceTimeBand from './RunTraceTimeBand.vue'
import RunTraceInspector from './RunTraceInspector.vue'
import RunTraceSkillDrilldown from './RunTraceSkillDrilldown.vue'
import RunTraceScrubber from './RunTraceScrubber.vue'
import RunTraceOverview from './RunTraceOverview.vue'

const store = useCockpitStore()
const { t } = useI18n()
const chatStore = useChatStore()
const profilesStore = useProfilesStore()
const sessionId = computed(() => store.runTraceSessionId)
const trace = useRunTrace(sessionId)
const focusedId = ref<string | null>(null)
const drilldownSkillId = ref<string | null>(null)
const focusedNode = computed(() => trace.nodes.value.find(n => n.id === (focusedId.value || trace.focusedNodeId.value)) ?? null)
const drilldownSkill = computed(() => trace.nodes.value.find(n => n.id === drilldownSkillId.value && n.kind === 'skill') ?? null)

// 是否处于"无会话选择"状态（sessionId 为空）
const needsSessionSelect = computed(() => !sessionId.value)

// 跨所有 profile 的会话列表（合并 orchestrator + worker-coder + worker-researcher 等）
const allSessions = ref<Array<SessionSummary & { profile?: string }>>([])
const loadingSessions = ref(false)
const searchQuery = ref('')

// 将 allSessions 注入 trace composable，供关联会话发现使用
trace.setAllSessionsRef(allSessions)
const filterProfile = ref('')  // '' = 全部

// 所有出现的 profile 名称（用于筛选下拉）
const availableProfiles = computed(() => {
  const set = new Set<string>()
  for (const s of allSessions.value) {
    if (s.profile) set.add(s.profile)
  }
  return [...set].sort()
})

// 带搜索筛选的会话列表
const sessionList = computed(() => {
  let source = allSessions.value.length > 0
    ? allSessions.value
    : chatStore.sessions.map(s => ({
        ...s,
        ended_at: s.endedAt ? Math.round(s.endedAt / 1000) : null,
        started_at: Math.round(s.createdAt / 1000),
        last_active: Math.round(s.updatedAt / 1000),
        message_count: s.messageCount ?? 0,
        profile: s.profile || 'default',
        source: s.source || 'webui',
      }) as any)

  // Profile 筛选
  if (filterProfile.value) {
    source = source.filter(s => (s as any).profile === filterProfile.value)
  }

  // 搜索筛选（标题 + id + model）
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    source = source.filter(s => {
      const title = (s.title || '').toLowerCase()
      const id = (s.id || '').toLowerCase()
      const model = (s.model || '').toLowerCase()
      return title.includes(q) || id.includes(q) || model.includes(q)
    })
  }

  return source
    .sort((a, b) => (b.last_active ?? b.started_at) - (a.last_active ?? a.started_at))
    .map(s => ({
      id: s.id,
      title: s.title || '(未命名会话)',
      model: s.model || '',
      isRunning: s.ended_at == null,
      updatedAt: s.last_active ?? s.started_at,
      messageCount: s.message_count ?? 0,
      profile: s.profile || '',
      parentSessionId: (s as any).parent_session_id || null,
      source: (s as any).source || '',
    }))
})

// 分页
const currentPage = ref(1)
const pageSize = 30
const totalFiltered = computed(() => sessionList.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFiltered.value / pageSize)))
const pagedSessions = computed(() => sessionList.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))

// 搜索/筛选变化时重置到第一页
watch([searchQuery, filterProfile], () => { currentPage.value = 1 })

// 父子分组：将分页后的会话按 parent_session_id 组织
const pagedSessionTree = computed(() => {
  const byParent = new Map<string | null, typeof sessionList.value>()
  for (const s of pagedSessions.value) {
    const key = s.parentSessionId || null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(s)
  }
  const roots = byParent.get(null) || []
  return roots.map(root => ({
    ...root,
    children: byParent.get(root.id) || [],
  }))
})

// 当进入会话选择模式时，跨所有 profile 加载会话
watch(needsSessionSelect, async (need) => {
  if (!need) return
  loadingSessions.value = true
  allSessions.value = []
  try {
    // 获取所有 profile 名称
    let profileNames: string[] = []
    try {
      // 先确保 profiles 已加载
      const pStore = profilesStore as any
      if (!pStore.profiles || pStore.profiles.length === 0) {
        await pStore.fetchProfiles?.()
      }
      const profiles = pStore.profiles
      if (Array.isArray(profiles) && profiles.length > 0) {
        profileNames = profiles.map((p: any) => p?.name).filter(Boolean)
      }
    } catch { /* profilesStore 未初始化 */ }

    // Fallback: 从已知 profile 目录名硬编码（确保总能查到）
    if (profileNames.length === 0) {
      profileNames = ['default', 'orchestrator', 'worker-coder', 'worker-researcher']
    }

    // 并行查询所有 profile 的会话（limit 提高到 500 确保全量）
    const results = await Promise.allSettled(
      profileNames.map((name: string) => fetchHermesSessions(undefined, 500, name).then(sessions => {
        console.debug(`[RunTrace] profile=${name}: ${sessions.length} sessions`)
        return sessions.map(s => ({ ...s, profile: name }))
      }))
    )
    const merged: Array<SessionSummary & { profile?: string }> = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        merged.push(...result.value)
      } else {
        console.warn('[RunTrace] profile query failed:', result.reason)
      }
    }
    console.debug(`[RunTrace] total merged sessions: ${merged.length}`)
    allSessions.value = merged
  } catch {
    allSessions.value = []
  } finally {
    loadingSessions.value = false
  }
}, { immediate: true })

function selectSession(sid: string) {
  // 从 allSessions 查找该会话是否已结束
  const s = allSessions.value.find(x => x.id === sid)
  trace.sessionEnded.value = !!(s && s.ended_at != null)
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

// 时间游标播放控制：自动推进 scrubberTime，驱动图谱节点按时间逐步激活
const playing = ref(false)
const playSpeed = ref(1) // 1x / 2x / 4x
let playTimer: ReturnType<typeof setInterval> | null = null
function togglePlay() {
  if (playing.value) {
    playing.value = false
    if (playTimer) { clearInterval(playTimer); playTimer = null }
  } else {
    playing.value = true
    const span = maxTime.value - minTime.value
    const step = span / 200 // 200 步走完整段
    playTimer = setInterval(() => {
      const next = trace.scrubberTime.value + step * playSpeed.value
      if (next >= maxTime.value) {
        trace.scrubTo(maxTime.value)
        playing.value = false
        if (playTimer) { clearInterval(playTimer); playTimer = null }
      } else {
        trace.scrubTo(next)
      }
    }, 80)
  }
}
function cyclePlaySpeed() {
  playSpeed.value = playSpeed.value === 1 ? 2 : playSpeed.value === 2 ? 4 : 1
}
onScopeDispose(() => { if (playTimer) clearInterval(playTimer) })

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
    <!-- 全局聚合视图（无 sessionId 时显示）：所有跨任务会话聚合图 -->
    <RunTraceOverview
      v-if="needsSessionSelect"
      @select-session="selectSession"
      @close="store.closeRunTrace"
    />

    <!-- 正常 trace 视图（有 sessionId 时显示） -->
    <template v-else>
      <header class="run-trace-modal__top">
        <button type="button" class="run-trace-modal__back" @click="store.openRunTrace({ sessionId: '' })" :title="t('cockpit.backToSessions')">‹</button>
        <span class="run-trace-modal__dot" :class="trace.mode.value === 'live' ? 'is-live' : ''"></span>
        <div><b>Run Observatory</b><small>{{ sessionId }}</small></div>
        <span v-if="trace.l2Available.value" class="run-trace-modal__l2badge" title="Layer 2 data available">L2</span>
        <!-- 聚合模式开关 -->
        <label class="run-trace-modal__aggregate" :title="t('cockpit.aggregateMode')">
          <input type="checkbox" v-model="trace.aggregateMode.value" />
          <span>{{ t('cockpit.aggregate') }}</span>
        </label>
        <button type="button" data-action="export" class="run-trace-modal__export" @click="exportDossier" title="导出证据档案">📥</button>
        <button type="button" data-action="close" @click="store.closeRunTrace">×</button>
      </header>
      <!-- 关联会话栏（聚合模式开启且有关联会话时显示） -->
      <div v-if="trace.aggregateMode.value && trace.relatedSessions.value.length > 1" class="run-trace-related">
        <span class="run-trace-related__label">🔗 聚合 {{ trace.relatedSessions.value.length }} 个会话</span>
        <div class="run-trace-related__list">
          <span
            v-for="rs in trace.relatedSessions.value"
            :key="rs.sessionId"
            class="run-trace-related__item"
            :class="{ 'is-primary': rs.isPrimary, 'is-empty': rs.isEmpty, [`is-${rs.role}`]: true }"
            :title="rs.title + (rs.isEmpty ? ' (空)' : '')"
          >
            <span class="run-trace-related__dot" :class="{ 'is-ended': rs.ended, 'is-live': !rs.ended }"></span>
            <span v-if="rs.isPrimary" class="run-trace-related__star">★</span>
            <span class="run-trace-related__title">{{ rs.taskId || rs.sessionId.slice(-8) }}</span>
            <span v-if="rs.profile" class="run-trace-related__profile">{{ rs.profile }}</span>
            <span v-if="rs.role === 'creator'" class="run-trace-related__role">创建</span>
            <span v-if="rs.isEmpty" class="run-trace-related__empty">空</span>
          </span>
        </div>
      </div>
      <RunTraceScrubber
        :min-time="minTime"
        :max-time="maxTime"
        :current-time="trace.scrubberTime.value"
        :mode="trace.mode.value"
        :replay-progress="trace.replayProgress.value"
        @scrub="trace.scrubTo"
        @switch-live="trace.switchToLive"
        @start-replay="trace.switchToReplay"
        @scrub-end="trace.scrubEnd"
      />
      <!-- 播放控制：驱动时间游标，图谱节点按时间逐步激活 -->
      <div class="run-trace-modal__playback">
        <button type="button" class="run-trace-modal__play-btn" :class="{ 'is-playing': playing }" @click="togglePlay" :title="playing ? '暂停' : '播放时间游标'">
          {{ playing ? '⏸' : '▶' }}
        </button>
        <button type="button" class="run-trace-modal__speed-btn" @click="cyclePlaySpeed" title="切换播放速度">{{ playSpeed }}x</button>
        <span class="run-trace-modal__playback-hint">拖动时间轴或播放，观察任务/会话/agent 运行过程</span>
      </div>
      <RunTraceTimeBand
        :nodes="trace.nodes.value"
        :min-time="minTime"
        :max-time="maxTime"
        :current-time="trace.scrubberTime.value"
        @focus-node="focusNode"
      />
      <main class="run-trace-modal__main">
        <RunTraceSkillDrilldown v-if="drilldownSkill" :skill="drilldownSkill" @back="drilldownSkillId = null" />
        <RunTraceGraph v-else :nodes="trace.nodes.value" :edges="trace.edges.value" :focused-node-id="focusedNode?.id || null" :current-time="trace.scrubberTime.value" @focus-node="focusNode" />
        <RunTraceInspector :node="focusedNode" />
      </main>
    </template>
  </div>
</template>
<style scoped lang="scss">
/* 内联定位：与协作看板一致，从注意力条下方(top:84px)展开 */
.run-trace-modal { position: fixed; top: 84px; right: 0; bottom: 0; left: 0; z-index: 100; display: flex; flex-direction: column; background: var(--bg-primary); color: var(--text-primary); border-top: 1px solid var(--border-color); box-shadow: 0 -4px 16px rgba(0,0,0,0.08); }

/* ── 会话选择器 ── */
.run-trace-session-picker { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.run-trace-session-picker__head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--border-color); font-size: 13px; font-weight: 700; color: var(--text-secondary); }
.run-trace-session-picker__head small { font-size: 10px; font-weight: 400; color: var(--text-muted); margin-left: 8px; }
.run-trace-session-picker__head button { width: 28px; height: 28px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); border-radius: 6px; cursor: pointer; }

/* 搜索 + 筛选 */
.run-trace-session-picker__filters { display: flex; gap: 8px; padding: 8px 18px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); }
.run-trace-session-picker__search { flex: 1; height: 28px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; outline: none;
  &:focus { border-color: var(--accent-primary); }
  &::placeholder { color: var(--text-muted); }
}
/* Profile 标签按钮 */
.run-trace-session-picker__tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 18px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); }
.run-trace-session-picker__tab { font-size: 10px; padding: 3px 10px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--text-muted); color: var(--text-secondary); }
  &.is-active { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}
.run-trace-session-picker__list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.run-trace-session-picker__empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 48px 16px; }
.run-trace-session-picker__item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); cursor: pointer; font-family: inherit; text-align: left; transition: background 0.12s;
  &:hover { background: var(--bg-secondary); border-color: var(--text-muted); }
  &.is-running { border-color: var(--success); }
}
.run-trace-session-picker__item--child { margin-left: 24px; padding: 6px 12px; background: var(--bg-secondary); font-size: 11px; border-style: dashed; }
.run-trace-session-picker__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0;
  &.is-live { background: var(--success); animation: run-trace-live-pulse 1.5s ease-in-out infinite; }
}
.run-trace-session-picker__title { flex: 1; min-width: 0; font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-trace-session-picker__meta { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.run-trace-session-picker__profile { font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-muted); flex-shrink: 0; text-transform: uppercase; }
.run-trace-session-picker__kanban { font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--accent-info); color: var(--text-on-accent); flex-shrink: 0; font-family: monospace; }
.run-trace-session-picker__badge { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: var(--success); color: #fff; flex-shrink: 0; }
/* 分页 */
.run-trace-session-picker__pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 18px; border-top: 1px solid var(--border-color); background: var(--bg-card); }
.run-trace-session-picker__pagination button { height: 26px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; font-size: 11px; font-family: inherit;
  &:hover:not(:disabled) { background: var(--bg-card-hover); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.run-trace-session-picker__page-info { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }

/* ── 正常 trace 视图 ── */
.run-trace-modal__top { display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); flex-shrink: 0; }
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
.run-trace-modal__playback { display: flex; align-items: center; gap: 8px; padding: 4px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.run-trace-modal__play-btn { width: 26px; height: 26px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; }
.run-trace-modal__play-btn:hover { background: var(--bg-card-hover); }
.run-trace-modal__play-btn.is-playing { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
.run-trace-modal__speed-btn { padding: 3px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 10px; font-family: ui-monospace, monospace; }
.run-trace-modal__speed-btn:hover { background: var(--bg-card-hover); }
.run-trace-modal__playback-hint { font-size: 9px; color: var(--text-muted); margin-left: 4px; }
.run-trace-modal__main { min-height: 0; flex: 1; display: grid; grid-template-columns: 1fr 320px; }
@keyframes run-trace-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* ── 聚合模式开关 ── */
.run-trace-modal__aggregate { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); cursor: pointer; margin-left: 8px; flex-shrink: 0; }
.run-trace-modal__aggregate input { margin: 0; cursor: pointer; }

/* ── 关联会话栏 ── */
.run-trace-related { display: flex; align-items: center; gap: 8px; padding: 6px 18px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); overflow-x: auto; flex-shrink: 0; }
.run-trace-related__label { font-size: 11px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.run-trace-related__list { display: flex; gap: 6px; flex-wrap: nowrap; overflow-x: auto; }
.run-trace-related__item { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 10px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0;
  &.is-primary { border-color: var(--accent-primary); color: var(--text-primary); font-weight: 600; background: rgba(var(--accent-primary-rgb, 64,120,192), 0.06); }
  &.is-empty { opacity: 0.5; border-style: dashed; }
  &.is-creator { border-color: var(--accent-secondary, var(--accent-primary)); }
}
.run-trace-related__dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  &.is-live { background: var(--success); }
  &.is-ended { background: var(--text-muted); }
}
.run-trace-related__star { color: var(--warning); font-size: 11px; }
.run-trace-related__title { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.run-trace-related__profile { font-size: 9px; opacity: 0.7; }
.run-trace-related__role { font-size: 9px; padding: 0 3px; border-radius: 3px; background: rgba(var(--accent-secondary-rgb, 64,120,192), 0.12); color: var(--text-secondary); }
.run-trace-related__empty { font-size: 9px; padding: 0 3px; border-radius: 3px; background: var(--bg-inset, rgba(0,0,0,0.06)); color: var(--text-muted); }
</style>
