<!-- overlay/custom/client/ide/components/IdeCliSessions.vue -->
<!-- zcode CLI 会话兼容展示（2026-10-19 用户需求批）：IDE 工作区落地面列出
     zcode CLI（终端）最近会话——与 IDE 会话同屏可见，标「zcode CLI」源徽。
     行动作：「终端继续」= 在该会话的工作区目录开终端并运行 zcode（依赖用户
     PATH 中的 zcode 命令）；「复制 ID」供 CLI --resume 等场景。
     2026-10-21 用量账本轮（dsh-context 数据面吸收）：行内加用量徽（轮数/
     计费 token）；「账单」展开逐轮用量表（真实 TTFT/状态/轮内模型分解/成本）
     与工具调用时间线——数据源 /api/ide/zcode-usage/*（只读 ~/.zcode/cli/db
     用量表）。子代理会话被 CLI 列表端点排除，其用量在 MetricsPopover 账本
     分区的「子代理」来源构成里可见。老服务端无此端点时徽章静默缺席。
     数据源 GET /api/ide/zcode-cli/sessions（只读 ~/.zcode/cli/db）；无库=空态。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchCliSessions, launchDevtool, type CliSession } from '../api/devtools'
import { zcodeUsageApi, type ZcodeUsageRound, type ZcodeUsageSession, type ZcodeUsageTool } from '../api/zcodeUsage'
import { estimateCostUsd, formatCostUsd, isSubscriptionProvider } from '../utils/modelPricing'
import { filterCliSessions } from '../utils/sessionProjects'
import { showToast } from '../utils/toast'

const props = withDefaults(defineProps<{
  boxed?: boolean
  /** 跟随侧栏三段视图：active=24h 内活跃；done=更早；workspace=全部 */
  view?: 'active' | 'done' | 'workspace'
  /** 跟随侧栏搜索（命中标题或工作区路径） */
  query?: string
  /** 外部注入会话列表（侧栏单一数据源场景；不传则组件自拉） */
  sessions?: CliSession[] | null
}>(), { boxed: true, view: 'workspace', query: '', sessions: null })

const emit = defineEmits<{ (e: 'count', n: number): void }>()

const note = ref('')
const loadError = ref('')
const loading = ref(true)
const busyId = ref('')

const ALL = ref<CliSession[]>([])

// ── 用量账本（fail-soft：端点缺席/失败=徽章不出现，不影响会话列表）──
const usageById = ref<Map<string, ZcodeUsageSession>>(new Map())
const expandedId = ref('')
const billState = ref<'loading' | 'ok' | 'error'>('ok')
const billRounds = ref<ZcodeUsageRound[]>([])
const billTools = ref<ZcodeUsageTool[]>([])

function usageOf(s: CliSession): ZcodeUsageSession | null {
  return usageById.value.get(s.id) ?? null
}

