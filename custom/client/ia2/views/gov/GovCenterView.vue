<!-- overlay/custom/client/ia2/views/gov/GovCenterView.vue -->
<!-- 治理中心壳（C1·三中心重构波 3 首件）：顶部七签单层页签+内容区。
     七签冻结自设计正本 §二 治理关注面：签 1 关卡与流程／签 2 组织与资产／
     签 3 清偿门（C2 实装：台账全量+审批+放行灯）／签 4 问题单对账／签 5 审计
     与变更／签 6 文档评审／签 7 度量体检。七条兄弟路由共用本组件（SimCenter
     同模式，当前签由路由名推导）；五签占位注明 C3-C9 将迁入的既有组件
     （对账总表 B/C 组实存锚）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGovTabsText } from './gov-tabs'
import ClearancePanel from './ClearancePanel.vue'

const route = useRoute()
const router = useRouter()
const text = useGovTabsText()

type TabKey = 'process' | 'orgAssets' | 'clearance' | 'issues' | 'audit' | 'docs' | 'metrics'
interface GovTab { key: TabKey; name: string; components: string[] }

/** 七签单一事实源：路由名+占位注明的将迁入组件（对账行 C5/C7/C6/C4/C8/B8-B13/C3） */
const TABS: ReadonlyArray<GovTab> = [
  { key: 'process', name: 'ia2.governance', components: ['六闸卡（GovHealthSection 拆分·C3）', '闸修复状态机（orgloop gate-repairs·C3）'] },
  { key: 'orgAssets', name: 'ia2.govOrgAssets', components: ['组织与知识（GovOrgKnowledgeView）', '应用资产编辑器（GovRegistryRulesView）', '密钥最小台账（C11 增件）'] },
  { key: 'clearance', name: 'ia2.govClearance', components: [] },
  { key: 'issues', name: 'ia2.govIssues', components: ['诊断规则（KanbanDiagnosticsSection·C6）'] },
  { key: 'audit', name: 'ia2.govAudit', components: ['审计与变更（GovAuditChangeView·C7）'] },
  { key: 'docs', name: 'ia2.govDocs', components: ['文档评审（GovDocsReviewView·C5）'] },
  { key: 'metrics', name: 'ia2.govMetrics', components: ['工程效能（GovHarnessView）', '集群健康（GovClusterSection）', '语义体检（GovOntologySection）', '会话健康（GovSessionHealthSection）', '容量成本（CapacitySection·C4 五卡）'] },
]
type TabTextKey = 'tabProcess' | 'tabOrgAssets' | 'tabClearance' | 'tabIssues' | 'tabAudit' | 'tabDocs' | 'tabMetrics'
const TAB_LABEL_KEY: Record<TabKey, TabTextKey> = {
  process: 'tabProcess', orgAssets: 'tabOrgAssets', clearance: 'tabClearance', issues: 'tabIssues',
  audit: 'tabAudit', docs: 'tabDocs', metrics: 'tabMetrics',
}

const activeTab = computed<TabKey>(() =>
  TABS.find(t => t.name === String(route.name))?.key ?? 'process',
)

function goTab(tab: GovTab): void {
  if (tab.key === activeTab.value) return
  void router.push({ name: tab.name })
}
</script>

<template>
  <div class="gov-center">
    <header class="gov-center__head">
      <h2 class="gov-center__title">{{ text.shellTitle }}</h2>
      <nav class="gov-center__tabs" role="tablist" :aria-label="text.shellTitle">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          role="tab"
          class="gov-center__tab"
          :class="{ 'gov-center__tab--active': activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          :data-testid="`ia-gov-tab-${tab.key}`"
          @click="goTab(tab)"
        >{{ text[TAB_LABEL_KEY[tab.key]] }}</button>
      </nav>
    </header>

    <main class="gov-center__body">
      <!-- 签 3 清偿门（C2 实装：台账全量+审批+放行灯，消费 orgloop X2） -->
      <section
        v-show="activeTab === 'clearance'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-clearance"
      >
        <h3 class="gov-center__panel-title">签 3·{{ text.tabClearance }}</h3>
        <ClearancePanel />
      </section>
      <!-- 其余六签占位（C3-C9 逐签实装） -->
      <section
        v-for="tab in TABS.filter(t => t.key !== 'clearance')"
        v-show="activeTab === tab.key"
        :key="tab.key"
        class="gov-center__panel"
        :data-testid="`ia-gov-panel-${tab.key}`"
      >
        <h3 class="gov-center__panel-title">签 {{ TABS.findIndex(x => x.key === tab.key) + 1 }}·{{ text[TAB_LABEL_KEY[tab.key]] }}</h3>
        <p class="gov-center__pending">
          <span class="gov-center__badge">{{ text.pendingBadge }}</span>{{ text.pendingLead }}
        </p>
        <ul class="gov-center__comp-list">
          <li v-for="c in tab.components" :key="c" class="gov-center__comp">{{ c }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.gov-center { display: flex; flex-direction: column; height: 100%; padding: 16px; overflow: auto; gap: 12px; }
.gov-center__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.gov-center__title { margin: 0; font-size: 16px; }
.gov-center__tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.gov-center__tab {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.gov-center__tab--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}
.gov-center__body { flex: 1; min-height: 0; }
.gov-center__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px 18px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-standard, 6px);
}
.gov-center__panel--live { padding: 12px 14px; border-style: solid; }
.gov-center__panel-title { margin: 0; font-size: 14px; }
.gov-center__pending { margin: 0; font-size: 12px; color: var(--text-muted, #878c99); line-height: 1.6; }
.gov-center__badge {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill, 999px);
  font-size: 11px;
}
.gov-center__comp-list { margin: 0; padding: 0 0 0 4px; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.gov-center__comp { font-size: 12px; font-family: var(--font-mono, ui-monospace, monospace); color: var(--text-muted, #878c99); }
</style>
