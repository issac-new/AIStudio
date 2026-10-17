<!-- overlay/custom/client/ia2/views/sim/CockpitPanel.vue -->
<!-- 轻量驾驶条（B10，R1/R6——Q1 镜头层解体裁定的「值班台轻量随 B」落位）：
     挂仿真中心壳头、任意签常驻的三徽标行（运行模式档色点/遗留项清算灯/服务异常数）。
     与旗舰签 1（OverviewPanel 全量总览屏）同端点不同密度——run 口径与四个面板
     签同源（useRunContext：query 优先+记忆回落），此处只读不自建输入；无 run=
     提示去签 1。点击整条跳签 1 看全量。 -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchRunState, postureKind, type RunStateResponse } from '../../api/overview'
import { fetchTopology } from '../../api/ops'
import { useRunContext } from '../../composables/useRunContext'

const router = useRouter()

// run 口径与四个面板签同源（useRunContext）：query.run 优先，无 query 回落最近
// 一次成功读取的记忆——本条挂在仿真中心壳头与②需求阶段页，两处都不该要求手打目录名
const { run } = useRunContext()
const state = ref<RunStateResponse | null>(null)
const failServices = ref<number | null>(null)
const loadError = ref('')

const POSTURE_LABEL: Record<string, string> = { strict: 'strict', standard: 'standard', demo: 'demo' }

async function load(): Promise<void> {
  loadError.value = ''
  state.value = null
  failServices.value = null
  if (!run.value) return
  const [st, topo] = await Promise.allSettled([fetchRunState(run.value), fetchTopology()])
  if (st.status === 'fulfilled') state.value = st.value
  else loadError.value = 'run-state 不可达'
  if (topo.status === 'fulfilled') {
    // 端点形状不符（缺 services）按未知处理，渲染「服务未探测」——不抛未处理拒绝
    const svcs = (topo.value as { services?: Record<string, { ok: boolean }> } | null)?.services
    failServices.value = svcs ? Object.values(svcs).filter(s => !s.ok).length : null
  }
}

watch(run, () => { void load() }, { immediate: true })

function goOverview(): void {
  void router.push({ name: 'ia2.sim', query: run.value ? { run: run.value } : {} })
}
</script>

<template>
  <button
    class="cpb"
    type="button"
    data-testid="cpb-strip"
    :title="run ? `运行 ${run}——点击看全量总览屏` : '去运行总览输入运行目录名'"
    @click="goOverview"
  >
    <template v-if="!run">
      <span class="cpb__hint" data-testid="cpb-empty">值班台待命——运行总览签输入运行后，运行模式/遗留项/服务状态在此常驻</span>
    </template>
    <template v-else-if="loadError">
      <span class="cpb__dot cpb__dot--unknown">●</span>
      <span class="cpb__run">{{ run }}</span>
      <span class="cpb__fail" data-testid="cpb-error">{{ loadError }}</span>
    </template>
    <template v-else-if="state">
      <span class="cpb__dot" :class="`cpb__dot--${postureKind(state.posture)}`">●</span>
      <span class="cpb__run">{{ run }}</span>
      <span class="cpb__badge">{{ POSTURE_LABEL[postureKind(state.posture)] ?? state.posture }}</span>
      <span
        class="cpb__badge"
        :class="state.ledger.open > 0 ? 'cpb__badge--red' : 'cpb__badge--green'"
        data-testid="cpb-clearance"
      >遗留项 {{ state.ledger.open > 0 ? `${state.ledger.open} 待处理` : '已清零' }}</span>
      <span
        v-if="failServices !== null"
        class="cpb__badge"
        :class="failServices > 0 ? 'cpb__badge--red' : 'cpb__badge--green'"
        data-testid="cpb-services"
      >服务 {{ failServices > 0 ? `${failServices} 异常` : '4/4' }}</span>
      <span v-else class="cpb__badge cpb__badge--muted">服务未探测</span>
    </template>
    <template v-else>
      <span class="cpb__run">{{ run }}</span>
      <span class="cpb__hint">读取中……</span>
    </template>
  </button>
</template>

<style scoped lang="scss">
.cpb {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
  &:hover { background: rgba(127, 127, 127, 0.08); }
}
.cpb__dot { font-size: 10px; line-height: 1; }
.cpb__dot--strict { color: var(--ia-fresh); }
.cpb__dot--standard { color: var(--ia-stale); }
.cpb__dot--demo { color: var(--ia-compensated); }
.cpb__dot--unknown { color: var(--text-muted); }
.cpb__run { font-family: var(--font-mono); font-size: 11px; }
.cpb__badge {
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(127, 127, 127, 0.12);
}
.cpb__badge--red { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.cpb__badge--green { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.cpb__badge--muted { color: var(--text-muted); }
.cpb__hint { color: var(--text-muted); }
.cpb__fail { color: var(--ia-fail); }
</style>
