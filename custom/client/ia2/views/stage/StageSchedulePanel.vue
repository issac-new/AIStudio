<!-- ③分析设计·排期页签：只列已排期（scheduled）任务，点行开看板抽屉。
     没有已排期任务时给出去看板设置排期的真实出口，不放假日期表单。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../store/workspace'

const emit = defineEmits<{ (e: 'open-task', taskId: string): void }>()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const workspace = useWorkspaceStore()

const scheduled = computed(() => workspace.tasks
  .filter(t => t.status === 'scheduled')
  .sort((a, b) => a.createdAt - b.createdAt))
</script>

<template>
  <section class="ssp" data-testid="stg-schedule">
    <header class="ssp__head">
      <h2 class="ssp__title">{{ zh ? '已排期任务' : 'Scheduled tasks' }}</h2>
      <span class="ssp__n">{{ scheduled.length }}</span>
      <button type="button" class="ssp__btn" @click="router.push({ name: 'ia2.board' })">{{ zh ? '去看板排期' : 'Schedule on board' }}</button>
    </header>

    <div v-if="scheduled.length" class="ssp__rows">
      <button
        v-for="t in scheduled"
        :key="t.id"
        type="button"
        class="ssp__row"
        :data-testid="`stg-schedule-${t.id}`"
        @click="emit('open-task', t.id)"
      >
        <span class="ssp__body">
          <strong>{{ t.title }}</strong>
          <span>{{ t.id }}<template v-if="t.workspace"> · {{ t.workspace }}</template><template v-if="t.assignee"> · {{ t.assignee }}</template></span>
        </span>
        <span class="ssp__go">{{ zh ? '打开' : 'Open' }}</span>
      </button>
    </div>
    <div v-else class="ssp__empty" data-testid="stg-schedule-empty">
      <p>{{ zh ? '还没有已排期的任务。' : 'No task is scheduled yet.' }}</p>
      <p class="ssp__empty-sub">{{ zh ? '在看板里把任务状态改为「scheduled」即进入排期。' : 'Set a task to “scheduled” on the board to schedule it.' }}</p>
    </div>
  </section>
</template>

<style scoped>
.ssp { display: flex; flex-direction: column; gap: 10px; }
.ssp__head { display: flex; align-items: center; gap: 8px; }
.ssp__title { margin: 0; font-size: 14px; }
.ssp__n { font-size: 11px; color: var(--text-muted); }
.ssp__btn { margin-left: auto; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 12px; padding: 4px 12px; cursor: pointer; }
.ssp__btn:hover { background: var(--bg-secondary); }
.ssp__rows { display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.ssp__row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--border-color); background: transparent; text-align: left; font-family: inherit; color: inherit; cursor: pointer; }
.ssp__row:last-child { border-bottom: 0; }
.ssp__row:hover { background: var(--bg-secondary); }
.ssp__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ssp__body strong { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssp__body span { font-size: 10.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssp__go { font-size: 11px; color: var(--accent-primary); white-space: nowrap; }
.ssp__empty { padding: 22px 16px; text-align: center; border: 1px dashed var(--border-color); border-radius: 8px; }
.ssp__empty p { margin: 0; font-size: 12.5px; }
.ssp__empty-sub { margin-top: 4px !important; font-size: 11.5px !important; color: var(--text-muted); }
</style>
