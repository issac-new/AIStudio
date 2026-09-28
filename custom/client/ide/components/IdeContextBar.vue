<script setup lang="ts">
// IdeContextBar — 分段上下文水位条（复刻 dsh-TUI 5 段配色：system/prompt/assistant/
// thinking/tools +悬停图例 breakdown+80/95% 压力变色读数；UI 复刻 S3）。
// 数据=useSessionMetrics 的分段（六源 context-six-source 同语义四段合并映射五段）。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useSessionMetrics } from '../composables/useSessionMetrics'
import { computeBreakdown } from '../utils/contextBreakdown'

const metrics = useSessionMetrics()
const chatStore = useChatStore()
const hover = ref(false)

interface Segment { key: string; label: string; pct: number; color: string }

/** 分段构成（真实 span 源=computeBreakdown——G4 构成分解同源：按消息角色归段；
 * 无可分解口径时回落总量条（诚实不虚构构成）。 */
const segments = computed<Segment[]>(() => {
  const used = (metrics as unknown as { contextUsed?: { value: number } }).contextUsed?.value ?? 0
  const breakdown = computeBreakdown((chatStore.activeSession?.messages ?? []) as never, used)
  if (!breakdown || breakdown.total <= 0) return []
  const COLORS: Record<string, string> = {
    system: '#e5c07b', user: '#61afef', assistant: '#98c379', tool: '#c678dd',
  }
  const LABELS: Record<string, string> = {
    system: 'system/prompt', user: 'user', assistant: 'assistant/thinking', tool: 'tools',
  }
  return breakdown.segments
    .filter((seg) => seg.tokens > 0)
    .map((seg) => ({
      key: seg.key,
      label: LABELS[seg.key] ?? seg.key,
      pct: Math.round((seg.tokens / breakdown.total) * 100),
      color: COLORS[seg.key] ?? '#888',
    }))
})

const totalPct = computed(() => {
  const used = (metrics as unknown as { contextUsed?: { value: number } }).contextUsed?.value ?? 0
  const len = (metrics as unknown as { contextLength?: { value: number } }).contextLength?.value ?? 1
  return Math.min(100, Math.round((used / Math.max(1, len)) * 100))
})

const pressure = computed(() => (totalPct.value >= 95 ? 'critical' : totalPct.value >= 80 ? 'warn' : 'ok'))

/** 无遥测（coding-agent 类会话不上报 contextTokens）→ 诚实标注而非误导性 0%。 */
const noTelemetry = computed(() => totalPct.value === 0)
</script>

<template>
  <div
    class="ide-ctxbar"
    :class="`is-${pressure}`"
    data-testid="ide-context-bar"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <div class="ide-ctxbar__track">
      <span
        v-for="s in segments"
        :key="s.key"
        class="ide-ctxbar__seg"
        :style="{ width: `${s.pct}%`, background: s.color }"
        :data-testid="`ide-ctxbar-seg-${s.key}`"
      />
      <span v-if="!segments.length" class="ide-ctxbar__seg is-total" :style="{ width: `${totalPct}%` }" />
    </div>
    <span class="ide-ctxbar__pct" :data-testid="'ide-ctxbar-pct'">{{ noTelemetry ? '无遥测' : totalPct + '%' }}</span>
    <div v-if="hover" class="ide-ctxbar__legend" data-testid="ide-ctxbar-legend">
      <template v-if="segments.length">
        <div v-for="s in segments" :key="s.key">
          <span class="ide-ctxbar__dot" :style="{ background: s.color }" />{{ s.label }} {{ s.pct }}%
        </div>
      </template>
      <div v-else>分段构成数据未就绪（显示总量）</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-ctxbar { position: relative; display: inline-flex; align-items: center; gap: 6px; cursor: default; }
.ide-ctxbar__track {
  width: 140px; height: 8px; border-radius: 4px; overflow: hidden; display: flex;
  background: var(--hover-color, rgba(0, 0, 0, 0.08));
}
.ide-ctxbar__seg { height: 100%; }
.ide-ctxbar__seg.is-total { background: var(--primary-color, #18a058); }
.ide-ctxbar__pct { font-size: 11px; color: var(--text-color-3, #999); }
.ide-ctxbar.is-warn .ide-ctxbar__pct { color: #b8860b; }
.ide-ctxbar.is-critical .ide-ctxbar__pct { color: #d03050; font-weight: 600; }
.ide-ctxbar__legend {
  position: absolute; bottom: calc(100% + 4px); left: 0; z-index: 50;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px; padding: 6px 10px; font-size: 11px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.ide-ctxbar__dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
</style>
