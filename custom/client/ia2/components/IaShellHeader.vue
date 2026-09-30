<!-- overlay/custom/client/ia2/components/IaShellHeader.vue -->
<!-- 驾驶舱统一壳页头。v12.4（2026-09-20 用户裁定）页头四改：
     ① 语言单按钮切换（IaLocaleToggle 显示目标语言，ZH/EN 两按钮合并）；
     ② 视图切换器单按钮（IaViewSwitcher 显示目标视图，沟通协作/IDE 工作台
       两按钮合并）；
     ③ 态势 chips 收窄（SitlineBar 删会话/循环/管理；任务口径=跨板未完成
       未归档；等我口径=useDecisionRows 待我决策的任务及会话，与通知铃铛
       的待人工决策同源）；
     ④ 三栏栏控迁各栏顶部控制条（WorkbenchView/IdeShell 挂 IaColumnControls，
       页头集中簇 IaWindowControls 退役）。
     2026-09-30 用户裁定：品牌位「驾驶舱」文案退役，视图切换器（沟通协作 ⇄
     IDE 工作台，带目标视图图标+切换图标）自最右迁入品牌位；用户按钮设置页
     跳转经路由收编落 /app/settings（壳内顶栏+注意力条常显，见 routes.ts）。
     历史搬运（v12.3）：📅 日程按钮/通知下拉双页签；v12.1/2：品牌/全局搜索/
     Gateway 探测组/ThemeSwitch/用户。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { useAppStore } from '@/stores/hermes/app'
import { useWorkspaceStore } from '../store/workspace'
import { useFlowStore } from '../store/flow'
import { taskLinkedSessionId } from '../adapters/flow'
import { filterInboxByPrefs } from '../store/notify-prefs'
import IaLocaleToggle from './IaLocaleToggle.vue'
import IaViewSwitcher from './IaViewSwitcher.vue'
import NotifyDropdownPanel from './NotifyDropdownPanel.vue'
import SitlineBar from './SitlineBar.vue'
import SitDetailPanel, { type SitSegment, type SitTaskRow } from './SitDetailPanel.vue'
import { useSitCounts } from '../composables/useSitCounts'
import { useSessionRows } from '../composables/useSessionRows'
import { useDecisionActions } from '../composables/useDecisionActions'
import { useDecisionRows } from '../composables/useDecisionRows'
import { useNowTick } from '../composables/useNowTick'

const { t } = useI18n()
const router = useRouter()
const store = useCockpitStore()
const appStore = useAppStore()
const workspace = useWorkspaceStore()
const flow = useFlowStore()

defineProps<{ userName?: string }>()

/** 用户按钮 → 设置页 */
function goSettings() { router.push({ name: 'hermes.settings' }) }

// ── V5 补遗⑤ S7（仅 Gateway 段维持摘除）：platforms store 与轮询能力保留，
//    引用计数由 GovTeamSection/WorkbenchView 各自 retain ──

// ── 日程按钮（2026-10-01 用户裁定还原 S7 摘除，v12.3 原样回生）：当日有事件亮徽章 ──

// 依赖共享秒级 tick：computed 里只有 new Date() 时无响应式依赖、首次求值后永久
// 缓存，挂载过夜后徽章永远查昨天的键（24h 审查 P3）
const nowTick = useNowTick()
const todayKey = computed(() => {
  void nowTick.value
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})
const scheduleTodayCount = computed(() => store.scheduleDatesWithEvents.has(todayKey.value) ? 1 : 0)

// ── 通知下拉（v12.3）：铃铛徽章 = 待决策未读数（useDecisionRows 单一聚合）──

const showNotify = ref(false)
const { decisionRows, decisionUnread, oldestDecisionLabel } = useDecisionRows()

// R6 补充：消息未读合计（统一收件箱 inboxItems count 求和；通知徽章双计数）
// B9 口径：同走偏好分组过滤（notify-prefs 单一事实源）——关掉的类目不进徽章。
const messageUnread = computed(() =>
  filterInboxByPrefs(store.inboxItems ?? []).reduce((n: number, i: { count?: number }) => n + (i.count ?? 0), 0),
)
const notifyTotal = computed(() => decisionUnread.value + messageUnread.value)

