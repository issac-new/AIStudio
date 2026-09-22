<!-- overlay/custom/client/ia2/components/AttentionStrip.vue -->
<!-- 总览注意力条：收编 cockpit CockpitAttention 的 blocked/review/triage 梯队模型
     （归并逻辑在 adapters/overview.ts mergeAttention 纯函数，本组件纯展示）。
     v12.4（2026-09-20 用户裁定）：标签改「swarm kanban」——双击进看板总览
     （全部 kanban 任务，与原 AI协作中心页面同动线）；条目点击仍跳对象
     （看板预选/运行详情/循环画布）；尾部 ⚙管理按钮退役（管理台入口收敛到
     左栏 FlowNavPanel）。空态条不消失（标签常驻）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AttentionRow } from '../adapters/overview'

defineProps<{ items: AttentionRow[] }>()

const emit = defineEmits<{
  (e: 'select', row: AttentionRow): void
  (e: 'open-board'): void
}>()

const { t } = useI18n()

const TIER_LABEL: Record<AttentionRow['status'], string> = {
  blocked: 'ia2.overview.tierBlocked',
  review: 'ia2.overview.tierReview',
  triage: 'ia2.overview.tierTriage',
}
</script>

<template>
  <div class="ia-attn" data-testid="ia-attn">
    <!-- R6 补充：Swarm kanban 标签改按钮（对齐 AI协作中心注意力条按钮样式；
         单击进看板总览，保留双击兼容 + Enter 键） -->
    <button
      type="button"
      class="ia-attn__label ia-attn__label--btn" data-testid="ia-attn-label"
      :title="t('ia2.overview.swarmKanbanHint')" @click="emit('open-board')" @dblclick="emit('open-board')"
      @keydown.enter="emit('open-board')"
    >{{ t('ia2.overview.swarmKanbanLabel') }}</button>
    <div class="ia-attn__items">
      <span v-if="items.length === 0" class="ia-attn__empty">{{ t('ia2.overview.attentionEmpty') }}</span>
      <button
        v-for="row in items"
        :key="row.id"
        type="button"
        class="ia-attn__item"
        :class="[`ia-attn__item--${row.status}`, `ia-attn__item--${row.severity}`]"
        :title="row.title"
        @click="emit('select', row)"
      >
        <span class="ia-attn__bar" />
        <span class="ia-attn__tier">{{ t(TIER_LABEL[row.status]) }}</span>
        <span class="ia-attn__text">{{ row.title }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ia-attn { display: flex; align-items: center; gap: 8px; }

/* R6 补充：Swarm kanban 标签改按钮（对齐 AI协作中心注意力条按钮样式） */
.ia-attn__label {
  flex-shrink: 0; display: inline-flex; align-items: center;
  padding: 3px 10px; font-size: 11px; font-weight: 600;
  color: var(--text-primary, #d7dae0); background: var(--bg-secondary, rgba(128,128,128,0.1));
  border: 1px solid var(--border-color, #3a3f4b); border-radius: 6px;
  cursor: pointer; font-family: inherit;
  &:hover { border-color: #61afef; color: #61afef; }
}
.ia-attn__items { display: flex; align-items: center; gap: 6px; overflow-x: auto; }
</style>
