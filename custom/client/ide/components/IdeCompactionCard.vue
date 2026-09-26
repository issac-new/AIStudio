<script setup lang="ts">
// IdeCompactionCard — compaction 留痕卡（UI 融合 UI-2 v1，dsh"压缩不静默"落地）。
// 数据=GET /api/ide/compaction-trace/:sessionId（chat_compression_snapshots 单点）：
// 该会话被压缩过即在消息流底部浮一张卡（压到哪条/折叠多少条/摘要规模）。
// 历史序列卡（多次压缩 markers）列 v2（表只存最新快照）。
import { computed, onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

const chatStore = useChatStore()
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
</script>

<template>
  <div v-if="snapshot" class="ide-compaction" data-testid="ide-compaction-card" title="历史已压缩——摘要替换早期消息">
    ▤ 压缩留痕：{{ foldedText }} · 摘要 {{ snapshot.summaryChars }} 字（至消息 #{{ snapshot.compressedThroughMessageId.slice(0, 8) }}）
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
</style>
