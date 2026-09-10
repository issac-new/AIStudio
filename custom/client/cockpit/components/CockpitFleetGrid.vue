<script setup lang="ts">
// CockpitFleetGrid.vue —— 舰队网格（2.13 指挥中心核心面）
//
// 一屏同看 N 个跨 profile 会话：状态点 + 尾部预览 + 队列/审批徽标 +
// 一键批准/拒绝 + 点击秒切全量聊天。数据来自 store.fleetSessionsFiltered
// （fleet WS 快照），动作走 store 的 REST 适配器。
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import type { FleetSession, FleetSubagent } from '@/custom/cockpit/adapters/fleet-adapter'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

const search = ref('')
const workingOnly = ref(false)

const sessions = computed(() => {
  let list = store.fleetSessionsFiltered
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(s =>
      s.title.toLowerCase().includes(q)
      || s.profile.toLowerCase().includes(q)
      || s.lastPreview.toLowerCase().includes(q)
      || s.subagents.some(sub => `${sub.goal} ${sub.last_tool}`.toLowerCase().includes(q)))
  }
  if (workingOnly.value) {
    list = list.filter(s => s.status === 'working' || s.approvals.length > 0 || s.clarifies.length > 0
      || s.subagents.some(sub => sub.status === 'running'))
  }
  return list
})

const workingCount = computed(() => store.fleetSessionsFiltered.filter(s => s.status === 'working').length)
const attentionCount = computed(() => store.fleetSessionsFiltered.reduce(
  (n, s) => n + s.approvals.length + s.clarifies.length, 0))

function openSession(session: FleetSession) {
  router.push({
    name: 'hermes.session',
    params: { sessionId: session.id },
    query: session.profile ? { profile: session.profile } : {},
  })
}

