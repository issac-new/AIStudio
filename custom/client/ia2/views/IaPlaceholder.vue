<!-- overlay/custom/client/ia2/views/IaPlaceholder.vue -->
<!-- 区域占位骨架（Task 4/5/6 实装前的统一占位）：标题 + 说明，文案全 i18n。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  titleKey: string
  descKey: string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="ia-area">
    <div class="ia-placeholder">
      <div class="ia-placeholder__title">{{ t(titleKey) }}</div>
      <div class="ia-placeholder__desc">{{ t(descKey) }}</div>
    </div>
  </div>
</template>
