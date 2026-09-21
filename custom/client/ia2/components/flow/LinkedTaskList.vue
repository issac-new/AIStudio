<!-- overlay/custom/client/ia2/components/flow/LinkedTaskList.vue -->
<!-- v12 右栏 · 挂接任务：8px 状态语义点 + 标题/指派 + 行上动作
     （改派=任务抽屉 / ⌨=IDE 任务空间 / 去处理=看板深链）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

defineProps<{ tasks: CockpitTask[] }>()

const emit = defineEmits<{
  (e: 'reassign', taskId: string): void
  (e: 'open-ide', taskId: string): void
  (e: 'handle-task', taskId: string): void
}>()

const { t } = useI18n()

// R7-A workdir 短路径展示（取末两段，归属链区可读）
function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || p
}

const TONE: Record<string, string> = {
  running: 'run', review: 'warn', blocked: 'err', done: 'ok',
  triage: 'info', todo: 'idle', scheduled: 'idle', ready: 'idle', archived: 'idle',
}
</script>

<template>
  <div class="ltl" data-testid="tdp-linked">
    <div v-if="!tasks.length" class="ltl__empty">{{ t('ia2.tdp.linkedEmpty') }}</div>
    <div v-for="task in tasks" :key="task.id" class="ltl__row" :data-testid="`tdp-task-${task.id}`">
      <span class="ltl__dot" :class="`ltl__dot--${TONE[task.status] ?? 'idle'}`" />
      <span class="ltl__body">
        <span class="ltl__title">
          <span class="ltl__id">#{{ task.id.slice(0, 8) }}</span> {{ task.title }}
        </span>
        <span class="ltl__sub">
          {{ t(`ia2.tdp.status.${task.status}`) }} · {{ task.assignee }}
        </span>
        <!-- R7-A 归属链：关联会话 + workdir（session_id 桥 + workspace 字段） -->
        <span v-if="task.sessionId || task.workspace" class="ltl__linkage" data-testid="tdp-linkage">
          <span v-if="task.sessionId" class="ltl__linkage-item" :title="t('ia2.tdp.session', { id: task.sessionId })">◉ {{ task.sessionId.slice(0, 8) }}</span>
          <span v-if="task.workspace" class="ltl__linkage-item ltl__linkage-item--ws" :title="task.workspace">⎇ {{ shortPath(task.workspace) }}</span>
        </span>
      </span>
      <span class="ltl__avatar" :title="task.assignee">{{ (task.assignee || '?').slice(0, 1).toUpperCase() }}</span>
      <span class="ltl__acts">
        <button
          type="button" class="ltl__btn" :data-testid="`tdp-reassign-${task.id}`"
          :title="t('ia2.tdp.reassign')" @click="emit('reassign', task.id)"
        >{{ t('ia2.tdp.reassign') }}</button>
        <button
          type="button" class="ltl__btn" :data-testid="`tdp-ide-${task.id}`"
          :title="t('ia2.tdp.openIde')" @click="emit('open-ide', task.id)"
        >⌨</button>
        <button
          type="button" class="ltl__btn" :data-testid="`tdp-handle-${task.id}`"
          @click="emit('handle-task', task.id)"
        >{{ t('ia2.tdp.handle') }}</button>
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ltl { display: flex; flex-direction: column; gap: 2px; }
.ltl__empty { padding: 8px 4px; font-size: 11px; color: var(--text-muted); }
.ltl__row {
  display: flex; align-items: center; gap: 6px; padding: 5px 6px;
  border-radius: 6px;
  &:hover { background: var(--bg-secondary); }
}
.ltl__dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.ltl__dot--run { background: var(--primary); }
.ltl__dot--warn { background: var(--warning); }
.ltl__dot--err { background: var(--error); }
.ltl__dot--ok { background: var(--success); }
.ltl__dot--info { background: var(--info); }
.ltl__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ltl__title {
  font-size: 11px; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ltl__id { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.ltl__sub { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* R7-A 归属链区（会话 + workdir） */
.ltl__linkage {
  display: flex; gap: 6px; margin-top: 1px; font-size: 9px; font-family: ui-monospace, monospace;
  color: var(--text-muted);
}
.ltl__linkage-item {
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: #61afef;
}
.ltl__linkage-item--ws { color: #c678dd; }
.ltl__avatar {
  flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%;
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 8px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;
}
.ltl__acts { display: flex; gap: 3px; flex-shrink: 0; }
.ltl__btn {
  height: 18px; padding: 0 6px; border: 1px solid var(--border-color); border-radius: 9px;
  background: transparent; color: var(--text-secondary); font-size: 10px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
