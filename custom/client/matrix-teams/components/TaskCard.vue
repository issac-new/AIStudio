<!-- overlay/custom/client/matrix-teams/components/TaskCard.vue -->
<!-- M-D 任务卡片：看板态 + 负责人 + Agent 徽章 + 卡片操作（指派/转派/完成/阻塞/重开）。
     纯展示：写路径由容器发事件（本组件只 emit 操作意图）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AssignContent, ReceiptContent } from '../protocol'
import { cardStatus, type CardStatus } from '../task-card'

const props = defineProps<{
  assign: AssignContent
  receipt: ReceiptContent | null
  /** 操作可用（leader/有权限视角）；false 时只读。 */
  canOperate: boolean
}>()
const emit = defineEmits<{
  (e: 'reassign', target: { account: string }): void
  (e: 'op', op: 'complete' | 'block' | 'reopen'): void
}>()

const { t } = useI18n()
const status = computed<CardStatus>(() => cardStatus(props.assign, props.receipt))

const assigneeLabel = computed(() => {
  const tgt = props.assign.target
  const local = tgt.account.startsWith('@') ? tgt.account.slice(1).split(':')[0] : tgt.account
  return tgt.agentTeam ? `${local} · ${tgt.agentTeam}` : local
})

const agentBadge = computed(() => props.assign.capability?.length ? props.assign.capability[0] : null)
const reassignTarget = computed(() => props.assign.target.account)

function onOp(op: 'complete' | 'block' | 'reopen'): void {
  emit('op', op)
}
</script>

<template>
  <div class="tkc" :class="`tkc--${status}`" :data-testid="`task-card-${assign.taskId}`">
    <div class="tkc__head">
      <span class="tkc__title">{{ assign.title }}</span>
      <span class="tkc__badge" :data-testid="`task-card-status-${assign.taskId}`">{{ t(`ia2.taskCard.status.${status}`) }}</span>
    </div>
    <div class="tkc__meta">
      <span class="tkc__assignee" :data-testid="`task-card-assignee-${assign.taskId}`">{{ assigneeLabel }}</span>
      <span v-if="agentBadge" class="tkc__agent" :data-testid="`task-card-agent-${assign.taskId}`">{{ agentBadge }}</span>
      <span v-if="assign.dueAt" class="tkc__due" :class="{ 'tkc__due--over': status !== 'done' && assign.dueAt < Date.now() }">
        {{ new Date(assign.dueAt).toLocaleDateString() }}
      </span>
    </div>
    <div v-if="canOperate" class="tkc__ops">
      <button type="button" class="tkc__btn" :data-testid="`task-op-complete-${assign.taskId}`" :disabled="status === 'done'" @click="onOp('complete')">{{ t('ia2.taskCard.opComplete') }}</button>
      <button type="button" class="tkc__btn" :data-testid="`task-op-block-${assign.taskId}`" :disabled="status === 'blocked'" @click="onOp('block')">{{ t('ia2.taskCard.opBlock') }}</button>
      <button type="button" class="tkc__btn" :data-testid="`task-op-reopen-${assign.taskId}`" :disabled="status !== 'done' && status !== 'blocked'" @click="onOp('reopen')">{{ t('ia2.taskCard.opReopen') }}</button>
      <button type="button" class="tkc__btn" :data-testid="`task-op-reassign-${assign.taskId}`" @click="emit('reassign', { account: reassignTarget })">{{ t('ia2.taskCard.opReassign') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tkc { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; background: var(--bg-card); display: flex; flex-direction: column; gap: 5px; }
.tkc--done { opacity: .68; }
.tkc--blocked { border-color: var(--error, #e05656); }
.tkc__head { display: flex; align-items: center; gap: 8px; }
.tkc__title { font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tkc__badge { margin-left: auto; padding: 1px 8px; border-radius: 8px; font-size: 10px; background: var(--bg-secondary); color: var(--text-secondary); flex: none; }
.tkc--done .tkc__badge { background: var(--success, #34c77b); color: #fff; }
.tkc--blocked .tkc__badge { background: var(--error, #e05656); color: #fff; }
.tkc--review .tkc__badge { background: var(--warning, #d69e2e); color: #fff; }
.tkc__meta { display: flex; gap: 8px; font-size: 11px; color: var(--text-muted); align-items: center; }
.tkc__agent { padding: 0 6px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 10px; }
.tkc__due--over { color: var(--error, #e05656); font-weight: 700; }
.tkc__ops { display: flex; gap: 6px; flex-wrap: wrap; }
.tkc__btn { border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); font-size: 10px; padding: 2px 8px; cursor: pointer; font-family: inherit; &:disabled { opacity: .4; cursor: default; } }
</style>
