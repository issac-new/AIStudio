<script setup lang="ts">
// IdeMentionChip — mention 触发结果 chip（复刻 multica comment 旁结果 chip：
// 每个 @mention 的分派结果 reason 码本地化画在旁——回答"为什么没跑"；UI 复刻 R4）。
// 数据源=useZcodeProjection().mentionOutcomes（dispatch-reasons 词表字面值）。
import { computed } from 'vue'
import { useZcodeProjection } from '../../zcode/store/zcode-projection'

const zcode = useZcodeProjection()

const REASON_TEXT: Record<string, string> = {
  queued: '已派单', coalesced: '并入现有 run', runtime_offline: '引擎离线未跑',
  target_unavailable: '目标不可用', deferred: '旧链托管', command_rejected: '引擎拒绝',
  engine_unreachable: '引擎不可达', self_trigger_suppressed: '自触发已抑制',
  duplicate: '重复派被拦', paused: '全局暂停', capacity: '并发已满', dedupe: '同键在跑',
}

const outcomes = computed(() => (zcode.state.mentionOutcomes ?? []).slice(-6))

function text(reason: string): string {
  return REASON_TEXT[reason] ?? reason
}

function isTrouble(reason: string): boolean {
  return reason !== 'queued' && reason !== 'coalesced'
}
</script>

<template>
  <div v-if="outcomes.length" class="ide-mention-chips" data-testid="ide-mention-chips">
    <span
      v-for="(o, i) in outcomes"
      :key="i"
      class="ide-mention-chip"
      :class="{ 'is-trouble': isTrouble(o.reason) }"
      :data-testid="`ide-mention-chip-${o.reason}`"
      :title="o.detail ?? ''"
    >@{{ o.target ?? '…' }} · {{ text(o.reason) }}</span>
  </div>
</template>

<style scoped lang="scss">
.ide-mention-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 12px; }
.ide-mention-chip {
  font-size: 11px; padding: 1px 8px; border-radius: 10px;
  background: var(--hover-color, rgba(0, 0, 0, 0.05)); color: var(--text-color-3, #777);
}
.ide-mention-chip.is-trouble {
  background: rgba(208, 48, 80, 0.08); color: #c0392b; border: 1px solid rgba(208, 48, 80, 0.25);
}
</style>
