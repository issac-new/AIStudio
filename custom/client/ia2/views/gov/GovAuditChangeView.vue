<!-- overlay/custom/client/ia2/views/gov/GovAuditChangeView.vue -->
<!-- 审计与变更（2026-10-01 单层页签重构）：原治理中心二级分区四升平级页签。
     板块=统一审计（四源汇聚：approvals/domain/provider/kanban + PROV-O 导出）
     · 变更治理（L1-L4 分级评审/五维影响/三级冻结窗口/管控基准月度指标）
     · 事故报告（六文调研轮 A+B：17 要素汇编+自治度对账）· 治理事件流（F）。
     分区无内部导航；各板块自取数、失败态自管。 -->
<script setup lang="ts">
import AuditSection from '@/custom/governance/components/AuditSection.vue'
import ChangeGovernanceSection from '@/custom/governance/components/ChangeGovernanceSection.vue'
import IncidentReportSection from '@/custom/governance/components/IncidentReportSection.vue'
import GovEventStreamSection from '@/custom/governance/components/GovEventStreamSection.vue'
import { useTasksTabsText } from '../../i18n-tasks-tabs'

const tabText = useTasksTabsText()
</script>

<template>
  <div class="ia-area gov-view" data-testid="ia-tasks-panel-gov-audit">
    <header class="gov-view__bar">
      <div>
        <h2 class="gov-view__title">{{ tabText.tabGovAudit }}</h2>
        <p class="gov-view__sub">统一审计 · 变更治理 · 事故报告 · 治理事件流</p>
      </div>
    </header>
    <div class="gov-view__body">
      <AuditSection />
      <ChangeGovernanceSection />
      <IncidentReportSection />
      <GovEventStreamSection />
    </div>
  </div>
</template>

<style scoped lang="scss">
.gov-view { gap: 10px; padding: 12px 16px; overflow: auto; }
.gov-view__bar { display: flex; align-items: flex-start; gap: 10px; flex-shrink: 0; }
.gov-view__title { margin: 0; font-size: 15px; font-weight: 600; }
.gov-view__sub { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted, #878c99); }
.gov-view__body { display: flex; flex-direction: column; gap: 14px; }
</style>
