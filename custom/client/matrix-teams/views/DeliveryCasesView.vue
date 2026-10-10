<script setup lang="ts">
// 交付案例面板（M2，分布式设计 §7 协作场景）：案例列表 → 阶段条 P1-P6 → 门禁灯
// G1-G6 → 证据抽屉（gate 事件详情：evidence/decidedBy/reason/at）。数据来自
// delivery-cases store（index 发现 + case state + timeline 事件投影）。
// P0（09-28）：完成态（P6+G6 pass）分色+读数新口径（completed 不计在途/待审）+
// 房间深链（跳 ia2 房间路由）+ 实时刷新（Room.timeline 监听，30s 兜底轮询）。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NButton, NCard, NEmpty, NSpin, NTag } from 'naive-ui'
import { useDeliveryCasesStore, type DeliveryCaseView, type GateLight } from '../stores/delivery-cases'
import { useQGateBridgeStore } from '../stores/qgate-bridge'
import { fetchQgateVerdicts } from '@/custom/governance/api/governance'

// v1.31.1 吸收轮：每案例"同步 QGate 判定"动作——governance qgate-verdicts →
// qgate-bridge 逐门 delivery.gate 事件（机器执法判定流闭环，此前桥无生产调用方）。
const store = useDeliveryCasesStore()
const bridge = useQGateBridgeStore()
const router = useRouter()
const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const loading = ref(false)
const drawer = ref<GateLight | null>(null)
// 发起向导（M2）：标题/中央仓/档位 → 建案例房 + case state + index 登记
const formOpen = ref(false)
const form = ref({ title: '', repoUrl: '', tier: 'standard' })
const launching = ref(false)
const launchError = ref('')
// QGate 同步态（逐案例）：caseId → running / 结果行
const syncing = ref<Record<string, boolean>>({})
const syncResult = ref<Record<string, string>>({})

async function syncQgateVerdicts(c: DeliveryCaseView) {
  syncing.value = { ...syncing.value, [c.caseId]: true }
  try {
    const { verdicts } = await fetchQgateVerdicts()
    if (verdicts.length === 0) {
      syncResult.value = { ...syncResult.value, [c.caseId]: zh.value ? '无 QGate 判定在档（先跑 qgate run）' : 'no qgate runs on record' }
      return
    }
    const res = await bridge.syncVerdictsToCase(c.caseId, verdicts)
    if (res.error === 'no-client') syncResult.value = { ...syncResult.value, [c.caseId]: zh.value ? 'Matrix 未连接' : 'matrix client not connected' }
    else if (res.error === 'no-room') syncResult.value = { ...syncResult.value, [c.caseId]: zh.value ? '无可上报房间（案例房/注册房缺失）' : 'no room to report to' }
    else syncResult.value = { ...syncResult.value, [c.caseId]: zh.value ? `已上报 ${res.sent} 门${res.failed > 0 ? `，失败 ${res.failed}` : ''}` : `reported ${res.sent} gates${res.failed > 0 ? `, ${res.failed} failed` : ''}` }
  } catch (e) {
    syncResult.value = { ...syncResult.value, [c.caseId]: e instanceof Error ? e.message : String(e) }
  } finally {
    syncing.value = { ...syncing.value, [c.caseId]: false }
  }
}

async function reload() {
  loading.value = true
  try { await store.refresh() } finally { loading.value = false }
}

async function submitCase() {
  if (!form.value.title.trim() || !form.value.repoUrl.trim()) return
  launching.value = true
  launchError.value = ''
  try {
    await store.createCase({ ...form.value })
    formOpen.value = false
    form.value = { title: '', repoUrl: '', tier: 'standard' }
  } catch (err) {
    launchError.value = err instanceof Error ? err.message : String(err)
  } finally {
    launching.value = false
  }
}

