<!-- overlay/custom/client/ia2/components/AttentionStrip.vue -->
<!-- 总览注意力条：收编 cockpit CockpitAttention 的 blocked/review/triage 梯队模型
     （归并逻辑在 adapters/overview.ts mergeAttention 纯函数，本组件纯展示）。
     v12.4（2026-09-20 用户裁定）：标签改「swarm kanban」——双击进看板总览
     （全部 kanban 任务，与原 AI协作中心页面同动线）；条目点击仍跳对象
     （看板预选/运行详情/循环画布）；尾部 ⚙管理按钮退役（管理台入口收敛到
     左栏 FlowNavPanel）。空态条不消失（标签常驻）。
     2026-10-10 根治轮（用户裁定「根治」）：条目多时不再靠隐藏滚动条的
     overflow 截断（chip 被像素级切半、无任何可滚提示，视觉即坏）——改为
     隐藏测量行实测 chip 宽度，按容器自适应显示前缀 + 尾部「+N」chip
     （悬浮=被收起条目的梯队摘要，点击进看板总览；列表本身仍按
     mergeAttention 优先级排序，前缀=最高优先）。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AttentionRow } from '../adapters/overview'
import { useFitSlice } from '../composables/useFitSlice'

const props = defineProps<{ items: AttentionRow[] }>()

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

const itemsEl = ref<HTMLElement | null>(null)
const measureEl = ref<HTMLElement | null>(null)
const { visibleCount } = useFitSlice({
  container: itemsEl,
  measurer: measureEl,
  selector: '.ia-attn__item',
  gap: 6,
  moreWidth: 56,
  deps: [() => props.items],
})

const visibleItems = computed(() => props.items.slice(0, Math.min(visibleCount.value, props.items.length)))
const hiddenItems = computed(() => props.items.slice(visibleItems.value.length))

/** 「+N」悬浮摘要：被收起条目按梯队计数（复用既有 tier 词条，不新增 locale 键） */
const hiddenSummary = computed(() => {
  const byTier = new Map<AttentionRow['status'], number>()
  for (const row of hiddenItems.value) byTier.set(row.status, (byTier.get(row.status) ?? 0) + 1)
  const parts = (['blocked', 'review', 'triage'] as const)
    .filter(s => byTier.get(s))
    .map(s => `${t(TIER_LABEL[s])} ${byTier.get(s)}`)
  return parts.length ? parts.join(' · ') : ''
})
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
    <div ref="itemsEl" class="ia-attn__items">
      <span v-if="items.length === 0" class="ia-attn__empty">{{ t('ia2.overview.attentionEmpty') }}</span>
      <button
        v-for="row in visibleItems"
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
      <button
        v-if="hiddenItems.length > 0"
        type="button"
        class="ia-attn__item ia-attn__more" data-testid="ia-attn-more"
        :title="`${hiddenSummary}｜${t('ia2.overview.swarmKanbanHint')}`"
        @click="emit('open-board')"
      >+{{ hiddenItems.length }}</button>
    </div>
    <!-- 隐藏测量行：与可见行同 class 渲染全量条目，取真实宽度供自适应切片；
         绝对定位脱流不计入布局，aria-hidden 不进无障碍树。 -->
    <div ref="measureEl" class="ia-attn__measure" aria-hidden="true">
      <button v-for="row in items" :key="`m-${row.id}`" type="button" class="ia-attn__item" :class="[`ia-attn__item--${row.status}`, `ia-attn__item--${row.severity}`]">
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
.ia-attn__items { display: flex; align-items: center; gap: 6px; }

/* 隐藏测量行：只供 useFitSlice 取 offsetWidth，不进布局与无障碍树 */
.ia-attn__measure {
  position: absolute; visibility: hidden; pointer-events: none;
  display: flex; gap: 6px; width: max-content; height: 0; overflow: hidden; top: 0; left: 0;
}
</style>
