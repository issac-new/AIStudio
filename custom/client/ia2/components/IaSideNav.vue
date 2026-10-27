<!-- overlay/custom/client/ia2/components/IaSideNav.vue
     工作台左侧常驻导航（2026-10-20 日常/推演拆分）：
     日常模式 = 常用（流程总览/工作台/看板/审批收件箱 + 最近轨迹面板开关）
     + 流程六阶段 + 专题 + 系统设置；全流程推演改为顶栏独立模式，不再作为日常
     侧栏「整轮」组。推演模式 = 推演专区六签 + 返回日常工作台，侧栏不出现日常
     阶段与专题。三组子项共用 IaSideNavItem 一套行式（18px 前导槽 + 标签 + 右侧槽）。
     常用/推演两组静态定义自 nav-centers（COMMON_NAVS/SIM_NAVS，2026-10-23
     最近轨迹批迁入）；「最近」（2026-10-23）记录 fullPath 级访问轨迹供回溯。
     状态数据走 useDailyStageProgress 共享缓存；无运行/读取失败按未开始呈现，不假装完成。 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { features } from '../../../../config/features'
import { CENTER_NAVS, COMMON_NAVS, ISLAND_NAVS, SIM_NAVS, WORKBENCH_ROUTE_NAMES, useCenterNavLocale } from '../nav-centers'
import { STAGE_META } from '../stage-meta'
import { useDailyStageProgress } from '../composables/useDailyStageProgress'
import { useRunContext } from '../composables/useRunContext'
import { useNowTick } from '../composables/useNowTick'
import { runShortLabel } from '../run-display'
import { useSideNavBadges } from '../composables/useSideNavBadges'
import { useRecentTrail } from '../composables/useRecentTrail'
import { formatRecentTime, type RecentEntry } from '../recent-trail'
import { readSetting, writeSetting } from '@/custom/settings-layers'
import IaSideNavItem from './IaSideNavItem.vue'

const route = useRoute()
const router = useRouter()
const navLocale = useCenterNavLocale()
const progress = useDailyStageProgress()
const { run: simRun } = useRunContext('sim')
const { badges: navBadges, blockedCount } = useSideNavBadges()

/** 待办徽标：0=不渲染（''），>0 传数字；key 见 useSideNavBadges 口径表 */
function navBadge(key: string): number | '' {
  const n = navBadges.value[key] ?? 0
  return n > 0 ? n : ''
}

/** 徽标项的悬停说明（有数才挂 title，说明数字口径；无徽标保持无 title 现状） */
const BADGE_TITLES: Record<string, { zh: string; en: string }> = {
  journey: { zh: '待办合计：需关注 + 评审门（并集不重）', en: 'Total pending: attention + gate reviews (union)' },
  workbench: { zh: '需关注：阻塞任务 / 阻塞循环 / 等我 / 失败会话', en: 'Needs attention: blocked tasks/loops, waiting, failed sessions' },
  board: { zh: '受阻任务数（与注意力条同口径）', en: 'Blocked tasks (same scope as attention bar)' },
  inbox: { zh: '待决策：等我三源 + 评审门', en: 'Pending decisions: waiting + gate reviews' },
  stage3: { zh: '本阶段在办：待分类 / 待办 / 已排期 / 可开工', en: 'In this stage: triage / todo / scheduled / ready' },
  stage4: { zh: '本阶段在办：进行中 / 阻塞 / 待验收', en: 'In this stage: running / blocked / review' },
}
function badgeTitle(key: string): string | undefined {
  const n = navBadges.value[key] ?? 0
  if (n <= 0) return undefined
  const t = BADGE_TITLES[key]
  return t ? (zh.value ? t.zh : t.en) : undefined
}

const zh = computed(() => navLocale.value === 'zh')
const routeName = computed(() => String(route?.name ?? ''))
const routePath = computed(() => String(route?.path ?? ''))
const isSimMode = computed(() => routePath.value === '/app/sim' || routePath.value.startsWith('/app/sim/'))

