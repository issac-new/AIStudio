<!-- overlay/custom/client/ia2/components/SkillgovNavEntry.vue -->
<!-- 技能安全扫描导航入口（EvalNavEntry 同款自含模式）。features.skillgov 门控由挂载方承担。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { skillgovMessages } from '@/custom/skillgov/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? skillgovMessages.zh.skillgov : skillgovMessages.en.skillgov
})
const router = useRouter()
</script>

<template>
  <button
    type="button"
    class="sgov-entry"
    data-testid="skillgov-nav-entry"
    :title="L.navTitle"
    @click="router.push({ name: 'ia2.skillgov' })"
  >
    <span class="sgov-entry__icon">⛨</span>
    <span class="sgov-entry__label">{{ L.navLabel }}</span>
  </button>
</template>

<style scoped lang="scss">
.sgov-entry {
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
.sgov-entry__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}
.sgov-entry__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