// ── 态势 chips + 内联面板（v12.3 自 WorkbenchView 迁入；v12.4/12.5 口径修订）──

const {
  tasks: sitTasks, openTasks, accounts, online, boardRows, teams,
} = useSitCounts()
const { sessionRows } = useSessionRows()
const { approveTask, rejectTask, approveRun, rejectRun, approveFleet, rejectFleet } = useDecisionActions()

/** 原始任务索引（id → {board, task}）：板名/优先级/挂接会话解析用 */
const rawById = computed(() => {
  const map = new Map<string, { board: string; task: any }>()
  for (const e of workspace.rawTasks) map.set(e.task.id, e)
  return map
})

/** 板名（slug → name） */
const boardNameOf = computed(() => new Map((workspace.boards ?? []).map(b => [b.slug, b.name])))

/** 态势面板任务行（SitTaskRow 增强形状：join 原始任务补板名/优先级） */
const storeTasks = computed<SitTaskRow[]>(() => openTasks.value.map(x => ({
  id: x.id, title: x.title, status: x.status, assignee: x.assignee, createdAt: x.createdAt,
  boardName: boardNameOf.value.get(x.boardSlug) ?? x.boardSlug,
  priority: x.priority,
})))

/** 分状态统计行（开放态；词表序由 SitDetailPanel 排） */
const taskStats = computed(() =>
  Object.entries(sitTasks.value.byStatus).map(([status, count]) => ({ status, count })))

const fleetMachines = computed(() => (store.fleetSessions ?? []).map(m =>
  ({ id: m.id, profile: m.profile, title: m.title, status: m.status })))

const sitPanel = ref<SitSegment | null>(null)

function onSitSelect(segment: 'tasks' | 'online'): void {
  sitPanel.value = sitPanel.value === segment ? null : segment
}

/** v12.5 任务行点击 → 三栏跳转：挂接 matrix 房间 → 房间画布；挂接 agent 会话
 *  → IDE 工作台（会话列自动切到挂靠会话 + 编码任务工作空间上下文）；无挂接
 *  → IDE 任务维度兜底。等我段（review 任务）仍走看板预选（就地验收动线）。 */
function onPanelJumpTask(taskId: string): void {
  sitPanel.value = null
  const raw = rawById.value.get(taskId)?.task
  const sessionId = raw ? taskLinkedSessionId(raw) : null
  if (sessionId) {
    const row = sessionRows.value.find(s => s.id === sessionId)
    if (row?.kind === 'room') { void router.push({ name: 'ia2.commsRoom', params: { roomId: row.id } }); return }
    if (row?.kind === 'group') { void router.push({ name: 'ia2.groupRoom', params: { roomId: row.id } }); return }
  }
  void router.push({ path: '/app/ide', query: { task: taskId } })
}
</script>

