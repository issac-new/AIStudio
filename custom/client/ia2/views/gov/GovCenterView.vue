<!-- overlay/custom/client/ia2/views/gov/GovCenterView.vue -->
<!-- 治理中心壳（C1·三中心重构波 3 首件）：顶部七签单层页签+内容区。
     七签冻结自设计正本 §二 治理关注面：签 1 关卡与流程／签 2 组织与资产／
     签 3 遗留项清算（C2 实装：台账全量+审批+放行灯）／签 4 问题清单对账／签 5 审计
     与变更／签 6 文档评审／签 7 度量检查。七条兄弟路由共用本组件（SimCenter
     同模式，当前签由路由名推导）；五签占位注明 C3-C9 将迁入的既有组件
     （对账总表 B/C 组实存锚）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGovTabsText } from './gov-tabs'
import { CENTER_NAVS, ISLAND_NAVS, stageContextQuery, useCenterNavLocale } from '../../nav-centers'
import { stageCircles, stageKeyOf, stageOwnersForRouteName } from '../../stage-attribution'
import { features } from '../../../../../config/features'
import ClearancePanel from './ClearancePanel.vue'
import GateRepairsPanel from './GateRepairsPanel.vue'
import OrgEditor from '../../components/gov/OrgEditor.vue'
import KeyLedgerSection from './KeyLedgerSection.vue'
import GovOrgKnowledgeView from './GovOrgKnowledgeView.vue'
import GovRegistryRulesView from './GovRegistryRulesView.vue'
import GovAuditChangeView from './GovAuditChangeView.vue'
import GovDocsReviewView from './GovDocsReviewView.vue'
import GovHarnessView from './GovHarnessView.vue'
import GovClusterSection from './GovClusterSection.vue'
import GovOntologySection from './GovOntologySection.vue'
import GovSessionHealthSection from './GovSessionHealthSection.vue'
import CapacitySection from '../../../kanban/components/CapacitySection.vue'
import CapacityLampBanner from './CapacityLampBanner.vue'
import GovIssuesPanel from './GovIssuesPanel.vue'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import GovAiQualitySection from './GovAiQualitySection.vue'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'

const route = useRoute()
const router = useRouter()
const text = useGovTabsText()
const navLocale = useCenterNavLocale()
// 页签级归属（2026-10-17）：治理七签归不同阶段，回链按当前签动态生成
const owners = computed(() => stageOwnersForRouteName(String(route.name ?? '')))
const parentStage = computed(() => (owners.value.length ? CENTER_NAVS.find(c => c.key === stageKeyOf(owners.value[0]))! : null))
const parentLabel = computed(() => {
  if (!owners.value.length) return navLocale.value === 'zh' ? '全程工具' : 'All-stage tool'
  if (owners.value.length === 1) return navLocale.value === 'zh' ? parentStage.value!.labelZh : parentStage.value!.labelEn
  return stageCircles(owners.value)
})
const parentTitle = computed(() => {
  if (!owners.value.length) return navLocale.value === 'zh' ? '跨阶段工具：不隶属单一阶段' : 'All-stage tool: not tied to a single stage'
  const names = owners.value.map(no => {
    const c = CENTER_NAVS.find(x => x.key === stageKeyOf(no))!
    return navLocale.value === 'zh' ? c.labelZh : c.labelEn
  }).join(navLocale.value === 'zh' ? '、' : ', ')
  return navLocale.value === 'zh' ? `所属阶段：${names}${owners.value.length > 1 ? '（点击回第一个阶段）' : ''}` : `Stages: ${names}`
})
function goParentStage(): void {
  if (parentStage.value) void router.push({ name: parentStage.value.name })
}

// V1 壳收敛（视觉重规划 D2）：治理中心全宽——挂载期隐藏上游导航 rail
onMounted(() => document.body.classList.add('ia-center-full'))
onUnmounted(() => document.body.classList.remove('ia-center-full'))

type TabKey = 'process' | 'orgAssets' | 'clearance' | 'issues' | 'audit' | 'docs' | 'metrics'
interface GovTab { key: TabKey; name: string; components: string[] }

