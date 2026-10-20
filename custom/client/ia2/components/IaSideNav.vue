<!-- overlay/custom/client/ia2/components/IaSideNav.vue
     工作台左侧常驻导航（2026-10-20 日常/推演拆分）：
     日常模式 = 常用（流程总览/工作台/看板/审批收件箱/检索）+ 流程六阶段
     + 专题 + 系统设置；全流程推演改为顶栏独立模式，不再作为日常侧栏「整轮」组。
     推演模式 = 推演专区六签 + 返回日常工作台，侧栏不出现日常阶段与专题。
     三组子项共用 IaSideNavItem 一套行式（18px 前导槽 + 标签 + 右侧槽）。
     状态数据走 useDailyStageProgress 共享缓存；无运行/读取失败按未开始呈现，不假装完成。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { features } from '../../../../config/features'
import { CENTER_NAVS, ISLAND_NAVS, useCenterNavLocale } from '../nav-centers'
import { STAGE_META } from '../stage-meta'
import { useDailyStageProgress } from '../composables/useDailyStageProgress'
import { useRunContext } from '../composables/useRunContext'
import { runShortLabel } from '../run-display'
import { useDecisionRows } from '../composables/useDecisionRows'
import { readSetting, writeSetting } from '@/custom/settings-layers'
import IaSideNavItem from './IaSideNavItem.vue'

const route = useRoute()
const router = useRouter()
const navLocale = useCenterNavLocale()
const progress = useDailyStageProgress()
const { run: simRun } = useRunContext('sim')
const { decisionRows } = useDecisionRows()

const zh = computed(() => navLocale.value === 'zh')
const routeName = computed(() => String(route?.name ?? ''))
const routePath = computed(() => String(route?.path ?? ''))
const isSimMode = computed(() => routePath.value === '/app/sim' || routePath.value.startsWith('/app/sim/'))

/** 推演模式侧栏（与 SimCenterView 六签同序；日常模式不再出现本组） */
const simItems = computed(() => [
  { key: 'sim-overview', lead: '◎', zh: '导演台', en: 'Director', name: 'ia2.sim', testid: 'ia-side-nav-sim' },
  { key: 'sim-supervision', lead: '◉', zh: '监督面板', en: 'Supervision', name: 'ia2.simSupervision', testid: 'ia-side-nav-sim-supervision' },
  { key: 'sim-ops', lead: '◈', zh: '运行监控', en: 'Run monitoring', name: 'ia2.simOps', testid: 'ia-side-nav-sim-ops' },
  { key: 'sim-evidence', lead: '▤', zh: '证据库', en: 'Evidence', name: 'ia2.simEvidence', testid: 'ia-side-nav-sim-evidence' },
  { key: 'sim-orchestration', lead: '⟐', zh: '运行编排', en: 'Orchestration', name: 'ia2.simOrchestration', testid: 'ia-side-nav-sim-orchestration' },
  { key: 'sim-settings', lead: '⚙', zh: '推演设置', en: 'Simulation settings', name: 'ia2.simSettings', testid: 'ia-side-nav-sim-settings' },
])

/** 常用组：日常高频入口。match 覆盖同一功能的兄弟路由（会话/房间/群聊都算工作台） */
const WORKBENCH_ROUTES = new Set([
  'ia2.collab', 'ia2.collabChat', 'ia2.collabSession', 'ia2.commsRoom', 'ia2.groupRoom',
  'ia2.dash', 'ia2.collabHistory', 'ia2.collabHistorySession',
  'ia2.collabGlobalAgent', 'ia2.collabGlobalAgentSession',
])

interface CommonItem {
  key: string
  lead: string
  zh: string
  en: string
  name: string
  testid: string
  match: () => boolean
}

const commonItems: CommonItem[] = [
  {
    key: 'journey', lead: '◫', zh: '流程总览', en: 'Overview', name: 'ia2.journey',
    testid: 'ia-side-nav-journey', match: () => routeName.value === 'ia2.journey',
  },
  {
    key: 'workbench', lead: '▤', zh: '工作台', en: 'Workbench', name: 'ia2.collab',
    testid: 'ia-side-nav-workbench', match: () => WORKBENCH_ROUTES.has(routeName.value),
  },
  {
    key: 'board', lead: '▦', zh: '看板', en: 'Board', name: 'ia2.board',
    testid: 'ia-side-nav-board', match: () => routeName.value === 'ia2.board',
  },
  {
    key: 'inbox', lead: '◷', zh: '审批收件箱', en: 'Approvals Inbox', name: 'ia2.inbox',
    testid: 'ia-side-nav-inbox', match: () => routeName.value === 'ia2.inbox',
  },
  {
    key: 'search', lead: '⌕', zh: '检索', en: 'Search', name: 'ia2.search',
    testid: 'ia-side-nav-search', match: () => routeName.value === 'ia2.search',
  },
]