<template>
  <div class="cockpit-top" data-testid="ia-shell-header">
    <div class="cockpit-top__brand">
      <ThemeSwitch />
      <IaLocaleToggle />
      <span class="cockpit-top__conn"
        :title="appStore.connected ? t('cockpit.connected') : t('cockpit.disconnected')">
        <span class="cockpit-top__dot" :class="appStore.connected ? 'is-ok' : 'is-err'" />
      </span>
      <!-- 2026-09-30 用户裁定：品牌位「驾驶舱」文案退役，换视图切换器
           （沟通协作 ⇄ IDE 工作台；目标视图图标 + 切换图标见 IaViewSwitcher） -->
      <IaViewSwitcher />
    </div>
    <div class="cockpit-top__div" />
    <div class="cockpit-top__search">
      <span class="cockpit-top__search-icon"><CockpitIcon name="search" :size="12" /></span>
      <input type="text" class="cockpit-top__search-input" :value="store.searchQuery"
        :placeholder="t('cockpit.searchPlaceholder')" @input="store.runSearch(($event.target as HTMLInputElement).value)" />
      <button v-if="store.searchQuery" type="button" class="cockpit-top__search-clear" @click="store.clearSearch()">×</button>
      <span v-if="store._sessionSearching" class="cockpit-top__search-spinner" />
    </div>
    <div class="cockpit-top__spacer" />
    <div class="cockpit-top__sit">
      <SitlineBar
        :waiting-count="decisionRows.length"
        :oldest-label="oldestDecisionLabel"
        :task-total="sitTasks.total"
        :task-by-status="sitTasks.byStatus"
        :online-people="online.people"
        :online-agents="online.agents"
        :online-machines="online.machines"
        :active="sitPanel"
        @select="onSitSelect"
      />
    </div>
    <!-- 日程按钮（2026-10-01 用户裁定还原：S7 A 档摘除回生，v12.3 原样） -->
    <button type="button" class="cockpit-top__btn" data-testid="ia-header-schedule"
      :title="t('cockpit.scheduleTitle')" @click="workspace.openSchedule()"
    >
      <CockpitIcon name="calendar" />
      <span v-if="scheduleTodayCount" class="cockpit-top__bdg cockpit-top__bdg--err">{{ t('ia2.header.scheduleToday') }}</span>
    </button>
    <div class="cockpit-top__div" />
    <button type="button" class="cockpit-top__btn" data-testid="ia-header-notify" @click="showNotify = !showNotify">
      <CockpitIcon name="bell" />
      <!-- R6 补充：通知徽章双计数（决策未读 + 消息未读合计；悬停分明细） -->
      <span v-if="notifyTotal" class="cockpit-top__bdg cockpit-top__bdg--err" data-testid="ia-header-notify-badge" :title="t('ia2.notify.totalHint', { decisions: decisionUnread, messages: messageUnread })">{{ notifyTotal }}</span>
    </button>
    <button type="button" class="cockpit-top__user" data-testid="ia-header-user" @click="goSettings">
      <span class="cockpit-top__avatar">{{ (userName ?? t('cockpit.defaultUser')).slice(0, 1) }}</span>
      <span class="cockpit-top__uname">{{ userName ?? t('cockpit.defaultUser') }}</span>
      <span class="cockpit-top__caret">▾</span>
    </button>

    <!-- 态势内联面板（v12.3 迁页头；浮层贴页头下方） -->
    <div v-if="sitPanel" class="cockpit-top__sitpanel">
      <SitDetailPanel
        :segment="sitPanel"
        :wait-items="decisionRows"
        :tasks="storeTasks"
        :task-stats="taskStats"
        :accounts="accounts.map(a => ({ userId: a.userId, displayName: a.displayName, isLeader: a.isLeader, agentTeams: (a.agentTeams ?? []).map(at => ({ slug: at.slug, name: at.name, profiles: at.profiles ?? [] })) }))"
        :machines="fleetMachines"
        :boards="boardRows"
        :teams="teams"
        @close="sitPanel = null"
        @open-task="taskId => { sitPanel = null; void router.push({ name: 'ia2.board', query: { task: taskId } }) }"
        @jump-task="onPanelJumpTask"
        @approve-task="approveTask"
        @reject-task="rejectTask"
        @approve-run="approveRun"
        @reject-run="rejectRun"
        @approve-fleet="approveFleet"
        @reject-fleet="rejectFleet"
        @open-review="flow.openGov('review')"
        @open-gov-people="flow.openGov('people')"
      />
    </div>
    <div v-if="sitPanel" class="cockpit-top__mask" @click="sitPanel = null" />

    <!-- 通知下拉（v12.3：双页签，点击遮罩关闭） -->
    <NotifyDropdownPanel v-if="showNotify" @close="showNotify = false" />
    <div v-if="showNotify" class="cockpit-top__mask" @click="showNotify = false" />
  </div>
</template>

<style scoped lang="scss">
.cockpit-top { flex-shrink: 0; height: 44px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; padding: 0 12px; position: relative; z-index: 10; }
/* 2026-09-30：品牌位文字退役改挂切换器控件簇——不再收缩裁剪（窄幅挤压转由
 * 搜索框 flex-shrink:2 与态势条横向滚动吸收），文字省略三件套随之退役 */
