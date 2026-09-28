<!-- overlay/custom/client/ia2/components/IaOverviewEntry.vue -->
<!-- P5 驾驶舱概览导航入口（2026-09-28 §六）：工作流导航栏顶部入口，
     点击进 #/app/dash（中栏三卡概览），当前路由命中时高亮。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
// 无路由上下文（嵌板测试/Storybook 态）兜底：useRoute/useRouter 可能返回 undefined
const route = useRoute()
const router = useRouter()
const active = computed(() => route?.name === 'ia2.dash')
function open(): void {
  router?.push({ name: 'ia2.dash' })
}
</script>

<template>
  <button
    type="button"
    class="overview-entry"
    :class="{ 'overview-entry--active': active }"
    data-testid="overview-nav-entry"
    :title="t('ia2.overviewDash.title')"
    @click="open"
  >
    <span class="overview-entry__icon">🏠</span>
    <span class="overview-entry__label">{{ t('ia2.overviewDash.navLabel') }}</span>
  </button>
</template>

<style scoped lang="scss">
.overview-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 16px);
  margin: 4px 8px 0;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12.5px;
  &:hover { background: rgba(var(--accent-primary-rgb, 37, 99, 235), 0.06); color: var(--text-primary); }
  &--active {
    background: rgba(var(--accent-primary-rgb, 37, 99, 235), 0.1);
    color: var(--accent-primary, #2563eb);
    font-weight: 600;
  }
}
.overview-entry__icon { font-size: 13px; }
</style>
