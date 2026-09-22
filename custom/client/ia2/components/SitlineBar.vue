<!-- overlay/custom/client/ia2/components/SitlineBar.vue -->
<!-- v12.4 态势条（2026-09-20 用户裁定：删会话/循环/管理）：页头一行全局态势
     仅保留——等我⚠（待我决策的任务及会话）/ 任务（分状态分类汇总，口径=跨板
     未完成未归档全量；v12.7 由「进行·待审」两项扩为 9 态词表全量，零计数跳过）/
     在线（人·智能体·机器）。点击 emit select(segment)
     就地展开 SitDetailPanel 内联面板（active 高亮当前展开段）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** R6 补充：waiting 并入 tasks（单「任务」chip；待决策数作为副注角标） */
  waitingCount: number
  /** 最久等待人类可读标签（如 3h；空则不显示副注） */
  oldestLabel?: string
  taskTotal: number
  /** v12.7：分状态计数（byStatus），替代原 taskRunning/taskReview 两项；
   *  与 useSitCounts.tasks 同形，零计数状态不呈现 */
  taskByStatus: Record<string, number>
  onlinePeople: number
  onlineAgents: number
  onlineMachines: number
  /** 当前展开的内联面板段（null=无） */
  active?: 'tasks' | 'online' | null
}>()

const emit = defineEmits<{
  (e: 'select', segment: 'tasks' | 'online'): void
}>()
const { t } = useI18n()

/** 状态呈现顺序：与 SitDetailPanel STATUS_ORDER 同一词表序；done/archived
 *  不进任务口径（openTasks 已过滤），防御性排除 */
const STATUS_ORDER = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review'] as const

/** 任务按钮副注：9 态全量分类汇总，零计数跳过；
 *  词条与 SitDetailPanel/tdp 共用 ia2.tdp.status.*（状态词单一事实源） */
const taskStatusSummary = computed(() =>
  STATUS_ORDER
    .filter(s => (props.taskByStatus[s] ?? 0) > 0)
    .map(s => `${t(`ia2.tdp.status.${s}`)} ${props.taskByStatus[s]}`)
    .join(' · '),
)
</script>

<template>
  <div class="sit" data-testid="sitline">
    <!-- R6 补充：「等我」与「任务」合并为单「任务」chip（待决策数作为角标副注；
         面板顶部仍有待决策区，决策动作在面板内） -->
    <button type="button" class="sit__item" :class="{ 'sit__item--on': active === 'tasks' }" data-testid="sit-tasks" @click="emit('select', 'tasks')">
      📋 {{ t('ia2.sit.tasks') }} {{ taskTotal }}
      <span v-if="waitingCount" class="sit__sm sit__sm--warn" data-testid="sit-tasks-decide">{{ t('ia2.sit.decideCount', { n: waitingCount }) }}</span>
      <span v-if="taskStatusSummary" class="sit__sm" data-testid="sit-tasks-summary">{{ taskStatusSummary }}</span>
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

/* R6 待决策角标（任务 chip 副注，warning 色显性化） */
.sit__sm--warn { color: var(--warning); font-weight: 700; }
.sit__item--on { background: var(--bg-secondary); color: var(--text-primary); box-shadow: inset 0 -2px 0 var(--primary, #3b82f6); }
.sit__sm { font-size: 10px; color: var(--text-muted); }
.sit__dot { width: 8px; height: 8px; border-radius: 50%; }
.sit__dot--ok { background: var(--success); }
</style>