/** 七签单一事实源：路由名+占位注明的将迁入组件（对账行 C5/C7/C6/C4/C8/B8-B13/C3） */
const TABS: ReadonlyArray<GovTab> = [
  { key: 'process', name: 'ia2.governance', components: ['质量门卡（GovHealthSection 拆分·C3）', '质量门修复状态机（orgloop gate-repairs·C3）'] },
  { key: 'orgAssets', name: 'ia2.govOrgAssets', components: ['组织与知识（GovOrgKnowledgeView）', '应用资产编辑器（GovRegistryRulesView）', '密钥最小台账（C11 增件）'] },
  { key: 'clearance', name: 'ia2.govClearance', components: [] },
  { key: 'issues', name: 'ia2.govIssues', components: ['诊断规则（KanbanDiagnosticsSection·C6）'] },
  { key: 'audit', name: 'ia2.govAudit', components: ['审计与变更（GovAuditChangeView·C7）'] },
  { key: 'docs', name: 'ia2.govDocs', components: ['文档评审（GovDocsReviewView·C5）'] },
  { key: 'metrics', name: 'ia2.govMetrics', components: ['AI 产出质量（GovAiQualitySection·E/F 件）', '工程效能（GovHarnessView）', '集群健康（GovClusterSection）', '语义体检（GovOntologySection）', '会话健康（GovSessionHealthSection）', '容量成本（CapacitySection·C4 五卡）'] },
]
type TabTextKey = 'tabProcess' | 'tabOrgAssets' | 'tabClearance' | 'tabIssues' | 'tabAudit' | 'tabDocs' | 'tabMetrics'
const TAB_LABEL_KEY: Record<TabKey, TabTextKey> = {
  process: 'tabProcess', orgAssets: 'tabOrgAssets', clearance: 'tabClearance', issues: 'tabIssues',
  audit: 'tabAudit', docs: 'tabDocs', metrics: 'tabMetrics',
}

const activeTab = computed<TabKey>(() =>
  TABS.find(t => t.name === String(route.name))?.key ?? 'process',
)

/** D8 治理工作台区：BPA/本体/评测/技能治理模块入口（原顶栏岛屿组归位治理域；
 *  feature 门控随行，IDE 岛不在列——其入口在工作台视图切换器） */
const govWorkbenches = computed(() => ISLAND_NAVS.filter(i => i.testid !== 'ia-nav-island-ide' && features[i.featureKey]))

const INTRO_KEY: Record<TabKey, string> = {
  process: 'gov-process', orgAssets: 'gov-orgAssets', clearance: 'gov-clearance',
  issues: 'gov-issues', audit: 'gov-audit', docs: 'gov-docs', metrics: 'gov-metrics',
}
/** 治理动线分组（事前准备/事中跟踪/事后对账）——标注在页签上 */
const STAGE_TAG: Record<TabKey, string> = {
  process: '事前·中', orgAssets: '事前', clearance: '事前', issues: '事中·后', audit: '事后', docs: '事后', metrics: '事后',
}

function goTab(tab: GovTab): void {
  if (tab.key === activeTab.value) return
  // 来源阶段随签切换保留（从②需求进来查文档评审，切到别的签仍亮②）
  const from = route.query.from
  void router.push(typeof from === 'string' ? { name: tab.name, query: { from } } : { name: tab.name })
}
</script>

