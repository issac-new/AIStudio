<!-- overlay/custom/client/ia2/views/sim/CockpitPanel.vue -->
<!-- 轻量驾驶条（B10，R1/R6——Q1 镜头层解体裁定的「驾驶位轻量随 B」落位）：
     挂推演中心壳头、任意签常驻的三徽标行（姿态档色点/清偿门灯/服务异常数）。
     与旗舰签 1（OverviewPanel 全量驾驶屏）同端点不同密度——run 单一事实源=
     /app/sim?run=xxx（query，与旗舰签同源），此处只读不自建输入；无 run=提示
     去签 1。点击整条跳签 1 看全量。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRunState, postureKind, type RunStateResponse } from '../../api/overview'
import { fetchTopology } from '../../api/ops'

const route = useRoute()
const router = useRouter()

const run = computed(() => String(route.query.run ?? '').trim())
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
    failServices.value = Object.values(topo.value.services).filter(s => !s.ok).length
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
    :title="run ? `轮次 ${run}——点击看全量驾驶屏` : '去轮次总览输入轮次目录名'"
    @click="goOverview"
  >
    <template v-if="!run">
      <span class="cpb__hint" data-testid="cpb-empty">驾驶位待命——轮次总览签输入轮次后，姿态/清偿/服务状态在此常驻</span>
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
      >清偿 {{ state.ledger.open > 0 ? `${state.ledger.open} 未清` : '放行' }}</span>
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
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
  &:hover { background: rgba(127, 127, 127, 0.08); }
}
.cpb__dot { font-size: 10px; line-height: 1; }
.cpb__dot--strict { color: #2e9e5b; }
.cpb__dot--standard { color: #c9962e; }
.cpb__dot--demo { color: #9a6ac9; }
.cpb__dot--unknown { color: #999; }
.cpb__run { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
.cpb__badge {
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(127, 127, 127, 0.12);
}
.cpb__badge--red { color: #d33; background: rgba(221, 51, 51, 0.12); }
.cpb__badge--green { color: #2e9e5b; background: rgba(46, 158, 91, 0.12); }
.cpb__badge--muted { color: #999; }
.cpb__hint { color: var(--text-muted, #878c99); }
.cpb__fail { color: #d33; }
</style>
