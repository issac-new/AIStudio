<!-- overlay/custom/client/ia2/components/SitlineBar.vue -->
<!-- v12.4 态势条（2026-09-20 用户裁定：删会话/循环/管理）：页头一行全局态势
     仅保留——等我⚠（待我决策的任务及会话）/ 任务（进行·待审，口径=跨板
     未完成未归档全量）/ 在线（人·智能体·机器）。点击 emit select(segment)
     就地展开 SitDetailPanel 内联面板（active 高亮当前展开段）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  waitingCount: number
  /** 最久等待人类可读标签（如 3h；空则不显示副注） */
  oldestLabel?: string
  taskTotal: number
  taskRunning: number
  taskReview: number
  onlinePeople: number
  onlineAgents: number
  onlineMachines: number
  /** 当前展开的内联面板段（null=无） */
  active?: 'waiting' | 'tasks' | 'online' | null
}>()

const emit = defineEmits<{
  (e: 'select', segment: 'waiting' | 'tasks' | 'online'): void
}>()
const { t } = useI18n()
</script>

<template>
  <div class="sit" data-testid="sitline">
    <button
      type="button" class="sit__item sit__item--warn" :class="{ 'sit__item--on': active === 'waiting' }" data-testid="sit-waiting"
      :title="t('ia2.sit.waitingTitle')"
      @click="emit('select', 'waiting')"
    >
      ⧖ {{ t('ia2.sit.waiting') }} {{ waitingCount }}
      <span v-if="oldestLabel" class="sit__sm">{{ t('ia2.sit.oldest') }} {{ oldestLabel }}</span>
    </button>
    <button type="button" class="sit__item" :class="{ 'sit__item--on': active === 'tasks' }" data-testid="sit-tasks" @click="emit('select', 'tasks')">
      📋 {{ t('ia2.sit.tasks') }} {{ taskTotal }}
      <span class="sit__sm">{{ t('ia2.sit.running') }} {{ taskRunning }} · {{ t('ia2.sit.review') }} {{ taskReview }}</span>
    </button>
    <button type="button" class="sit__item" :class="{ 'sit__item--on': active === 'online' }" data-testid="sit-online" @click="emit('select', 'online')">
      <span class="sit__dot sit__dot--ok" />{{ t('ia2.sit.online') }} {{ onlinePeople + onlineAgents + onlineMachines }}
      <span class="sit__sm">{{ t('ia2.sit.onlineDetail', { p: onlinePeople, a: onlineAgents, m: onlineMachines }) }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.sit {
  display: flex; align-items: center; gap: 4px; flex-shrink: 0;
  padding: 4px 2px; font-size: 12px; overflow-x: auto; scrollbar-width: thin;
}
.sit__item {
  display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px;
  border: none; border-radius: 6px; background: transparent;
  color: var(--text-secondary); font-size: 12px; cursor: pointer; white-space: nowrap;
  font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.sit__item--warn { color: var(--warning); font-weight: 700; }
.sit__item--on { background: var(--bg-secondary); color: var(--text-primary); box-shadow: inset 0 -2px 0 var(--primary, #3b82f6); }
.sit__sm { font-size: 10px; color: var(--text-muted); }
.sit__dot { width: 8px; height: 8px; border-radius: 50%; }
.sit__dot--ok { background: var(--success); }
</style>