/** 推演模式侧栏（2026-10-27 产品一致性 Task 9：中央页签条退役，本组是推演域
 *  唯一导航；文案自 nav-centers SIM_NAVS 单一源——与最近轨迹标题解析共用，
 *  2026-10-23 迁入） */
const simItems = SIM_NAVS

/** 常用组：日常高频入口。静态定义自 nav-centers COMMON_NAVS（单一源），
 *  match 覆盖同一功能的兄弟路由（会话/房间/群聊都算工作台）留在组件内
 *  （依赖响应式路由名）。 */
interface CommonItem {
  key: string
  lead: string
  zh: string
  en: string
  name: string
  testid: string
  match: () => boolean
}

const COMMON_MATCH: Record<string, () => boolean> = {
  journey: () => routeName.value === 'ia2.journey',
  workbench: () => WORKBENCH_ROUTE_NAMES.has(routeName.value),
  board: () => routeName.value === 'ia2.board',
  inbox: () => routeName.value === 'ia2.inbox',
}

const commonItems: CommonItem[] = COMMON_NAVS.map(c => ({ ...c, match: COMMON_MATCH[c.key] }))

/** 六阶段：标签取 STAGE_META（单一事实源）。只有站在某个阶段页本身时，
 *  该阶段行才用底色高亮；其余页面（工作台/看板/工具页）只靠右侧状态点
 *  表示「当前阶段」，避免「当前页面 + 当前阶段」两行同时抢高亮。 */
const activeStagePage = computed(() => /^ia2\.stage[1-6]$/.test(routeName.value) ? routeName.value : '')
/** 阶段行右侧信号（2026-10-26 合一轮）：③④有在办数时计数章色=本阶段桶自身
 *  状态（桶映射=STAGE_BOARD_STATUSES，与阶段页内嵌看板同源）——④桶含 blocked，
 *  有阻塞卡=红、否则有卡=黄；③桶（triage/todo/scheduled/ready）无 blocked 恒黄。
 *  无在办数（①②⑤⑥与空桶③④）保留生命周期状态点。
 *  2026-10-27 日常阶段语义：dailyStageState 的 done=「已流转」（后续阶段有
 *  工作）——映射为 flowed 中性 ○，不画绿✓「已完成」（IaSideNavItem 复用
 *  pending 中性色，无第三套状态色）。 */
function stageChipStatus(no: 1 | 2 | 3 | 4 | 5 | 6): 'flowed' | 'current' | 'pending' | 'blocked' {
  if (navBadge(`stage${no}`) === '') {
    const s = progress.stageState(no)
    return s === 'done' ? 'flowed' : s
  }
  if (no === 4) return blockedCount.value > 0 ? 'blocked' : 'current'
  return 'current'
}

/** 合一章的悬停说明：计数口径 + 阻塞提示（黄章不必注明「进行中」——有数即进行中） */
function stageRowTitle(no: 1 | 2 | 3 | 4 | 5 | 6): string | undefined {
  const base = badgeTitle(`stage${no}`)
  if (!base) return undefined
  return stageChipStatus(no) === 'blocked' ? `${base}；本阶段有阻塞` : base
}

const stageItems = computed(() => STAGE_META.map((meta) => {
  const nav = CENTER_NAVS.find(c => c.key === `stage${meta.no}`)!
  return {
    no: meta.no,
    key: nav.key,
    name: nav.name,
    lead: String(meta.no),
    label: zh.value ? meta.navLabel : meta.navLabelEn,
    active: activeStagePage.value === nav.name,
    status: stageChipStatus(meta.no),
    badge: navBadge(`stage${meta.no}`),
    title: stageRowTitle(meta.no),
  }
}))