async function load(): Promise<void> {
  if (props.sessions) { ALL.value = props.sessions; return } // 外部注入：不双拉
  loading.value = true
  loadError.value = ''
  try {
    // 拉宽到 30：视图/搜索过滤后仍有余量（界面只展示过滤结果）
    const res = await fetchCliSessions(30)
    ALL.value = res.sessions
    note.value = res.note ?? ''
  } catch (e) {
    ALL.value = []
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
  // 用量徽（并行、静默失败：老服务端无此端点=无徽章）
  try {
    const usage = await zcodeUsageApi.sessions(100)
    usageById.value = new Map((usage.sessions ?? []).map(s => [s.id, s]))
  } catch { /* fail-soft */ }
}

watch(() => props.sessions, v => { if (v) { ALL.value = v; loading.value = false } }, { immediate: true })

/** 视图 + 搜索过滤（共享 util——侧栏混排与独立分组同口径）。 */
const sessions = computed(() => filterCliSessions(ALL.value, props.view, props.query, Date.now()))

watch(sessions, list => emit('count', list.length), { immediate: true })

async function resumeInTerminal(s: CliSession): Promise<void> {
  busyId.value = s.id
  try {
    await launchDevtool('terminal-zcode', s.directory || undefined)
  } catch (e) {
    showToast((e as Error).message, 'error')
  } finally {
    busyId.value = ''
  }
}

async function copyId(s: CliSession): Promise<void> {
  try {
    await navigator.clipboard.writeText(s.id)
    showToast('会话 ID 已复制', 'info')
  } catch {
    showToast('剪贴板不可用——请手动复制', 'error')
  }
}

/** 「账单」展开：逐轮用量 + 工具时间线（再点收起）。 */
async function toggleBill(s: CliSession): Promise<void> {
  if (expandedId.value === s.id) {
    expandedId.value = ''
    return
  }
  expandedId.value = s.id
  billState.value = 'loading'
  billRounds.value = []
  billTools.value = []
  try {
    const [r, t] = await Promise.all([
      zcodeUsageApi.rounds(s.id),
      zcodeUsageApi.tools(s.id),
    ])
    billRounds.value = r.rounds ?? []
    billTools.value = t.tools ?? []
    billState.value = 'ok'
  } catch (e) {
    billState.value = 'error'
    showToast(`读取会话账单失败：${(e as Error).message}`, 'error')
  }
}

/** 账单成本：逐轮按模型估价求和（订阅 provider 不计；未收录不计）。 */
const billCost = computed<number | null>(() => {
  let sum = 0
  let any = false
  for (const r of billRounds.value) {
    for (const m of r.models) {
      if (isSubscriptionProvider(m.provider)) continue
      const cost = estimateCostUsd(m.model, {
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheReadTokens: m.cacheReadTokens,
        cacheWriteTokens: m.cacheWriteTokens,
      })
      if (cost != null) { sum += cost; any = true }
    }
  }
  return any ? sum : null
})

/** 账单中是否有订阅 provider（显示说明：金额不含包月计划）。 */
const billHasSubscription = computed(() =>
  billRounds.value.some(r => r.models.some(m => isSubscriptionProvider(m.provider))))

function fmtRelative(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  return day < 30 ? `${day} 天前` : new Date(ts).toLocaleDateString('zh-CN')
}

function fmtClock(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function fmtDur(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

function fmtBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}kB`
  return `${n}B`
}

/** 工作区短名（末两层），完整路径进 title。 */
function dirShort(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path
}

const hasAny = computed(() => sessions.value.length > 0)

onMounted(() => { void load() })
</script>

<template>
  <section class="ide-cli-sessions" :class="{ 'ide-cli-sessions--boxed': boxed }" data-testid="ide-cli-sessions">
    <div class="ide-cli-sessions__head">
      <h3 v-if="boxed" class="ide-cli-sessions__title">zcode CLI 会话</h3>
      <span v-if="boxed" class="ide-cli-sessions__badge" title="在终端 zcode CLI 里创建的会话，与 IDE 会话同库不同入口">zcode CLI</span>
      <button v-if="boxed" type="button" class="ide-cli-sessions__refresh" data-testid="ide-cli-sessions-refresh" @click="load">刷新</button>
    </div>

    <p v-if="loadError" class="ide-cli-sessions__hint ide-cli-sessions__hint--err">{{ loadError }}</p>
    <p v-else-if="loading" class="ide-cli-sessions__hint">正在读取 zcode CLI 会话……</p>
    <p v-else-if="ALL.length === 0" class="ide-cli-sessions__hint">{{ note || '还没有 zcode CLI 会话——在终端运行 zcode 开始一次会话，之后会出现在这里。' }}</p>
    <p v-else-if="sessions.length === 0" class="ide-cli-sessions__hint">{{ view === 'active' ? '24 小时内没有活跃的 zcode CLI 会话（切到「更早」看全部）。' : view === 'done' ? '没有超过 24 小时的 zcode CLI 会话。' : '没有匹配搜索的 zcode CLI 会话。' }}</p>

    <ul v-else class="ide-cli-sessions__list">
      <li v-for="s in sessions" :key="s.id" class="ide-cli-sessions__row" :data-testid="`ide-cli-session-${s.id}`">
        <div class="ide-cli-sessions__rowline">
          <div class="ide-cli-sessions__main">
            <span class="ide-cli-sessions__name" :title="s.title">{{ s.title }}</span>
            <span class="ide-cli-sessions__meta">
              <span v-if="s.directory" :title="s.directory">{{ dirShort(s.directory) }}</span>
              <span> · {{ fmtRelative(s.timeUpdated) }}</span>
              <span
                v-if="usageOf(s)"
                class="ide-cli-sessions__usage"
                :title="`轮 ${usageOf(s)!.turns}（错 ${usageOf(s)!.turnErrors}）· 模型调用 ${usageOf(s)!.modelCalls} · 工具 ${usageOf(s)!.toolCalls} · 计费 ${fmtTokens(usageOf(s)!.billedTokens)} token（输入+输出+缓存读写）`"
              > · {{ usageOf(s)!.turns }} 轮 · {{ fmtTokens(usageOf(s)!.billedTokens) }} tok</span>
            </span>
          </div>
          <div class="ide-cli-sessions__acts">
            <button
              v-if="usageOf(s)"
              type="button"
              class="ide-cli-sessions__btn"
              :class="{ 'ide-cli-sessions__btn--on': expandedId === s.id }"
              :data-testid="`ide-cli-bill-${s.id}`"
              title="展开逐轮用量与工具调用时间线（数据来自本机 zcode 用量库）"
              @click="toggleBill(s)"
            >账单</button>
            <button
              type="button"
              class="ide-cli-sessions__btn ide-cli-sessions__btn--primary"
              :data-testid="`ide-cli-resume-${s.id}`"
              :disabled="busyId === s.id"
              title="在该会话的工作区打开终端并运行 zcode"
              @click="resumeInTerminal(s)"
            >终端继续</button>
            <button
              type="button"
              class="ide-cli-sessions__btn"
              :data-testid="`ide-cli-copy-${s.id}`"
              :title="`复制会话 ID：${s.id}`"
              @click="copyId(s)"
            >复制 ID</button>
          </div>
        </div>

        <!-- 账单展开：逐轮用量（真实 TTFT）+ 工具时间线 -->
        <div v-if="expandedId === s.id" class="ide-cli-sessions__bill" :data-testid="`ide-cli-bill-body-${s.id}`">
          <p v-if="billState === 'loading'" class="ide-cli-sessions__hint">正在读取账单……</p>
          <p v-else-if="billState === 'error'" class="ide-cli-sessions__hint ide-cli-sessions__hint--err">账单读取失败（重试请收起再展开）。</p>
          <template v-else>
            <div class="ide-cli-sessions__bill-head">
              <strong>逐轮用量</strong>
              <span class="ide-cli-sessions__bill-cost" :title="billHasSubscription ? '金额为按量 provider 估算（订阅计划不按 token 计费，未计入）' : '按模型价目估算（未收录模型不计）'">
                ≈{{ billCost == null ? '—（未收录价目或全为订阅）' : formatCostUsd(billCost) }}
                <em v-if="billHasSubscription">含订阅计划</em>
              </span>
            </div>
            <p v-if="billRounds.length === 0" class="ide-cli-sessions__hint">该会话没有轮记录。</p>
            <table v-else class="ide-cli-sessions__table" :data-testid="`ide-cli-bill-rounds-${s.id}`">
              <thead>
                <tr><th>时间</th><th>状态</th><th class="is-num">TTFT</th><th class="is-num">时长</th><th class="is-num">输入</th><th class="is-num">输出</th><th class="is-num">缓存读</th><th>模型</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in billRounds" :key="r.turnId">
                  <td>{{ fmtClock(r.startedAt) }}</td>
                  <td><span class="ide-cli-sessions__st" :data-st="r.status">{{ r.status === 'completed' ? '完成' : r.status === 'error' ? '出错' : r.status === 'cancelled' ? '取消' : r.status }}</span>
                    <span v-if="r.errorCode" :title="`${r.errorType || ''} ${r.errorCode}`">· {{ r.errorCode }}</span></td>
                  <td class="is-num">{{ r.ttftMs == null ? '—' : fmtDur(r.ttftMs) }}</td>
                  <td class="is-num">{{ fmtDur(r.durationMs) }}</td>
                  <td class="is-num">{{ fmtTokens(r.models.reduce((a, m) => a + m.inputTokens, 0)) }}</td>
                  <td class="is-num">{{ fmtTokens(r.models.reduce((a, m) => a + m.outputTokens, 0)) }}</td>
                  <td class="is-num">{{ fmtTokens(r.models.reduce((a, m) => a + m.cacheReadTokens, 0)) }}</td>
                  <td class="is-model" :title="r.models.map(m => `${m.provider}/${m.model}×${m.calls}`).join('、')">
                    {{ r.models.length === 1 ? `${r.models[0].model}×${r.models[0].calls}` : `${r.models.length} 模型/${r.modelRequestCount} 次` }}</td>
                </tr>
              </tbody>
            </table>

            <div class="ide-cli-sessions__bill-head ide-cli-sessions__bill-head--gap">
              <strong>工具调用时间线</strong>
              <span class="ide-cli-sessions__bill-cost">{{ billTools.length }} 次</span>
            </div>
            <p v-if="billTools.length === 0" class="ide-cli-sessions__hint">该会话没有工具调用记录。</p>
            <ul v-else class="ide-cli-sessions__tools" :data-testid="`ide-cli-bill-tools-${s.id}`">
              <li v-for="t in billTools" :key="t.id" class="ide-cli-sessions__tool" :title="`${t.toolName} · ${t.status}${t.errorType ? ` · ${t.errorType}` : ''}${t.approvalStatus ? ` · 审批:${t.approvalStatus}` : ''}`">
                <span class="ide-cli-sessions__st" :data-st="t.status">{{ t.status === 'completed' ? '✓' : t.status === 'error' ? '✗' : '·' }}</span>
                <span class="ide-cli-sessions__tool-name">{{ t.toolName }}</span>
                <span v-if="t.destructive" class="ide-cli-sessions__tag ide-cli-sessions__tag--warn" title="破坏性操作（写入/删除类）">破坏性</span>
                <span v-else-if="!t.readOnly" class="ide-cli-sessions__tag" title="写入类操作">写</span>
                <span class="ide-cli-sessions__tool-meta">{{ fmtClock(t.startedAt) }} · {{ fmtDur(t.durationMs) }} · {{ fmtBytes(t.outputBytes) }}</span>
              </li>
            </ul>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.ide-cli-sessions {
  width: 100%; text-align: left;
}
/* hero 落地场景的容器化包装（侧栏内嵌时无边框贴合作分组体） */
.ide-cli-sessions--boxed {
  max-width: 560px; margin: 18px auto 0;
  border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 14px;
}
.ide-cli-sessions__head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ide-cli-sessions__title { margin: 0; font-size: 13px; font-weight: 600; }
.ide-cli-sessions__badge {
  font-size: 10px; padding: 1px 6px; border-radius: 8px;
  color: var(--accent-info, #3b82f6); border: 1px solid var(--accent-info, #3b82f6);
}
.ide-cli-sessions__refresh {
  margin-left: auto; border: none; background: none; color: var(--text-muted);
  font-size: 11px; cursor: pointer; &:hover { color: var(--text-primary); }
}
.ide-cli-sessions__hint { margin: 4px 0; font-size: 12px; color: var(--text-muted); }
.ide-cli-sessions__hint--err { color: var(--error, #d33); }
.ide-cli-sessions__list { list-style: none; margin: 0; padding: 0; }
.ide-cli-sessions__row {
  display: flex; flex-direction: column; gap: 6px;
  padding: 7px 2px; border-bottom: 1px solid var(--border-color);
  &:last-child { border-bottom: none; }
}
.ide-cli-sessions__rowline { display: flex; align-items: center; gap: 10px; }
.ide-cli-sessions__main { flex: 1; min-width: 0; }
.ide-cli-sessions__name {
  display: block; font-size: 12.5px; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ide-cli-sessions__meta { font-size: 10.5px; color: var(--text-muted); }
.ide-cli-sessions__usage { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.ide-cli-sessions__tag {
  font-size: 9.5px; padding: 0 4px; margin-left: 4px; border-radius: 6px;
  color: var(--text-muted); border: 1px solid var(--border-color);
}
.ide-cli-sessions__tag--warn { color: var(--warning, #b80); border-color: var(--warning, #b80); }
.ide-cli-sessions__acts { display: flex; gap: 6px; flex-shrink: 0; }
.ide-cli-sessions__btn {
  border: 1px solid var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-secondary); font-size: 11px; padding: 3px 8px; cursor: pointer;
  &:hover:not(:disabled) { color: var(--text-primary); border-color: var(--text-muted); }
  &:disabled { opacity: .5; }
}
.ide-cli-sessions__btn--primary { color: var(--accent-info); border-color: var(--accent-info); }
.ide-cli-sessions__btn--on { color: var(--accent-info); border-color: var(--accent-info); }
/* ── 账单展开 ── */
.ide-cli-sessions__bill {
  border: 1px solid var(--border-color); border-radius: 8px;
  padding: 8px 10px; background: var(--bg-secondary, transparent); font-size: 11.5px;
}
.ide-cli-sessions__bill-head {
  display: flex; align-items: baseline; gap: 8px; margin: 2px 0 6px;
  strong { font-size: 12px; }
}
.ide-cli-sessions__bill-head--gap { margin-top: 10px; }
.ide-cli-sessions__bill-cost {
  margin-left: auto; color: var(--text-muted); font-variant-numeric: tabular-nums;
  em { font-style: normal; font-size: 10px; margin-left: 4px; opacity: .8; }
}
.ide-cli-sessions__table {
  width: 100%; border-collapse: collapse; table-layout: auto;
  th, td { padding: 2px 5px; text-align: left; white-space: nowrap; }
  th { color: var(--text-muted); font-weight: 500; font-size: 10.5px; }
  .is-num { text-align: right; font-variant-numeric: tabular-nums; }
  .is-model { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
  tbody tr { border-top: 1px solid var(--border-color); }
}
.ide-cli-sessions__st {
  font-size: 10px; padding: 0 5px; border-radius: 6px; border: 1px solid var(--border-color);
  &[data-st='completed'] { color: var(--success, #2a2); border-color: var(--success, #2a2); }
  &[data-st='error'] { color: var(--error, #d33); border-color: var(--error, #d33); }
}
.ide-cli-sessions__tools { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; }
.ide-cli-sessions__tool {
  display: flex; align-items: center; gap: 6px; padding: 2px 0;
  border-top: 1px dashed var(--border-color);
  &:first-child { border-top: none; }
}
.ide-cli-sessions__tool-name { font-weight: 500; }
.ide-cli-sessions__tool-meta { margin-left: auto; color: var(--text-muted); font-variant-numeric: tabular-nums; font-size: 10.5px; }
</style>
