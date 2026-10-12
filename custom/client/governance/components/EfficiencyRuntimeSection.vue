<!-- overlay/custom/governance/components/EfficiencyRuntimeSection.vue -->
<!-- 运行时效率机制账本（SoL-Pi 效能轮）：四大机制的运行记录 + Token 四账户。
     数据面：GET /api/token-meter/runtime-ledger（hermes-agent efficiency/ledger.jsonl 聚合）
            + GET /api/studio/usage/stats（近 N 天四账户合计）。
     机制语义：观察归档=大输出转存留柄；召回=obs_recall 分页取回；写后即验=then_run
     融合校验；日志精简=收据制（引文逐字校验，失败原样放行）。 -->
<template>
  <section class="eff-runtime" data-testid="efficiency-runtime-section">
    <header class="row">
      <h3>运行时效率机制</h3>
      <button class="btn ghost" @click="refreshAll">{{ loading ? '加载中…' : '刷新' }}</button>
    </header>
    <p class="lead">
      写后即验、观察归档、分页召回、日志精简四类机制的运行账本。效率以不伤能力为前提：
      精简失败一律原样放行，原始输出全部留档，随时可整页取回核对。
    </p>

    <div v-if="error" class="err">{{ error }}</div>

    <div class="cards">
      <div class="card">
        <div class="k">观察归档（大输出转存）</div>
        <div class="v">{{ mech('observation_archive').count }}</div>
        <div class="sub">省下上下文约 {{ fmtChars(mech('observation_archive').charsSaved) }}（原文已留档）</div>
      </div>
      <div class="card">
        <div class="k">归档召回（分页取回）</div>
        <div class="v">{{ mech('obs_recall').count }}</div>
        <div class="sub">累计取回 {{ mech('obs_recall').linesServed ?? 0 }} 行</div>
      </div>
      <div class="card">
        <div class="k">写后即验（then_run 融合）</div>
        <div class="v">{{ mech('action_fusion').count }}</div>
        <div class="sub">执行 {{ mech('action_fusion').ran ?? 0 }} 次；哈希守卫跳过 {{ mech('action_fusion').skippedGuard ?? 0 }} 次</div>
      </div>
      <div class="card">
        <div class="k">日志精简（收据制）</div>
        <div class="v">{{ mech('evidence_reduce').reduced ?? 0 }}</div>
        <div class="sub">放行 {{ mech('evidence_reduce').passthrough ?? 0 }} 次（校验不过=原文直出）</div>
      </div>
    </div>

    <div class="cards" v-if="usage">
      <div class="card">
        <div class="k">输入 Token（近 {{ usage.period_days }} 天）</div>
        <div class="v">{{ fmtTokens(usage.total_input_tokens) }}</div>
        <div class="sub">模型每次请求读入的新内容</div>
      </div>
      <div class="card">
        <div class="k">输出 Token</div>
        <div class="v">{{ fmtTokens(usage.total_output_tokens) }}</div>
        <div class="sub">模型生成的全部内容</div>
      </div>
      <div class="card">
        <div class="k">缓存读 / 缓存写</div>
        <div class="v">{{ fmtTokens(usage.total_cache_read_tokens) }} / {{ fmtTokens(usage.total_cache_write_tokens) }}</div>
        <div class="sub">缓存命中率 {{ cacheHitPercent }}%</div>
      </div>
      <div class="card">
        <div class="k">估算成本</div>
        <div class="v">{{ usage.total_cost > 0 ? '$' + usage.total_cost.toFixed(2) : '—' }}</div>
        <div class="sub">{{ usage.total_sessions }} 个会话 · {{ usage.total_api_calls }} 次调用</div>
      </div>
    </div>

    <table v-if="ledger && ledger.recent.length" class="tbl">
      <thead>
        <tr><th>时间</th><th>机制</th><th>工具</th><th>结果</th><th class="num">数字</th></tr>
      </thead>
      <tbody>
        <tr v-for="(e, i) in ledger.recent" :key="i">
          <td>{{ timeText(e.ts) }}</td>
          <td>{{ kindText(e.kind) }}</td>
          <td class="mono">{{ e.tool || e.command || '—' }}</td>
          <td>{{ outcomeText(e) }}</td>
          <td class="num">{{ numbersText(e) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="ok">暂无机制事件——归档在大结果出现时自动触发；写后即验与日志精简由模型按需使用（精简需在 cli-config 开启 evidence_reducer）。</p>

    <table v-if="ledger && ledger.sessions.length > 1" class="tbl">
      <thead><tr><th>会话</th><th class="num">事件数</th></tr></thead>
      <tbody>
        <tr v-for="s in ledger.sessions" :key="s.sessionId">
          <td class="mono">{{ s.sessionId }}</td>
          <td class="num">{{ s.events }}</td>
        </tr>
      </tbody>
    </table>

    <p class="hint">数据源：运行时效率账本（efficiency/ledger.jsonl，机制端 best-effort 追加）+ 用量统计端点；方法论对位 NVIDIA SoL-Pi（机制语义与其四机制一一对应，参数与实现为本机实现）。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { request } from '@/api/client'

interface MechanismStats {
  count: number
  charsSaved: number
  ran?: number
  skippedGuard?: number
  execError?: number
  failedRuns?: number
  reduced?: number
  passthrough?: number
  linesServed?: number
}
interface LedgerEvent {
  ts: number
  kind: string
  tool?: string
  outcome?: string
  exit_code?: number
  chars_original?: number
  chars_inline?: number
  chars_receipt?: number
  lines?: number
  command?: string
  session_id?: string | null
}
interface LedgerSummary {
  ok: boolean
  totalEvents: number
  lastEventTs: number | null
  mechanisms: Record<string, MechanismStats>
  recent: LedgerEvent[]
  sessions: { sessionId: string; events: number }[]
}
interface UsageSummary {
  period_days: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_write_tokens: number
  total_cost: number
  total_sessions: number
  total_api_calls: number
}

const loading = ref(false)
const error = ref('')
const ledger = ref<LedgerSummary | null>(null)
const usage = ref<UsageSummary | null>(null)

function mech(kind: string): MechanismStats {
  return ledger.value?.mechanisms?.[kind] ?? { count: 0, charsSaved: 0 }
}

const cacheHitPercent = computed(() => {
  const u = usage.value
  if (!u) return '—'
  const denom = u.total_cache_read_tokens + u.total_input_tokens
  return denom > 0 ? ((u.total_cache_read_tokens / denom) * 100).toFixed(1) : '—'
})

function fmtChars(n: number): string {
  if (!n) return '0 字符'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M 字符'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K 字符'
  return n + ' 字符'
}
function fmtTokens(n: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}
function timeText(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts * 1000) / 1000))
  if (sec < 90) return `${sec}s 前`
  if (sec < 86400) return `${Math.round(sec / 3600)} 小时前`
  return `${Math.round(sec / 86400)} 天前`
}
function kindText(kind: string): string {
  return ({
    observation_archive: '观察归档', obs_recall: '归档召回',
    action_fusion: '写后即验', evidence_reduce: '日志精简',
  } as Record<string, string>)[kind] ?? kind
}
function outcomeText(e: LedgerEvent): string {
  if (e.kind === 'action_fusion') {
    if (e.outcome === 'ran') return e.exit_code === 0 ? '通过' : `校验失败（退出码 ${e.exit_code}）`
    if (e.outcome === 'skipped_guard') return '哈希守卫跳过'
    return '执行异常'
  }
  if (e.kind === 'evidence_reduce') return e.outcome === 'reduced' ? '出收据（引文已核）' : '放行（原文直出）'
  if (e.kind === 'observation_archive') return '已转存留柄'
  return '已取回'
}
function numbersText(e: LedgerEvent): string {
  if (e.kind === 'observation_archive' || e.kind === 'evidence_reduce') {
    const before = e.chars_original ?? 0
    const after = e.kind === 'evidence_reduce' ? e.chars_receipt ?? 0 : e.chars_inline ?? 0
    return before ? `${fmtChars(before)} → ${fmtChars(after)}` : '—'
  }
  if (e.kind === 'obs_recall') return `${e.lines ?? 0} 行`
  if (e.kind === 'action_fusion') return e.outcome === 'ran' ? `${e.exit_code}` : '—'
  return '—'
}

