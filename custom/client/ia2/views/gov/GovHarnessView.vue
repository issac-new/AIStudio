<!-- overlay/custom/client/ia2/views/gov/GovHarnessView.vue -->
<!-- 驾驭工程（2026-10-02 信通院《驾驭工程》报告产品化）：统一能力目录 · 六类成本账 ·
     L1-L5 成熟度自检 · 八工程原语对账。分区无内部导航（单层页签纪律）；
     各板块自取数（/api/harness/*）、失败态自管、缺席如实降级。 -->
<script setup lang="ts">
import CapabilityCatalogSection from '@/custom/governance/components/CapabilityCatalogSection.vue'
import CostAccountsSection from '@/custom/governance/components/CostAccountsSection.vue'
import MaturitySection from '@/custom/governance/components/MaturitySection.vue'
import PrimitivesSection from '@/custom/governance/components/PrimitivesSection.vue'
import { useTasksTabsText } from '../../i18n-tasks-tabs'

const tabText = useTasksTabsText()
</script>

<template>
  <div class="ia-area gov-view" data-testid="ia-tasks-panel-gov-harness">
    <header class="gov-view__bar">
      <div>
        <h2 class="gov-view__title">{{ tabText.tabGovHarness }}</h2>
        <p class="gov-view__sub">统一能力目录 · 六类成本账 · L1-L5 成熟度自检 · 八工程原语对账</p>
      </div>
    </header>
    <div class="gov-view__body">
      <CapabilityCatalogSection />
      <CostAccountsSection />
      <MaturitySection />
      <PrimitivesSection />
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
