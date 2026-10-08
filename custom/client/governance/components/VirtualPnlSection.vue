<!-- overlay/custom/client/governance/components/VirtualPnlSection.vue -->
<!-- 虚拟损益表面板（六文调研轮 E UI 化，BCG AI 虚拟损益表）：per-agent 成本×交付
     单位经济视图 + 全局面 + 日成本异常。delivered=0 不造单价（如实 —）；收益面
     未配置如实注记（benefitNote 服务端单一事实源）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchVirtualPnl, type VirtualPnlDto } from '@/custom/governance/api/incident-suite'

const DAYS_OPTIONS = [7, 30, 90]
const days = ref(30)
const report = ref<VirtualPnlDto | null>(null)
const loading = ref(false)
const error = ref('')

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    report.value = await fetchVirtualPnl(days.value)
  } catch (e) {
    error.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

const LEVEL_TITLES: Record<string, string> = {
  insight: '洞察（只读）', assist: '辅助（关键步确认）', auto: '自动执行',
}

function fmtCost(v: number | null): string {
  if (v == null) return '—'
  if (v === 0) return '0'
  if (v < 0.01) return v.toFixed(4)
  return v.toFixed(2)
}

function fmtNum(v: number | null): string {
  if (v == null) return '—'
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))
}

const sourceNote = computed(() => {
  if (!report.value) return ''
  const s = report.value.sourcesAvailable
  const missing: string[] = []
  if (!s.usageDb) missing.push('用量库')
  if (!s.kanban) missing.push('看板交付')
  if (!s.pricing) missing.push('价目表')
  return missing.length > 0 ? `数据源缺席：${missing.join('、')}（相关列为空不是 0）` : ''
})

onMounted(() => void refresh())
</script>

<template>
  <div class="vp" data-testid="gov-virtual-pnl">
    <div class="vp__bar">
      <h3 class="vp__title">AI 虚拟损益表（成本 × 交付）</h3>
      <select v-model="days" class="vp__days" data-testid="vp-days" @change="refresh()">
        <option v-for="d in DAYS_OPTIONS" :key="d" :value="d">近 {{ d }} 天</option>
      </select>
      <button type="button" class="vp__refresh" data-testid="vp-refresh" @click="refresh()">刷新</button>
    </div>

    <div v-if="error" class="vp__error">{{ error }}</div>
    <div v-if="sourceNote" class="vp__src-note">{{ sourceNote }}</div>

    <template v-if="report">
      <div class="vp__global" data-testid="vp-global">
        全局面：人工干预 {{ report.global.interventions ?? '—' }} 次 · 返工 {{ report.global.reworkHours ?? '—' }} 时 · 24h 内完成 p95 {{ report.global.waitP95SecondsWithinDay != null ? `${Math.round(report.global.waitP95SecondsWithinDay / 60)} 分钟` : '—' }}
      </div>

      <div v-if="report.anomalies.length > 0" class="vp__anomalies" data-testid="vp-anomalies">
        <div v-for="(a, i) in report.anomalies.slice(0, 5)" :key="i" class="vp__anomaly">
          ⚠️ {{ a.profile }} 于 {{ a.day }}：{{ a.note }}
        </div>
      </div>

      <table class="vp__table" data-testid="vp-table">
        <thead><tr>
          <th>Agent</th><th>交付</th><th>在途</th>
          <th>tokens（入/出）</th><th>成本区间（{{ report.currency }}）</th>
          <th>单位成本/件</th><th>价值/件</th><th>最近活跃</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in report.rows" :key="r.profile">
            <td class="vp__profile">{{ r.profile }}</td>
            <td>{{ r.delivered }}</td>
            <td>{{ r.inFlight }}</td>
            <td class="vp__num">{{ fmtNum(r.tokens.input) }} / {{ fmtNum(r.tokens.output) }}</td>
            <td class="vp__num">{{ fmtCost(r.costIdle) }} ~ {{ fmtCost(r.costPeak) }}<template v-if="r.unpricedRows > 0">（{{ r.unpricedRows }} 行未计价）</template></td>
            <td class="vp__num">{{ r.costPerDeliveredPeak != null ? `${fmtCost(r.costPerDeliveredIdle)} ~ ${fmtCost(r.costPerDeliveredPeak)}` : '—（无交付）' }}</td>
            <td class="vp__num">{{ r.valuePerDelivered != null ? fmtCost(r.valuePerDelivered) : '—' }}</td>
            <td class="vp__num">{{ r.lastActiveAt ? new Date(r.lastActiveAt).toLocaleDateString() : '—' }}</td>
          </tr>
          <tr v-if="report.rows.length === 0"><td colspan="8" class="vp__empty-row">暂无数据（用量与看板两源均空）</td></tr>
        </tbody>
      </table>

      <div class="vp__benefit" data-testid="vp-benefit-note">{{ report.benefitNote }}</div>
    </template>
    <div v-else-if="loading" class="vp__empty">…</div>
  </div>
</template>

<style scoped lang="scss">
.vp {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  display: flex; flex-direction: column; gap: 8px;
}
.vp__bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.vp__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted, #878c99); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 4px; }
.vp__days { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 2px 6px; font-size: 10.5px; background: var(--bg-primary, #fff); color: var(--text-primary, inherit); margin-left: auto; }
.vp__refresh { border: none; background: transparent; cursor: pointer; font-size: 12px; color: var(--accent-primary, #3b82f6); }
.vp__error { font-size: 11px; color: #b91c1c; }
.vp__src-note { font-size: 10.5px; color: #b45309; }
.vp__global { font-size: 11px; color: var(--text-muted, #878c99); }
.vp__anomalies { display: flex; flex-direction: column; gap: 2px;
  .vp__anomaly { font-size: 11px; color: #92400e; background: #fef3c7; border-radius: 6px; padding: 3px 8px; } }
.vp__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted, #878c99); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); } }
.vp__profile { font-weight: 600; }
.vp__num { font-family: ui-monospace, monospace; font-size: 10px; white-space: nowrap; }
.vp__empty-row { text-align: center; color: var(--text-muted, #878c99); padding: 12px; }
.vp__benefit { font-size: 10px; color: var(--text-muted, #878c99); }
.vp__empty { font-size: 11px; color: var(--text-muted, #878c99); text-align: center; padding: 12px; }
</style>
