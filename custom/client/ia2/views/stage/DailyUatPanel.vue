<!-- ⑤验收·UAT 待判（日常源）：review 任务等待人类验收；判定动作回到任务卡
     或审批系统留痕，不写推演台账。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../../store/workspace'
import { taskPathLabel, taskResultLabel, taskUpdatedLabel, type RawBoardTask } from './daily-task-display'
import DailySimReference from './DailySimReference.vue'

const emit = defineEmits<{ (e: 'open-task', id: string): void }>()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const workspace = useWorkspaceStore()
const rows = computed<RawBoardTask[]>(() => [...(workspace.rawTasks ?? [])]
  .filter(r => r.task.status === 'review')
  .sort((a, b) => (b.task.last_heartbeat_at ?? b.task.created_at) - (a.task.last_heartbeat_at ?? a.task.created_at)))

function openInbox(): void { void router.push({ name: 'ia2.inbox' }) }
</script>

<template>
  <section class="dup" data-testid="daily-uat-panel">
    <header class="dup__head">
      <div>
        <h2 class="dup__title">{{ zh ? 'UAT 待判' : 'UAT waiting for you' }}</h2>
        <p class="dup__sub">{{ zh ? '这些任务已经提交人工验收。打开任务卡填写结果，或在审批收件箱处理对应审批。' : 'Open the task to record a result, or handle its approval in the inbox.' }}</p>
      </div>
      <button type="button" class="dup__btn" data-testid="daily-uat-inbox" @click="openInbox">{{ zh ? '打开审批收件箱' : 'Open approvals' }}</button>
    </header>
    <p v-if="!rows.length" class="dup__empty">{{ zh ? '没有等待 UAT 判定的任务。' : 'No tasks waiting for UAT.' }}</p>
    <div v-else class="dup__rows">
      <article v-for="r in rows" :key="`${r.board}:${r.task.id}`" class="dup__row" :data-testid="`daily-uat-${r.task.id}`">
        <strong class="dup__name">{{ r.task.title }}</strong>
        <span class="dup__meta">{{ r.task.assignee || '未指派' }} · {{ taskUpdatedLabel(r.task) }} · {{ taskPathLabel(r.task) }}</span>
        <span class="dup__result">{{ taskResultLabel(r.task) }}</span>
        <button type="button" class="dup__btn" @click="emit('open-task', r.task.id)">打开任务判定</button>
      </article>
    </div>
    <DailySimReference what="UAT 判定台账" />
  </section>
</template>

<style scoped>
.dup { display: flex; flex-direction: column; gap: 10px; }
.dup__head { display: flex; align-items: flex-start; gap: 12px; }
.dup__title { margin: 0; font-size: 15px; }
.dup__sub { margin: 3px 0 0; font-size: 12px; color: var(--text-muted); }
.dup__btn { margin-left: auto; border: 1px solid var(--accent-primary); border-radius: 6px; background: transparent; color: var(--accent-primary); font: inherit; font-size: 12px; padding: 4px 11px; cursor: pointer; white-space: nowrap; }
.dup__empty { margin: 0; padding: 18px; border: 1px dashed var(--border-color); border-radius: 8px; color: var(--text-muted); font-size: 12px; }
.dup__rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; }
.dup__row { display: flex; flex-direction: column; gap: 4px; padding: 10px 11px; border: 1px solid var(--border-color); border-radius: 8px; }
.dup__row .dup__btn { margin: 6px 0 0 auto; }
.dup__name { font-size: 12.5px; }
.dup__meta, .dup__result { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
