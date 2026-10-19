<!-- overlay/custom/client/ia2/views/stage/StageDevApprovals.vue
     ④开发·审批待办：同屏给出两类真实待办——
     ①人工介入与遗留项（Gatekeeper/orgloop）；
     ②普通命令与评审审批（/api/approvals，与审批收件箱同源）。
     此前本页只挂 Gatekeeper，页面显示 0 就让人误以为全部审批为 0。 -->
<script setup lang="ts">
import GatekeeperSection from '../../components/inbox/GatekeeperSection.vue'
import ApprovalPanel from '@/custom/cockpit/components/ApprovalPanel.vue'

const emit = defineEmits<{ 'open-all': [] }>()
</script>

<template>
  <div class="sda" data-testid="stage-dev-approvals">
    <section class="sda__block" data-testid="sda-interventions">
      <header class="sda__head">
        <h3 class="sda__title">人工介入与遗留项</h3>
        <p class="sda__note">需要你裁决的介入点与清偿门；与审批收件箱同一数据源。</p>
      </header>
      <GatekeeperSection />
    </section>

    <section class="sda__block" data-testid="sda-approvals">
      <header class="sda__head">
        <h3 class="sda__title">命令与评审审批</h3>
        <p class="sda__note">
          普通审批、评审卡与审批历史；全量视图在审批收件箱，这里不重复计数。
        </p>
        <button type="button" class="sda__link" data-testid="sda-open-inbox" @click="emit('open-all')">
          打开审批收件箱 →
        </button>
      </header>
      <ApprovalPanel :poll-ms="10000" :show-history="true" :hide-title="true" @open-all="emit('open-all')" />
    </section>
  </div>
</template>

<style scoped>
.sda { display: flex; flex-direction: column; gap: 18px; }
.sda__block { display: flex; flex-direction: column; gap: 8px; }
.sda__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.sda__title { margin: 0; font-size: 13px; font-weight: 600; }
.sda__note { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.sda__link {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--accent-info);
  font-size: 11.5px;
  cursor: pointer;
}
</style>
