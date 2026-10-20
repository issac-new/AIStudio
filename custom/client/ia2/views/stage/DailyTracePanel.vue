<!-- ⑤验收·需求追溯（日常源）：看板任务、执行结果与人工判定入口同屏对账；
     不读取推演证据目录。推演参照在全流程推演·证据库查看。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../store/workspace'
import { isRecentTask, taskPathLabel, taskResultLabel, taskStatusLabel, taskUpdatedLabel, type RawBoardTask } from './daily-task-display'
import DailySimReference from './DailySimReference.vue'

const emit = defineEmits<{ (e: 'open-task', id: string): void }>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const workspace = useWorkspaceStore()

const rows = computed<RawBoardTask[]>(() => [...(workspace.rawTasks ?? [])]
  .filter(r => r.task.status === 'review' || (r.task.status === 'done' && isRecentTask(r.task)))
  .sort((a, b) => (a.task.status === 'review' ? 0 : 1) - (b.task.status === 'review' ? 0 : 1)
    || (b.task.completed_at ?? b.task.created_at) - (a.task.completed_at ?? a.task.created_at))
  .slice(0, 30))
</script>

<template>
  <section class="dtp" data-testid="daily-trace-panel">
    <header class="dtp__head">
      <div>
        <h2 class="dtp__title">{{ zh ? '需求与任务对账' : 'Requirement trace' }}</h2>
        <p class="dtp__sub">{{ zh ? '按看板任务追踪验收标准、执行结果与人工判定；点任务打开原卡。' : 'Trace tasks, results, and human decisions from the board.' }}</p>
      </div>
      <span class="dtp__count">{{ rows.length }}</span>
    </header>
    <p v-if="!rows.length" class="dtp__empty">{{ zh ? '还没有进入验收或已完成的任务。' : 'No tasks in acceptance or done yet.' }}</p>
    <div v-else class="dtp__rows">
      <button v-for="r in rows" :key="`${r.board}:${r.task.id}`" type="button" class="dtp__row" :data-testid="`daily-trace-${r.task.id}`" @click="emit('open-task', r.task.id)">
        <strong class="dtp__name">{{ r.task.title }}</strong>
        <span class="dtp__meta">{{ r.task.id }} · {{ r.board }} · {{ r.task.assignee || '未指派' }} · {{ taskUpdatedLabel(r.task) }}</span>
        <span class="dtp__result">{{ taskResultLabel(r.task) }}</span>
        <span class="dtp__status" :data-status="r.task.status">{{ taskStatusLabel(r.task.status) }}</span>
        <span v-if="r.task.workspace_path" class="dtp__path" :title="r.task.workspace_path">{{ taskPathLabel(r.task) }}</span>
      </button>
    </div>
    <DailySimReference what="验收判定链（冻结单×测试报告×UAT）" />
  </section>
</template>

<style scoped>
.dtp { display: flex; flex-direction: column; gap: 10px; }
.dtp__head { display: flex; align-items: flex-start; gap: 12px; }
.dtp__title { margin: 0; font-size: 15px; }
.dtp__sub { margin: 3px 0 0; font-size: 12px; color: var(--text-muted); }
.dtp__count { margin-left: auto; font-size: 16px; font-weight: 700; color: var(--accent-primary); }
.dtp__empty { margin: 0; padding: 18px; border: 1px dashed var(--border-color); border-radius: 8px; color: var(--text-muted); font-size: 12px; }
.dtp__rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px; }
.dtp__row { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; padding: 9px 11px; border: 1px solid var(--border-color); border-radius: 8px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.dtp__row:hover { background: var(--bg-secondary); }
.dtp__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.dtp__meta, .dtp__result, .dtp__path { grid-column: 1 / -1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--text-muted); }
.dtp__status { padding: 1px 7px; border: 1px solid var(--border-color); border-radius: 999px; font-size: 10.5px; }
</style>
