<!-- overlay/custom/client/ia2/views/sim/OpsPanel.vue -->
<!-- 签 3 运行观测（B4 工单，R1/R2——设计正本 §二 推演关注面）：四服务红绿点
     （探测失败=红+原因，如实显示）＋调度器健康卡（634 正身在 hermes-agent）
     ＋空闲工作者卡（635）＋运行活性行（驱动/监督器/哨兵——端点未接挂账态）。
     一键并发三端点；任一失败单独呈现，不拖垮整卡。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchRunState } from '../../api/overview'
import { useRunContext } from '../../composables/useRunContext'
import {
  fetchCapabilities, fetchTopology, fetchDispatcherHealth, fetchSleepingWorkers,
  topologyRows, cliHealthEntries, sleepingRows,
  type ServiceRow, type CliHealthResponse,
} from '../../api/ops'

const { run } = useRunContext('sim')
const loading = ref(false)
const loadError = ref('')
const checkedAt = ref('')
const services = ref<ServiceRow[] | null>(null)
const dispatcher = ref<CliHealthResponse | null>(null)
const sleeping = ref<Array<Record<string, string>> | null>(null)
const sleepingError = ref('')
const sleepingNote = ref('')
const dispatcherNote = ref('')
const liveness = ref<string>('')

/** 技术错误人话化：503/未配置=服务端缺探测命令，不把 env 名甩给用户。 */
function humanizeOpsError(message: string): string {
  if (/SIM_DISPATCHER_HEALTH_CLI/.test(message)) return '调度器健康探测未接入（服务端未配置探测命令）'
  if (/SIM_SLEEPING_WORKERS_CLI/.test(message)) return '空闲工作者探测未接入（服务端未配置探测命令）'
  if (/OBS_SIM_ROOT/.test(message)) return '推演数据目录未配置；请在系统设置·平台连接中完成环境配置'
  return message
}

const SERVICE_LABEL: Record<string, string> = {
  gateway: '网关', studio: '工作台', synapse: '消息服务', hindsight: '记忆服务',
}
function serviceLabel(name: string): string { return SERVICE_LABEL[name] ?? name }

/** 探测结果一句话（主视图只给人话；原始错误留在「技术详情」里）。 */
function serviceStatus(ok: boolean, detail: string, latency: number): string {
  if (ok) return `正常 · ${latency} ms`
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|refused|connect/i.test(detail)) return '未连接'
  if (/timeout|timed out/i.test(detail)) return '响应超时'
  return '不可用'
}

const checkedAtLabel = computed(() => {
  if (!checkedAt.value) return ''
  const d = new Date(checkedAt.value)
  return Number.isNaN(d.getTime()) ? checkedAt.value : d.toLocaleString('zh-CN', { hour12: false })
})

/** 「技术详情」折叠内容：原始探测值，供排障时复制。 */
const technicalRows = computed(() => (services.value ?? []).map(s => ({
  name: s.name,
  label: serviceLabel(s.name),
  detail: s.detail,
})))

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  sleepingError.value = ''
  sleepingNote.value = ''
  dispatcherNote.value = ''
  // 先读能力面：未配置的探测命令不发请求（必然 503 只会制造控制台噪音）
  const caps = await fetchCapabilities().catch(() => null)
  const canDisp = caps ? caps.dispatcherHealth : true
  const canSleep = caps ? caps.sleepingWorkers : true
  const [topo, disp, sleep] = await Promise.allSettled([
    fetchTopology(),
    canDisp ? fetchDispatcherHealth() : Promise.resolve(null),
    canSleep ? fetchSleepingWorkers() : Promise.resolve(null),
  ])
  if (topo.status === 'fulfilled') {
    services.value = topologyRows(topo.value.services)
    checkedAt.value = topo.value.checkedAt
  } else {
    services.value = null
    loadError.value = humanizeOpsError((topo.reason as Error).message)
  }
  dispatcher.value = disp.status === 'fulfilled' ? disp.value : null
  if (!canDisp) dispatcherNote.value = '未接入（服务端未配置调度器探测命令）'
  else if (disp.status === 'rejected') loadError.value = loadError.value || humanizeOpsError((disp.reason as Error).message)
  sleeping.value = sleep.status === 'fulfilled' && sleep.value ? sleepingRows(sleep.value) : null
  if (!canSleep) sleepingNote.value = '未接入（服务端未配置空闲工作者探测命令）'
  else if (sleep.status === 'rejected') sleepingError.value = humanizeOpsError((sleep.reason as Error).message)
  loading.value = false
}

/** 运行状态一句话：有 report_done=已结束；否则按已完成步数呈现进行中。 */
async function loadLiveness(): Promise<void> {
  const name = run.value.trim()
  if (!name) { liveness.value = '还没有选择运行记录'; return }
  try {
    const st = await fetchRunState(name)
    const done = Object.keys(st.steps ?? {}).length
    liveness.value = 'report_done' in (st.steps ?? {})
      ? '运行已结束（报告已生成）'
      : `运行进行中（已完成 ${done} 个步骤）`
  } catch {
    liveness.value = '运行状态暂不可读'
  }
}

onMounted(() => {
  void load()
  void loadLiveness()
})
</script>

