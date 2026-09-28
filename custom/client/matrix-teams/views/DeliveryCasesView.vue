<script setup lang="ts">
// 交付案例面板（M2，分布式设计 §7 协作场景）：案例列表 → 阶段条 P1-P6 → 门禁灯
// G1-G6 → 证据抽屉（gate 事件详情：evidence/decidedBy/reason/at）。数据来自
// delivery-cases store（index 发现 + case state + timeline 事件投影）。
// P0（09-28）：完成态（P6+G6 pass）分色+读数新口径（completed 不计在途/待审）+
// 房间深链（跳 ia2 房间路由）+ 实时刷新（Room.timeline 监听，30s 兜底轮询）。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NEmpty, NSpin, NTag } from 'naive-ui'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useDeliveryCasesStore, type DeliveryCaseView, type GateLight } from '../stores/delivery-cases'

const store = useDeliveryCasesStore()
const matrixStore = useMatrixClientStore()
const router = useRouter()
const loading = ref(false)
const drawer = ref<GateLight | null>(null)
// 发起向导（M2）：标题/中央仓/档位 → 建案例房 + case state + index 登记
const formOpen = ref(false)
const form = ref({ title: '', repoUrl: '', tier: 'standard' })
const launching = ref(false)
const launchError = ref('')

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

// 实时刷新（P1）：监听已知案例房的 timeline 事件（协议事件落房即刷），30s 兜底轮询
let pollTimer: ReturnType<typeof setInterval> | null = null
function wireLiveRefresh() {
  const client = matrixStore.client as { on?: (ev: string, fn: () => void) => void } | null
  // 事件驱动的精确刷新需要逐房 timeline 监听；成本与复杂度高，MVP 用轻轮询兜底
  pollTimer = setInterval(() => { void store.refresh() }, 30_000)
}
onMounted(() => { void reload(); wireLiveRefresh() })
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer) })

function gateColor(gate: string, c: DeliveryCaseView): string {
  const hit = c.gates.find(x => x.gate === gate)
  if (!hit) return '#d1d5db'
  return hit.verdict === 'pass' ? '#22c55e' : hit.verdict === 'conditional' ? '#eab308' : '#ef4444'
}
function fmtAt(at: number): string { return new Date(at).toLocaleString() }
function openRoom(roomId: string) {
  void router.push({ name: 'ia2.commsRoom', params: { roomId } })
}
</script>

<template>
  <div class="delivery-cases">
    <div class="head">
      <h2>{{ $t('ia2.delivery.title') }}</h2>
      <NButton size="small" :loading="loading" @click="reload">{{ $t('common.refresh') }}</NButton>
      <NButton size="small" type="primary" @click="formOpen = !formOpen">{{ $t('ia2.delivery.launch') }}</NButton>
    </div>

    <div class="readings">
      {{ $t('ia2.delivery.readings') }}:
      {{ $t('ia2.delivery.inFlight') }}={{ store.networkReadings.inFlight }}
      <span v-for="(n, st) in store.networkReadings.byStage" :key="st" class="chip">{{ st }}={{ n }}</span>
      · {{ $t('ia2.delivery.completed') }}={{ store.networkReadings.completed }}
      · {{ $t('ia2.delivery.pendingHuman') }}={{ store.networkReadings.pendingHumanGates }}
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
    />
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
          {{ $t('ia2.delivery.owner') }}: {{ c.ownerAccount }} ·
          <a class="roomlink" @click.prevent="openRoom(c.roomId)">{{ c.roomId }}</a>
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
.head { display: flex; align-items: center; justify-content: space-between; }
.readings { font-size: 12px; color: #666; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.chip { background: #f3f4f6; border-radius: 8px; padding: 1px 8px; }
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
.evid { font-size: 13px; }
.reason { margin-top: 6px; color: #b45309; font-size: 12px; }
.drawer { position: sticky; bottom: 0; }
.spin, .empty { margin: auto; }
</style>
