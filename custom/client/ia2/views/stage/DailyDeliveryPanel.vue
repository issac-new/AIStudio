<!-- ⑤验收·交付健康（日常源）：从任务卡读分支、工作区与结果，缺项直指任务；
     不读推演 evidence 目录。 -->
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
  .sort((a, b) => (b.task.last_heartbeat_at ?? b.task.created_at) - (a.task.last_heartbeat_at ?? a.task.created_at))
  .slice(0, 30))
const missingBranch = computed(() => rows.value.filter(r => !r.task.branch_name).length)
const missingResult = computed(() => rows.value.filter(r => !String(r.task.result ?? '').trim() && r.task.status === 'done').length)
</script>

<template>
  <section class="ddp" data-testid="daily-delivery-panel">
    <header class="ddp__head">
      <div>
        <h2 class="ddp__title">{{ zh ? '交付健康' : 'Delivery health' }}</h2>
        <p class="ddp__sub">{{ zh ? '任务卡是日常交付源：分支、工作区和结果缺一项，就回到原任务补齐。' : 'Tasks are the delivery source: fix missing branch, workspace, or result at the card.' }}</p>
      </div>
    </header>
    <div class="ddp__stats">
      <span>任务 {{ rows.length }}</span>
      <span :class="{ 'ddp__warn': missingBranch }">未填分支 {{ missingBranch }}</span>
      <span :class="{ 'ddp__warn': missingResult }">完成但无结果 {{ missingResult }}</span>
    </div>
    <p v-if="!rows.length" class="ddp__empty">{{ zh ? '还没有可验收的交付任务。' : 'No deliverable tasks yet.' }}</p>
    <div v-else class="ddp__tablewrap">
      <table class="ddp__table">
        <thead><tr><th>任务</th><th>负责人</th><th>状态</th><th>分支</th><th>工作区</th><th>更新</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="`${r.board}:${r.task.id}`" class="ddp__row" :data-testid="`daily-delivery-${r.task.id}`" @click="emit('open-task', r.task.id)">
            <td class="ddp__task">
              <strong>{{ r.task.title }}</strong>
              <span>{{ taskResultLabel(r.task) }}</span>
            </td>
            <td>{{ r.task.assignee || '未指派' }}</td>
            <td>{{ taskStatusLabel(r.task.status) }}</td>
            <td class="ddp__mono">{{ r.task.branch_name || '未填写' }}</td>
            <td class="ddp__mono" :title="r.task.workspace_path">{{ taskPathLabel(r.task) }}</td>
            <td>{{ taskUpdatedLabel(r.task) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <DailySimReference what="交付物与证据链" />
  </section>
</template>

<style scoped>
.ddp { display: flex; flex-direction: column; gap: 10px; }
.ddp__head > div { min-width: 0; }
.ddp__title { margin: 0; font-size: 15px; }
.ddp__sub { margin: 3px 0 0; font-size: 12px; color: var(--text-muted); }
.ddp__stats { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.ddp__stats span { border: 1px solid var(--border-color); border-radius: 999px; padding: 2px 9px; }
.ddp__warn { color: var(--ia-stale); border-color: color-mix(in srgb, var(--ia-stale) 45%, var(--border-color)); }
.ddp__empty { margin: 0; padding: 18px; border: 1px dashed var(--border-color); border-radius: 8px; color: var(--text-muted); font-size: 12px; }
.ddp__tablewrap { min-width: 0; overflow-x: auto; }
.ddp__table { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 12px; }
.ddp__table th, .ddp__table td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.ddp__row { cursor: pointer; }
.ddp__row:hover { background: var(--bg-secondary); }
.ddp__task { display: flex; flex-direction: column; gap: 2px; min-width: 220px; max-width: 360px; }
.ddp__task span { color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ddp__mono { font-family: var(--font-mono); font-size: 11px; }
</style>