const stageStatusLabel = (status: 'flowed' | 'current' | 'pending' | 'blocked'): string =>
  status === 'flowed' ? (zh.value ? '已流转：后续阶段有工作，本阶段未标记完成' : 'Moved on: work is in later stages')
    : status === 'current' ? (zh.value ? '当前阶段' : 'Current')
      : status === 'blocked' ? (zh.value ? '有阻塞' : 'Blocked')
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
  if (typeof document !== 'undefined') document.addEventListener('mousedown', onDocMouseDown)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  mq = window.matchMedia('(max-width: 1180px)')
  autoCompact.value = mq.matches
  mq.addEventListener?.('change', onMqChange)
  mqNarrow = window.matchMedia('(max-width: 720px)')
  hardCompact.value = mqNarrow.matches
  mqNarrow.addEventListener?.('change', onNarrowChange)
})
onUnmounted(() => {
  if (typeof document !== 'undefined') document.removeEventListener('mousedown', onDocMouseDown)
  mq?.removeEventListener?.('change', onMqChange)
  mqNarrow?.removeEventListener?.('change', onNarrowChange)
})

function toggleCollapsed(): void {
  userSet.value = true
  collapsed.value = !effectiveCollapsed.value
}

/** 推演域内互跳保留 run/from 上下文（2026-10-27 产品一致性 Task 9：中央页签条
 *  退役后左栏是唯一推演导航，原 SimCenterView.goTab 的 contextQuery 白名单迁此）。
 *  跳出推演域不携带——from 在日常域是阶段归属来路语义，带上会污染顶栏归属判定。 */
function simContextQuery(): Record<string, string> | undefined {
  const query: Record<string, string> = {}
  for (const key of ['run', 'from'] as const) {
    const v = route.query[key]
    if (typeof v === 'string' && v) query[key] = v
  }
  return Object.keys(query).length ? query : undefined
}

function go(name: string): void {
  if (routeName.value === name) return
  const simToSim = isSimMode.value && String(name).startsWith('ia2.sim')
  void router.push(simToSim ? { name, query: simContextQuery() } : { name })
}

// ── 最近轨迹（2026-10-23「常用 · 最近」）：记录页面访问轨迹，便于回溯 ──
const recentOpen = ref(false)
const recentAnchor = ref<HTMLElement | null>(null)
const recentPanelEl = ref<HTMLElement | null>(null)
// 面板定位（2026-10-23 修复）：Teleport 到 body + fixed——面板原挂 .isn__scroll
// （overflow-y:auto，另一轴被计算为 auto）内，left 溢出侧栏即被容器裁剪，
// 视觉与命中双重不可达（用户实测「不可用」）。fixed 坐标打开时按锚点实测一次。
const recentPanelPos = ref<{ left: string; top: string } | null>(null)
const { entries: recentEntries, record: recordRecent, clear: clearRecentTrail } = useRecentTrail()
// 相对时间随共享 30s tick 重算（「3 分钟前」不僵死）
const nowTick = useNowTick()
// 记录粒度=fullPath（含 query：阶段页 ?tab= 切换也是一次操作）；初始落地页
// 不记——「还没有访问记录」空态保持可达，首个导航事件起记。
watch(() => route.fullPath, () => {
  recordRecent(route, navLocale.value)
})

function toggleRecent(): void {
  recentOpen.value = !recentOpen.value
  if (recentOpen.value) {
    void nextTick(() => {
      const a = recentAnchor.value
      if (!a) return
      const r = a.getBoundingClientRect()
      recentPanelPos.value = { left: `${Math.round(r.right + 8)}px`, top: `${Math.round(r.top)}px` }
    })
  }
}

function closeRecent(): void {
  recentOpen.value = false
}

/** 点击面板外关闭；锚点内（含「最近」开关键自身）与 Teleport 后的面板自身不关 */
function onDocMouseDown(e: MouseEvent): void {
  if (!recentOpen.value) return
  const t = e.target as Node
  if (recentAnchor.value?.contains(t)) return
  if (recentPanelEl.value?.contains(t)) return
  closeRecent()
}

/** 行点击：回跳该 fullPath（含 query）并关面板；已在当前页只关面板 */
function goRecent(entry: RecentEntry): void {
  closeRecent()
  if (route.fullPath === entry.fullPath) return
  void router.push(entry.fullPath)
}

