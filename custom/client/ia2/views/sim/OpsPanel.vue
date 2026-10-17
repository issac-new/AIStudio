<!-- overlay/custom/client/ia2/views/sim/OpsPanel.vue -->
<!-- 签 3 运行观测（B4 工单，R1/R2——设计正本 §二 推演关注面）：四服务红绿点
     （探测失败=红+原因，如实显示）＋调度器健康卡（634 正身在 hermes-agent）
     ＋空闲工作者卡（635）＋运行活性行（驱动/监督器/哨兵——端点未接挂账态）。
     一键并发三端点；任一失败单独呈现，不拖垮整卡。 -->
<script setup lang="ts">
import { ref } from 'vue'
import {
  fetchTopology, fetchDispatcherHealth, fetchSleepingWorkers,
  topologyRows, cliHealthEntries, sleepingRows,
  type ServiceRow, type CliHealthResponse,
} from '../../api/ops'

const loading = ref(false)
const loadError = ref('')
const checkedAt = ref('')
const services = ref<ServiceRow[] | null>(null)
const dispatcher = ref<CliHealthResponse | null>(null)
const sleeping = ref<Array<Record<string, string>> | null>(null)
const sleepingError = ref('')

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  sleepingError.value = ''
  const [topo, disp, sleep] = await Promise.allSettled([fetchTopology(), fetchDispatcherHealth(), fetchSleepingWorkers()])
  if (topo.status === 'fulfilled') {
    services.value = topologyRows(topo.value.services)
    checkedAt.value = topo.value.checkedAt
  } else {
    services.value = null
    loadError.value = (topo.reason as Error).message
  }
  dispatcher.value = disp.status === 'fulfilled' ? disp.value : null
  if (disp.status === 'rejected') loadError.value = loadError.value || (disp.reason as Error).message
  sleeping.value = sleep.status === 'fulfilled' ? sleepingRows(sleep.value) : null
  if (sleep.status === 'rejected') sleepingError.value = (sleep.reason as Error).message
  loading.value = false
}
</script>

<template>
  <div class="ops" data-testid="ops-panel">
    <div class="ops__bar">
      <button class="ops__btn" type="button" data-testid="ops-load" :disabled="loading" @click="load">探测</button>
      <span v-if="checkedAt" class="ops__ts" data-testid="ops-checked-at">探测时刻：{{ checkedAt }}</span>
    </div>
    <p v-if="loadError" class="ops__error" data-testid="ops-error">{{ loadError }}</p>

    <section class="ops__box">
      <h4 class="ops__h">环境拓扑（四服务）</h4>
      <p v-if="!services" class="ops__hint">点「探测」读取（gateway :8801 / studio :8802 / synapse :8008 / hindsight :8888）。</p>
      <ul v-else class="ops__svc-list">
        <li v-for="s in services" :key="s.name" class="ops__svc" :data-testid="`ops-svc-${s.name}`">
          <span class="ops__dot" :class="s.ok ? 'ops__dot--ok' : 'ops__dot--fail'" data-testid="ops-dot">{{ s.ok ? '●' : '●' }}</span>
          <span class="ops__svc-name">{{ s.name }}</span>
          <span class="ops__svc-detail" :class="{ 'ops__svc-detail--fail': !s.ok }">{{ s.detail }}</span>
        </li>
      </ul>
    </section>

    <section class="ops__box">
      <h4 class="ops__h">调度器健康</h4>
      <p v-if="!dispatcher" class="ops__hint">未读取（探测一并拉取；正身在 hermes-agent，界面只消费）。</p>
      <ul v-else class="ops__kv">
        <li v-for="(e, i) in cliHealthEntries(dispatcher)" :key="i" :data-testid="`ops-disp-kv-${i}`" :class="{ 'ops__kv--fail': !dispatcher.ok }">
          <span class="ops__kv-k">{{ e.k }}</span>
          <span class="ops__kv-v">{{ e.v }}</span>
        </li>
      </ul>
    </section>

    <section class="ops__box">
      <h4 class="ops__h">空闲工作者</h4>
      <p v-if="sleepingError" class="ops__error" data-testid="ops-sleeping-error">{{ sleepingError }}</p>
      <p v-else-if="!sleeping" class="ops__hint">未读取。</p>
      <template v-else>
        <p v-if="sleeping.length === 0" class="ops__hint" data-testid="ops-sleeping-empty">无空闲工作者。</p>
        <table v-else class="ops__table" data-testid="ops-sleeping-table">
          <thead>
            <tr><th v-for="(_, k) in sleeping[0]" :key="k">{{ k }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in sleeping" :key="i">
              <td v-for="(v, k) in row" :key="k">{{ v }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <section class="ops__box">
      <h4 class="ops__h">运行活性（驱动/监督器/哨兵）</h4>
      <p class="ops__hint" data-testid="ops-liveness-absent">运行活性端点未接（挂账项）——进程状态与最新日志行时刻待端点就绪后实装，当前如实缺席。</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ops { display: flex; flex-direction: column; gap: 12px; }
.ops__bar { display: flex; gap: 10px; align-items: center; }
.ops__btn {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.ops__ts { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.ops__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.ops__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.ops__box { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; }
.ops__h { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.ops__svc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ops__svc { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
.ops__dot { font-size: 10px; }
.ops__dot--ok { color: var(--ia-fresh); }
.ops__dot--fail { color: var(--ia-fail); }
.ops__svc-name { font-family: var(--font-mono); min-width: 80px; }
.ops__svc-detail { color: var(--text-muted); }
.ops__svc-detail--fail { color: var(--ia-fail); }
.ops__kv { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.ops__kv { font-size: 12px; }
.ops__kv-k { display: inline-block; min-width: 140px; color: var(--text-muted); }
.ops__kv-v { word-break: break-all; }
.ops__kv--fail .ops__kv-v { color: var(--ia-fail); }
.ops__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ops__table th, .ops__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); }
</style>
