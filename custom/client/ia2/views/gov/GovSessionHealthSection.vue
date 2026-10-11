<template>
  <section class="gov-session-health" data-testid="gov-session-health-section">
    <header class="row">
      <h3>会话健康（长会话治理）</h3>
      <button class="btn ghost" @click="refresh">{{ loading ? '加载中…' : '刷新' }}</button>
    </header>
    <p class="lead">每个 agent 会话的上下文水位、累计迭代与环检测处置。水位持续 ≥85% 或空转连击说明该会话已进入长会话衰减区，优先轮换而非续跑。</p>

    <div v-if="error" class="err">{{ error }}</div>

    <div class="cards">
      <div class="card">
        <div class="k">观测会话</div>
        <div class="v">{{ entries.length }}</div>
        <div class="sub">遥测 10 分钟内有效的会话数</div>
      </div>
      <div class="card">
        <div class="k">高水位（≥85%）</div>
        <div class="v">{{ highWatermark.length }}</div>
        <div class="sub">压缩接近失效的会话</div>
      </div>
      <div class="card">
        <div class="k">空转连击（≥4）</div>
        <div class="v">{{ stuckSessions.length }}</div>
        <div class="sub">有调用无产出的会话</div>
      </div>
      <div class="card">
        <div class="k">环检测处置</div>
        <div class="v">{{ runawaySessions.length }}</div>
        <div class="sub">反复触发死循环处置的会话</div>
      </div>
    </div>

    <table v-if="entries.length" class="tbl">
      <thead>
        <tr>
          <th>会话</th><th>平台/模型</th><th class="num">水位</th><th class="num">累计迭代</th>
          <th class="num">回合</th><th class="num">空转连击</th><th class="num">心跳</th>
          <th class="num">环处置</th><th class="num">轮换</th><th>最近活动</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in entries" :key="e.sessionKey" :class="rowClass(e)">
          <td class="mono">{{ e.sessionKey }}</td>
          <td>{{ e.platform || '?' }} / {{ e.model || '?' }}</td>
          <td class="num">{{ e.watermarkPct == null ? '-' : e.watermarkPct + '%' }}</td>
          <td class="num">{{ e.cumApiCalls ?? '-' }}</td>
          <td class="num">{{ e.turns ?? '-' }}</td>
          <td class="num">{{ e.emptyStreak ?? 0 }}</td>
          <td class="num" :title="`间隔 ${e.heartbeat?.interval ?? '-'} 次迭代`">{{ e.heartbeat?.emitted ?? 0 }}</td>
          <td class="num" :title="e.runaway?.signal ? `最近信号 ${e.runaway.signal} @ ${e.runaway.tool ?? '?'}` : ''">{{ e.runaway?.decisions ?? 0 }}</td>
          <td class="num" :title="e.lastRotationReason || ''">{{ e.rotations ?? 0 }}</td>
          <td>{{ ageText(e.tsMs) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="ok">暂无会话遥测（网关未运行或 602 sidecar 未生成——每回合后自动落盘）。</p>

    <table v-if="sessionAnomalies.length" class="tbl">
      <thead><tr><th>级别</th><th>检测器</th><th>主体</th><th>摘要</th></tr></thead>
      <tbody>
        <tr v-for="(a, i) in sessionAnomalies" :key="i" :class="a.severity">
          <td>{{ a.severity }}</td><td>{{ a.detector }}</td><td class="mono">{{ a.subject }}</td><td>{{ a.summary }}</td>
        </tr>
      </tbody>
    </table>

    <p class="hint">数据源：集群巡检快照的会话遥测面（运行时 602 sidecar）；D9 水位 / D10 空转 / D11 环检测判据同巡检。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { request } from '@/api/client'

interface TelemetryEntry {
  sessionKey: string
  tsMs: number
  platform?: string
  model?: string | null
  watermarkPct?: number | null
  turns?: number
  cumApiCalls?: number
  emptyStreak?: number
  rotations?: number
  lastRotationReason?: string
  heartbeat?: { step?: number; emitted?: number; interval?: number }
  runaway?: { signal?: string | null; tool?: string | null; count?: number | null; decisions?: number }
}
interface Anomaly { detector: string; subject: string; severity: string; summary: string }

const loading = ref(false)
const error = ref('')
const entries = ref<TelemetryEntry[]>([])
const anomalies = ref<Anomaly[]>([])

const highWatermark = computed(() => entries.value.filter((e) => (e.watermarkPct ?? 0) >= 85))
const stuckSessions = computed(() => entries.value.filter((e) => (e.emptyStreak ?? 0) >= 4))
const runawaySessions = computed(() => entries.value.filter((e) => (e.runaway?.decisions ?? 0) >= 2))
const sessionAnomalies = computed(() => anomalies.value.filter((a) => a.detector.startsWith('session.')))

function rowClass(e: TelemetryEntry): string {
  if ((e.watermarkPct ?? 0) >= 95 || (e.emptyStreak ?? 0) >= 8 || (e.runaway?.decisions ?? 0) >= 4) return 'high'
  if ((e.watermarkPct ?? 0) >= 85 || (e.emptyStreak ?? 0) >= 4 || (e.runaway?.decisions ?? 0) >= 2 || (e.rotations ?? 0) > 0) return 'warn'
  return ''
}

function ageText(tsMs: number): string {
  const sec = Math.max(0, Math.round((Date.now() - tsMs) / 1000))
  if (sec < 90) return `${sec}s 前`
  if (sec < 5400) return `${Math.round(sec / 60)} 分钟前`
  return `${Math.round(sec / 3600)} 小时前`
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const r = await request('/api/hermes/cluster-inspector/snapshot') as {
      snapshot?: { sessionTelemetry?: { entries?: TelemetryEntry[] } }
      anomalies?: Anomaly[]
    }
    entries.value = [...(r.snapshot?.sessionTelemetry?.entries ?? [])].sort(
      (a, b) => (b.watermarkPct ?? 0) - (a.watermarkPct ?? 0))
    anomalies.value = r.anomalies ?? []
  } catch (e) {
    error.value = String((e as Error).message)
  } finally {
    loading.value = false
  }
}
onMounted(refresh)
</script>

<style scoped>
.gov-session-health { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; align-items: center; gap: 10px; }
.row h3 { margin: 0; font-size: 15px; }
.lead { margin: 0; color: #6b7280; font-size: 13px; }
.btn { border: 1px solid #d0d4dd; border-radius: 6px; padding: 4px 12px; background: #2563eb; color: #fff; cursor: pointer; }
.btn.ghost { background: transparent; color: inherit; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.card { border: 1px solid #e3e6ec; border-radius: 8px; padding: 10px; }
.card .k { font-size: 12px; color: #6b7280; }
.card .v { font-size: 16px; font-weight: 600; margin: 2px 0; }
.card .sub { font-size: 12px; color: #6b7280; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-bottom: 1px solid #eef0f4; padding: 6px 8px; text-align: left; }
.tbl td.num { text-align: right; font-variant-numeric: tabular-nums; }
.tbl td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.tbl tr.high td { color: #b91c1c; }
.tbl tr.warn td { color: #92400e; }
.err { color: #b91c1c; font-size: 13px; }
.ok { color: #047857; }
.hint { color: #9ca3af; font-size: 12px; margin: 0; }
</style>