<template>
  <div class="ops" data-testid="ops-panel">
    <div class="ops__bar">
      <button class="ops__btn" type="button" data-testid="ops-load" :disabled="loading" @click="load(); loadLiveness()">刷新</button>
      <span v-if="checkedAtLabel" class="ops__ts" data-testid="ops-checked-at">最近探测：{{ checkedAtLabel }}</span>
    </div>
    <p v-if="loadError" class="ops__error" data-testid="ops-error">{{ loadError }}</p>

    <section class="ops__box">
      <h4 class="ops__h">环境拓扑（四服务）</h4>
      <p v-if="!services" class="ops__hint">正在读取服务状态……（网关 / 工作台 / 消息服务 / 记忆服务）</p>
      <ul v-else class="ops__svc-list">
        <li v-for="s in services" :key="s.name" class="ops__svc" :data-testid="`ops-svc-${s.name}`" :title="`${s.name} · ${s.detail}`">
          <span class="ops__dot" :class="s.ok ? 'ops__dot--ok' : 'ops__dot--fail'" data-testid="ops-dot" aria-hidden="true">●</span>
          <span class="ops__svc-name">{{ serviceLabel(s.name) }}</span>
          <span class="ops__svc-detail" :class="{ 'ops__svc-detail--fail': !s.ok }" data-testid="ops-svc-status">{{ serviceStatus(s.ok, s.detail, s.latency_ms) }}</span>
        </li>
      </ul>
      <details v-if="services?.length" class="ops__tech">
        <summary>技术详情</summary>
        <ul>
          <li v-if="checkedAt"><span>探测时刻（原始）</span><code>{{ checkedAt }}</code></li>
          <li v-for="r in technicalRows" :key="r.name"><span>{{ r.label }}（{{ r.name }}）</span><code>{{ r.detail }}</code></li>
        </ul>
      </details>
    </section>

    <section v-if="dispatcher || !dispatcherNote" class="ops__box" data-testid="ops-dispatcher">
      <h4 class="ops__h">调度器健康</h4>
      <p v-if="!dispatcher" class="ops__hint">暂未读取到调度器状态。</p>
      <ul v-else class="ops__kv">
        <li v-for="(e, i) in cliHealthEntries(dispatcher)" :key="i" :data-testid="`ops-disp-kv-${i}`" :class="{ 'ops__kv--fail': !dispatcher.ok }">
          <span class="ops__kv-k">{{ e.k }}</span>
          <span class="ops__kv-v">{{ e.v }}</span>
        </li>
      </ul>
    </section>

    <section v-if="sleepingError || sleeping || !sleepingNote" class="ops__box" data-testid="ops-sleeping">
      <h4 class="ops__h">空闲工作者</h4>
      <p v-if="sleepingError" class="ops__error" data-testid="ops-sleeping-error">{{ sleepingError }}</p>
      <p v-else-if="!sleeping" class="ops__hint">暂未读取到空闲工作者。</p>
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
      <h4 class="ops__h">运行状态</h4>
      <p class="ops__hint" data-testid="ops-liveness">{{ liveness || '正在读取……' }}</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ops { display: flex; flex-direction: column; gap: 14px; }
.ops__bar { display: flex; gap: 12px; align-items: center; }
.ops__btn {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: inherit;
  font-family: inherit;
  font-size: 12.5px;
  padding: 5px 14px;
  cursor: pointer;
  &:hover:not(:disabled) { background: var(--bg-secondary); }
  &:disabled { opacity: 0.4; }
}
.ops__ts { font-size: 12px; color: var(--text-muted); }
.ops__error { color: var(--ia-fail); font-size: 13px; margin: 0; word-break: break-word; }
.ops__hint { color: var(--text-muted); font-size: 13px; margin: 0; }
.ops__box { border: 1px solid var(--border-color); border-radius: 10px; padding: 14px 16px; background: var(--bg-card); }
.ops__h { margin: 0 0 10px; font-size: 13px; font-weight: 650; }
.ops__svc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ops__svc {
  display: flex; gap: 10px; align-items: center;
  padding: 8px 10px; border-radius: 8px; background: var(--bg-secondary);
  font-size: 13px;
}
.ops__dot { font-size: 10px; line-height: 1; }
.ops__dot--ok { color: var(--ia-fresh); }
.ops__dot--fail { color: var(--ia-fail); }
.ops__svc-name { min-width: 76px; font-weight: 500; }
.ops__svc-detail { margin-left: auto; font-size: 12px; color: var(--text-secondary); }
.ops__svc-detail--fail { color: var(--ia-fail); font-weight: 600; }
.ops__tech { margin-top: 10px; font-size: 12px; color: var(--text-muted); }
.ops__tech summary { cursor: pointer; user-select: none; }
.ops__tech ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ops__tech li { display: flex; gap: 8px; justify-content: space-between; }
.ops__tech code { font-family: var(--font-mono); word-break: break-all; color: var(--text-secondary); }
.ops__kv { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ops__kv { font-size: 13px; }
.ops__kv-k { display: inline-block; min-width: 140px; color: var(--text-muted); }
.ops__kv-v { word-break: break-all; }
.ops__kv--fail .ops__kv-v { color: var(--ia-fail); }
.ops__table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ops__table th, .ops__table td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border-color); }
</style>
