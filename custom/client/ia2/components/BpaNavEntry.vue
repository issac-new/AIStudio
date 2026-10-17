<!-- overlay/custom/client/ia2/components/BpaNavEntry.vue -->
<!-- 流程架构工作台导航入口（OntologyNavEntry 同款自含模式）。
     features.bpa 默认开（VITE_CUSTOM_BPA=false 关），挂载方不加 v-if。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { bpaMessages } from '@/custom/bpa/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? bpaMessages.zh.bpa : bpaMessages.en.bpa
})
const router = useRouter()
</script>

<template>
  <button
    type="button"
    class="bpa-entry"
    data-testid="bpa-nav-entry"
    :title="L.navTitle"
    @click="router.push({ name: 'ia2.bpa' })"
  >
    <span class="bpa-entry__icon">⌗</span>
    <span class="bpa-entry__label">{{ L.navLabel }}</span>
  </button>
</template>

<style scoped lang="scss">
.bpa-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary, rgba(255, 255, 255, 0.55));
  cursor: pointer;
  font-size: 13px;
  color: inherit;
  text-align: left;
  &:hover { background: var(--bg-tertiary); }
}
.bpa-entry__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}
.bpa-entry__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
