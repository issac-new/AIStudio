<!-- overlay/custom/client/governance/components/DecisionGraphSection.vue -->
<!-- 决策图谱（乙4/丁9 的 UI 化，2026-10-01 用户裁定）：决策时间线 + 因果链展开 +
     门禁判定同步 + 双时态回放。数据 /api/governance/decision-graph/*；
     venv 缺席如实降级提示，不编造。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchDgChain, fetchDgDecisions, fetchDgReplay, fetchDgSnapshots, fetchDgStatus, syncDgGates,
  type ChainItem, type DecisionGraphStatus, type DecisionItem, type ReplayResp,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { decisionGraph: Record<string, string> }).decisionGraph
})

const status = ref<DecisionGraphStatus | null>(null)
const decisions = ref<DecisionItem[]>([])
const total = ref(0)
const error = ref('')
const busy = ref(false)
const expandedId = ref('')
const chain = ref<ChainItem[]>([])
const chainError = ref('')
const snapCount = ref<number | null>(null)
/** 回放：datetime-local 输入（本地时区）→ epoch ms */
const replayInput = ref('')
const replay = ref<ReplayResp | null>(null)
const replayError = ref('')

async function refresh(): Promise<void> {
  error.value = ''
  try {
    const [st, dc, snaps] = await Promise.all([
      fetchDgStatus(),
      fetchDgDecisions(30),
      fetchDgSnapshots().catch(() => null),
    ])
    status.value = st
    decisions.value = dc.decisions ?? []
    total.value = dc.total ?? 0
    snapCount.value = snaps?.stats?.count ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function syncGates(): Promise<void> {
  busy.value = true
  try {
    await syncDgGates()
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function toggleChain(id: string): Promise<void> {
  if (expandedId.value === id) {
    expandedId.value = ''
    chain.value = []
    return
  }
  expandedId.value = id
  chain.value = []
  chainError.value = ''
  try {
    const res = await fetchDgChain(id)
    chain.value = res.chain ?? []
  } catch (e) {
    chainError.value = e instanceof Error ? e.message : String(e)
  }
}

async function runReplay(): Promise<void> {
  replayError.value = ''
  replay.value = null
  if (!replayInput.value) return
  const at = new Date(replayInput.value).getTime()
  if (!Number.isFinite(at) || at <= 0) {
    replayError.value = 'invalid time'
    return
  }
  try {
    replay.value = await fetchDgReplay(at)
  } catch (e) {
    replayError.value = e instanceof Error ? e.message : String(e)
  }
}

const outcomeZh = (o: string | null): string =>
  o === 'approved' ? '放行' : o === 'rejected' ? '拒绝' : o === 'deferred' ? '暂缓' : (o ?? '—')

const categoryZh = (c: string | null): string => ({
  dispatch: '派发', approval: '审批', escalation: '升级', gate: '门禁',
}[c ?? ''] ?? (c ?? '—'))

function fmtTs(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—'
}

onMounted(() => void refresh())
</script>

<template>
  <div class="dg" data-testid="gov-decision-graph">
    <div class="dg__bar">
      <h3 class="dg__title">{{ L?.title }}</h3>
      <span v-if="status" class="dg__chip" data-testid="dg-status">
        {{ status.decisions }} 决策 · {{ status.nodes }} 节点
        <template v-if="snapCount !== null"> · {{ (L?.snapshots ?? '').replace('{n}', String(snapCount)).replace('{kb}', '?') }}</template>
      </span>
      <button type="button" class="dg__sync" data-testid="dg-sync-gates" :disabled="busy" @click="syncGates()">
        {{ busy ? L?.syncing : L?.syncGates }}
      </button>
    </div>
    <p class="dg__sub">{{ L?.sub }}</p>
    <div v-if="error" class="dg__error">{{ error }}</div>
    <div v-if="status && !status.python" class="dg__nokg" data-testid="dg-no-python">{{ L?.pythonMissing }}</div>
    <div v-else-if="!status" class="dg__empty">…</div>
    <template v-else>
      <!-- 决策时间线 -->
      <div class="dg__panel" data-testid="dg-timeline">
        <h4 class="dg__panel-title">{{ L?.timeline }}<span class="dg__count">{{ (L?.total ?? '').replace('{n}', String(total)) }}</span></h4>
        <div v-if="!decisions.length" class="dg__empty">{{ L?.empty }}</div>
        <div
          v-for="d in decisions" :key="d.id"
          class="dg__row" :data-testid="`dg-decision-${d.id.slice(0, 8)}`"
          @click="toggleChain(d.id)"
        >
          <span class="dg__cat" :data-cat="d.category">{{ categoryZh(d.category) }}</span>
          <span class="dg__scenario">{{ d.scenario ?? '—' }}</span>
          <span class="dg__outcome" :class="`is-${d.outcome ?? 'unknown'}`">{{ outcomeZh(d.outcome) }}</span>
          <span class="dg__conf">{{ d.confidence != null ? `${Math.round(d.confidence * 100)}%` : '' }}</span>
          <!-- 因果链展开（同一行内联区） -->
          <div v-if="expandedId === d.id" class="dg__chain" data-testid="dg-chain">
            <div v-if="chainError" class="dg__error">{{ chainError }}</div>
            <div v-else-if="!chain.length" class="dg__empty">{{ L?.chainEmpty }}</div>
            <template v-else>
              <div class="dg__chain-title">{{ L?.chainTitle }}</div>
              <div v-for="(c, i) in chain" :key="c.id" class="dg__chain-item">
                <span class="dg__chain-idx">{{ i + 1 }}</span>
                <span class="dg__cat" :data-cat="c.category">{{ categoryZh(c.category) }}</span>
                <span class="dg__scenario">{{ c.scenario ?? '—' }}</span>
                <span class="dg__outcome" :class="`is-${c.outcome ?? 'unknown'}`">{{ outcomeZh(c.outcome) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 双时态回放 -->
      <div class="dg__panel dg__replay" data-testid="dg-replay">
        <h4 class="dg__panel-title">{{ L?.replayTitle }}</h4>
        <div class="dg__replay-row">
          <label class="dg__label">{{ L?.replayAt }}</label>
          <input v-model="replayInput" type="datetime-local" class="dg__replay-input" data-testid="dg-replay-input" />
          <button type="button" class="dg__replay-go" data-testid="dg-replay-go" @click="runReplay()">{{ L?.replayGo }}</button>
        </div>
        <div v-if="replayError" class="dg__error">{{ replayError }}</div>
        <div v-else-if="replay" class="dg__replay-result" data-testid="dg-replay-result">
          <template v-if="replay.snapshotTs !== null">
            {{ (L?.replayResult ?? '')
              .replace('{ts}', fmtTs(replay.snapshotTs))
              .replace('{lag}', replay.lagMs != null ? `${Math.round(replay.lagMs / 1000)}s` : '—')
              .replace('{n}', String(replay.decisions.length)) }}
          </template>
          <template v-else>{{ L?.replayNoSnapshot }}</template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.dg {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dg__bar { display: flex; align-items: center; gap: 8px; }
.dg__title { margin: 0; font-size: 14px; }
.dg__chip { font-size: 12px; opacity: 0.85; }
.dg__sync { margin-left: auto; font-size: 12px; cursor: pointer; }
.dg__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.dg__error { color: var(--danger, #dc2626); font-size: 12px; }
.dg__empty { font-size: 12px; opacity: 0.6; }
.dg__nokg { font-size: 12px; color: var(--warning-ink, #92400e); background: rgb(254 243 199); border-radius: 6px; padding: 4px 8px; }
.dg__panel { border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.dg__panel-title { margin: 0 0 4px; font-size: 13px; }
.dg__count { margin-left: 8px; font-size: 11px; opacity: 0.6; }
.dg__row { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; padding: 4px 0; border-bottom: 1px dashed var(--border-color, #e5e7eb); cursor: pointer; font-size: 12px; }
.dg__row:hover { background: rgb(0 0 0 / 3%); }
.dg__cat { font-size: 11px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--border-color, #e5e7eb); flex-shrink: 0; }
.dg__cat[data-cat="dispatch"] { border-color: rgb(147 197 253); background: rgb(219 234 254); }
.dg__cat[data-cat="approval"] { border-color: rgb(134 239 172); background: rgb(220 252 231); }
.dg__cat[data-cat="escalation"] { border-color: rgb(252 165 165); background: rgb(254 226 226); }
.dg__cat[data-cat="gate"] { border-color: rgb(253 186 116); background: rgb(255 237 213); }
.dg__scenario { flex: 1; min-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dg__outcome { font-weight: 600; font-size: 11px; flex-shrink: 0; }
.dg__outcome.is-approved { color: var(--ok, #15803d); }
.dg__outcome.is-rejected { color: var(--danger, #dc2626); }
.dg__outcome.is-deferred { color: var(--warning-ink, #92400e); }
.dg__conf { font-size: 11px; opacity: 0.6; flex-shrink: 0; }
.dg__chain { flex-basis: 100%; margin: 4px 0 2px; padding: 6px 8px; background: rgb(0 0 0 / 3%); border-radius: 6px; display: flex; flex-direction: column; gap: 2px; }
.dg__chain-title { font-size: 11px; opacity: 0.7; margin-bottom: 2px; }
.dg__chain-item { display: flex; gap: 6px; align-items: baseline; font-size: 11px; }
.dg__chain-idx { font-family: monospace; opacity: 0.6; }
.dg__replay-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.dg__label { font-size: 12px; opacity: 0.75; }
.dg__replay-input { font-size: 12px; }
.dg__replay-go { font-size: 12px; cursor: pointer; }
.dg__replay-result { font-size: 12px; opacity: 0.85; }
</style>
