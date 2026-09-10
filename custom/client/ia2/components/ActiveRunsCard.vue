<!-- overlay/custom/client/ia2/components/ActiveRunsCard.vue -->
<!-- 活跃运行卡：running/awaiting 计数 + 最近活动相对时间；点击进 /app/runs。
     纯展示：数字来自 adapters/overview.ts aggregateActiveRuns。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { activeRunsLastActivityToken, type ActiveRunsAgg } from '../adapters/overview'

const props = withDefaults(defineProps<{
  agg: ActiveRunsAgg
  /** 相对时间计算锚（epoch ms）；缺省取当前时刻 */
  now?: number
}>(), { now: () => Date.now() })

const emit = defineEmits<{ (e: 'open'): void }>()

const { t } = useI18n()

const main = computed(() => props.agg.running + props.agg.awaiting)
const lastActivity = computed(() => {
  const token = activeRunsLastActivityToken(props.agg, props.now)
  // justNow 无 n 参数（词表原文不含插值），透传 undefined 让 i18n 按无参渲染
  return token ? t(`runcenter.time.${token.key}`, token.n !== undefined ? { n: token.n } : undefined) : '—'
})
</script>

<template>
  <button type="button" class="ia-card" @click="emit('open')">
    <span class="ia-card__label">{{ t('ia2.overview.cardActiveRuns') }}</span>
    <span class="ia-card__num">{{ main }}</span>
    <span class="ia-card__sub">
      {{ t('ia2.overview.awaitingPart') }} {{ agg.awaiting }} · {{ t('ia2.overview.lastActive') }} {{ lastActivity }}
    </span>
  </button>
</template>