/** 六阶段：标签取 STAGE_META（单一事实源）。只有站在某个阶段页本身时，
 *  该阶段行才用底色高亮；其余页面（工作台/看板/工具页）只靠右侧状态点
 *  表示「当前阶段」，避免「当前页面 + 当前阶段」两行同时抢高亮。 */
const activeStagePage = computed(() => /^ia2\.stage[1-6]$/.test(routeName.value) ? routeName.value : '')
const stageItems = computed(() => STAGE_META.map((meta) => {
  const nav = CENTER_NAVS.find(c => c.key === `stage${meta.no}`)!
  return {
    no: meta.no,
    key: nav.key,
    name: nav.name,
    lead: String(meta.no),
    label: zh.value ? meta.navLabel : meta.navLabelEn,
    active: activeStagePage.value === nav.name,
    status: progress.stageState(meta.no),
  }
}))

const stageStatusLabel = (status: 'done' | 'current' | 'pending'): string =>
  status === 'done' ? (zh.value ? '已完成' : 'Done')
    : status === 'current' ? (zh.value ? '当前阶段' : 'Current')
      : (zh.value ? '未开始' : 'Not started')

/** 左侧栏只放可读日期（10/17 运行），不暴露运行目录名/轮次号；
 *  完整目录名留在顶栏运行 chip 的 title 里供排查反查（2026-10-19 走查批） */
const runTrail = computed(() => {
  const r = simRun.value.trim()
  return r ? runShortLabel(r) : ''
})

const topicItems = computed(() => ISLAND_NAVS
  .filter(i => i.testid !== 'ia-nav-island-ide' && features[i.featureKey])
  .map(i => ({
    key: i.testid,
    name: i.name,
    lead: i.testid.includes('bpa') ? '◧' : i.testid.includes('ontology') ? '◈' : i.testid.includes('eval') ? '◇' : '◉',
    label: zh.value ? i.labelZh : i.labelEn,
    active: routeName.value === i.name,
  })))

const settingsActive = computed(() => routeName.value === 'ia2.govSettings' || routeName.value === 'ia2.modelProviders')

// ── 折叠：手动优先；窄屏自动收起；≤720px 强制紧凑（用户历史展开偏好不覆盖） ──
const stored = readSetting<boolean>('sidenav.collapsed', false)
const userSet = ref(stored.layer !== 'default')
const collapsed = ref(stored.value)
const autoCompact = ref(false)
const hardCompact = ref(false)
const effectiveCollapsed = computed(() => hardCompact.value || collapsed.value || (autoCompact.value && !userSet.value))

watch(collapsed, (v) => {
  if (userSet.value) writeSetting('user', 'sidenav.collapsed', v)
})

let mq: MediaQueryList | null = null
let mqNarrow: MediaQueryList | null = null
function onMqChange(e: MediaQueryListEvent): void { autoCompact.value = e.matches }
function onNarrowChange(e: MediaQueryListEvent): void { hardCompact.value = e.matches }
onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  mq = window.matchMedia('(max-width: 1180px)')
  autoCompact.value = mq.matches
  mq.addEventListener?.('change', onMqChange)
  mqNarrow = window.matchMedia('(max-width: 720px)')
  hardCompact.value = mqNarrow.matches
  mqNarrow.addEventListener?.('change', onNarrowChange)
})
onUnmounted(() => {
  mq?.removeEventListener?.('change', onMqChange)
  mqNarrow?.removeEventListener?.('change', onNarrowChange)
})

function toggleCollapsed(): void {
  userSet.value = true
  collapsed.value = !effectiveCollapsed.value
}

function go(name: string): void {
  if (routeName.value === name) return
  void router.push({ name })
}
</script>

