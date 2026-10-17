<!-- overlay/custom/client/ia2/components/IaJourneyEntry.vue -->
<!-- 旅程首页入口（2026-10-17 驾驶舱层级批）：旅程页是产品默认入口但此前顶栏/
     左栏均无入口，基本只能靠默认 URL 到达；与驾驶舱概览（dash）构成的双首页
     互不连通是「双首页心智」痛点的一半。本入口随概览入口并列挂工作台左栏。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const active = computed(() => route?.name === 'ia2.journey')
function open(): void {
  router?.push({ name: 'ia2.journey' })
}
</script>

<template>
  <button
    type="button"
    class="journey-entry"
    :class="{ 'journey-entry--active': active }"
    data-testid="journey-nav-entry"
    title="旅程首页：搭建五步＋交付五阶段（产品默认入口）"
    @click="open"
  >
    <span class="journey-entry__icon">🧭</span>
    <span class="journey-entry__label">旅程首页</span>
  </button>
</template>

<style scoped lang="scss">
.journey-entry {
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
  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); color: var(--text-primary); }
  &--active {
    background: rgba(var(--accent-primary-rgb), 0.1);
    color: var(--accent-primary);
    font-weight: 600;
  }
}
.journey-entry__icon { font-size: 13px; }
</style>
