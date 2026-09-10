<!-- overlay/custom/client/ia2/components/InboxPreviewCard.vue -->
<!-- 等你决策卡：awaiting-input 计数 + 最久等待时长；点击进 /app/inbox。
     纯展示：数字来自 adapters/overview.ts aggregateInbox。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDuration, type InboxAgg } from '../adapters/overview'

const props = defineProps<{
  agg: InboxAgg
  /** 等待时长计算锚（epoch ms）；缺省取当前时刻 */
  now?: number
}>()

const emit = defineEmits<{ (e: 'open'): void }>()

const { t } = useI18n()

const waitLabel = computed(() => {
  const d = formatDuration(props.agg.longestWaitMs)
  return d ?? '—'
})
</script>

<template>
  <button type="button" class="ia-card" @click="emit('open')">
    <span class="ia-card__label">{{ t('ia2.overview.cardInbox') }}</span>
    <span class="ia-card__num">{{ agg.awaiting }}</span>
    <span class="ia-card__sub">{{ t('ia2.overview.waitLongest') }} {{ waitLabel }}</span>
  </button>
</template>
