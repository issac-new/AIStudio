<!-- overlay/custom/client/ia2/views/InboxView.vue -->
<!-- P1 审批收件箱页（/app/inbox，2026-09-28 产品 UI 缺陷修复 §二）：
     收件箱式待审列表（agent 命令请求 + 看板评审卡）+ 审批历史。
     右上角关闭钮回到沟通协作工作台（与看板页一致动线）。 -->
<script setup lang="ts">
import IaBreadcrumb from '../components/IaBreadcrumb.vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ApprovalPanel from '@/custom/shared/components/ApprovalPanel.vue'
import GatekeeperSection from '../components/inbox/GatekeeperSection.vue'

const { t } = useI18n()
const router = useRouter()

// 动线批（2026-10-17）：关闭钮回来源——此前固定回工作台，从阶段 5 审批待办
// 等处进入后「关闭」落到别处；有来路（本会话内发生过导航）则 history 回退。
function closeGoBack(fallback: () => void): void {
  if (window.history.length > 1) router.back()
  else fallback()
}

function closeInbox(): void {
  closeGoBack(() => { void router.push({ name: 'ia2.collab' }) })
}
</script>

<template>
  <div class="ia-area ia-inbox">
  <IaBreadcrumb />
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
      <GatekeeperSection />
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
  padding: 18px 24px 20px;
  gap: 12px;
}
.ia-inbox__bar {
  display: flex;
  align-items: center;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.ia-inbox__title {
  margin: 0;
  font-size: 20px;
  line-height: 1.3;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.ia-inbox__close {
  margin-left: auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); border-color: var(--border-color); }
}
.ia-inbox__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 8px;
}

@media (max-width: 720px) {
  .ia-inbox { padding: 14px; }
  .ia-inbox__title { font-size: 18px; }
}
</style>