<template>
  <div class="gov-center">
    <header class="gov-center__head">
      <IaBreadcrumb />
      <h2 class="gov-center__title">{{ text.shellTitle }}</h2>
      <button v-if="parentStage" class="gov-center__parent" type="button" data-testid="gov-parent-stage" :title="parentTitle" @click="goParentStage">← {{ parentLabel }}</button>
      <span v-else class="gov-center__parent gov-center__parent--all" data-testid="gov-allstage-tool" :title="parentTitle">{{ parentLabel }}</span>
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
        >{{ text[TAB_LABEL_KEY[tab.key]] }}<span class="gov-center__stage-tag">{{ STAGE_TAG[tab.key] }}</span></button>
      </nav>
      <span class="gov-center__wb-group" data-testid="ia-gov-workbenches">
        <button
          v-for="wb in govWorkbenches"
          :key="wb.testid"
          class="gov-center__wb-btn"
          type="button"
          :data-testid="`ia-gov-wb-${wb.testid}`"
          @click="void router.push({ name: wb.name })"
        >{{ wb.labelZh }}</button>
      </span>
      <button
        class="gov-center__settings"
        type="button"
        data-testid="ia-gov-settings-link"
        title="系统设置"
        @click="void router.push({ name: 'ia2.govSettings', query: stageContextQuery(route.query.from) })"
      >⚙ 系统设置</button>
    </header>

    <main class="gov-center__body">
      <!-- 签 3 遗留项清算（C2 实装：台账全量+审批+放行灯，消费 orgloop X2） -->
      <section
        v-show="activeTab === 'clearance'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-clearance"
      >
        <h3 class="gov-center__panel-title">{{ text.tabClearance }}<span class="gov-center__panel-no">签 3</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['clearance']" />
        <ClearancePanel />
      </section>
      <!-- 签 1 关卡与流程（C3 件一实装：闸修复单台账；质量门卡拆分随 C3 正件） -->
      <section
        v-show="activeTab === 'process'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-process"
      >
        <h3 class="gov-center__panel-title">{{ text.tabProcess }}<span class="gov-center__panel-no">签 1</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['process']" />
        <GateRepairsPanel />
        <p class="gov-center__pending">六道质量门表卡（GovHealthSection 六闸半区拆分）随 C3 拆分正件并入本签。</p>
      </section>
      <!-- 签 2 组织与资产（C8 实装：组织知识+应用资产整件迁入+密钥最小台账 C11） -->
      <section
        v-show="activeTab === 'orgAssets'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-orgAssets"
      >
        <h3 class="gov-center__panel-title">{{ text.tabOrgAssets }}<span class="gov-center__panel-no">签 2</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['orgAssets']" />
        <OrgEditor />
        <KeyLedgerSection />
        <GovOrgKnowledgeView />
        <GovRegistryRulesView />
      </section>
      <!-- 签 5 审计与变更（C7 整件迁入） -->
      <section
        v-show="activeTab === 'audit'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-audit"
      >
        <h3 class="gov-center__panel-title">{{ text.tabAudit }}<span class="gov-center__panel-no">签 5</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['audit']" />
        <GovAuditChangeView />
      </section>
      <!-- 签 6 文档评审（C5 整件迁入） -->
      <section
        v-show="activeTab === 'docs'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-docs"
      >
        <h3 class="gov-center__panel-title">{{ text.tabDocs }}<span class="gov-center__panel-no">签 6</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['docs']" />
        <GovDocsReviewView />
      </section>
      <!-- 签 7 度量检查（C4 主体：五卡整件迁入；容量阈值灯随 C4 增件；AI 产出质量随 E/F 件） -->
      <section
        v-show="activeTab === 'metrics'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-metrics"
      >
        <h3 class="gov-center__panel-title">{{ text.tabMetrics }}<span class="gov-center__panel-no">签 7</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['metrics']" />
        <CapacityLampBanner />
        <GovAiQualitySection />
        <GovHarnessView />
        <GovClusterSection />
        <GovOntologySection />
        <GovSessionHealthSection />
        <CapacitySection />
      </section>
      <!-- 签 4 问题清单对账（C6 实装：issues.log 台账全量+DISP 联结处置态+100% 处置进度；
           看板诊断规则区件随看板抽屉迁移另件） -->
      <section
        v-show="activeTab === 'issues'"
        class="gov-center__panel gov-center__panel--live"
        data-testid="ia-gov-panel-issues"
      >
        <h3 class="gov-center__panel-title">{{ text.tabIssues }}<span class="gov-center__panel-no">签 4</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['issues']" />
        <GovIssuesPanel />
      </section>
    </main>
  </div>
</template>

<style scoped>
.gov-center { display: flex; flex-direction: column; height: 100%; padding: 16px; overflow: auto; gap: 12px; }
.gov-center__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.gov-center__title { margin: 0; font-size: 16px; }
.gov-center__parent {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); text-decoration: underline; text-underline-offset: 3px; }
}
.gov-center__parent--all { cursor: help; }
.gov-center__parent--all:hover { color: var(--text-muted); text-decoration: none; }
.gov-center__wb-group { display: flex; gap: 4px; }
.gov-center__wb-btn {
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-micro);
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  &:hover { color: var(--text-primary); background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08))); }
}
.gov-center__settings {
  margin-left: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro);
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}
.gov-center__tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.gov-center__tab {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.gov-center__tab--active {
  border-color: var(--accent-primary, var(--color-primary));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}
.gov-center__body { flex: 1; min-height: 0; }
.gov-center__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px 18px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-standard);
}
.gov-center__panel--live { padding: 12px 14px; border-style: solid; }
.gov-center__panel-title { margin: 0; font-size: 14px; display: flex; align-items: center; }
.gov-center__panel-no { margin-left: 8px; padding: 0 5px; border: 1px solid var(--border-color); border-radius: 3px; font-size: 10px; font-weight: 400; color: var(--text-muted); white-space: nowrap; }
.gov-center__pending { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.gov-center__badge {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  font-size: 11px;
}
.gov-center__comp-list { margin: 0; padding: 0 0 0 4px; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.gov-center__comp { font-size: 12px; font-family: var(--font-mono); color: var(--text-muted); }
</style>
