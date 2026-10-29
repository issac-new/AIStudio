<!-- overlay/custom/client/ia2/components/sim/SimFleetBar.vue -->
<!-- 舰队利用率条（自我觉察 spec §4 舰队层，最小产品面）：主行「活跃/在编·饱和度·闲置容量」，
     各域一行小字（在编×活跃×饱和度，title 携近期/最近活动详情）。口径=如实呈现＋闲置容量
     可见，利用率≠KPI（不造无用功、不做考核语义）。
     fail-soft 隐藏（N1）：端点 404/失败/available:false 时整条不渲染、不占布局——宿主日常
     未配推演根（OBS_SIM_ROOT/SIM_ROOT）时零干扰。60s 轮询对齐服务端 30s 缓存档。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchFleetUtilization, type FleetUtilizationResponse } from '../../api/fleet-utilization'

const REFRESH_MS = 60_000

const data = ref<FleetUtilizationResponse | null>(null)

/** 只在端点可用且给出舰队汇总时呈现；其余一律隐藏（不占布局）。 */
const visible = computed(() => data.value?.available === true && !!data.value.fleet)
const fleet = computed(() => (visible.value ? data.value!.fleet! : null))
const domains = computed(() => (visible.value ? data.value!.domains ?? [] : []))

/** 域行 title：近期窗与最近活动秒数（hover 才见，保持条面小字克制）。 */
function domainTitle(label: string, recent: number, lastAgoSec: number | null): string {
  const last = lastAgoSec === null ? '无活动记录' : `最近活动 ${lastAgoSec}s 前`
  return `${label}：近期(1h) ${recent} · ${last}`
}

async function load(): Promise<void> {
  try {
    data.value = await fetchFleetUtilization()
  } catch {
    // fail-soft：端点缺席/网络失败=隐藏条，不上报不占位（观测端点非阻断面）
    data.value = null
  }
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void load()
  timer = setInterval(() => { void load() }, REFRESH_MS)
})
onUnmounted(() => { if (timer !== null) clearInterval(timer) })
</script>

<template>
  <div v-if="visible && fleet" class="sfb" data-testid="sim-fleet-bar">
    <div class="sfb__main">
      <span class="sfb__label">舰队利用率</span>
      <span class="sfb__num" data-testid="sim-fleet-activity">活跃 {{ fleet.active }}/{{ fleet.staffed }}</span>
      <span class="sfb__sep" aria-hidden="true">·</span>
      <span class="sfb__num" data-testid="sim-fleet-saturation">饱和度 {{ fleet.saturationPct }}%</span>
      <span class="sfb__sep" aria-hidden="true">·</span>
      <span class="sfb__num sfb__idle" data-testid="sim-fleet-idle">闲置 {{ fleet.idleCapacity }} 工位</span>
    </div>
    <ul class="sfb__domains" data-testid="sim-fleet-domains">
      <li
        v-for="d in domains"
        :key="d.domain"
        class="sfb__domain"
        :class="{ 'sfb__domain--active': d.active > 0 }"
        :data-testid="`sim-fleet-domain-${d.domain}`"
        :title="domainTitle(d.label, d.recent, d.lastActivityAgoSec)"
      >{{ `${d.label} ${d.staffed} 在编·${d.active} 活跃·${d.saturationPct}%` }}</li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.sfb {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  border: 1px solid var(--border-color); border-radius: 6px;
  padding: 5px 12px; font-size: 12px;
}
.sfb__main { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.sfb__label { font-size: 11px; color: var(--text-muted); }
.sfb__num { font-variant-numeric: tabular-nums; }
.sfb__idle { color: var(--ia-compensated); }
.sfb__sep { color: var(--text-muted); }
.sfb__domains {
  list-style: none; margin: 0; padding: 0;
  display: flex; gap: 4px 10px; flex-wrap: wrap; flex: 1; min-width: 0;
}
.sfb__domain { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.sfb__domain--active { color: inherit; }
</style>
