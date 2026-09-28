<!-- overlay/custom/client/ia2/components/GovernanceNavEntry.vue -->
<!-- 治理中心导航入口（补功能主清单 2026-09-28）：工作流导航栏入口 + 待裁决评审
     徽标。自含轮询（30s，治理面低频）——与 InboxNavEntry 同款自含模式。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { fetchGovernanceOverview } from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
/** 文案单一事实源=custom/governance/i18n.ts；legacy i18n 无 mergeLocaleMessage，
 * 组件内按当前 locale 选表。 */
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
})
const router = useRouter()
const pending = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

async function poll(): Promise<void> {
  try {
    const res = await fetchGovernanceOverview()
    pending.value = res.pendingReviews ?? 0
  } catch { /* 网络闪断保持上次计数 */ }
}

onMounted(() => {
  void poll()
  timer = setInterval(() => void poll(), 30000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <button
    type="button"
    class="gov-entry"
    data-testid="governance-nav-entry"
    :title="L.pageTitle"
    @click="router.push({ name: 'ia2.governance' })"
  >
    <span class="gov-entry__icon">⚖</span>
    <span class="gov-entry__label">{{ L.pageTitle }}</span>
    <span v-if="pending" class="gov-entry__badge" data-testid="governance-nav-count">{{ pending > 99 ? '99+' : pending }}</span>
  </button>
</template>

<style scoped lang="scss">
.gov-entry {
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
.gov-entry__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}
.gov-entry__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gov-entry__badge {
  background: #b45309;
  color: #fff;
  border-radius: 9px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