<template>
  <aside
    class="isn"
    :class="{ 'isn--collapsed': effectiveCollapsed }"
    data-testid="ia-side-nav"
    aria-label="主导航"
  >
    <div class="isn__brand">
      <span class="isn__logo" aria-hidden="true">S</span>
      <span v-if="!effectiveCollapsed" class="isn__brand-name">SwarmStudio</span>
      <button
        type="button"
        class="isn__collapse"
        data-testid="ia-side-nav-collapse"
        :disabled="hardCompact"
        :aria-label="hardCompact ? '窄屏下固定紧凑导航' : effectiveCollapsed ? '展开侧栏' : '收起侧栏'"
        :title="hardCompact ? '窄屏下固定紧凑导航' : effectiveCollapsed ? '展开侧栏' : '收起侧栏'"
        @click="toggleCollapsed"
      >{{ effectiveCollapsed ? '›' : '‹' }}</button>
    </div>

    <nav class="isn__scroll" aria-label="左侧导航分组">
      <!-- 推演模式：只出现推演六签，不出现日常阶段/专题/常用 -->
      <template v-if="isSimMode">
        <section class="isn__group">
          <h2 v-if="!effectiveCollapsed" class="isn__label">{{ zh ? '全流程推演' : 'Full-run Simulation' }}</h2>
          <IaSideNavItem
            v-for="item in simItems"
            :key="item.key"
            :lead="item.lead"
            :label="zh ? item.zh : item.en"
            :trail="item.key === 'sim-overview' ? runTrail : ''"
            :active="routeName === item.name"
            :testid="item.testid"
            @select="go(item.name)"
          />
        </section>
      </template>

      <template v-else>
        <section class="isn__group">
          <h2 v-if="!effectiveCollapsed" class="isn__label">{{ zh ? '常用' : 'Common' }}</h2>
          <IaSideNavItem
            v-for="item in commonItems"
            :key="item.key"
            :lead="item.lead"
            :label="zh ? item.zh : item.en"
            :active="item.match()"
            :badge="item.key === 'inbox' && decisionRows.length ? decisionRows.length : ''"
            :testid="item.testid"
            @select="go(item.name)"
          />
        </section>

        <section class="isn__group">
          <h2 v-if="!effectiveCollapsed" class="isn__label">{{ zh ? '流程' : 'Process' }}</h2>
          <IaSideNavItem
            v-for="item in stageItems"
            :key="item.key"
            lead-kind="number"
            :lead="item.lead"
            :label="item.label"
            :status="item.status"
            :status-label="stageStatusLabel(item.status)"
            :active="item.active"
            :testid="`ia-side-nav-${item.key}`"
            @select="go(item.name)"
          />
        </section>

        <section v-if="topicItems.length" class="isn__group">
          <h2 v-if="!effectiveCollapsed" class="isn__label">{{ zh ? '专题' : 'Topics' }}</h2>
          <IaSideNavItem
            v-for="item in topicItems"
            :key="item.key"
            :lead="item.lead"
            :label="item.label"
            :active="item.active"
            :testid="item.key"
            @select="go(item.name)"
          />
        </section>
      </template>
    </nav>

    <div class="isn__foot">
      <IaSideNavItem
        v-if="isSimMode"
        lead="←"
        :label="zh ? '返回日常工作台' : 'Back to daily'"
        testid="ia-side-nav-back-daily"
        @select="go('ia2.collab')"
      />
      <IaSideNavItem
        v-else
        lead="⚙"
        :label="zh ? '系统设置' : 'Settings'"
        :active="settingsActive"
        testid="ia-side-nav-settings"
        @select="go('ia2.govSettings')"
      />
    </div>
  </aside>
</template>

<style scoped>
.isn {
  width: 216px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
}
.isn--collapsed { width: 58px; }
.isn__brand {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  border-bottom: 1px solid var(--border-color);
}
.isn--collapsed .isn__brand { justify-content: center; padding: 0; }
/* 收起后隐藏品牌字标，但展开按钮必须留在原地——否则没有回到展开态的入口 */
.isn--collapsed .isn__logo { display: none; }
.isn__logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent-primary);
  color: var(--text-on-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.isn__brand-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.isn__collapse {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
.isn__collapse:hover { color: var(--text-primary); background: var(--bg-secondary); }
.isn__collapse:disabled { opacity: .55; cursor: default; }
.isn--collapsed .isn__collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}
.isn__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 8px 12px; }
.isn__group + .isn__group { margin-top: 8px; }
.isn__label {
  margin: 10px 6px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
}
.isn--collapsed .isn__scroll { padding: 8px 6px 12px; }
.isn--collapsed :deep(.isn-item) {
  grid-template-columns: 18px;
  justify-items: center;
  padding: 0;
}
.isn--collapsed :deep(.isn-item__label),
.isn--collapsed :deep(.isn-item__trail) { display: none; }
.isn--collapsed :deep(.isn-item__badge) {
  position: absolute;
  margin: -16px 0 0 18px;
}
.isn__foot {
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--border-color);
}
.isn--collapsed .isn__foot { padding: 8px 6px; }
</style>
