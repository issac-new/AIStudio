<!-- overlay/custom/client/ia2/components/InboxNavEntry.vue -->
<!-- P1 审批收件箱导航入口（2026-09-28）：工作流导航栏顶入口 + 待审计数徽标。
     自含轮询（15s）——不依赖父组件传数，任何挂点即用。 -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { fetchPendingApprovals } from '@/custom/cockpit/api/approvals'

const { t } = useI18n()
const router = useRouter()
const count = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

async function poll(): Promise<void> {
  try {
    const res = await fetchPendingApprovals()
    count.value = (res.items ?? []).length
  } catch { /* 网络闪断保持上次计数 */ }
}

onMounted(() => {
  void poll()
  timer = setInterval(() => void poll(), 15000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <button
    type="button"
    class="inbox-entry"
    data-testid="inbox-nav-entry"
    :title="t('approvals.title')"
    @click="router.push({ name: 'ia2.inbox' })"
  >
    <span class="inbox-entry__icon">✓</span>
    <span class="inbox-entry__label">{{ t('approvals.navLabel') }}</span>
    <span v-if="count" class="inbox-entry__badge" data-testid="inbox-nav-count">{{ count > 99 ? '99+' : count }}</span>
  </button>
</template>

<style scoped lang="scss">
.inbox-entry {
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
.inbox-entry__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}
.inbox-entry__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inbox-entry__badge {
  background: #dc2626;
  color: #fff;
  border-radius: 9px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