async function refreshAll() {
  loading.value = true
  error.value = ''
  const jobs: Promise<void>[] = [
    request('/api/token-meter/runtime-ledger').then((r) => { ledger.value = r as LedgerSummary })
      .catch((e) => { error.value = `机制账本读取失败：${String((e as Error).message)}` }),
    request('/api/studio/usage/stats?days=30').then((r) => {
      const raw = r as Record<string, unknown>
      usage.value = {
        period_days: Number(raw.period_days ?? 30),
        total_input_tokens: Number(raw.total_input_tokens ?? 0),
        total_output_tokens: Number(raw.total_output_tokens ?? 0),
        total_cache_read_tokens: Number(raw.total_cache_read_tokens ?? 0),
        total_cache_write_tokens: Number(raw.total_cache_write_tokens ?? 0),
        total_cost: Number(raw.total_cost ?? 0),
        total_sessions: Number(raw.total_sessions ?? 0),
        total_api_calls: Number(raw.total_api_calls ?? 0),
      }
    }).catch(() => { usage.value = null }),
  ]
  await Promise.all(jobs)
  loading.value = false
}
onMounted(refreshAll)
</script>

<style scoped>
.eff-runtime { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border: 1px solid #e3e6ec; border-radius: 10px; }
.row { display: flex; align-items: center; gap: 10px; }
.row h3 { margin: 0; font-size: 15px; }
.lead { margin: 0; color: #6b7280; font-size: 13px; }
.btn { border: 1px solid #d0d4dd; border-radius: 6px; padding: 4px 12px; background: #2563eb; color: #fff; cursor: pointer; }
.btn.ghost { background: transparent; color: inherit; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.card { border: 1px solid #e3e6ec; border-radius: 8px; padding: 10px; }
.card .k { font-size: 12px; color: #6b7280; }
.card .v { font-size: 16px; font-weight: 600; margin: 2px 0; }
.card .sub { font-size: 12px; color: #6b7280; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-bottom: 1px solid #eef0f4; padding: 6px 8px; text-align: left; }
.tbl td.num { text-align: right; font-variant-numeric: tabular-nums; }
.tbl td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.err { color: #b91c1c; font-size: 13px; }
.ok { color: #047857; margin: 0; }
.hint { color: #9ca3af; font-size: 12px; margin: 0; }
</style>
