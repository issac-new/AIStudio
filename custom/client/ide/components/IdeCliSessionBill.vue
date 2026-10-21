<!-- overlay/custom/client/ide/components/IdeCliSessionBill.vue -->
<!-- zcode CLI 会话账单展开体（2026-10-21 遗留项收编轮，自 IdeCliSessions 抽出）：
     逐轮用量表（真实 TTFT/轮内模型分解/成本）+ 上下文趋势条带（model_usage
     精确值）+ 构成折叠（message×part ≈估算，按需拉）+ 工具调用时间线。
     两个宿主复用同一实现：IdeCliSessions（「分组」模式独立段/落地页）与
     IdeTaskSidebar 混排行（「项目/时间线」组织）——账单 UI 单一事实源。
     挂载即拉 rounds+tools；构成（context 端点）首点开才拉。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { zcodeUsageApi, type ZcodeContextData, type ZcodeUsageRound, type ZcodeUsageTool } from '../api/zcodeUsage'
import { estimateCostUsd, formatCostUsd, isSubscriptionProvider } from '../utils/modelPricing'
import { showToast } from '../utils/toast'

const props = defineProps<{ sessionId: string }>()

const billState = ref<'loading' | 'ok' | 'error'>('loading')
const billRounds = ref<ZcodeUsageRound[]>([])
const billTools = ref<ZcodeUsageTool[]>([])

// ── 上下文趋势/构成（Phase 2：按需拉取，点开「构成」才请求）──
const ctxData = ref<ZcodeContextData | null>(null)
const ctxState = ref<'hidden' | 'loading' | 'ok' | 'error'>('hidden')

onMounted(() => { void loadBill() })