function recentTimeLabel(ts: number): string {
  return formatRecentTime(ts, nowTick.value, zh.value ? 'zh' : 'en')
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
      <span v-if="!effectiveCollapsed" class="isn__brand-name">AIStudio</span>
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
            :badge="navBadge(item.key)"
            :title="badgeTitle(item.key)"
            :testid="item.testid"
            @select="go(item.name)"
          />
          <!-- 最近（2026-10-23）：轨迹回溯面板开关，非路由项。面板 Teleport 到
               body + fixed（2026-10-23 修复）：原绝对定位在 .isn__scroll
               （overflow-y:auto）内，右向溢出被容器裁剪——视觉与命中双不可达。 -->
          <div ref="recentAnchor" class="isn__recent-anchor">
            <IaSideNavItem
              lead="⏱"
              :label="zh ? '最近' : 'Recent'"
              :active="recentOpen"
              :title="zh ? '最近访问的页面' : 'Recently visited pages'"
              testid="ia-side-nav-recent"
              @select="toggleRecent"
            />
            <Teleport to="body">
              <div
                v-if="recentOpen"
                ref="recentPanelEl"
                class="isn__recent-panel"
                data-testid="recent-panel"
                :style="recentPanelPos ?? undefined"
                :aria-label="zh ? '最近访问' : 'Recent pages'"
              >
              <div class="isn__recent-head">{{ zh ? '最近访问' : 'Recent pages' }}</div>
              <p v-if="!recentEntries.length" class="isn__recent-empty" data-testid="recent-empty">
                {{ zh ? '还没有访问记录' : 'No history yet' }}
              </p>
              <ul v-else class="isn__recent-list">
                <li v-for="(e, i) in recentEntries" :key="e.fullPath">
                  <button
                    type="button"
                    class="isn__recent-item"
                    :data-testid="`recent-item-${i}`"
                    :title="e.fullPath"
                    @click="goRecent(e)"
                  >
                    <span class="isn__recent-item-main">
                      <span class="isn__recent-item-label">{{ e.title }}</span>
                      <span class="isn__recent-item-time">{{ recentTimeLabel(e.ts) }}</span>
                    </span>
                    <span class="isn__recent-item-path">{{ e.fullPath }}</span>
                  </button>
                </li>
              </ul>
              <div class="isn__recent-foot">
                <button
                  type="button"
                  class="isn__recent-clear"
                  data-testid="recent-clear"
                  :disabled="!recentEntries.length"
                  @click="clearRecentTrail"
                >
                  {{ zh ? '清空' : 'Clear' }}
                </button>
              </div>
            </div>
            </Teleport>
          </div>
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
            :badge="item.badge"
            :title="item.title"
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

/* 最近轨迹面板（2026-10-23）：Teleport 到 body + fixed（同日修复：原 absolute
   在 .isn__scroll overflow 容器内被裁剪）；坐标由脚本按锚点实测写入 inline
   style（left/top），层级用 modal 档压过页面主内容浮层。锚点行仅保留占位。 */
.isn__recent-anchor { position: relative; }
.isn__recent-panel {
  position: fixed;
  width: 264px;
  display: flex;
  flex-direction: column;
  max-height: min(420px, 70vh);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  z-index: var(--ia-z-modal);
  overflow: hidden;
}
.isn__recent-head {
  padding: 8px 10px 7px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
}
.isn__recent-empty {
  margin: 0;
  padding: 14px 10px;
  font-size: 12px;
  color: var(--text-muted);
}
.isn__recent-list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
}
.isn__recent-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.isn__recent-item:hover { background: var(--bg-secondary); }
.isn__recent-item:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.isn__recent-item-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.isn__recent-item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.isn__recent-item-time { flex-shrink: 0; color: var(--text-muted); font-size: 11px; }
.isn__recent-item-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11px;
}
.isn__recent-foot {
  padding: 6px;
  border-top: 1px solid var(--border-color);
  text-align: right;
}
.isn__recent-clear {
  padding: 3px 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.isn__recent-clear:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-secondary); }
.isn__recent-clear:disabled { opacity: 0.55; cursor: default; }
</style>
