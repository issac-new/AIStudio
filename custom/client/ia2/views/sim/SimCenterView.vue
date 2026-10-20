<!-- overlay/custom/client/ia2/views/sim/SimCenterView.vue
     全流程推演专区壳（2026-10-18 推演区批，原「仿真中心」改名）：
     四签单层页签——运行总览 / 监督面板 / 运行监控 / 证据库；运行编排与
     推演设置是专区级动作，放页头按钮。页面不再出现「签 N」「待实现」或
     端点清单占位。日常阶段页只留一行「本轮运行」摘要，本专区才是整轮运行
     的监控、证据与编排入口。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSimTabsText } from './sim-tabs'
import SupervisionPanel from './SupervisionPanel.vue'
import EvidencePanel from './EvidencePanel.vue'
import OpsPanel from './OpsPanel.vue'
import DirectorPanel from './DirectorPanel.vue'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import CockpitPanel from './CockpitPanel.vue'
import SimFlowStrip from './SimFlowStrip.vue'
import RunSelector from './RunSelector.vue'
import OrchestrationView from '../orchestration/OrchestrationView.vue'
import SimSettingsView from './SimSettingsView.vue'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { useCenterNavLocale } from '../../nav-centers'
import { retainBodyClass } from '../../composables/useBodyClass'

const route = useRoute()
const router = useRouter()
const text = useSimTabsText()
const navLocale = useCenterNavLocale()

// V1 壳收敛（视觉重规划 D2）：推演专区全宽——挂载期隐藏上游导航 rail
// 2026-10-18：改为引用计数，IaShell 全程 retain 时本页卸载不会误摘 body 类。
let releaseBodyClass: (() => void) | null = null
onMounted(() => { releaseBodyClass = retainBodyClass('ia-center-full') })
onUnmounted(() => { releaseBodyClass?.(); releaseBodyClass = null })

type TabKey = 'overview' | 'supervision' | 'ops' | 'evidence' | 'orchestration' | 'settings'
interface SimTab { key: TabKey; name?: string; zh?: string; en?: string }

const TABS: ReadonlyArray<SimTab> = [
  { key: 'overview', name: 'ia2.sim' },
  { key: 'supervision', name: 'ia2.simSupervision' },
  { key: 'ops', name: 'ia2.simOps' },
  { key: 'evidence', name: 'ia2.simEvidence' },
  { key: 'orchestration', zh: '运行编排', en: 'Orchestration' },
  { key: 'settings', zh: '推演设置', en: 'Settings' },
]
type TabTextKey = 'tabOverview' | 'tabSupervision' | 'tabOps' | 'tabEvidence'
const TAB_LABEL_KEY: Record<string, TabTextKey> = {
  overview: 'tabOverview', supervision: 'tabSupervision', ops: 'tabOps', evidence: 'tabEvidence',
}

const localTab = computed<'orchestration' | 'settings' | ''>(() => {
  const t = String(route.query.tab ?? '')
  return t === 'orchestration' || t === 'settings' ? t : ''
})
const activeTab = computed<TabKey>(() =>
  localTab.value || TABS.find(t => t.name === String(route.name))?.key || 'overview',
)

function labelOf(tab: SimTab): string {
  if (tab.zh) return navLocale.value === 'zh' ? tab.zh : tab.en!
  return text.value[TAB_LABEL_KEY[tab.key]]
}

/** 页签点击：路由签走兄弟路由，编排/设置走本页 ?tab=；run/from 上下文随签保留 */
function goTab(tab: SimTab): void {
  if (tab.key === activeTab.value) return
  const query: Record<string, string> = {}
  for (const key of ['run', 'from'] as const) {
    const v = route.query[key]
    if (typeof v === 'string' && v) query[key] = v
  }
  if (tab.name) {
    void router.push({ name: tab.name, query: Object.keys(query).length ? query : undefined })
  } else {
    void router.push({ name: 'ia2.sim', query: { ...query, tab: tab.key } })
  }
}

const INTRO_KEY: Record<string, string> = {
  overview: 'sim-overview', supervision: 'sim-supervision', ops: 'sim-ops', evidence: 'sim-evidence',
}
</script>

<template>
  <div class="sim-center">
    <header class="sim-center__head">
      <IaBreadcrumb />
      <h2 class="sim-center__title">{{ navLocale === 'zh' ? '全流程推演' : 'Full-run Simulation' }}</h2>
      <RunSelector />
    </header>

    <p class="sim-center__lead">
      {{ navLocale === 'zh'
        ? '本次运行 26 步怎么走、卡在哪、证据在哪。日常派活与沟通请切换顶部「日常工作台」。'
        : 'How this 26-step run is going, where it is stuck, and where the evidence is. Daily work lives in the top "Daily" mode.' }}
    </p>

    <nav class="sim-center__tabs" role="tablist" aria-label="全流程推演">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        class="sim-center__tab"
        :class="{ 'sim-center__tab--active': activeTab === tab.key }"
        :aria-selected="activeTab === tab.key"
        :data-testid="`ia-sim-tab-${tab.key}`"
        @click="goTab(tab)"
      >{{ labelOf(tab) }}</button>
    </nav>

    <CockpitPanel />
    <SimFlowStrip />

    <main class="sim-center__body">
      <section v-show="activeTab === 'overview'" class="sim-center__panel" data-testid="ia-sim-panel-overview">
        <TabIntroBanner :tab="INTRO_KEY.overview" />
        <DirectorPanel />
      </section>
      <section v-show="activeTab === 'supervision'" class="sim-center__panel" data-testid="ia-sim-panel-supervision">
        <TabIntroBanner :tab="INTRO_KEY.supervision" />
        <SupervisionPanel />
      </section>
      <section v-show="activeTab === 'ops'" class="sim-center__panel" data-testid="ia-sim-panel-ops">
        <TabIntroBanner :tab="INTRO_KEY.ops" />
        <OpsPanel />
      </section>
      <section v-show="activeTab === 'evidence'" class="sim-center__panel" data-testid="ia-sim-panel-evidence">
        <TabIntroBanner :tab="INTRO_KEY.evidence" />
        <EvidencePanel />
      </section>
      <section v-if="activeTab === 'orchestration'" class="sim-center__panel" data-testid="ia-sim-panel-orchestration">
        <OrchestrationView />
      </section>
      <section v-if="activeTab === 'settings'" class="sim-center__panel" data-testid="ia-sim-panel-settings">
        <SimSettingsView embedded />
      </section>
    </main>
  </div>
</template>

<style scoped>
.sim-center {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px 16px 16px;
  overflow: hidden;
  gap: 10px;
}
.sim-center__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sim-center__title { margin: 0; font-size: 16px; }
.sim-center__spacer { flex: 1; }
.sim-center__act {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}
.sim-center__act:hover { background: var(--bg-secondary); }
.sim-center__act:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.sim-center__lead { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.55; }
.sim-center__tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
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
.sim-center__tab:hover { color: var(--text-primary); background: var(--bg-secondary); }
.sim-center__tab:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.sim-center__tab--active {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  font-weight: 600;
}
.sim-center__body { flex: 1; min-height: 0; overflow-y: auto; }
.sim-center__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard);
}
</style>
