<!-- overlay/custom/client/ia2/views/sim/DirectorRunDetail.vue -->
<!-- 导演运行详情（2026-10-21 两体系分流）：导演 run（图运行时）的节点/事件/人工闸
     唯一详情页——数据源=图事件流（/api/graph/runs/:id 与 replay），不造第二份
     run 视图；26 步 harness run 仍走原 26 步面板。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import {
  fetchGraphEvents, fetchGraphRun, pendingGatesOf, resumeGraphGate,
  type GraphEvent, type GraphRunState, type PendingGate,
} from '../../api/sim-director'
import {
  directorEventLabel, directorEventTime, directorNodeRows,
  directorRunStatus, directorStatusLabel, type DirectorNodeRow,
} from '../../utils/director-run'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))

/** 参数路由 /app/sim/director/:runId（深链可分享；返回键行为正确） */
const runId = computed(() => {
  const raw = Array.isArray(route.params.runId) ? route.params.runId[0] : route.params.runId
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
})

const runState = ref<GraphRunState | null>(null)
const events = ref<GraphEvent[]>([])
const loading = ref(false)
const loadError = ref('')
const busyGate = ref('')

async function refresh(): Promise<void> {
  if (!runId.value) return
  loading.value = true
  loadError.value = ''
  try {
    const [state, evts] = await Promise.all([fetchGraphRun(runId.value), fetchGraphEvents(runId.value)])
    runState.value = state
    events.value = evts
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => { void refresh() })
watch(runId, () => { void refresh() })

/** 状态以事件流为准（instance.status 可能滞留），投影函数=导演台同源 */
const pendingGates = computed<PendingGate[]>(() => pendingGatesOf(events.value))
const statusLabel = computed(() => directorStatusLabel(
  directorRunStatus(String(runState.value?.instance?.status ?? ''), events.value, pendingGates.value.length),
))
const nodeRows = computed<DirectorNodeRow[]>(() => directorNodeRows(events.value, 200))
const recentEvents = computed(() => events.value.slice(-30))

function backToSim(): void {
  void router.push({ name: 'ia2.sim', query: runId.value ? { run: runId.value } : undefined })
}

function nodeStateLabel(state: 'running' | 'done' | 'failed'): string {
  if (state === 'done') return zh.value ? '已完成' : 'done'
  return directorStatusLabel(state)
}

async function resolveGate(gate: PendingGate, approved: boolean): Promise<void> {
  busyGate.value = gate.interruptId
  try {
    await resumeGraphGate(runId.value, gate.interruptId, approved)
    await refresh()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busyGate.value = ''
  }
}
</script>

<template>
  <div class="srd" data-testid="srd-page">
    <IaBreadcrumb />
    <header class="srd__head">
      <h2 class="srd__title">{{ zh ? '导演运行详情' : 'Director run detail' }}</h2>
      <div class="srd__actions">
        <button type="button" class="srd__btn" data-testid="srd-refresh" :disabled="loading" @click="refresh">{{ loading ? (zh ? '读取中…' : 'Loading…') : (zh ? '刷新' : 'Refresh') }}</button>
        <button type="button" class="srd__btn" data-testid="srd-back" @click="backToSim">{{ zh ? '返回全流程推演' : 'Back' }}</button>
      </div>
    </header>

    <p v-if="!runId" class="srd__note" data-testid="srd-no-run">{{ zh ? '缺少 run 参数——请从导演台或推演页签的「打开导演详情」进入。' : 'Missing run parameter.' }}</p>
    <p v-else-if="loadError" class="srd__error" data-testid="srd-error" :title="loadError">{{ zh ? '运行数据暂不可用。' : 'Run data unavailable.' }}</p>

    <template v-else>
      <section class="srd__card" data-testid="srd-summary">
        <div class="srd__kv"><span class="srd__k">{{ zh ? '运行' : 'Run' }}</span><code class="srd__v">{{ runId }}</code></div>
        <div class="srd__kv"><span class="srd__k">{{ zh ? '状态' : 'Status' }}</span><span class="srd__v" data-testid="srd-status">{{ statusLabel }}</span></div>
        <div class="srd__kv"><span class="srd__k">{{ zh ? '步数' : 'Step' }}</span><span class="srd__v" data-testid="srd-step">{{ runState?.instance?.currentStep ?? events.length }}</span></div>
        <div class="srd__kv"><span class="srd__k">{{ zh ? '事件数' : 'Events' }}</span><span class="srd__v">{{ events.length }}</span></div>
      </section>

      <section class="srd__card">
        <h3 class="srd__h">{{ zh ? '待人介入的人工闸' : 'Pending human gates' }}</h3>
        <p v-if="!pendingGates.length" class="srd__empty">{{ zh ? '没有等待人工应答的闸。' : 'No pending gates.' }}</p>
        <article v-for="g in pendingGates" :key="g.interruptId" class="srd__gate" :data-testid="`srd-gate-${g.interruptId}`">
          <div class="srd__gate-main">
            <strong>{{ g.prompt }}</strong>
            <span class="srd__muted">{{ g.nodeId || '—' }} · {{ g.interruptId }}</span>
          </div>
          <div class="srd__gate-actions">
            <button type="button" class="srd__btn srd__btn--ok" :data-testid="`srd-gate-approve-${g.interruptId}`" :disabled="busyGate === g.interruptId" @click="resolveGate(g, true)">{{ zh ? '批准' : 'Approve' }}</button>
            <button type="button" class="srd__btn srd__btn--no" :data-testid="`srd-gate-reject-${g.interruptId}`" :disabled="busyGate === g.interruptId" @click="resolveGate(g, false)">{{ zh ? '打回' : 'Reject' }}</button>
          </div>
        </article>
      </section>

      <section class="srd__card">
        <h3 class="srd__h">{{ zh ? '节点（按事件流投影）' : 'Nodes (event-projected)' }}</h3>
        <p v-if="!nodeRows.length" class="srd__empty">{{ zh ? '还没有节点事件。' : 'No node events yet.' }}</p>
        <ul v-else class="srd__events" data-testid="srd-nodes">
          <li v-for="(n, i) in nodeRows.slice(-30)" :key="`${n.nodeId}-${i}`" class="srd__event" :data-testid="`srd-node-${i}`">
            <span class="srd__ts">{{ directorEventTime(n.ts) }}</span>
            <span class="srd__kind">{{ n.nodeId }}</span>
            <span class="srd__node">{{ n.step === null ? '—' : `step ${n.step}` }} · {{ nodeStateLabel(n.state) }}</span>
          </li>
        </ul>
      </section>

      <section class="srd__card">
        <h3 class="srd__h">{{ zh ? '最近事件' : 'Recent events' }}</h3>
        <p v-if="!recentEvents.length" class="srd__empty">{{ zh ? '还没有事件记录。' : 'No events yet.' }}</p>
        <ul v-else class="srd__events" data-testid="srd-events">
          <li v-for="(e, i) in recentEvents" :key="`${e.ts}-${i}`" class="srd__event" :data-testid="`srd-event-${i}`">
            <span class="srd__ts">{{ directorEventTime(e.ts) }}</span>
            <span class="srd__kind">{{ directorEventLabel(String(e.kind ?? e.type ?? '')) }}</span>
            <span class="srd__node">{{ e.nodeId || '—' }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.srd { display: flex; flex-direction: column; gap: 12px; height: 100%; padding: 14px 16px; overflow: hidden; }
.srd__head { display: flex; align-items: center; gap: 12px; }
.srd__title { margin: 0; font-size: 15px; }
.srd__actions { margin-left: auto; display: flex; gap: 6px; }
.srd__btn { border: 1px solid var(--border-color); background: transparent; color: inherit; border-radius: 4px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; &:disabled { opacity: .5; } }
.srd__btn--ok { border-color: var(--accent-primary); color: var(--accent-primary); }
.srd__btn--no { border-color: var(--ia-fail); color: var(--ia-fail); }
.srd__note { margin: 0; font-size: 12px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 6px; padding: 10px 12px; }
.srd__error { margin: 0; color: var(--ia-fail); font-size: 12px; }
.srd__card { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.srd__h { margin: 0; font-size: 13px; }
.srd__kv { display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; }
.srd__k { color: var(--text-muted); min-width: 48px; }
.srd__v { word-break: break-all; }
.srd__empty { margin: 0; font-size: 12px; color: var(--text-muted); }
.srd__gate { display: flex; align-items: center; gap: 10px; border: 1px dashed var(--border-color); border-radius: 6px; padding: 8px 10px; }
.srd__gate-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.srd__gate-main strong { font-size: 12.5px; }
.srd__muted { font-size: 11px; color: var(--text-muted); }
.srd__gate-actions { display: flex; gap: 6px; flex-shrink: 0; }
.srd__events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.srd__event { display: flex; gap: 10px; font-size: 11.5px; }
.srd__ts { color: var(--text-muted); min-width: 110px; }
.srd__kind { min-width: 120px; }
.srd__node { color: var(--text-muted); word-break: break-all; }
</style>
