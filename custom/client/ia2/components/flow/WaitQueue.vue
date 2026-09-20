<!-- overlay/custom/client/ia2/components/flow/WaitQueue.vue -->
<!-- v12 右栏 · 等我队列（动线④决策就地完成）：review 任务=验收/打回；
     awaiting-input 运行=确认恢复；fleet 审批=确认。行内动作，不出面板。
     v12.4：口径对齐 DecisionRow（新增 gate-review 评审门行——无行内动作，
     决策走评审区/通知下拉）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { DecisionRow } from '../../composables/useDecisionRows'

defineProps<{ items: DecisionRow[] }>()

const emit = defineEmits<{
  (e: 'approve-task', taskId: string): void
  (e: 'reject-task', taskId: string): void
  (e: 'approve-run', item: DecisionRow): void
  (e: 'approve-fleet', item: DecisionRow): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="wq" data-testid="tdp-wait">
    <div v-if="!items.length" class="wq__empty">{{ t('ia2.tdp.waitEmpty') }}</div>
    <div
      v-for="w in items"
      :key="w.id"
      class="wq__row"
      :data-testid="`tdp-wait-${w.id}`"
    >
      <span class="wq__gate" :class="{ 'wq__gate--run': w.kind === 'run-approval', 'wq__gate--fleet': w.kind === 'fleet-approval', 'wq__gate--gate': w.kind === 'gate-review' }" />
      <span class="wq__body">
        <span class="wq__title">{{ w.title }}</span>
        <span class="wq__sub">{{ t(w.subKey) }}</span>
      </span>
      <span class="wq__acts">
        <template v-if="w.kind === 'task-review'">
          <button
            type="button" class="wq__btn wq__btn--ok" :data-testid="`tdp-approve-${w.taskId}`"
            @click="emit('approve-task', w.taskId!)"
          >{{ t('ia2.tdp.approve') }}</button>
          <button
            type="button" class="wq__btn wq__btn--no" :data-testid="`tdp-reject-${w.taskId}`"
            @click="emit('reject-task', w.taskId!)"
          >{{ t('ia2.tdp.reject') }}</button>
        </template>
        <button
          v-else-if="w.kind === 'run-approval'"
          type="button" class="wq__btn wq__btn--ok" :data-testid="`tdp-confirm-run-${w.runId}`"
          @click="emit('approve-run', w)"
        >{{ t('ia2.tdp.confirm') }}</button>
        <button
          v-else-if="w.kind === 'fleet-approval'"
          type="button" class="wq__btn wq__btn--ok" :data-testid="`tdp-confirm-fleet-${w.sessionId}`"
          @click="emit('approve-fleet', w)"
        >{{ t('ia2.tdp.confirm') }}</button>
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wq { display: flex; flex-direction: column; gap: 2px; }
.wq__empty { padding: 8px 4px; font-size: 11px; color: var(--text-muted); }
.wq__row {
  display: flex; align-items: center; gap: 7px; padding: 6px 6px;
  border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary);
}
.wq__gate { flex-shrink: 0; width: 10px; height: 10px; border-radius: 50%; background: var(--warning); }
.wq__gate--run { background: var(--info); }
.wq__gate--fleet { background: var(--primary); }
.wq__gate--gate { background: var(--text-muted); }
.wq__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.wq__title {
  font-size: 11px; color: var(--text-primary); font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wq__sub { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wq__acts { display: flex; gap: 4px; flex-shrink: 0; }
.wq__btn {
  height: 20px; padding: 0 8px; border-radius: 10px; font-size: 10px; cursor: pointer;
  background: transparent; white-space: nowrap;
}
.wq__btn--ok { border: 1px solid var(--success); color: var(--success); &:hover { background: rgba(46,125,50,.08); } }
.wq__btn--no { border: 1px solid var(--error); color: var(--error); &:hover { background: rgba(198,40,40,.08); } }
</style>