// 实时刷新（P1 升级）：事件驱动已下沉 store（Room.timeline 协议事件 500ms 去抖，
// review-center 同款模式）；视图只保留 60s 兜底轮询（防 index 房未入 getRooms 的边缘态）。
let pollTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void reload()
  pollTimer = setInterval(() => { void store.refresh() }, 60_000)
})
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer) })

function gateColor(gate: string, c: DeliveryCaseView): string {
  const hit = c.gates.find(x => x.gate === gate)
  if (!hit) return '#d1d5db'
  return hit.verdict === 'pass' ? '#22c55e' : hit.verdict === 'conditional' ? '#eab308' : '#ef4444'
}
function fmtAt(at: number): string { return new Date(at).toLocaleString() }
/** U8 降噪（推演审计二轮）：matrix 全形 ID（!room:host / @user:host）→ 短形展示，悬停见全形。 */
function shortMatrixId(id: string | null | undefined): string {
  if (!id) return ''
  if (id.startsWith('@')) return '@' + id.slice(1).split(':')[0]
  return id.replace(/^!/, '').split(':')[0].slice(0, 10)
}
function openRoom(roomId: string) {
  void router.push({ name: 'ia2.commsRoom', params: { roomId } })
}
</script>

<template>
  <div class="delivery-cases">
    <div class="head">
      <h2>{{ $t('ia2.delivery.title') }}</h2>
      <div class="head__actions">
        <NButton size="small" :loading="loading" @click="reload">{{ $t('common.refresh') }}</NButton>
        <NButton size="small" type="primary" @click="formOpen = !formOpen">{{ $t('ia2.delivery.launch') }}</NButton>
      </div>
    </div>

    <div class="readings">
      <span class="readings__label">{{ $t('ia2.delivery.readings') }}</span>
      <span class="chip"><em>{{ store.networkReadings.inFlight }}</em>{{ $t('ia2.delivery.inFlight') }}</span>
      <span v-for="(n, st) in store.networkReadings.byStage" :key="st" class="chip"><em>{{ n }}</em>{{ st }}</span>
      <span class="chip"><em>{{ store.networkReadings.completed }}</em>{{ $t('ia2.delivery.completed') }}</span>
      <span class="chip"><em>{{ store.networkReadings.pendingHumanGates }}</em>{{ $t('ia2.delivery.pendingHuman') }}</span>
    </div>

    <NCard v-if="formOpen" size="small" :title="$t('ia2.delivery.launch')">
      <div class="form">
        <input v-model="form.title" :placeholder="$t('ia2.delivery.formTitle')" class="in" />
        <input v-model="form.repoUrl" :placeholder="$t('ia2.delivery.formRepo')" class="in" />
        <select v-model="form.tier" class="in">
          <option value="lite">lite</option>
          <option value="standard">standard</option>
          <option value="compliance">compliance</option>
        </select>
        <NButton size="small" type="primary" :loading="launching" :disabled="!form.title.trim() || !form.repoUrl.trim()" @click="submitCase">
          {{ $t('ia2.delivery.submit') }}
        </NButton>
        <div v-if="launchError" class="reason">{{ launchError }}</div>
      </div>
    </NCard>

    <NSpin v-if="loading && !store.loaded" class="spin" />
    <NEmpty
      v-else-if="store.cases.length === 0"
      :description="$t('ia2.delivery.empty')"
      class="empty"
    >
      <template #extra>
        <NButton size="small" type="primary" @click="formOpen = !formOpen">{{ $t('ia2.delivery.launch') }}</NButton>
      </template>
    </NEmpty>
    <div v-else class="list">
      <NCard
        v-for="c in store.cases"
        :key="c.roomId"
        size="small"
        class="case"
        :class="{ 'case--done': c.completed }"
        :title="c.title"
      >
        <template #header-extra>
          <NTag v-if="c.completed" size="small" type="success" :bordered="false">{{ $t('ia2.delivery.completed') }}</NTag>
          <NTag size="small" :bordered="false">{{ c.tier }}</NTag>
          <NTag size="small" type="info" :bordered="false">{{ c.caseId }}</NTag>
          <NButton
            size="tiny"
            :loading="syncing[c.caseId]"
            data-testid="qgate-sync-btn"
            @click="syncQgateVerdicts(c)"
          >{{ zh ? '同步 QGate 判定' : 'Sync QGate' }}</NButton>
        </template>
        <div class="stagebar">
          <span
            v-for="st in store.DELIVERY_STAGES"
            :key="st"
            class="stage"
            :class="{ current: c.stage === st, done: c.stagesDone.includes(st) }"
          >{{ st }}</span>
        </div>
        <div class="gates">
          <span
            v-for="g in store.DELIVERY_GATES.slice(0, 6)"
            :key="g"
            class="light"
            :style="{ background: gateColor(g, c) }"
            :title="g"
            @click="drawer = c.gates.find(x => x.gate === g) ?? null"
          >{{ g }}</span>
        </div>
        <div class="meta">
          {{ $t('ia2.delivery.owner') }}: <span :title="c.ownerAccount">{{ shortMatrixId(c.ownerAccount) }}</span> ·
          <a class="roomlink" :title="c.roomId" @click.prevent="openRoom(c.roomId)">{{ shortMatrixId(c.roomId) }}</a>
          <span v-if="syncResult[c.caseId]" class="syncnote" :data-testid="`qgate-sync-note-${c.caseId}`">{{ syncResult[c.caseId] }}</span>
        </div>
      </NCard>
    </div>

    <NCard v-if="drawer" size="small" class="drawer" :title="drawer.gate">
      <template #header-extra>
        <NTag size="small" :type="drawer.verdict === 'pass' ? 'success' : drawer.verdict === 'conditional' ? 'warning' : 'error'">
          {{ drawer.verdict }}
        </NTag>
      </template>
      <div class="evid">{{ drawer.evidence }}</div>
      <div class="meta">{{ drawer.decidedBy }} · {{ fmtAt(drawer.at) }}</div>
      <div v-if="drawer.reason" class="reason">{{ drawer.reason }}</div>
      <NButton size="tiny" @click="drawer = null">{{ $t('common.close') }}</NButton>
    </NCard>
  </div>
