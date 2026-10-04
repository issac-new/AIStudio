<!-- overlay/custom/client/ia2/views/gov/GovRegistryRulesView.vue -->
<!-- 台账与规则（2026-10-01 单层页签重构）：原治理中心二级分区三升平级页签。
     板块=能力台账 · 状态本体 · 决策规则闸（注册表只读投影+mode 徽标）· 运行态
     （SLO 档/用量/成本）。分区无内部导航；各板块自取数、失败态自管。 -->
<script setup lang="ts">
import LedgerSection from '@/custom/governance/components/LedgerSection.vue'
import RuntimeSection from '@/custom/governance/components/RuntimeSection.vue'
import StateModelSection from '@/custom/governance/components/StateModelSection.vue'
import DecisionRulesSection from '@/custom/governance/components/DecisionRulesSection.vue'
import AgentIdentitySection from '@/custom/governance/components/AgentIdentitySection.vue'
import { useTasksTabsText } from '../../i18n-tasks-tabs'

const tabText = useTasksTabsText()
</script>

<template>
  <div class="ia-area gov-view" data-testid="ia-tasks-panel-gov-registry">
    <header class="gov-view__bar">
      <div>
        <h2 class="gov-view__title">{{ tabText.tabGovRegistry }}</h2>
        <p class="gov-view__sub">能力台账 · 状态本体 · 规则闸 · 运行态</p>
      </div>
    </header>
    <div class="gov-view__body">
      <LedgerSection />
      <StateModelSection />
      <DecisionRulesSection />
      <RuntimeSection />
      <AgentIdentitySection />
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
