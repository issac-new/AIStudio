<!-- overlay/custom/client/ia2/views/gov/GovOrgKnowledgeView.vue -->
<!-- 组织与知识（2026-10-01 单层页签重构）：原治理中心二级分区二升平级页签。
     板块=五流断点诊断（信息/决策/责任/资源/反馈+机制归因）· 板级共享知识图谱
     （结案摄取+冲突收件箱）· 决策图谱（时间线/因果链/门禁同步/双时态回放）。
     分区无内部导航（单层页签纪律）；各板块自取数、失败态自管。 -->
<script setup lang="ts">
import OrgDiagnosisSection from '@/custom/governance/components/OrgDiagnosisSection.vue'
import KnowledgeGraphSection from '@/custom/governance/components/KnowledgeGraphSection.vue'
import DecisionGraphSection from '@/custom/governance/components/DecisionGraphSection.vue'
import { useTasksTabsText } from '../../i18n-tasks-tabs'

const tabText = useTasksTabsText()
</script>

<template>
  <div class="ia-area gov-view" data-testid="ia-tasks-panel-gov-org">
    <header class="gov-view__bar">
      <div>
        <h2 class="gov-view__title">{{ tabText.tabGovOrg }}</h2>
        <p class="gov-view__sub">五流断点诊断 · 板级知识图谱 · 决策图谱</p>
      </div>
    </header>
    <div class="gov-view__body">
      <OrgDiagnosisSection />
      <KnowledgeGraphSection />
      <DecisionGraphSection />
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
