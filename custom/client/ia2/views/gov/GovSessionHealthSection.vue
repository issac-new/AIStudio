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
          <th>会话</th><th>平台/模型</th><th class="num">水位</th><th>压缩档位</th><th class="num">累计迭代</th>
          <th class="num">回合</th><th class="num">空转连击</th><th class="num">心跳</th>
          <th class="num">环处置</th><th class="num">轮换</th><th>最近活动</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in entries" :key="e.sessionKey" :class="rowClass(e)">
          <td class="mono">{{ e.sessionKey }}</td>
          <td>{{ e.platform || '?' }} / {{ e.model || '?' }}</td>
          <td class="num">{{ e.watermarkPct == null ? '-' : e.watermarkPct + '%' }}</td>
          <td>
            <span v-if="e.compaction" :class="['lvl', `lvl--${e.compaction.level}`]"
              :title="`触发线 ${(e.compaction.triggerTokens / 1000).toFixed(0)}K token（容量扣输出预留后的 90% 线），距线 ${(e.compaction.headroomTokens / 1000).toFixed(0)}K；输出预留按 8K 缺省估`">
              {{ levelText(e.compaction.level) }}
            </span>
            <span v-else class="lvl lvl--na" title="遥测未携带上下文绝对值（旧 sidecar 或非回合采样），不出档位">—</span>
          </td>
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

    <p class="hint">数据源：集群巡检快照的会话遥测面（运行时 602 sidecar）；D9 水位 / D10 空转 / D11 环检测判据同巡检。压缩档位=容量扣输出预留（缺省 8K 估）后的 90% 线公式（compact-threshold 域），档位缺省=遥测未带上下文绝对值。</p>
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
  compaction?: { level: 'under' | 'soon' | 'now'; triggerTokens: number; headroomTokens: number; reserveTokens: number }
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

/** 压缩档位（compact-threshold 90% 线公式，服务端投影）：充裕/临近/立即 */
function levelText(level: 'under' | 'soon' | 'now'): string {
  return ({ under: '充裕', soon: '临近', now: '立即' } as const)[level]
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
.lead { margin: 0; color: var(--text-secondary); font-size: 13px; }
.btn { border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 12px; background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; }
.btn.ghost { background: transparent; color: inherit; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.card { border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; }
.card .k { font-size: 12px; color: var(--text-secondary); }
.card .v { font-size: 16px; font-weight: 600; margin: 2px 0; }
.card .sub { font-size: 12px; color: var(--text-secondary); }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-bottom: 1px solid var(--border-color); padding: 6px 8px; text-align: left; }
.tbl td.num { text-align: right; font-variant-numeric: tabular-nums; }
.tbl td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.tbl tr.high td { color: var(--error); }
.tbl tr.warn td { color: var(--ia-stale); }
.lvl { display: inline-block; padding: 1px 8px; border-radius: 9px; font-size: 12px; }
.lvl--under { background: rgba(var(--success-rgb), 0.06); color: var(--success); }
.lvl--soon { background: rgba(var(--warning-rgb), 0.1); color: var(--ia-stale); }
.lvl--now { background: rgba(var(--error-rgb), 0.05); color: var(--error); }
.lvl--na { color: var(--text-muted); }
.err { color: var(--error); font-size: 13px; }
.ok { color: var(--success); }
.hint { color: var(--text-muted); font-size: 12px; margin: 0; }
</style>
