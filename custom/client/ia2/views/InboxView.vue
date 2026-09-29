<!-- overlay/custom/client/ia2/views/InboxView.vue -->
<!-- P1 审批收件箱页（/app/inbox，2026-09-28 产品 UI 缺陷修复 §二）：
     收件箱式待审列表（agent 命令请求 + 看板评审卡）+ 审批历史。
     右上角关闭钮回到沟通协作工作台（与看板页一致动线）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ApprovalPanel from '@/custom/cockpit/components/ApprovalPanel.vue'

const { t } = useI18n()
const router = useRouter()

function closeInbox(): void {
  void router.push({ name: 'ia2.collab' })
}
</script>

<template>
  <div class="ia-area ia-inbox">
    <div class="ia-inbox__bar">
      <h2 class="ia-inbox__title">{{ t('approvals.pageTitle') }}</h2>
      <button
        type="button"
        class="ia-inbox__close"
        data-testid="ia-inbox-close"
        :title="t('cockpit.close')"
        :aria-label="t('cockpit.close')"
        @click="closeInbox"
      >×</button>
    </div>
    <div class="ia-inbox__body">
      <ApprovalPanel :poll-ms="10000" show-history hide-title />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ia-inbox {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.ia-inbox__bar {
  display: flex;
  align-items: center;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
}
.ia-inbox__title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.ia-inbox__close {
  margin-left: auto;
  margin-bottom: 2px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #878c99);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  &:hover { color: var(--text-primary, inherit); background: var(--bg-secondary, #f1f2f4); }
}
.ia-inbox__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
}
</style>
