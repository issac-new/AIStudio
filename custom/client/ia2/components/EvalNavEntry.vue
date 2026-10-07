<!-- overlay/custom/client/ia2/components/EvalNavEntry.vue -->
<!-- 评测工作台导航入口（M2，GovernanceNavEntry 同款自含模式）。
     features.eval 门控由挂载方（FlowNavPanel）v-if 承担。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})
const router = useRouter()
</script>

<template>
  <button
    type="button"
    class="eval-entry"
    data-testid="eval-nav-entry"
    :title="L.navTitle"
    @click="router.push({ name: 'ia2.eval' })"
  >
    <span class="eval-entry__icon">◧</span>
    <span class="eval-entry__label">{{ L.navLabel }}</span>
  </button>
</template>

<style scoped lang="scss">
.eval-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-secondary, rgba(255, 255, 255, 0.55));
  cursor: pointer;
  font-size: 13px;
  color: inherit;
  text-align: left;
  &:hover { background: var(--bg-tertiary, #f1f2f4); }
}
.eval-entry__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}
.eval-entry__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
