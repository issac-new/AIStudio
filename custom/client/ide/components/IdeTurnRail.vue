<script setup lang="ts">
// IdeTurnRail — 轮导航 rail（UI 融合 UI-1，dsh TurnNavigator 吸收落地）。
// 数据面=cockpit/adapters/turn-outline.ts（轮轮廓投影）；跳转=chatStore.focusMessageId
// →MessageList.scrollToMessage 既有链（不新造滚动机制）。悬停展开该轮锚点与工具数。
import { computed } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { buildTurnOutline, type OutlineEvent } from '../../cockpit/adapters/turn-outline'

const chatStore = useChatStore()

interface TurnRow {
  turnIndex: number
  anchor: string
  steps: number
  toolCalls: number
  durationMs: number
  firstMessageId: string
}

const rows = computed<TurnRow[]>(() => {
  const messages = chatStore.activeSession?.messages ?? []
  const events: Array<OutlineEvent & { messageId: string }> = []
  for (const m of messages) {
    const role = m.role
    if (role === 'user') {
      events.push({ kind: 'user', at: Date.parse(String(m.created_at ?? '')) || 0, text: typeof m.content === 'string' ? m.content : '', messageId: String(m.id) })
    } else if (role === 'assistant') {
      const toolCalls = Array.isArray((m as { tool_calls?: unknown }).tool_calls) ? (m as { tool_calls: unknown[] }).tool_calls.length : 0
      if (toolCalls > 0) {
        for (let i = 0; i < toolCalls; i += 1) {
          events.push({ kind: 'tool', at: Date.parse(String(m.created_at ?? '')) || 0, toolName: 'call', messageId: String(m.id) })
        }
      } else {
        events.push({ kind: 'assistant', at: Date.parse(String(m.created_at ?? '')) || 0, messageId: String(m.id) })
      }
    }
  }
  const outline = buildTurnOutline(events)
  return outline.map((entry) => ({
    turnIndex: entry.turnIndex,
    anchor: entry.anchor,
    steps: entry.steps,
    toolCalls: entry.toolCalls,
    durationMs: entry.durationMs,
    firstMessageId: events[entry.startIndex]?.messageId ?? '',
  }))
})

function jump(row: TurnRow): void {
  if (row.firstMessageId) chatStore.focusMessageId = row.firstMessageId
}

function fmt(ms: number): string {
  if (!ms) return ''
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}
</script>

<template>
  <nav v-if="rows.length > 1" class="ide-turn-rail" data-testid="ide-turn-rail" aria-label="turn navigator">
    <div
      v-for="row in rows"
      :key="row.turnIndex"
      class="ide-turn-rail__row"
      :data-testid="`ide-turn-rail-${row.turnIndex}`"
      :title="`#${row.turnIndex + 1} ${row.anchor} · ${row.steps} steps · ${row.toolCalls} tools · ${fmt(row.durationMs)}`"
      @click="jump(row)"
    >
      <span class="ide-turn-rail__idx">{{ row.turnIndex + 1 }}</span>
      <span v-if="row.toolCalls" class="ide-turn-rail__tools">{{ row.toolCalls }}</span>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.ide-turn-rail {
  position: absolute;
  right: 2px;
  top: 8px;
  bottom: 8px;
  width: 22px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  z-index: 5;
  opacity: 0.45;
  transition: opacity 0.15s;
}

.ide-turn-rail:hover {
  opacity: 1;
}

.ide-turn-rail__row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 1px 3px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-color-3, #999);
}

.ide-turn-rail__row:hover {
  background: var(--hover-color, rgba(0, 0, 0, 0.08));
  color: var(--primary-color, #18a058);
}

.ide-turn-rail__tools {
  font-size: 9px;
  background: var(--hover-color, rgba(0, 0, 0, 0.08));
  border-radius: 3px;
  padding: 0 2px;
}
</style>
