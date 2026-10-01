<!-- overlay/custom/client/ide/components/IdeTrajectoryPane.vue -->
<!-- 会话轨迹账本面板（2026-10-01 运行观测吸收批 #6：dsh-TUI TrajectoryScene 与
     deepseek-harness ui-trajectory 的 Web 化吸收）。
     语义：回答"这个 agent 一整个会话干了什么"——账本行（kind 徽章+标签+时长+
     状态色）× 谓词查询（kind:/err:/>Ns/文本 AND 组合）× 双排序（时间线=startedAt、
     热点=durationMs 降序）× 选中行 inspector（详情/时间戳/证据层）。
     数据：GET /api/hermes/sessions/:id/trace（L2 图投影——投影是索引不是镜像，
     账本只持节点引用，轻量首载）。会话源=chatStore.activeSessionId。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { authFetch } from '../utils/auth-fetch'
import { useRunSurfaceText } from '@/custom/ia2/i18n-observatory'

const chatStore = useChatStore()
const tx = useRunSurfaceText()

interface TraceNode {
  id: string
  kind: string
  label: string
  detail: string | null
  status: string
  startedAt: number | null
  endedAt: number | null
  durationMs: number | null
  evidence?: string
}
interface TraceMeta {
  started_at?: number
  ended_at?: number
  duration_ms?: number
  model?: string | null
  outcome?: string | null
  usage?: { input_tokens?: number; output_tokens?: number; api_calls?: number }
}
interface TraceResp {
  session_id: string
  nodes: TraceNode[]
  edges: Array<{ from: string; to: string }>
  meta: TraceMeta
}

const loading = ref(false)
const error = ref<string | null>(null)
const nodes = ref<TraceNode[]>([])
const meta = ref<TraceMeta | null>(null)

const sessionId = computed(() => chatStore.activeSessionId)

async function load(): Promise<void> {
  const sid = sessionId.value
  if (!sid) { nodes.value = []; meta.value = null; return }
  loading.value = true
  error.value = null
  try {
    const res = await authFetch(`/api/hermes/sessions/${encodeURIComponent(sid)}/trace`)
    if (!res.ok) {
      // 404 = 该会话无 trace 文件（run-trace 插件未启用/非 agent 会话）——如实空态
      nodes.value = []
      meta.value = null
      error.value = res.status === 404 ? 'no-trace' : `HTTP ${res.status}`
      return
    }
    const data = (await res.json()) as TraceResp
    nodes.value = data.nodes ?? []
    meta.value = data.meta ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(sessionId, () => { void load() }, { immediate: true })

// ── 谓词查询（dsh-TUI Trajectory 查询语言子集：前缀 AND 组合）──
// 支持：kind:tool（kind 前缀匹配）、err:（status=error 过滤）、>10s/>500ms（时长下限）、
// 其余裸词=文本包含（label/detail）。大小写不敏感。
const query = ref('')

function parseDurationToken(tok: string): { minMs: number } | null {
  const m = /^>(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(tok)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2] ?? 's'
  return { minMs: unit === 'ms' ? n : unit === 'm' ? n * 60000 : n * 1000 }
}

function matchQuery(n: TraceNode, q: string): boolean {
  const toks = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!toks.length) return true
  for (const tok of toks) {
    if (tok.startsWith('kind:')) {
      if (!n.kind.toLowerCase().includes(tok.slice(5))) return false
    } else if (tok === 'err:' || tok === 'err') {
      if (n.status !== 'error') return false
    } else {
      const dur = parseDurationToken(tok)
      if (dur) {
        if ((n.durationMs ?? 0) < dur.minMs) return false
      } else if (
        !n.label.toLowerCase().includes(tok)
        && !(n.detail ?? '').toLowerCase().includes(tok)
        && !n.kind.toLowerCase().includes(tok)
      ) return false
    }
  }
  return true
}

// ── 排序：时间线（startedAt 升序，缺时沉底）/ 热点（durationMs 降序）──
const sortMode = ref<'timeline' | 'hotspot'>('timeline')

const rows = computed<TraceNode[]>(() => {
  const filtered = nodes.value.filter(n => matchQuery(n, query.value))
  const sorted = [...filtered]
  if (sortMode.value === 'hotspot') {
    sorted.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
  } else {
    sorted.sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity))
  }
  return sorted
})

