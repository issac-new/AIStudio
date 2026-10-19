<!-- overlay/custom/client/ia2/views/stage/StageDevApprovals.vue
     ④开发·审批待办：同屏给出两类真实待办——
     ①人工介入与遗留项（Gatekeeper/orgloop）；
     ②普通命令与评审审批（/api/approvals，与审批收件箱同源）。
     P2（2026-10-19）：头部汇总徽标走统一契约 approval-summary（单端点+单类型），
     计数与概览/收件箱同源；源缺席的域显示「未知」不冒充 0。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GatekeeperSection from '../../components/inbox/GatekeeperSection.vue'
import ApprovalPanel from '@/custom/cockpit/components/ApprovalPanel.vue'
import { fetchApprovalSummary, type ApprovalSummary } from '../../api/approval-summary'

const emit = defineEmits<{ 'open-all': [] }>()

const summary = ref<ApprovalSummary | null>(null)
const summaryError = ref('')

function fmtCount(n: number | null | undefined): string {
  return typeof n === 'number' ? String(n) : '未知'
}

onMounted(() => {
  void fetchApprovalSummary()
    .then((s) => { summary.value = s })
    .catch((e) => { summaryError.value = (e as Error).message })
})
</script>

<template>
  <div class="sda" data-testid="stage-dev-approvals">
    <div v-if="summary" class="sda__badges" data-testid="sda-summary">
      <span class="sda__badge">命令 {{ fmtCount(summary.approvals?.command) }}</span>
      <span class="sda__badge">评审 {{ fmtCount(summary.approvals?.review) }}</span>
      <span class="sda__badge">执法门 {{ fmtCount(summary.approvals?.enforce) }}</span>
      <span class="sda__badge">介入点 {{ fmtCount(summary.interventions) }}</span>
      <span class="sda__badge">清偿 {{ fmtCount(summary.clearance) }}</span>
      <span class="sda__badge sda__badge--total">
        {{ summary.knownTotal === null ? '合计未知' : `合计 ${summary.knownTotal}` }}
      </span>
    </div>
    <p v-else-if="summaryError" class="sda__err" data-testid="sda-summary-error">汇总读取失败：{{ summaryError }}</p>

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
.sda__badges { display: flex; gap: 8px; flex-wrap: wrap; }
.sda__badge {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 2px 10px;
  font-size: 11.5px;
  color: var(--text-muted);
}
.sda__badge--total { color: var(--text-primary); font-weight: 600; }
.sda__err { margin: 0; font-size: 11.5px; color: var(--ia-fail); }
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
