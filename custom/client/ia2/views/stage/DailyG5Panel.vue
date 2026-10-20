<!-- ⑤验收·G5 审批（日常源）：发布类审批 + review/done 任务概览；
     推演 release-gate 台账回到全流程推演，不在日常页写入。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ApprovalPanel from '@/custom/cockpit/components/ApprovalPanel.vue'
import { useWorkspaceStore } from '../../store/workspace'
import { isRecentTask, taskStatusLabel, taskUpdatedLabel, type RawBoardTask } from './daily-task-display'
import { useAssigneeLabel } from './assignee-display'
import DailySimReference from './DailySimReference.vue'

const emit = defineEmits<{ (e: 'open-all'): void; (e: 'open-task', id: string): void }>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const workspace = useWorkspaceStore()
const assigneeLabel = useAssigneeLabel()
const rows = computed<RawBoardTask[]>(() => [...(workspace.rawTasks ?? [])]
  .filter(r => r.task.status === 'review' || (r.task.status === 'done' && isRecentTask(r.task)))
  .sort((a, b) => (b.task.completed_at ?? b.task.created_at) - (a.task.completed_at ?? a.task.created_at))
  .slice(0, 5))
</script>

<template>
  <div class="dgp" data-testid="daily-g5-panel">
    <section class="dgp__block">
      <header class="dgp__head">
        <h3 class="dgp__title">{{ zh ? '发布类审批' : 'Release approvals' }}</h3>
      </header>
      <p class="dgp__note">{{ zh ? '与发布、准出相关的评审卡；普通命令与普通评审在审批收件箱处理。' : 'Release-related reviews only; ordinary approvals stay in the inbox.' }}</p>
      <ApprovalPanel :poll-ms="10000" :show-history="true" :hide-title="true" filter="release" @open-all="emit('open-all')" />
    </section>

    <section class="dgp__block">
      <header class="dgp__head">
        <h3 class="dgp__title">{{ zh ? '发布前任务检查' : 'Pre-release tasks' }}</h3>
      </header>
      <p v-if="!rows.length" class="dgp__note">{{ zh ? '没有待验收或已完成的任务。' : 'No review or done tasks.' }}</p>
      <div v-else class="dgp__rows">
        <button v-for="r in rows" :key="`${r.board}:${r.task.id}`" type="button" class="dgp__row" @click="emit('open-task', r.task.id)">
          <strong>{{ r.task.title }}</strong>
          <span>{{ taskStatusLabel(r.task.status) }} · {{ assigneeLabel(r.task.assignee) }} · {{ taskUpdatedLabel(r.task) }}</span>
        </button>
      </div>
      <DailySimReference what="发布准出台账" />
  </section>
  </div>
</template>

<style scoped>
.dgp { display: flex; flex-direction: column; gap: 16px; }
.dgp__block { display: flex; flex-direction: column; gap: 8px; }
.dgp__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.dgp__title { margin: 0; font-size: 13px; font-weight: 600; }
.dgp__note { margin: 0; font-size: 11.5px; color: var(--text-muted); line-height: 1.55; }
.dgp__rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; }
.dgp__row { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.dgp__row:hover { background: var(--bg-secondary); }
.dgp__row span { font-size: 11px; color: var(--text-muted); }
</style>
