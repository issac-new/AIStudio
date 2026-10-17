<!-- overlay/custom/client/ia2/views/sim/SimCenterView.vue -->
<!-- 仿真中心壳（B1·三中心重构波 2 首件）：顶部六签单层页签 + 内容区。
     六签路由与挂面冻结自 docs/superpowers/specs/2026-10-16-sim-center-detailed-design.md：
     签 1 运行总览 /app/sim（默认签）、签 2 监督面板、签 3 运行监控、签 4 证据库、
     签 5 交付健康、签 6 需求追溯——六条兄弟路由共用本组件（workbench 复用模式，
     当前签由路由名单一推导）。本壳只含导航与占位空态：签内容（数据面）由
     B2-B7 逐签实装，占位文案注明各签将消费的 X1 已就绪端点（正身=custom/server/
     simcenter 控制器族，X1 已合入）。场景编排挂面（/app/sim/orchestration，
     A8+D9）是壳层挂面非第七签，随其工单挂入。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSimTabsText } from './sim-tabs'
import SupervisionPanel from './SupervisionPanel.vue'
import EvidencePanel from './EvidencePanel.vue'
import OpsPanel from './OpsPanel.vue'
import DeliveryPanel from './DeliveryPanel.vue'
import TracePanel from './TracePanel.vue'
import OverviewPanel from './OverviewPanel.vue'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import CockpitPanel from './CockpitPanel.vue'
import SimFlowStrip from './SimFlowStrip.vue'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { CENTER_NAVS, stageContextQuery, useCenterNavLocale } from '../../nav-centers'
import { stageCircles, stageKeyOf, stageOwnersForRouteName } from '../../stage-attribution'

const route = useRoute()
const router = useRouter()
const text = useSimTabsText()
const navLocale = useCenterNavLocale()
// 页签级归属（2026-10-17）：中心各签归不同阶段，回链按当前签动态生成；
// 全程工具（运行总览/仿真设置）不硬指一站
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

// V1 壳收敛（视觉重规划 D2）：仿真中心全宽——挂载期隐藏上游导航 rail
onMounted(() => document.body.classList.add('ia-center-full'))
onUnmounted(() => document.body.classList.remove('ia-center-full'))

/** 六签单一事实源：路由名 + 该签将消费的 X1 端点清单（占位展示用，
 *  非数据面调用；端点全集见 simcenter-controller，POST 标注写法面） */
type TabKey = 'overview' | 'supervision' | 'ops' | 'evidence' | 'delivery' | 'trace'
interface SimTab { key: TabKey; name: string; endpoints: string[] }

const TABS: ReadonlyArray<SimTab> = [
  { key: 'overview', name: 'ia2.sim', endpoints: ['/api/hermes/sim/run-state', '/api/hermes/sim/deliverables', '/api/hermes/sim/issues'] },
  { key: 'supervision', name: 'ia2.simSupervision', endpoints: ['/api/hermes/sim/journal'] },
  { key: 'ops', name: 'ia2.simOps', endpoints: ['/api/hermes/sim/topology', '/api/hermes/sim/dispatcher-health', '/api/hermes/sim/sleeping-workers'] },
  { key: 'evidence', name: 'ia2.simEvidence', endpoints: ['/api/hermes/sim/anchor', 'POST /api/hermes/sim/evidence/mark'] },
  { key: 'delivery', name: 'ia2.simDelivery', endpoints: ['/api/hermes/sim/branches'] },
  { key: 'trace', name: 'ia2.simTrace', endpoints: ['/api/hermes/sim/trace'] },
]
type TabTextKey = 'tabOverview' | 'tabSupervision' | 'tabOps' | 'tabEvidence' | 'tabDelivery' | 'tabTrace'
const TAB_LABEL_KEY: Record<TabKey, TabTextKey> = {
  overview: 'tabOverview',
  supervision: 'tabSupervision',
  ops: 'tabOps',
  evidence: 'tabEvidence',
  delivery: 'tabDelivery',
  trace: 'tabTrace',
}