.cockpit-top__brand { display: flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; }
.cockpit-top__conn { font-size: 10px; flex-shrink: 0; }
.cockpit-top__div { width: 1px; height: 20px; background: var(--border-color); margin: 0 2px; flex-shrink: 0; }
.cockpit-top__btn { display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 12px; font-family: inherit; position: relative; white-space: nowrap; flex-shrink: 0;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-top__dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.cockpit-top__dot.is-ok { background: var(--success); }
.cockpit-top__dot.is-err { background: var(--error); }
.cockpit-top__dot.is-idle { background: var(--text-muted); }
.cockpit-top__bdg { position: absolute; top: -3px; right: -3px; background: var(--accent-primary); color: var(--text-on-accent); font-size: 8px; font-weight: 700; min-width: 13px; height: 13px; border-radius: 6px; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); padding: 0 3px; }
.cockpit-top__bdg--err { background: var(--error); }
.cockpit-top__search { flex: 1 1 auto; max-width: 280px; min-width: 120px; height: 28px; display: flex; align-items: center; gap: 6px; padding: 0 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px; color: var(--text-muted); position: relative; flex-shrink: 2; }
.cockpit-top__search-icon { font-size: 12px; flex-shrink: 0; color: var(--text-muted); }
.cockpit-top__search-input { flex: 1; border: none; background: transparent; color: var(--text-primary); font-size: 11px; outline: none; font-family: inherit; min-width: 0; &::placeholder { color: var(--text-muted); } }
.cockpit-top__search-clear { flex-shrink: 0; width: 16px; height: 16px; padding: 0; border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; &:hover { color: var(--text-primary); } }
.cockpit-top__search-spinner { width: 10px; height: 10px; flex-shrink: 0; border: 1.5px solid var(--border-color); border-top-color: var(--accent-primary); border-radius: 50%; animation: cockpit-tspin 0.6s linear infinite; }
@keyframes cockpit-tspin { to { transform: rotate(360deg); } }
.cockpit-top__spacer { flex: 1; }
.cockpit-top__sit { min-width: 0; overflow-x: auto; scrollbar-width: none; }
.cockpit-top__grp { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: 6px; transition: background 0.12s; flex-shrink: 0; white-space: nowrap;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-top__ustat { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.cockpit-top__cd { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }
.cockpit-top__user { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 4px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--bg-card); cursor: pointer; font-family: inherit; flex-shrink: 0;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-top__avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--accent-primary); color: var(--text-on-accent); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; flex-shrink: 0; }
.cockpit-top__uname { font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; }
.cockpit-top__caret { font-size: 9px; color: var(--text-muted); }

/* 态势内联面板浮层（v12.3：贴页头下方，左对齐态势 chips 区） */
.cockpit-top__sitpanel { position: absolute; top: 100%; left: 12px; width: min(760px, calc(100vw - 48px)); z-index: 999; }
.cockpit-top__sitpanel :deep(.sitp) { margin: 6px 0 0; box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
.cockpit-top__mask { position: fixed; inset: 0; z-index: 998; }

/* 探测结果下拉面板 */
.cockpit-probe { position: absolute; top: 100%; right: 16px; min-width: 320px; max-width: 420px; max-height: 400px; overflow: auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 999; }
.cockpit-probe__head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-color); font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-probe__close { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 0 4px; &:hover { color: var(--text-primary); } }
.cockpit-probe__body { padding: 8px 14px 12px; }
.cockpit-probe__body--empty { text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px; }
.cockpit-probe__row { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.cockpit-probe__label { font-size: 12px; color: var(--text-secondary); flex: 1; min-width: 0; }
.cockpit-probe__val { font-size: 12px; font-weight: 600; flex-shrink: 0; }
.cockpit-probe__val.is-ok { color: var(--success, #52c41a); }
.cockpit-probe__val.is-err { color: var(--error); }
.cockpit-probe__ago { font-size: 10px; color: var(--text-muted); font-family: monospace; flex-shrink: 0; }
.cockpit-probe__section { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }
.cockpit-probe__section-title { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
.cockpit-probe__footer { display: flex; gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 10px; color: var(--text-muted); font-family: monospace; }
.cockpit-probe__mask { position: fixed; inset: 0; z-index: 998; }
</style>
