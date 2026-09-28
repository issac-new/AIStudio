<script setup lang="ts">
// IdeQueuePanel — 排队面板（复刻 multica/codex queue 排队任务管理+claude-code 发送
// 队列灰显形态；UI 复刻 R7）。数据=chatStore 消息队列/运行态（运行中时排队态可见）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'

const chatStore = useChatStore()
const { t } = useI18n()

interface QueuedItem { id: string; text: string; state: 'queued' | 'sent' }

const queue = computed<QueuedItem[]>(() => {
  // 真实链：消息 queued 标志（MessageList 同源灰显数据）。
  const msgs = (chatStore.activeSession?.messages ?? []) as Array<{ id?: string; queued?: boolean; content?: unknown }>
  return msgs
    .filter((m) => m.queued)
    .map((m, i) => ({ id: String(m.id ?? `q${i}`), text: String(typeof m.content === 'string' ? m.content : '').slice(0, 80), state: 'queued' }))
})

const isRunning = computed(() => Boolean((chatStore as unknown as { isLoading?: boolean }).isLoading))
</script>

<template>
  <div v-if="queue.length" class="ide-queue" data-testid="ide-queue-panel">
    <div class="ide-queue__head">⇉ {{ t('ide.queue.count', { n: queue.length }) }}<span v-if="isRunning" class="ide-queue__running"> · {{ t('ide.queue.yieldWhileRunning', '运行中让位') }}</span></div>
    <div v-for="item in queue" :key="item.id" class="ide-queue__row" :data-testid="`ide-queue-${item.id}`">
      <span class="ide-queue__dot" />{{ item.text }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-queue { margin: 4px 12px; font-size: 11px; }
.ide-queue__head { font-weight: 600; color: var(--text-color-3, #999); }
.ide-queue__running { color: var(--primary-color, #18a058); }
.ide-queue__row {
  display: flex; gap: 6px; align-items: baseline; padding: 2px 4px;
  color: var(--text-color-3, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ide-queue__dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-color-3, #bbb); flex: 0 0 5px; }
</style>