const selected = ref<TraceNode | null>(null)
watch(rows, r => {
  if (selected.value && !r.some(x => x.id === selected.value?.id)) selected.value = null
})

// ── 摘要头 ──
const kindDist = computed(() => {
  const m = new Map<string, number>()
  for (const n of nodes.value) m.set(n.kind, (m.get(n.kind) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})

const errorCount = computed(() => nodes.value.filter(n => n.status === 'error').length)

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleTimeString('zh-CN', { hour12: false })
}

const KIND_TONE: Record<string, string> = {
  workflow: 't-kind--wf', agent: 't-kind--agent', skill: 't-kind--skill',
  tool: 't-kind--tool', memory: 't-kind--mem', service: 't-kind--svc',
  peer: 't-kind--peer', approval: 't-kind--appr', ingress: 't-kind--ing',
}
</script>

<template>
  <div class="traj" data-testid="ide-trajectory-pane">
    <!-- 摘要头 -->
    <div class="traj__head">
      <span class="traj__stat">{{ tx.trajNodes }} {{ nodes.length }}</span>
      <span v-if="errorCount" class="traj__stat traj__stat--err">{{ tx.trajErrors }} {{ errorCount }}</span>
      <span v-if="meta?.duration_ms" class="traj__stat">{{ fmtMs(meta.duration_ms) }}</span>
      <span v-if="meta?.usage?.input_tokens || meta?.usage?.output_tokens" class="traj__stat">
        ↑{{ meta?.usage?.input_tokens ?? 0 }} ↓{{ meta?.usage?.output_tokens ?? 0 }}
      </span>
      <span class="traj__spacer" />
      <button
        type="button" class="traj__sortbtn" :class="{ 'is-on': sortMode === 'hotspot' }"
        :title="tx.trajHotspotHint" data-testid="traj-sort-toggle"
        @click="sortMode = sortMode === 'timeline' ? 'hotspot' : 'timeline'"
      >🔥 {{ tx.trajHotspot }}</button>
    </div>

    <!-- kind 分布 chips -->
    <div v-if="kindDist.length" class="traj__kinds">
      <button
        v-for="[k, c] in kindDist" :key="k" type="button" class="traj__kindchip"
        :class="KIND_TONE[k] ?? ''"
        @click="query = query.includes(`kind:${k}`) ? query.replace(`kind:${k}`, '').trim() : `${query.trim()} kind:${k}`.trim()"
      >{{ k }} ×{{ c }}</button>
    </div>

    <!-- 谓词查询框 -->
    <input
      v-model="query" type="text" class="traj__query" :placeholder="tx.trajQueryHint"
      data-testid="traj-query-input"
    />

    <!-- 状态行 -->
    <div v-if="loading" class="traj__state">{{ tx.trajLoading }}</div>
    <div v-else-if="error === 'no-trace'" class="traj__state">{{ tx.trajNoTrace }}</div>
    <div v-else-if="error" class="traj__state traj__state--err">{{ error }}</div>
    <div v-else-if="!sessionId" class="traj__state">{{ tx.trajNoSession }}</div>

    <!-- 账本（ledger） -->
    <div v-else class="traj__ledger" data-testid="traj-ledger">
      <div v-if="!rows.length" class="traj__state">{{ tx.trajNoMatch }}</div>
      <button
        v-for="n in rows" :key="n.id" type="button" class="traj__row"
        :class="{ 'traj__row--sel': selected?.id === n.id, 'traj__row--err': n.status === 'error' }"
        :data-testid="`traj-row-${n.id}`"
        @click="selected = selected?.id === n.id ? null : n"
      >
        <span class="traj__kind" :class="KIND_TONE[n.kind] ?? ''">{{ n.kind }}</span>
        <span class="traj__label" :title="n.label">{{ n.label || n.id }}</span>
        <span v-if="n.status === 'error'" class="traj__status traj__status--err">!</span>
        <span v-else-if="n.status === 'running'" class="traj__status traj__status--run">●</span>
        <span class="traj__dur">{{ fmtMs(n.durationMs) }}</span>
        <span v-if="sortMode === 'timeline'" class="traj__ts">{{ fmtTs(n.startedAt) }}</span>
      </button>
    </div>

    <!-- Inspector -->
    <div v-if="selected" class="traj__insp" data-testid="traj-inspector">
      <div class="traj__insp-head">
        <span class="traj__kind" :class="KIND_TONE[selected.kind] ?? ''">{{ selected.kind }}</span>
        <span class="traj__insp-label">{{ selected.label || selected.id }}</span>
        <button type="button" class="traj__insp-close" @click="selected = null">×</button>
      </div>
      <div class="traj__insp-grid">
        <span>status</span><b :class="{ 'traj__status--err': selected.status === 'error' }">{{ selected.status }}</b>
        <span>duration</span><b>{{ fmtMs(selected.durationMs) }}</b>
        <span>started</span><b>{{ fmtTs(selected.startedAt) }}</b>
        <span>ended</span><b>{{ fmtTs(selected.endedAt) }}</b>
        <span>evidence</span><b>{{ selected.evidence ?? '—' }}</b>
      </div>
      <pre v-if="selected.detail" class="traj__insp-detail">{{ selected.detail }}</pre>
    </div>
  </div>
</template>

<style scoped lang="scss">
.traj {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 6px;
  font-size: 12px;
}

.traj__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.traj__stat { color: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.traj__stat--err { color: var(--error, #e11d48); font-weight: 600; }
.traj__spacer { flex: 1; }
.traj__sortbtn {
  height: 20px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 9px;
  background: transparent; color: var(--text-muted); font-size: 10px; cursor: pointer; font-family: inherit;
  &.is-on { color: var(--text-primary); border-color: var(--text-muted); background: var(--bg-secondary); }
}

.traj__kinds { display: flex; flex-wrap: wrap; gap: 4px; }
.traj__kindchip {
  height: 18px; padding: 0 7px; border: 1px solid var(--border-color); border-radius: 9px;
  background: transparent; color: var(--text-muted); font-size: 10px; cursor: pointer; font-family: inherit;
  &:hover { color: var(--text-primary); }
}

.traj__query {
  height: 26px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-secondary); color: var(--text-primary); font-size: 11px;
  font-family: var(--font-mono, monospace); outline: none;
  &:focus { border-color: var(--primary, #3b82f6); }
}

.traj__state { padding: 20px 0; text-align: center; color: var(--text-muted); font-size: 11px; }
.traj__state--err { color: var(--error, #e11d48); }

.traj__ledger { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }

.traj__row {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  border: none; background: transparent; cursor: pointer; font-family: inherit; text-align: left;
  &:hover { background: var(--bg-secondary); }
  &.traj__row--sel { background: var(--bg-secondary); box-shadow: inset 2px 0 0 var(--primary, #3b82f6); }
  &.traj__row--err .traj__label { color: var(--error, #e11d48); }
}

.traj__kind {
  flex-shrink: 0; min-width: 44px; text-align: center; padding: 1px 4px; border-radius: 3px;
  font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  background: var(--bg-secondary); color: var(--text-muted);
}
.t-kind--tool { color: #61afef; }
.t-kind--agent { color: #c678dd; }
.t-kind--skill { color: #98c379; }
.t-kind--appr { color: #e5c07b; }
.t-kind--err { color: var(--error, #e11d48); }

.traj__label {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-primary);
}

.traj__status { flex-shrink: 0; font-size: 10px; }
.traj__status--err { color: var(--error, #e11d48); font-weight: 700; }
.traj__status--run { color: #61afef; animation: traj-pulse 1.2s ease-in-out infinite; }
@keyframes traj-pulse { 50% { opacity: 0.35; } }

.traj__dur { flex-shrink: 0; font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 44px; text-align: right; }
.traj__ts { flex-shrink: 0; font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }

.traj__insp {
  flex-shrink: 0; max-height: 200px; overflow-y: auto; border-top: 1px solid var(--border-color);
  padding: 8px 4px 4px; background: var(--bg-secondary); border-radius: 6px 6px 0 0;
}
.traj__insp-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.traj__insp-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--text-primary); }
.traj__insp-close { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 0 4px; }
.traj__insp-grid {
  display: grid; grid-template-columns: 64px 1fr; gap: 2px 8px; font-size: 10px;
  span { color: var(--text-muted); }
  b { color: var(--text-primary); font-weight: 500; word-break: break-all; }
}
.traj__insp-detail {
  margin: 6px 0 0; padding: 6px; border-radius: 4px; background: var(--bg-card);
  font-size: 10px; line-height: 1.45; color: var(--text-secondary); white-space: pre-wrap;
  word-break: break-all; max-height: 100px; overflow-y: auto;
}
</style>