async function loadBill(): Promise<void> {
  billState.value = 'loading'
  billRounds.value = []
  billTools.value = []
  ctxData.value = null
  ctxState.value = 'hidden'
  try {
    const [r, t] = await Promise.all([
      zcodeUsageApi.rounds(props.sessionId),
      zcodeUsageApi.tools(props.sessionId),
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

/** 「构成（≈估算）」按需拉取：首点开才请求 context 端点。 */
async function toggleContext(): Promise<void> {
  if (ctxState.value === 'ok' || ctxState.value === 'loading') {
    ctxState.value = 'hidden'
    return
  }
  ctxState.value = 'loading'
  try {
    ctxData.value = await zcodeUsageApi.context(props.sessionId)
    ctxState.value = 'ok'
  } catch (e) {
    ctxState.value = 'error'
    showToast(`读取上下文构成失败：${(e as Error).message}`, 'error')
  }
}

/** 趋势条带：按请求 prompt 峰值定标（输出叠加为深色段）。 */
const CTX_BAR_MAX_H = 40
const trend = computed(() => {
  const reqs = ctxData.value?.requests ?? []
  const maxPrompt = Math.max(0, ...reqs.map(r => r.promptTokens))
  const bars = reqs.slice(-120).map(r => {
    const h = maxPrompt > 0 ? Math.max(6, Math.round((r.promptTokens / maxPrompt) * CTX_BAR_MAX_H)) : 0
    // 输出段高度：按输出/提示词比例在柱内叠加（capped 防溢出）
    const outH = r.promptTokens > 0 ? Math.min(h - 1, Math.round((r.outputTokens / r.promptTokens) * h)) : 0
    return {
      at: r.at,
      model: r.model,
      promptTokens: r.promptTokens,
      outputTokens: r.outputTokens,
      ttftMs: r.ttftMs,
      h,
      outH: Number.isFinite(outH) && outH > 0 ? outH : 0,
    }
  })
  return { bars, maxPrompt, total: reqs.length }
})

/** 趋势条带上叠加压缩标记：时间最近的请求位置。 */
function compactionMark(at: number): number | null {
  const bars = trend.value.bars
  if (!ctxData.value?.compactions.length || !bars.length) return null
  let idx = -1
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].at <= at) idx = i
    else break
  }
  return idx >= 0 ? idx : null
}

const CTX_CAT_LABELS: Record<string, string> = {
  'user-text': '用户消息',
  'assistant-text': '助手回复',
  reasoning: '推理过程',
  tool: '工具调用',
  file: '文件附件',
}
function ctxCatLabel(key: string): string {
  return CTX_CAT_LABELS[key] ?? key
}

/** 构成横条宽（百分比，相对估算总量）。 */
function ctxCatPct(c: { estTokens: number }): number {
  const total = ctxData.value?.est.estTotalTokens ?? 0
  return total > 0 ? Math.max(2, Math.round((c.estTokens / total) * 100)) : 0
}
</script>

<template>
  <div class="ide-cli-bill" :data-testid="`ide-cli-bill-body-${sessionId}`">
    <p v-if="billState === 'loading'" class="ide-cli-bill__hint">正在读取账单……</p>
    <p v-else-if="billState === 'error'" class="ide-cli-bill__hint ide-cli-bill__hint--err">账单读取失败（重试请收起再展开）。</p>
    <template v-else>
      <div class="ide-cli-bill__head">
        <strong>逐轮用量</strong>
        <span class="ide-cli-bill__cost" :title="billHasSubscription ? '金额为按量 provider 估算（订阅计划不按 token 计费，未计入）' : '按模型价目估算（未收录模型不计）'">
          ≈{{ billCost == null ? '—（未收录价目或全为订阅）' : formatCostUsd(billCost) }}
          <em v-if="billHasSubscription">含订阅计划</em>
        </span>
      </div>
      <p v-if="billRounds.length === 0" class="ide-cli-bill__hint">该会话没有轮记录。</p>
      <table v-else class="ide-cli-bill__table" :data-testid="`ide-cli-bill-rounds-${sessionId}`">
        <thead>
          <tr><th>时间</th><th>状态</th><th class="is-num">TTFT</th><th class="is-num">时长</th><th class="is-num">输入</th><th class="is-num">输出</th><th class="is-num">缓存读</th><th>模型</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in billRounds" :key="r.turnId">
            <td>{{ fmtClock(r.startedAt) }}</td>
            <td><span class="ide-cli-bill__st" :data-st="r.status">{{ r.status === 'completed' ? '完成' : r.status === 'error' ? '出错' : r.status === 'cancelled' ? '取消' : r.status }}</span>
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

      <!-- 上下文趋势（model_usage 精确值；构成按需拉） -->
      <div v-if="trend.bars.length || ctxState === 'ok'" class="ide-cli-bill__head ide-cli-bill__head--gap">
        <strong>上下文趋势</strong>
        <span class="ide-cli-bill__cost" title="每根=一次模型请求（精确值）：高度=提示词 token（输入+缓存读写），深色段=输出 token；✂=压缩事件">{{ trend.total }} 次请求</span>
      </div>
      <button
        type="button"
        class="ide-cli-bill__ctx-toggle"
        data-testid="ide-cli-ctx-toggle"
        @click="toggleContext"
      >{{ ctxState === 'hidden' ? '展开构成（≈估算）' : ctxState === 'loading' ? '构成读取中…' : ctxState === 'error' ? '构成读取失败，点击重试' : '收起构成' }}</button>
      <div v-if="trend.bars.length" class="ide-cli-bill__trend" :data-testid="`ide-cli-trend-${sessionId}`" title="横向为时间（旧→新），悬停看单次请求明细">
        <span
          v-for="(b, i) in trend.bars"
          :key="i"
          class="ide-cli-bill__tbar"
          :style="{ height: `${b.h}px` }"
          :title="`${fmtClock(b.at)} · ${b.model}\n提示词 ${fmtTokens(b.promptTokens)} · 输出 ${fmtTokens(b.outputTokens)}${b.ttftMs != null ? ` · TTFT ${fmtDur(b.ttftMs)}` : ''}`"
        ><i v-if="b.outH > 0" class="ide-cli-bill__tout" :style="{ height: `${b.outH}px` }" />
          <i
            v-for="c in ctxData?.compactions ?? []"
            :key="c.at"
            v-show="compactionMark(c.at) === i"
            class="ide-cli-bill__tcut"
            :title="`✂ 压缩（${c.trigger}${c.reason ? ` · ${c.reason}` : ''}${c.status ? ` · ${c.status}` : ''}）`"
          >✂</i>
        </span>
      </div>

      <!-- 构成（≈估算）：六类横条 + top 消息 -->
      <div v-if="ctxState === 'loading'" class="ide-cli-bill__hint">正在折叠消息与工具结果……</div>
      <div v-else-if="ctxState === 'error'" class="ide-cli-bill__hint ide-cli-bill__hint--err">构成读取失败。</div>
      <div v-else-if="ctxState === 'ok' && ctxData" class="ide-cli-bill__ctx" :data-testid="`ide-cli-ctx-${sessionId}`">
        <div v-if="ctxData.note" class="ide-cli-bill__hint">{{ ctxData.note }}</div>
        <template v-else>
          <div class="ide-cli-bill__ctx-total" title="构成=按内容长度估算（≈）：中文≈1 token/字、英文≈4 字符/token；与趋势列的精确值口径不同">
            构成合计 ≈{{ fmtTokens(ctxData.est.estTotalTokens) }} token
            <em v-if="ctxData.est.partsSkipped > 0">（{{ ctxData.est.partsParsed }} 段已解析，{{ ctxData.est.partsSkipped }} 段损坏跳过）</em>
          </div>
          <div class="ide-cli-bill__cats">
            <div v-for="c in ctxData.est.categories" :key="c.key" class="ide-cli-bill__cat" :title="`${ctxCatLabel(c.key)}：${c.count} 段 · ≈${fmtTokens(c.estTokens)} token`">
              <span class="ide-cli-bill__cat-name">{{ ctxCatLabel(c.key) }}</span>
              <span class="ide-cli-bill__cat-bar"><i :style="{ width: `${ctxCatPct(c)}%` }" /></span>
              <span class="ide-cli-bill__cat-num">{{ c.count }} · ≈{{ fmtTokens(c.estTokens) }}</span>
            </div>
          </div>
          <div v-if="ctxData.largest.length" class="ide-cli-bill__head ide-cli-bill__head--gap">
            <strong>最大的消息</strong>
            <span class="ide-cli-bill__cost">top {{ ctxData.largest.length }}</span>
          </div>
          <ul class="ide-cli-bill__largest">
            <li v-for="m in ctxData.largest" :key="m.messageId" :title="m.preview">
              <span class="ide-cli-bill__st" :data-st="m.role === 'user' ? 'completed' : ''">{{ m.role === 'user' ? '问' : '答' }}</span>
              <span class="ide-cli-bill__largest-meta">{{ fmtClock(m.at) }} · ≈{{ fmtTokens(m.estTokens) }}</span>
              <span class="ide-cli-bill__largest-preview">{{ m.preview }}</span>
            </li>
          </ul>
          <div v-if="ctxData.compactions.length" class="ide-cli-bill__ctx-events">
            ✂ 压缩事件 {{ ctxData.compactions.length }} 次<span v-for="c in ctxData.compactions.slice(0, 5)" :key="c.at"> · {{ fmtClock(c.at) }}（{{ c.trigger }}）</span>
          </div>
        </template>
      </div>

      <div class="ide-cli-bill__head ide-cli-bill__head--gap">
        <strong>工具调用时间线</strong>
        <span class="ide-cli-bill__cost">{{ billTools.length }} 次</span>
      </div>
      <p v-if="billTools.length === 0" class="ide-cli-bill__hint">该会话没有工具调用记录。</p>
      <ul v-else class="ide-cli-bill__tools" :data-testid="`ide-cli-bill-tools-${sessionId}`">
        <li v-for="t in billTools" :key="t.id" class="ide-cli-bill__tool" :title="`${t.toolName} · ${t.status}${t.errorType ? ` · ${t.errorType}` : ''}${t.approvalStatus ? ` · 审批:${t.approvalStatus}` : ''}`">
          <span class="ide-cli-bill__st" :data-st="t.status">{{ t.status === 'completed' ? '✓' : t.status === 'error' ? '✗' : '·' }}</span>
          <span class="ide-cli-bill__tool-name">{{ t.toolName }}</span>
          <span v-if="t.destructive" class="ide-cli-bill__tag ide-cli-bill__tag--warn" title="破坏性操作（写入/删除类）">破坏性</span>
          <span v-else-if="!t.readOnly" class="ide-cli-bill__tag" title="写入类操作">写</span>
          <span class="ide-cli-bill__tool-meta">{{ fmtClock(t.startedAt) }} · {{ fmtDur(t.durationMs) }} · {{ fmtBytes(t.outputBytes) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ide-cli-bill {
  border: 1px solid var(--border-color); border-radius: 8px;
  padding: 8px 10px; background: var(--bg-secondary, transparent); font-size: 11.5px;
  /* 侧栏窄容器：宽表（逐轮用量 8 列）横向滚动而非裁列 */
  overflow-x: auto;
}
.ide-cli-bill__hint { margin: 4px 0; font-size: 12px; color: var(--text-muted); }
.ide-cli-bill__hint--err { color: var(--error, #d33); }
.ide-cli-bill__head {
  display: flex; align-items: baseline; gap: 8px; margin: 2px 0 6px;
  strong { font-size: 12px; }
}
.ide-cli-bill__head--gap { margin-top: 10px; }
.ide-cli-bill__cost {
  margin-left: auto; color: var(--text-muted); font-variant-numeric: tabular-nums;
  em { font-style: normal; font-size: 10px; margin-left: 4px; opacity: .8; }
}
.ide-cli-bill__table {
  width: 100%; border-collapse: collapse; table-layout: auto;
  th, td { padding: 2px 5px; text-align: left; white-space: nowrap; }
  th { color: var(--text-muted); font-weight: 500; font-size: 10.5px; }
  .is-num { text-align: right; font-variant-numeric: tabular-nums; }
  .is-model { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
  tbody tr { border-top: 1px solid var(--border-color); }
}
.ide-cli-bill__st {
  font-size: 10px; padding: 0 5px; border-radius: 6px; border: 1px solid var(--border-color);
  &[data-st='completed'] { color: var(--success, #2a2); border-color: var(--success, #2a2); }
  &[data-st='error'] { color: var(--error, #d33); border-color: var(--error, #d33); }
}
.ide-cli-bill__tools { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; }
.ide-cli-bill__tool {
  display: flex; align-items: center; gap: 6px; padding: 2px 0;
  border-top: 1px dashed var(--border-color);
  &:first-child { border-top: none; }
}
.ide-cli-bill__tool-name { font-weight: 500; }
.ide-cli-bill__tool-meta { margin-left: auto; color: var(--text-muted); font-variant-numeric: tabular-nums; font-size: 10.5px; }
.ide-cli-bill__tag {
  font-size: 9.5px; padding: 0 4px; margin-left: 4px; border-radius: 6px;
  color: var(--text-muted); border: 1px solid var(--border-color);
}
.ide-cli-bill__tag--warn { color: var(--warning, #b80); border-color: var(--warning, #b80); }
/* ── 上下文趋势/构成 ── */
.ide-cli-bill__ctx-toggle {
  display: block; width: 100%; margin: 2px 0 6px;
  border: 1px dashed var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-muted); font-size: 10.5px; padding: 3px 8px; cursor: pointer;
  &:hover { color: var(--text-primary); }
}
.ide-cli-bill__trend {
  display: flex; align-items: flex-end; gap: 1px;
  height: 42px; overflow-x: auto; padding-bottom: 2px;
  border-bottom: 1px solid var(--border-color);
}
.ide-cli-bill__tbar {
  position: relative; flex: 0 0 5px; min-height: 4px;
  border-radius: 1px 1px 0 0; background: var(--accent-info, #3b82f6); opacity: .55;
  &:hover { opacity: .9; }
}
.ide-cli-bill__tout {
  position: absolute; left: 0; right: 0; bottom: 0;
  border-radius: 0 0 1px 1px; background: var(--accent-info, #3b82f6); opacity: 1;
}
.ide-cli-bill__tcut {
  position: absolute; top: -12px; left: -2px; font-size: 9px; font-style: normal;
  color: var(--warning, #b80);
}
.ide-cli-bill__ctx-total {
  font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;
  em { font-style: normal; font-size: 10px; color: var(--text-muted); }
}
.ide-cli-bill__cats { display: grid; gap: 3px; }
.ide-cli-bill__cat { display: flex; align-items: center; gap: 6px; font-size: 10.5px; }
.ide-cli-bill__cat-name { flex: 0 0 52px; color: var(--text-muted); }
.ide-cli-bill__cat-bar {
  flex: 1; height: 6px; border-radius: 3px; background: var(--border-color); overflow: hidden;
  i { display: block; height: 100%; border-radius: 3px; background: var(--accent-info, #3b82f6); }
}
.ide-cli-bill__cat-num { flex: 0 0 auto; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.ide-cli-bill__largest { list-style: none; margin: 0; padding: 0; max-height: 160px; overflow-y: auto; }
.ide-cli-bill__largest li {
  display: flex; align-items: center; gap: 6px; padding: 2px 0; font-size: 10.5px;
  border-top: 1px dashed var(--border-color);
  &:first-child { border-top: none; }
}
.ide-cli-bill__largest-meta { flex: 0 0 auto; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.ide-cli-bill__largest-preview {
  flex: 1; min-width: 0; color: var(--text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ide-cli-bill__ctx-events { margin-top: 6px; font-size: 10.5px; color: var(--warning, #b80); }
</style>
