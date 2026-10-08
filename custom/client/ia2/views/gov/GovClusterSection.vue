<template>
  <section class="gov-cluster" data-testid="gov-cluster-section">
    <header class="row">
      <h3>集群健康（cluster-inspector）</h3>
      <button class="btn" :disabled="running" @click="runInspect">{{ running ? '巡检中…' : '立即巡检' }}</button>
      <button class="btn ghost" @click="refresh">刷新</button>
    </header>

    <div v-if="error" class="err">{{ error }}</div>

    <div class="cards">
      <div class="card">
        <div class="k">网关</div>
        <div class="v">{{ gatewayState }}</div>
        <div class="sub">{{ gwSub }}</div>
      </div>
      <div class="card">
        <div class="k">会话槽位</div>
        <div class="v">{{ activeAgents }} 活跃 / {{ sessionsLive }} 注册</div>
        <div class="sub">{{ sessionsSub }}</div>
      </div>
      <div class="card">
        <div class="k">看板诊断</div>
        <div class="v">{{ kanbanOk ? '已接线' : '未接线' }}</div>
        <div class="sub">僵尸 worker 行 {{ anomalyCount('kanban.stale-worker') }}</div>
      </div>
      <div class="card">
        <div class="k">本轮异常</div>
        <div class="v">{{ anomalies.length }} 项（发 {{ lastRun?.emitted ?? 0 }} / 冷却 {{ lastRun?.suppressedByCooldown ?? 0 }}）</div>
        <div class="sub">{{ lastRunAt }}</div>
      </div>
    </div>

    <table v-if="anomalies.length" class="tbl">
      <thead><tr><th>级别</th><th>检测器</th><th>主体</th><th>摘要</th></tr></thead>
      <tbody>
        <tr v-for="(a, i) in anomalies" :key="i" :class="a.severity">
          <td>{{ a.severity }}</td><td>{{ a.detector }}</td><td>{{ a.subject }}</td><td>{{ a.summary }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="ok">最近一轮巡检无异常。</p>

    <p class="hint">周期巡检每 60s（CLUSTER_INSPECTOR=off 关闭）；事件入治理事件流 system 域（「审计与变更 → 治理事件流」可查历史）。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { request } from '@/api/client'

interface Anomaly { detector: string; subject: string; severity: string; summary: string }
interface Snapshot { gateway?: { ok?: boolean; error?: string; state?: Record<string, unknown> }; sessions?: { live?: number; entries?: number }; kanban?: { ok?: boolean } }
const loading = ref(false)
const running = ref(false)
const error = ref('')
const anomalies = ref<Anomaly[]>([])
const snapshot = ref<Snapshot | null>(null)
const lastRun = ref<{ ts?: number; emitted?: number; suppressedByCooldown?: number } | null>(null)

const gatewayState = computed(() => String(snapshot.value?.gateway?.state?.gateway_state ?? (snapshot.value?.gateway?.ok ? 'running(探测)' : '未知')))
const gwSub = computed(() => snapshot.value?.gateway?.error ?? `探测 ${snapshot.value?.gateway?.probe?.status ?? '-'}`)
const activeAgents = computed(() => Number(snapshot.value?.gateway?.state?.active_agents ?? 0))
const sessionsLive = computed(() => Number(snapshot.value?.sessions?.live ?? 0))
const sessionsSub = computed(() => `注册条目 ${snapshot.value?.sessions?.entries ?? 0}`)
const kanbanOk = computed(() => Boolean(snapshot.value?.kanban?.ok))
const lastRunAt = computed(() => (lastRun.value?.ts ? new Date(lastRun.value.ts!).toLocaleString() : '未运行'))
function anomalyCount(det: string) { return anomalies.value.filter((a) => a.detector === det).length }

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const r = await request('GET', '/api/hermes/cluster-inspector/snapshot')
    anomalies.value = (r as { anomalies?: Anomaly[] }).anomalies ?? []
    snapshot.value = (r as { snapshot?: Snapshot }).snapshot ?? null
    lastRun.value = (r as { inspector?: { lastRunAt?: number } } & Record<string, unknown>)?.lastRun ?? (r as Record<string, unknown>).outcome ?? null
  } catch (e) {
    error.value = String((e as Error).message)
  } finally {
    loading.value = false
  }
}
async function runInspect() {
  running.value = true
  error.value = ''
  try {
    const r = await request('POST', '/api/hermes/cluster-inspector/run')
    const o = (r as { outcome?: { anomalies?: Anomaly[]; emitted?: number; suppressedByCooldown?: number; ts?: number } }).outcome
    anomalies.value = o?.anomalies ?? []
    lastRun.value = o ?? null
    snapshot.value = (r as { snapshot?: Snapshot }).snapshot ?? null
  } catch (e) {
    error.value = String((e as Error).message)
  } finally {
    running.value = false
  }
}
onMounted(refresh)
</script>

<style scoped>
.gov-cluster { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; align-items: center; gap: 10px; }
.row h3 { margin: 0; font-size: 15px; }
.btn { border: 1px solid #d0d4dd; border-radius: 6px; padding: 4px 12px; background: #2563eb; color: #fff; cursor: pointer; }
.btn.ghost { background: transparent; color: inherit; }
.btn:disabled { opacity: .5; cursor: default; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.card { border: 1px solid #e3e6ec; border-radius: 8px; padding: 10px; }
.card .k { font-size: 12px; color: #6b7280; }
.card .v { font-size: 16px; font-weight: 600; margin: 2px 0; }
.card .sub { font-size: 12px; color: #6b7280; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-bottom: 1px solid #eef0f4; padding: 6px 8px; text-align: left; }
.tbl tr.high td { color: #b91c1c; }
.tbl tr.warn td { color: #92400e; }
.err { color: #b91c1c; font-size: 13px; }
.ok { color: #047857; }
.hint { color: #9ca3af; font-size: 12px; margin: 0; }
</style>
