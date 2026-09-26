<script setup lang="ts">
// IdeAgentsView — 后台代理三分区视图（复刻 claude-code "claude agents" 总视图：
// Needs input/Working/Completed 三分区+antigravity Manager 状态列；UI 复刻 S4）。
// 数据=chatStore.subagentStreams 六态映射三分区：needs input=failed/interrupted；
// working=running；completed=completed/cancelled。
import { computed } from 'vue'
import { useChatStore, type SubagentStream } from '@/stores/hermes/chat'

const chat = useChatStore()

const streams = computed<SubagentStream[]>(() => {
  const sid = chat.activeSessionId
  const list: SubagentStream[] = []
  for (const [key, s] of chat.subagentStreams) {
    if (!sid || key.startsWith(`${sid}:`)) list.push(s)
  }
  return list
})

const needsInput = computed(() => streams.value.filter((s) => s.status === 'failed' || s.status === 'error' || s.status === 'interrupted'))
const working = computed(() => streams.value.filter((s) => s.status === 'running'))
const completed = computed(() => streams.value.filter((s) => s.status === 'completed' || s.status === 'cancelled'))

function dur(s: SubagentStream): string {
  const secs = s.durationSeconds ?? (s.updatedAt - s.startedAt) / 1000
  return `${Math.max(0, Math.round(secs))}s`
}
</script>

<template>
  <div v-if="streams.length" class="ide-agents" data-testid="ide-agents-view">
    <div class="ide-agents__section is-needs" data-testid="ide-agents-needs">
      <div class="ide-agents__head">⚑ Needs input · {{ needsInput.length }}</div>
      <div v-for="s in needsInput" :key="s.subagentId" class="ide-agents__row">
        <span class="ide-agents__state is-needs">{{ s.status }}</span>
        {{ s.goal || s.subagentId }}<span class="ide-agents__dur">{{ dur(s) }}</span>
      </div>
    </div>
    <div class="ide-agents__section is-working" data-testid="ide-agents-working">
      <div class="ide-agents__head">▶ Working · {{ working.length }}</div>
      <div v-for="s in working" :key="s.subagentId" class="ide-agents__row">
        <span class="ide-agents__state is-working">running</span>
        {{ s.goal || s.subagentId }}<span class="ide-agents__dur">{{ dur(s) }}</span>
      </div>
    </div>
    <div class="ide-agents__section is-done" data-testid="ide-agents-completed">
      <div class="ide-agents__head">✓ Completed · {{ completed.length }}</div>
      <div v-for="s in completed" :key="s.subagentId" class="ide-agents__row">
        <span class="ide-agents__state is-done">{{ s.status }}</span>
        {{ s.goal || s.subagentId }}<span class="ide-agents__dur">{{ dur(s) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-agents { margin: 4px 12px; font-size: 12px; }
.ide-agents__section { margin: 6px 0; }
.ide-agents__head { font-weight: 600; color: var(--text-color-3, #999); font-size: 11px; }
.ide-agents__row { display: flex; gap: 8px; align-items: baseline; padding: 2px 4px; }
.ide-agents__state { font-size: 10px; padding: 0 6px; border-radius: 8px; }
.ide-agents__state.is-needs { background: rgba(208, 48, 80, 0.1); color: #c0392b; }
.ide-agents__state.is-working { background: rgba(24, 160, 88, 0.12); color: #18a058; }
.ide-agents__state.is-done { background: var(--hover-color, rgba(0, 0, 0, 0.06)); color: var(--text-color-3, #999); }
.ide-agents__dur { margin-left: auto; color: var(--text-color-3, #aaa); font-size: 11px; }
</style>
