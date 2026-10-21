<!-- overlay/custom/client/ia2/views/sim/SimCenterView.vue
     全流程推演专区壳（2026-10-18 推演区批，原「仿真中心」改名）：
     四签单层页签——导演台 / 监督面板 / 运行监控 / 证据库；运行编排与推演
     设置的唯一入口在左侧栏（2026-10-21 双入口收敛）。导演 run 与 26 步
     harness run 分流：legacy 三签在导演 run 下显示显式内联态并给「导演
     详情」入口，不再静默改道。 -->
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
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { useCenterNavLocale } from '../../nav-centers'
import { retainBodyClass } from '../../composables/useBodyClass'
import { useRunContext } from '../../composables/useRunContext'
import { isDirectorRun } from '../../utils/director-run'

const route = useRoute()
const router = useRouter()
const text = useSimTabsText()
const navLocale = useCenterNavLocale()

// V1 壳收敛（视觉重规划 D2）：推演专区全宽——挂载期隐藏上游导航 rail
// 2026-10-18：改为引用计数，IaShell 全程 retain 时本页卸载不会误摘 body 类。
let releaseBodyClass: (() => void) | null = null
onMounted(() => { releaseBodyClass = retainBodyClass('ia-center-full') })
onUnmounted(() => { releaseBodyClass?.(); releaseBodyClass = null })

type TabKey = 'overview' | 'supervision' | 'ops' | 'evidence'
interface SimTab { key: TabKey; name: string }

const TABS: ReadonlyArray<SimTab> = [
  { key: 'overview', name: 'ia2.sim' },
  { key: 'supervision', name: 'ia2.simSupervision' },
  { key: 'ops', name: 'ia2.simOps' },
  { key: 'evidence', name: 'ia2.simEvidence' },
]
type TabTextKey = 'tabOverview' | 'tabSupervision' | 'tabOps' | 'tabEvidence'
const TAB_LABEL_KEY: Record<TabKey, TabTextKey> = {
  overview: 'tabOverview', supervision: 'tabSupervision', ops: 'tabOps', evidence: 'tabEvidence',
}

const activeTab = computed<TabKey>(() =>
  TABS.find(t => t.name === String(route.name))?.key || 'overview',
)

function labelOf(tab: SimTab): string {
  return text.value[TAB_LABEL_KEY[tab.key]]
}

function contextQuery(): Record<string, string> | undefined {
  const query: Record<string, string> = {}
  for (const key of ['run', 'from'] as const) {
    const v = route.query[key]
    if (typeof v === 'string' && v) query[key] = v
  }
  return Object.keys(query).length ? query : undefined
}

/** 页签点击：四签各走兄弟路由；run/from 上下文随签保留 */
function goTab(tab: SimTab): void {
  if (tab.key === activeTab.value) return
  void router.push({ name: tab.name, query: contextQuery() })
}

/** 两体系分流（2026-10-21 遗留清偿）：导演 run 与 26 步 run 详情各归其位——
 *  导演 run 只在导演台/导演详情有效；legacy 三签显示显式内联态，不再静默改道。 */
const { run: selectedSimRun } = useRunContext('sim')
const directorRunId = computed(() => {
  const name = selectedSimRun.value.trim()
  return isDirectorRun(name) ? name : ''
})

function openDirectorDetail(): void {
  if (!directorRunId.value) return
  void router.push({ name: 'ia2.simDirectorRun', params: { runId: directorRunId.value } })
}

const RUNSPLIT_TEXT: Record<'supervision' | 'ops' | 'evidence', { zh: string; en: string }> = {
  supervision: {
    zh: '这是产品内导演运行（图运行时）。监督面板面向 26 步 harness 运行的观察窗，不适用。',
    en: 'This is a director run (graph runtime). Supervision serves 26-step harness runs.',
  },
  ops: {
    zh: '这是产品内导演运行（图运行时）。运行监控的环境拓扑/派发器面向 harness，不适用。',
    en: 'This is a director run (graph runtime). Run monitoring serves harness runs.',
  },
  evidence: {
    zh: '这是产品内导演运行（图运行时）。26 步证据库不适用，导演运行的证据是图事件流。',
    en: 'This is a director run (graph runtime). Evidence for director runs is the graph event log.',
  },
}

function runsplitText(key: 'supervision' | 'ops' | 'evidence'): string {
  return navLocale.value === 'zh' ? RUNSPLIT_TEXT[key].zh : RUNSPLIT_TEXT[key].en
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
        <div v-if="directorRunId" class="sim-center__runsplit" data-testid="ia-sim-runsplit-supervision">
          <p>{{ runsplitText('supervision') }}</p>
          <button type="button" data-testid="ia-sim-runsplit-open" @click="openDirectorDetail">{{ navLocale === 'zh' ? '打开导演详情 →' : 'Open director detail →' }}</button>
        </div>
        <SupervisionPanel v-else />
      </section>
      <section v-show="activeTab === 'ops'" class="sim-center__panel" data-testid="ia-sim-panel-ops">
        <TabIntroBanner :tab="INTRO_KEY.ops" />
        <div v-if="directorRunId" class="sim-center__runsplit" data-testid="ia-sim-runsplit-ops">
          <p>{{ runsplitText('ops') }}</p>
          <button type="button" data-testid="ia-sim-runsplit-open" @click="openDirectorDetail">{{ navLocale === 'zh' ? '打开导演详情 →' : 'Open director detail →' }}</button>
        </div>
        <OpsPanel v-else />
      </section>
      <section v-show="activeTab === 'evidence'" class="sim-center__panel" data-testid="ia-sim-panel-evidence">
        <TabIntroBanner :tab="INTRO_KEY.evidence" />
        <div v-if="directorRunId" class="sim-center__runsplit" data-testid="ia-sim-runsplit-evidence">
          <p>{{ runsplitText('evidence') }}</p>
          <button type="button" data-testid="ia-sim-runsplit-open" @click="openDirectorDetail">{{ navLocale === 'zh' ? '打开导演详情 →' : 'Open director detail →' }}</button>
        </div>
        <EvidencePanel v-else />
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
.sim-center__runsplit {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  border: 1px dashed var(--border-color); border-radius: var(--radius-standard);
  padding: 14px 16px; font-size: 12.5px; color: var(--text-muted);
}
.sim-center__runsplit button {
  margin-left: auto; border: 1px solid var(--accent-primary); border-radius: var(--radius-micro);
  background: transparent; color: var(--accent-primary);
  font-family: inherit; font-size: 12px; padding: 4px 12px; cursor: pointer; white-space: nowrap;
}
.sim-center__runsplit button:hover { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); }
.sim-center__runsplit button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
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
