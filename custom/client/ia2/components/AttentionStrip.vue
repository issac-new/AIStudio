<!-- overlay/custom/client/ia2/components/AttentionStrip.vue -->
<!-- 总览注意力条：收编 cockpit CockpitAttention 的 blocked/review/triage 梯队模型
     （归并逻辑在 adapters/overview.ts mergeAttention 纯函数，本组件纯展示）。
     v12.3（R2 用户裁定：注意力条改管理入口）：尾部 ⚙管理常驻、空态不消失——
     无注意项时条仍在（只余标签 + 管理按钮），角色从提醒条转为管理入口。
     点击条目 → 父级路由到对象（看板预选/运行详情/循环画布）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AttentionRow } from '../adapters/overview'

defineProps<{ items: AttentionRow[] }>()

const emit = defineEmits<{
  (e: 'select', row: AttentionRow): void
  (e: 'open-gov'): void
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
    <button type="button" class="ia-attn__gov" data-testid="ia-attn-gov" @click="emit('open-gov')">
      ⚙ {{ t('ia2.sit.manage') }}
    </button>
  </div>
</template>