</template>

<style scoped>
.delivery-cases { padding: 16px; display: flex; flex-direction: column; gap: 12px; height: 100%; overflow: auto; }
.head { display: flex; align-items: center; gap: 8px; }
.head__actions { margin-left: auto; display: flex; gap: 8px; }
.readings { font-size: 12px; color: #666; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.readings__label { color: #999; }
.chip { background: #f3f4f6; border-radius: 8px; padding: 1px 8px; }
.chip em { font-style: normal; font-weight: 700; color: #111; margin-right: 4px; font-variant-numeric: tabular-nums; }
.form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.in { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
.list { display: flex; flex-direction: column; gap: 10px; }
.case--done { opacity: 0.72; border-color: #bbf7d0; }
.roomlink { color: var(--color-primary, #3b82f6); cursor: pointer; text-decoration: underline dotted; }
.stagebar { display: flex; gap: 6px; margin-bottom: 8px; }
.stage { padding: 2px 8px; border-radius: 4px; background: #eee; font-size: 12px; }
.stage.done { background: #dcfce7; }
.stage.current { background: #111; color: #fff; }
.gates { display: flex; gap: 8px; }
.light { width: 28px; height: 20px; border-radius: 10px; color: #fff; font-size: 11px;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.meta { color: #888; font-size: 12px; margin-top: 6px; }
.syncnote { margin-left: 8px; color: #2563eb; font-size: 11px; }
.evid { font-size: 13px; }
.reason { margin-top: 6px; color: #b45309; font-size: 12px; }
.drawer { position: sticky; bottom: 0; }
.spin, .empty { margin: auto; }
.empty { padding: 48px 0; }
</style>
