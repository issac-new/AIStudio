<script setup lang="ts">
// IdeTeamSummaryBar — agent-team 状态汇总条（UI 融合 UI-4，minimax 汇总条吸收落地）。
// 数据=chatStore.subagentStreams（当前会话六态真数据）→ team-summary-bar 投影
// （server 域同语义的客户端镜像：五态计数+健康色红黄绿+零值段省略）。
// 状态映射：completed→done；failed/error/cancelled/interrupted→failed；
// running→running；running 且 updatedAt 超 5 分钟→stale（黄）。
import { computed } from 'vue'
import { useChatStore, type SubagentStream } from '@/stores/hermes/chat'

const chat = useChatStore()

const STALE_MS = 5 * 60 * 1000

const streams = computed<SubagentStream[]>(() => {
  const sid = chat.activeSessionId
  if (!sid) return []
  const list: SubagentStream[] = []
  for (const [key, stream] of chat.subagentStreams) {
    if (key.startsWith(`${sid}:`)) list.push(stream)
  }
  return list
})

const summary = computed(() => {
  const now = Date.now()
  const counts = { running: 0, done: 0, failed: 0, stale: 0 }
  for (const s of streams.value) {
    if (s.status === 'completed') counts.done += 1
    else if (s.status === 'running') {
      if (now - s.updatedAt > STALE_MS) counts.stale += 1
      else counts.running += 1
    } else counts.failed += 1
  }
  const health = counts.failed > 0 ? 'red' : counts.stale > 0 ? 'amber' : 'green'
  const parts = [`${streams.value.length} agents`]
  if (counts.running) parts.push(`${counts.running} running`)
  if (counts.done) parts.push(`${counts.done} done`)
  if (counts.failed) parts.push(`${counts.failed} failed`)
  if (counts.stale) parts.push(`${counts.stale} stale`)
  return { counts, health, bar: parts.join(' · ') }
})
</script>

<template>
  <div
    v-if="streams.length"
    class="ide-team-bar"
    :class="`is-${summary.health}`"
    data-testid="ide-team-summary-bar"
  >{{ summary.bar }}</div>
</template>

<style scoped lang="scss">
.ide-team-bar {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
}

.ide-team-bar.is-green { color: #18a058; }
.ide-team-bar.is-amber {
  color: #b8860b;
  background: rgba(184, 134, 11, 0.08);
  border-color: rgba(184, 134, 11, 0.35);
}
.ide-team-bar.is-red {
  color: #d03050;
  background: rgba(208, 48, 80, 0.06);
  border-color: rgba(208, 48, 80, 0.35);
}
</style>
