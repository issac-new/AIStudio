<script setup lang="ts">
// IdeRecapCard — 会话 recap 回笼摘要卡（复刻 claude-code"离开后发生了什么"+dsh
// /recap 回顾行+cc/codex/dsh 三源合并 recap 域；UI 复刻 R8）。
// 数据源=消息流 display_kind='recap' 或 display_metadata.recap（patch 410 recap
// 的客户端呈现面）。
import { computed } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

const chatStore = useChatStore()

interface RecapPayload { text?: string; summary?: string; at?: number }

const recap = computed(() => {
  const messages = (chatStore.activeSession?.messages ?? []) as Array<{ role: string; content: unknown; display_kind?: string; display_metadata?: unknown }>
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!
    const meta = m.display_metadata as { recap?: RecapPayload } | undefined
    if (m.display_kind === 'recap' || meta?.recap) {
      const text = meta?.recap?.text ?? meta?.recap?.summary ?? (typeof m.content === 'string' ? m.content : '')
      if (text) return text
    }
  }
  return null
})
</script>

<template>
  <div v-if="recap" class="ide-recap" data-testid="ide-recap-card" title="恢复会话时的回笼摘要（离开后发生了什么）">
    ↩ 回笼摘要：{{ recap }}
  </div>
</template>

<style scoped lang="scss">
.ide-recap {
  margin: 4px 12px; padding: 5px 10px; font-size: 12px;
  background: var(--hover-color, rgba(0, 0, 0, 0.04)); border-radius: 6px;
  border-left: 3px solid var(--primary-color, #18a058); color: var(--text-color-3, #777);
}
</style>
