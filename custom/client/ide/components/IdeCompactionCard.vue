<script setup lang="ts">
// IdeCompactionCard — compaction 留痕卡（UI 融合 UI-2 v1，dsh"压缩不静默"落地）。
// 数据=GET /api/ide/compaction-trace/:sessionId（chat_compression_snapshots 单点）：
// 该会话被压缩过即在消息流底部浮一张卡（压到哪条/折叠多少条/摘要规模）。
// 前瞻阈值（吸收 v2 批 compactthreshold，minimax 90% 线/reserve 公式）：无快照时
// 按 compactThreshold 实时判定 under（不显示）/soon/now——soon/now 给一键 /compact。
import { computed, onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useSessionMetrics } from '../composables/useSessionMetrics'
import { compactThreshold, type ThresholdDecision } from '../../../server/compactthreshold/compact-threshold'

const chatStore = useChatStore()
const metrics = useSessionMetrics()
const snapshot = ref<{ compressedThroughMessageId: string; foldedMessages: number; summaryChars: number; reason: string } | null>(null)

async function load(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) {
    snapshot.value = null
    return
  }
  try {
    const res = await fetch(`/api/ide/compaction-trace/${encodeURIComponent(sid)}`)
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as { snapshot: typeof snapshot.value }
    snapshot.value = body.snapshot ?? null
  } catch {
    snapshot.value = null
  }
}

onMounted(load)
watch(() => chatStore.activeSessionId, () => { void load() })

const foldedText = computed(() =>
  snapshot.value && snapshot.value.foldedMessages > 0
    ? `折叠 ${snapshot.value.foldedMessages} 条进摘要`
    : '折叠范围未记',
)

// 前瞻阈值（compactthreshold）：under 不渲染（不打扰）。
const threshold = computed<ThresholdDecision | null>(() => {
  const used = (metrics as unknown as { contextUsed?: { value: number } }).contextUsed?.value ?? 0
  const limit = (metrics as unknown as { contextLength?: { value: number } }).contextLength?.value ?? 0
  if (used <= 0 || limit <= 0) return null
  const d = compactThreshold({ usedTokens: used, limitTokens: limit, outputBudget: 8192 })
  return d.level === 'under' ? null : d
})

function runCompact(): void {
  void chatStore.sendMessage('/compact')
}
</script>

<template>
  <!-- 留痕（历史压缩快照在） -->
  <div v-if="snapshot" class="ide-compaction" data-testid="ide-compaction-card" title="历史已压缩——摘要替换早期消息">
    ▤ 压缩留痕：{{ foldedText }} · 摘要 {{ snapshot.summaryChars }} 字（至消息 #{{ snapshot.compressedThroughMessageId.slice(0, 8) }}）
  </div>
  <!-- 前瞻阈值（compactthreshold：soon/now 态才显示） -->
  <div
    v-else-if="threshold"
    class="ide-compaction is-threshold"
    :data-level="threshold.level"
    data-testid="ide-compaction-threshold"
    :title="`触发线 ${threshold.triggerTokens} tokens（reserve ${threshold.reserveTokens}）；余量 ${threshold.headroom}`"
  >
    ▤ 上下文{{ threshold.level === 'now' ? '已到建议压缩线' : '接近压缩线' }}（余 {{ Math.max(0, threshold.headroom) }} tokens）
    <button type="button" class="ide-compaction__btn" data-testid="ide-compaction-run" @click="runCompact">立即压缩</button>
  </div>
</template>

<style scoped lang="scss">
.ide-compaction {
  font-size: 11px;
  color: var(--text-color-3, #999);
  background: var(--hover-color, rgba(0, 0, 0, 0.03));
  border-left: 3px solid var(--text-color-3, #bbb);
  border-radius: 4px;
  padding: 3px 10px;
  margin: 4px 12px;
}
.ide-compaction.is-threshold[data-level='soon'] { border-left-color: var(--warning-color, #f0a020); color: var(--warning-color, #f0a020); }
.ide-compaction.is-threshold[data-level='now'] { border-left-color: var(--error-color, #d03050); color: var(--error-color, #d03050); font-weight: 600; }
.ide-compaction__btn {
  border: 1px solid currentColor; background: transparent; border-radius: 4px; font-size: 10px;
  padding: 0 8px; margin-left: 8px; cursor: pointer; color: inherit;
}
</style>
