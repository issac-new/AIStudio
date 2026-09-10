<!-- overlay/custom/client/ia2/components/AttentionStrip.vue -->
<!-- 总览注意力条：收编 cockpit CockpitAttention 的 blocked/review/triage 梯队模型
     （归并逻辑在 adapters/overview.ts mergeAttention 纯函数，本组件纯展示）。
     点击条目 → 父级路由到工作项区（/app/tasks）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AttentionRow } from '../adapters/overview'

defineProps<{ items: AttentionRow[] }>()

const emit = defineEmits<{ (e: 'select', row: AttentionRow): void }>()

const { t } = useI18n()

const TIER_LABEL: Record<AttentionRow['status'], string> = {
  blocked: 'ia2.overview.tierBlocked',
  review: 'ia2.overview.tierReview',
  triage: 'ia2.overview.tierTriage',
}
</script>

<template>
  <div class="ia-attn" data-testid="ia-attn">
    <span class="ia-attn__label">{{ t('ia2.overview.attentionLabel') }}</span>
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
