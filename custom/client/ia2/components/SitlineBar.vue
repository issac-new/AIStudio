<!-- overlay/custom/client/ia2/components/SitlineBar.vue -->
<!-- v12 态势条（2026-09-19 统一视图）：沟通协作视图顶部一行的全局态势——
     等我⚠ / 任务（进行·待审）/ 会话 / 循环（阻塞）/ 在线（人·智能体·机器）+
     ⚙管理入口（动线⑥）。计数经 props，装配方（WorkbenchView）聚合；
     五态势项 emit select(segment)，跳转语义由装配方决定（v12.1）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  waitingCount: number
  /** 最久等待人类可读标签（如 3h；空则不显示副注） */
  oldestLabel?: string
  taskTotal: number
  taskRunning: number
  taskReview: number
  sessionCount: number
  loopTotal: number
  loopBlocked: number
  onlinePeople: number
  onlineAgents: number
  onlineMachines: number
}>()

const emit = defineEmits<{
  (e: 'open-gov'): void
  (e: 'select', segment: 'waiting' | 'tasks' | 'sessions' | 'loops' | 'online'): void
}>()
const { t } = useI18n()
</script>

<template>
  <div class="sit" data-testid="sitline">
    <button
      type="button" class="sit__item sit__item--warn" data-testid="sit-waiting"
      :title="t('ia2.sit.waitingTitle')"
      @click="emit('select', 'waiting')"
    >
      ⧖ {{ t('ia2.sit.waiting') }} {{ waitingCount }}
      <span v-if="oldestLabel" class="sit__sm">{{ t('ia2.sit.oldest') }} {{ oldestLabel }}</span>
    </button>
    <button type="button" class="sit__item" data-testid="sit-tasks" @click="emit('select', 'tasks')">
      📋 {{ t('ia2.sit.tasks') }} {{ taskTotal }}
      <span class="sit__sm">{{ t('ia2.sit.running') }} {{ taskRunning }} · {{ t('ia2.sit.review') }} {{ taskReview }}</span>
    </button>
    <button type="button" class="sit__item" data-testid="sit-sessions" @click="emit('select', 'sessions')">
      💬 {{ t('ia2.sit.sessions') }} {{ sessionCount }}
    </button>
    <button
      type="button" class="sit__item" :class="{ 'sit__item--err': loopBlocked > 0 }" data-testid="sit-loops"
      @click="emit('select', 'loops')"
    >
      ▶ {{ t('ia2.sit.loops') }} {{ loopTotal }}
      <span v-if="loopBlocked" class="sit__sm">{{ t('ia2.sit.blocked') }} {{ loopBlocked }}</span>
    </button>
    <button type="button" class="sit__item" data-testid="sit-online" @click="emit('select', 'online')">
      <span class="sit__dot sit__dot--ok" />{{ t('ia2.sit.online') }} {{ onlinePeople + onlineAgents + onlineMachines }}
      <span class="sit__sm">{{ t('ia2.sit.onlineDetail', { p: onlinePeople, a: onlineAgents, m: onlineMachines }) }}</span>
    </button>
    <span class="sit__spacer" />
    <button type="button" class="sit__gov" data-testid="sit-gov" @click="emit('open-gov')">
      ⚙ {{ t('ia2.sit.manage') }}
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
.sit__item--err .sit__sm { color: var(--error); font-weight: 600; }
.sit__sm { font-size: 10px; color: var(--text-muted); }
.sit__dot { width: 8px; height: 8px; border-radius: 50%; }
.sit__dot--ok { background: var(--success); }
.sit__spacer { flex: 1; min-width: 8px; }
.sit__gov {
  height: 26px; padding: 0 12px; border: 1px solid var(--border-color); border-radius: 13px;
  background: var(--bg-card); color: var(--text-secondary); font-size: 12px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
