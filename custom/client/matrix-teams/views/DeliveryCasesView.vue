<script setup lang="ts">
// 交付案例面板（M2，分布式设计 §7 协作场景）：案例列表 → 阶段条 P1-P6 → 门禁灯
// G1-G6 → 证据抽屉（gate 事件详情：evidence/decidedBy/reason/at）。数据来自
// delivery-cases store（index 发现 + case state + timeline 事件投影）。
import { onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NSpin, NTag } from 'naive-ui'
import { useDeliveryCasesStore, type GateLight } from '../stores/delivery-cases'

const store = useDeliveryCasesStore()
const loading = ref(false)
const drawer = ref<GateLight | null>(null)

async function reload() {
  loading.value = true
  try { await store.refresh() } finally { loading.value = false }
}
onMounted(reload)

function gateColor(g: string): string {
  const hit = store.cases.flatMap(c => c.gates).find(x => x.gate === g)
  if (!hit) return '#9ca3af'
  return hit.verdict === 'pass' ? '#22c55e' : hit.verdict === 'conditional' ? '#eab308' : '#ef4444'
}
function stageDone(st: string): boolean {
  return store.cases.some(c => c.stage === st || c.stagesDone.includes(st))
}
function fmtAt(at: number): string { return new Date(at).toLocaleString() }
</script>

<template>
  <div class="delivery-cases">
    <div class="head">
      <h2>{{ $t('ia2.delivery.title') }}</h2>
      <NButton size="small" :loading="loading" @click="reload">{{ $t('common.refresh') }}</NButton>
    </div>

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
        :title="c.title"
      >
        <template #header-extra>
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
            :style="{ background: gateColor(g) }"
            :title="g"
            @click="drawer = c.gates.find(x => x.gate === g) ?? null"
          >{{ g }}</span>
        </div>
        <div class="meta">{{ $t('ia2.delivery.owner') }}: {{ c.ownerAccount }} · {{ c.roomId }}</div>
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
.list { display: flex; flex-direction: column; gap: 10px; }
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