function runDuration(session: FleetSession): string {
  if (session.status !== 'working' || !session.runStartedAt) return ''
  const secs = Math.max(0, Math.floor((Date.now() - session.runStartedAt) / 1000))
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m${secs % 60}s`
  return `${Math.floor(secs / 3600)}h${Math.floor((secs % 3600) / 60)}m`
}

function ago(ts: number): string {
  if (!ts) return ''
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return t('cockpit.justNow')
  if (mins < 60) return t('cockpit.minutesAgo', { n: mins })
  if (mins < 1440) return t('cockpit.hoursAgo', { n: Math.floor(mins / 60) })
  return t('cockpit.daysAgo', { n: Math.floor(mins / 1440) })
}

// ── 子代理花名册（hermes-agent 0.21.1 delegation，数据经 fleet 快照透传）──

const SUBAGENT_ROWS = 4

function runningSubCount(session: FleetSession): number {
  return session.subagents.filter(sub => sub.status === 'running').length
}

function visibleSubagents(session: FleetSession): FleetSubagent[] {
  return session.subagents.slice(0, SUBAGENT_ROWS)
}

function subMeta(sub: FleetSubagent): string {
  if (sub.status === 'running') {
    return [sub.model, sub.last_tool, sub.tool_count ? `×${sub.tool_count}` : ''].filter(Boolean).join(' · ')
  }
  const parts: string[] = []
  if (sub.duration_seconds != null) parts.push(`${Math.round(sub.duration_seconds)}s`)
  if (sub.cost_usd != null) parts.push(`$${sub.cost_usd.toFixed(3)}`)
  if (sub.input_tokens != null || sub.output_tokens != null) {
    parts.push(`${sub.input_tokens ?? 0}+${sub.output_tokens ?? 0}tok`)
  }
  return parts.join(' · ')
}

function subTooltip(sub: FleetSubagent): string {
  const lines = [sub.goal || sub.subagent_id, `status=${sub.status} model=${sub.model || '?'} depth=${sub.depth}`]
  if (sub.input_tokens != null || sub.output_tokens != null) {
    lines.push(`tokens: ${sub.input_tokens ?? 0} in / ${sub.output_tokens ?? 0} out`)
  }
  if (sub.cost_usd != null) lines.push(`cost: $${sub.cost_usd.toFixed(4)}`)
  if (sub.summary) lines.push(sub.summary)
  return lines.join('\n')
}

async function approve(session: FleetSession, approvalId: string, choice: 'once' | 'deny') {
  await store.respondFleetApproval(session.id, approvalId, choice)
}

const pendingAction = ref<string | null>(null)
async function clarify(session: FleetSession, clarifyId: string) {
  pendingAction.value = clarifyId
  try {
    const answer = window.prompt(t('cockpit.fleetClarifyPrompt'), '')
    if (answer === null) return
    await store.respondFleetClarify(session.id, clarifyId, answer.trim() || '继续')
  } finally {
    pendingAction.value = null
  }
}
</script>

<template>
  <div class="fleet-grid">
    <div class="fleet-grid__bar">
      <span class="fleet-grid__title">
        {{ t('cockpit.fleetTitle') }}
        <span class="fleet-grid__dot" :class="store.fleetConnected ? 'is-on' : 'is-off'" :title="store.fleetConnected ? t('cockpit.fleetLive') : t('cockpit.fleetOffline')" />
        <span class="fleet-grid__stats">
          {{ t('cockpit.fleetWorking', { n: workingCount }) }} / {{ t('cockpit.fleetTotal', { n: store.fleetSessionsFiltered.length }) }}
          <span v-if="attentionCount" class="fleet-grid__attn">{{ t('cockpit.fleetAttention', { n: attentionCount }) }}</span>
        </span>
      </span>
      <span class="fleet-grid__tools">
        <input v-model="search" class="fleet-grid__search" type="search" :placeholder="t('cockpit.fleetSearchPlaceholder')" />
        <label class="fleet-grid__toggle">
          <input type="checkbox" v-model="workingOnly" />
          {{ t('cockpit.fleetWorkingOnly') }}
        </label>
      </span>
    </div>
    <div class="fleet-grid__body">
      <div v-for="s in sessions" :key="s.id" class="fleet-card" :class="{ 'is-working': s.status === 'working', 'is-aborting': s.isAborting }" @click="openSession(s)">
        <div class="fleet-card__head">
          <span class="fleet-card__status" :class="`is-${s.approvals.length || s.clarifies.length ? 'attention' : s.status}`" />
          <span class="fleet-card__title" :title="s.title">{{ s.title }}</span>
          <span class="fleet-card__profile">{{ s.profile }}</span>
        </div>
        <div class="fleet-card__meta">
          <span v-if="s.status === 'working'" class="fleet-card__run">▶ {{ runDuration(s) }}<template v-if="s.isAborting"> · {{ t('cockpit.fleetAborting') }}</template></span>
          <span v-else class="fleet-card__idle">{{ ago(s.lastActiveAt) || '—' }}</span>
          <span v-if="s.queueLength" class="fleet-card__queue">{{ t('cockpit.fleetQueued', { n: s.queueLength }) }}</span>
          <span v-if="s.source" class="fleet-card__src">{{ s.source }}</span>
        </div>
        <div class="fleet-card__preview">{{ s.lastPreview || ' ' }}</div>
        <div v-if="s.subagents.length" class="fleet-card__subs">
          <div class="fleet-card__subs-head">
            <span class="fleet-card__subs-label">{{ t('cockpit.fleetSubagents') }}</span>
            <span v-if="runningSubCount(s)" class="fleet-card__subs-run">{{ t('cockpit.fleetSubagentsRun', { n: runningSubCount(s) }) }}</span>
          </div>
          <div
            v-for="sub in visibleSubagents(s)"
            :key="sub.subagent_id"
            class="fleet-card__sub"
            :class="{ 'is-done': sub.status !== 'running' }"
            :title="subTooltip(sub)"
          >
            <span class="fleet-card__sub-goal">{{ sub.goal || sub.subagent_id }}</span>
            <span class="fleet-card__sub-meta">{{ subMeta(sub) || ' ' }}</span>
          </div>
          <div v-if="s.subagents.length > SUBAGENT_ROWS" class="fleet-card__subs-more">+{{ s.subagents.length - SUBAGENT_ROWS }}</div>
        </div>
        <div v-if="s.approvals.length || s.clarifies.length" class="fleet-card__actions" @click.stop>
          <div v-for="a in s.approvals" :key="a.approval_id" class="fleet-card__approval">
            <span class="fleet-card__approval-text" :title="a.preview">{{ t('cockpit.fleetApproval') }}: {{ a.preview || a.approval_id }}</span>
            <button type="button" class="fleet-card__btn is-ok" @click="approve(s, a.approval_id, 'once')">{{ t('cockpit.fleetApprove') }}</button>
            <button type="button" class="fleet-card__btn is-no" @click="approve(s, a.approval_id, 'deny')">{{ t('cockpit.fleetDeny') }}</button>
          </div>
          <div v-for="c in s.clarifies" :key="c.clarify_id" class="fleet-card__approval">
            <span class="fleet-card__approval-text" :title="c.question">{{ t('cockpit.fleetClarify') }}: {{ c.question || c.clarify_id }}</span>
            <button type="button" class="fleet-card__btn is-ok" :disabled="pendingAction === c.clarify_id" @click="clarify(s, c.clarify_id)">{{ t('cockpit.fleetAnswer') }}</button>
          </div>
        </div>
      </div>
      <div v-if="!sessions.length" class="fleet-grid__empty">
        {{ store.fleetConnected ? t('cockpit.fleetEmpty') : t('cockpit.fleetOfflineEmpty') }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.fleet-grid { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-page); }
.fleet-grid__bar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); flex-wrap: wrap;
}
.fleet-grid__title { font-size: 12px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px; }
.fleet-grid__dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.fleet-grid__dot.is-on { background: #10b981; box-shadow: 0 0 4px rgba(16, 185, 129, .8); }
.fleet-grid__dot.is-off { background: var(--text-muted); }
.fleet-grid__stats { font-size: 11px; font-weight: 400; color: var(--text-muted); }
.fleet-grid__attn { color: var(--error); font-weight: 700; margin-left: 6px; }
.fleet-grid__tools { display: flex; align-items: center; gap: 8px; }
.fleet-grid__search {
  font: inherit; font-size: 11px; padding: 3px 8px; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); min-width: 140px;
}
.fleet-grid__toggle { font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; }
.fleet-grid__body {
  flex: 1; overflow-y: auto; padding: 10px; display: grid; gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); align-content: start;
}
.fleet-card {
  display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; cursor: pointer;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px;
  transition: border-color 0.12s, box-shadow 0.12s; min-width: 0;
  &:hover { border-color: var(--accent-primary); }
  &.is-working { border-left: 2px solid #10b981; }
  &.is-aborting { border-left: 2px solid #f59e0b; }
}
.fleet-card__head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.fleet-card__status { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.fleet-card__status.is-working { background: #10b981; animation: fleet-pulse 1.6s ease-in-out infinite; }
.fleet-card__status.is-attention { background: var(--error); animation: fleet-pulse 0.9s ease-in-out infinite; }
.fleet-card__status.is-aborting { background: #f59e0b; }
.fleet-card__title {
  flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fleet-card__profile {
  flex-shrink: 0; font-size: 9px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase;
  color: var(--text-on-accent); background: var(--accent-primary); border-radius: 4px; padding: 1px 5px;
}
.fleet-card__meta { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--text-muted); flex-wrap: wrap; }
.fleet-card__run { color: #10b981; font-weight: 600; font-family: ui-monospace, monospace; }
.fleet-card__idle { font-family: ui-monospace, monospace; }
.fleet-card__queue { background: var(--bg-secondary); border-radius: 4px; padding: 0 4px; }
.fleet-card__src { background: var(--bg-secondary); border-radius: 4px; padding: 0 4px; }
.fleet-card__preview {
  font-family: ui-monospace, monospace; font-size: 10.5px; line-height: 1.45; color: var(--text-secondary);
  background: var(--bg-secondary); border-radius: 4px; padding: 5px 7px; max-height: 4.4em;
  overflow: hidden; word-break: break-all; white-space: pre-wrap;
}
.fleet-card__actions { display: flex; flex-direction: column; gap: 4px; }
.fleet-card__subs {
  display: flex; flex-direction: column; gap: 2px; padding: 4px 6px;
  background: var(--bg-secondary); border-radius: 4px; border: 1px dashed var(--border-color);
}
.fleet-card__subs-head { display: flex; align-items: center; gap: 6px; }
.fleet-card__subs-label { font-size: 9px; font-weight: 700; letter-spacing: .03em; color: var(--text-muted); }
.fleet-card__subs-run {
  font-size: 9px; font-weight: 700; color: #10b981;
  background: rgba(16, 185, 129, .12); border-radius: 4px; padding: 0 4px;
}
.fleet-card__sub { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.fleet-card__sub-goal {
  flex: 0 1 auto; min-width: 0; font-size: 10px; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fleet-card__sub.is-done .fleet-card__sub-goal { color: var(--text-muted); }
.fleet-card__sub-meta {
  flex-shrink: 0; margin-left: auto; font-size: 9px; font-family: ui-monospace, monospace; color: var(--text-muted);
}
.fleet-card__subs-more { font-size: 9px; color: var(--text-muted); }
.fleet-card__approval {
  display: flex; align-items: center; gap: 6px; background: rgba(239, 68, 68, .08);
  border: 1px solid rgba(239, 68, 68, .35); border-radius: 4px; padding: 4px 6px;
}
.fleet-card__approval-text {
  flex: 1; min-width: 0; font-size: 10.5px; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fleet-card__btn {
  flex-shrink: 0; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer;
  border-radius: 4px; border: 1px solid transparent; padding: 2px 8px;
  &.is-ok { background: #10b981; color: #fff; }
  &.is-ok:hover { background: #059669; }
  &.is-no { background: transparent; border-color: var(--error); color: var(--error); }
  &.is-no:hover { background: rgba(239, 68, 68, .12); }
  &:disabled { opacity: .5; cursor: default; }
}
.fleet-grid__empty { grid-column: 1 / -1; padding: 40px 0; text-align: center; font-size: 12px; color: var(--text-muted); }
@keyframes fleet-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
</style>