/** 当前签：由路由名推导（六条兄弟路由共用本组件）；未知名兜底默认签=运行总览 */
const activeTab = computed<TabKey>(() =>
  TABS.find(t => t.name === String(route.name))?.key ?? 'overview',
)

/** 页签点击=路由切换（页签位置可分享/刷新保持；同签点击不产生导航） */
function goTab(tab: SimTab): void {
  if (tab.key === activeTab.value) return
  // 来源阶段随签切换保留（从②需求进来查文档/监督，切签后顶栏仍亮②）
  const from = route.query.from
  void router.push(typeof from === 'string' ? { name: tab.name, query: { from } } : { name: tab.name })
}

/** 六签全部实装（B1 壳+B2/B4/B5/B6+总览屏收尾件）；占位循环保留给后续新增签 */
const INTRO_KEY: Record<TabKey, string> = {
  overview: 'sim-overview', supervision: 'sim-supervision', ops: 'sim-ops',
  evidence: 'sim-evidence', delivery: 'sim-delivery', trace: 'sim-trace',
}

const placeholderTabs = computed(() => [] as Array<SimTab & { index: number }>)
</script>

<template>
  <div class="sim-center">
    <header class="sim-center__head">
      <IaBreadcrumb />
      <h2 class="sim-center__title">{{ text.shellTitle }}</h2>
      <button v-if="parentStage" class="sim-center__parent" type="button" data-testid="sim-parent-stage" :title="parentTitle" @click="goParentStage">← {{ parentLabel }}</button>
      <span v-else class="sim-center__parent sim-center__parent--all" data-testid="sim-allstage-tool" :title="parentTitle">{{ parentLabel }}</span>
      <nav class="sim-center__tabs" role="tablist" :aria-label="text.shellTitle">
        <button
          v-for="(tab, i) in TABS"
          :key="tab.key"
          type="button"
          role="tab"
          class="sim-center__tab"
          :class="{ 'sim-center__tab--active': activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          :data-testid="`ia-sim-tab-${tab.key}`"
          @click="goTab(tab)"
        >
          {{ text[TAB_LABEL_KEY[tab.key]] }}
        </button>
      </nav>
      <CockpitPanel />
      <button
        class="sim-center__settings"
        type="button"
        data-testid="ia-sim-settings-link"
        title="仿真设置"
        @click="void router.push({ name: 'ia2.simSettings', query: stageContextQuery(route.query.from) })"
      >⚙ 仿真设置</button>
    </header>

    <SimFlowStrip />

    <main class="sim-center__body">
      <!-- 签 1 运行总览＝总览屏（B 波收尾实装：运行模式横幅+健康行+六闸全名行+净额双行卡） -->
      <section
        v-show="activeTab === 'overview'"
        class="sim-center__panel sim-center__panel--live"
        data-testid="ia-sim-panel-overview"
      >
        <h3 class="sim-center__panel-title">{{ text.tabOverview }}<span class="sim-center__panel-no">签 1</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['overview']" />
        <OverviewPanel />
      </section>
      <!-- 签 2 监督面板（B2 实装：观察窗流+研判/判定时间线+journal 原行反查） -->
      <section
        v-show="activeTab === 'supervision'"
        class="sim-center__panel sim-center__panel--live"
        data-testid="ia-sim-panel-supervision"
      >
        <h3 class="sim-center__panel-title">{{ text.tabSupervision }}<span class="sim-center__panel-no">签 2</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['supervision']" />
        <SupervisionPanel />
      </section>
      <!-- 签 3 运行监控（B4 实装：四服务红绿点+调度器健康+空闲工作者+活性行挂账态） -->
      <section
        v-show="activeTab === 'ops'"
        class="sim-center__panel sim-center__panel--live"
        data-testid="ia-sim-panel-ops"
      >
        <h3 class="sim-center__panel-title">{{ text.tabOps }}<span class="sim-center__panel-no">签 3</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['ops']" />
        <OpsPanel />
      </section>
      <!-- 签 4 证据库（B2 实装：锚检索→锚点抽屉+台账子表+帧图廊挂账态） -->
      <section
        v-show="activeTab === 'evidence'"
        class="sim-center__panel sim-center__panel--live"
        data-testid="ia-sim-panel-evidence"
      >
        <h3 class="sim-center__panel-title">{{ text.tabEvidence }}<span class="sim-center__panel-no">签 4</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['evidence']" />
        <EvidencePanel />
      </section>
      <!-- 签 5 交付健康（B5 实装：分支新鲜度三态+交付物 14 件链） -->
      <section
        v-show="activeTab === 'delivery'"
        class="sim-center__panel sim-center__panel--live"
        data-testid="ia-sim-panel-delivery"
      >
        <h3 class="sim-center__panel-title">{{ text.tabDelivery }}<span class="sim-center__panel-no">签 5</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['delivery']" />
        <DeliveryPanel />
      </section>
      <!-- 签 6 需求追溯（B6 实装：AC 判词链四列+三源在场徽） -->
      <section
        v-show="activeTab === 'trace'"
        class="sim-center__panel sim-center__panel--live"
        data-testid="ia-sim-panel-trace"
      >
        <h3 class="sim-center__panel-title">{{ text.tabTrace }}<span class="sim-center__panel-no">签 6</span></h3>
        <TabIntroBanner :tab="INTRO_KEY['trace']" />
        <TracePanel />
      </section>
      <!-- 其余两签占位（B7 监督面板深化随 journal 积累） -->
      <section
        v-for="(tab, i) in placeholderTabs"
        v-show="activeTab === tab.key"
        :key="tab.key"
        class="sim-center__panel"
        :data-testid="`ia-sim-panel-${tab.key}`"
      >
        <h3 class="sim-center__panel-title">{{ text[TAB_LABEL_KEY[tab.key]] }}<span class="sim-center__panel-no">签 {{ tab.index }}</span></h3>
        <p class="sim-center__pending">
          <span class="sim-center__badge">{{ text.pendingBadge }}</span>{{ text.pendingLead }}
        </p>
        <p class="sim-center__endpoints">{{ text.endpointsLead }}</p>
        <ul class="sim-center__endpoint-list">
          <li v-for="ep in tab.endpoints" :key="ep" class="sim-center__endpoint">{{ ep }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.sim-center {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  overflow: auto;
  gap: 12px;
}

.sim-center__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.sim-center__title { margin: 0; font-size: 16px; }
.sim-center__parent {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); text-decoration: underline; text-underline-offset: 3px; }
}
.sim-center__parent--all { cursor: help; }
.sim-center__parent--all:hover { color: var(--text-muted); text-decoration: none; }
.sim-center__settings {
  margin-left: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro);
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}

/* 六签单层页签（无二级页签——全站单层纪律同 /app/board） */
.sim-center__tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.sim-center__tab {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.sim-center__tab--active {
  border-color: var(--accent-primary, var(--color-primary));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}

/* 占位面板（B1 壳空态） */
.sim-center__body { flex: 1; min-height: 0; }
.sim-center__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px 20px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-standard);
}
/* B2 实装签：去虚线占位框，承载实际面板 */
.sim-center__panel--live {
  padding: 12px 14px;
  border-style: solid;
}
.sim-center__panel-title { margin: 0; font-size: 15px; display: flex; align-items: center; }
.sim-center__panel-no { margin-left: 8px; padding: 0 5px; border: 1px solid var(--border-color); border-radius: 3px; font-size: 10px; font-weight: 400; color: var(--text-muted); white-space: nowrap; }
.sim-center__pending {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary));
  line-height: 1.6;
}
.sim-center__badge {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  font-size: 11px;
}
.sim-center__endpoints {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary));
}
.sim-center__endpoint-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sim-center__endpoint {
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
