<!-- overlay/custom/client/ia2/components/flow/TaskFlowTimeline.vue -->
<!-- P4③ 群侧栏 · 任务流转时间线（2026-09-28 §五）：当前群消息流解析出的任务型事件
     （派发/完成回执/缺陷/评审结论），竖向时间线：谁 → 什么操作 → 何时。
     纯展示：数据全 props；点任务号 emit open-task（装配层决定跳看板抽屉）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaskFlowEvent, TaskFlowAction } from '@/custom/matrix-chat/utils/task-flow'

const props = defineProps<{ events: TaskFlowEvent[] }>()
const emit = defineEmits<{ (e: 'open-task', taskId: string): void }>()

const { t } = useI18n()

// 展示最近 30 条，新的在上
const rows = computed(() => props.events.slice(-30).reverse())

const ACTION_META: Record<TaskFlowAction, { icon: string; cls: string }> = {
  dispatch: { icon: '⇢', cls: 'dispatch' },
  receipt: { icon: '✓', cls: 'receipt' },
  defect: { icon: '✗', cls: 'defect' },
  verdict: { icon: '⚖', cls: 'verdict' },
}

function fmtTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
</script>

<template>
  <div class="tft" data-testid="task-flow-timeline">
    <div v-if="!rows.length" class="tft__empty">{{ t('ia2.tdp.flowEmpty') }}</div>
    <div v-for="(ev, i) in rows" :key="`${ev.ts}-${i}`" class="tft__row" :data-testid="`tft-${ev.action}`">
      <span class="tft__icon" :class="`tft__icon--${ACTION_META[ev.action].cls}`">{{ ACTION_META[ev.action].icon }}</span>
      <div class="tft__main">
        <div class="tft__line">
          <b class="tft__actor">{{ ev.actor }}</b>
          <span class="tft__action" :class="`tft__action--${ACTION_META[ev.action].cls}`">{{ t(`ia2.tdp.flow.${ev.action}`) }}</span>
          <button
            v-if="ev.taskId"
            type="button"
            class="tft__task"
            :data-testid="`tft-task-${ev.taskId}`"
            @click="emit('open-task', ev.taskId!)"
          >{{ ev.taskId }}</button>
          <span v-if="ev.mentions.length" class="tft__mentions">@{{ ev.mentions.join(' @') }}</span>
          <span class="tft__time">{{ fmtTime(ev.ts) }}</span>
        </div>
        <div class="tft__summary">{{ ev.summary }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tft { display: flex; flex-direction: column; gap: 2px; }
.tft__empty { padding: 8px 4px; font-size: 11px; color: var(--text-muted); }
.tft__row { display: flex; gap: 7px; padding: 4px 2px; border-bottom: 1px dashed var(--border-color, #e5e7eb); }
.tft__row:last-child { border-bottom: none; }
.tft__icon { flex-shrink: 0; font-size: 11px; width: 14px; text-align: center; }
.tft__icon--dispatch { color: var(--info, #2563eb); }
.tft__icon--receipt { color: #059669; }
.tft__icon--defect { color: #dc2626; }
.tft__icon--verdict { color: #d97706; }
.tft__main { flex: 1; min-width: 0; }
.tft__line { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: 11px; }
.tft__actor { color: var(--text-primary); }
.tft__action { font-size: 10px; padding: 0 5px; border-radius: 3px; }
.tft__action--dispatch { color: var(--info, #2563eb); background: rgba(37, 99, 235, 0.08); }
.tft__action--receipt { color: #059669; background: #05966914; }
.tft__action--defect { color: #dc2626; background: #dc262614; }
.tft__action--verdict { color: #d97706; background: #d9770614; }
.tft__task {
  border: none; background: transparent; cursor: pointer; padding: 0;
  font-family: ui-monospace, Menlo, monospace; font-size: 10.5px;
  color: var(--accent-primary, #2563eb);
  &:hover { text-decoration: underline; }
}
.tft__mentions { color: var(--text-muted); font-size: 10px; }
.tft__time { margin-left: auto; font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.tft__summary {
  font-size: 10.5px; color: var(--text-secondary); margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
