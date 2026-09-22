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
     历史搬运（v12.3）：📅 日程按钮/通知下拉双页签；v12.1/2：品牌/全局搜索/
     Gateway 探测组/ThemeSwitch/用户。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { useAppStore } from '@/stores/hermes/app'
import { useWorkspaceStore } from '../store/workspace'
import { useFlowStore } from '../store/flow'
import { usePlatformsStore } from '../store/platforms'
import { taskLinkedSessionId } from '../adapters/flow'
import IaLocaleToggle from './IaLocaleToggle.vue'
import IaViewSwitcher from './IaViewSwitcher.vue'
import NotifyDropdownPanel from './NotifyDropdownPanel.vue'
import SitlineBar from './SitlineBar.vue'
import SitDetailPanel, { type SitSegment, type SitTaskRow } from './SitDetailPanel.vue'
import { useSitCounts } from '../composables/useSitCounts'
import { useSessionRows } from '../composables/useSessionRows'
import { useDecisionActions } from '../composables/useDecisionActions'
import { useDecisionRows } from '../composables/useDecisionRows'

const { t } = useI18n()
const router = useRouter()
const store = useCockpitStore()
const appStore = useAppStore()
const workspace = useWorkspaceStore()
const flow = useFlowStore()

defineProps<{ userName?: string }>()

/** 用户按钮 → 设置页 */
function goSettings() { router.push({ name: 'hermes.settings' }) }

// ── Gateway 探测组（2026-09-19 v12 上移 platforms store 共享轮询；展示语义不变）──

const platformsStore = usePlatformsStore()
const { gatewayState, platforms, refreshing, countdown, rawData } = storeToRefs(platformsStore)
const showDetail = ref(false)

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('cockpit.justNow')
  if (mins < 60) return t('cockpit.minutesAgo', { n: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('cockpit.hoursAgo', { n: hrs })
  return t('cockpit.daysAgo', { n: Math.floor(hrs / 24) })
}

/** 显示相对时间（store 保留 ISO，i18n 相对时间在组件层渲染） */
function platformUpdated(pl: { updated: string }): string {
  return formatTimeAgo(pl.updated)
}

/** 点击手动探测并弹出详情 */
async function manualProbe() {
  // 先切换显示状态，再异步刷新数据
  showDetail.value = !showDetail.value
  if (showDetail.value) {
    await platformsStore.fetchGatewayStatus(false)
  }
}

onMounted(() => platformsStore.retain())
onUnmounted(() => platformsStore.release())

// ── 日程按钮（v12.3 恢复）：当日有事件亮徽章 ──

const todayKey = computed(() => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})
const scheduleTodayCount = computed(() => store.scheduleDatesWithEvents.has(todayKey.value) ? 1 : 0)

// ── 通知下拉（v12.3）：铃铛徽章 = 待决策未读数（useDecisionRows 单一聚合）──

const showNotify = ref(false)
const { decisionRows, decisionUnread, oldestDecisionLabel } = useDecisionRows()

// R6 补充：消息未读合计（统一收件箱 inboxItems count 求和；通知徽章双计数）
const messageUnread = computed(() =>
  (store.inboxItems ?? []).reduce((n: number, i: { count?: number }) => n + (i.count ?? 0), 0),
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
  void router.push({ path: '/ide', query: { task: taskId } })
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
      {{ t('ia2.brand') }}
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
    <div class="cockpit-top__grp" :title="t('cockpit.gatewayProbeTitle')" @click.stop="manualProbe">
      <span class="cockpit-top__cd" :title="t('cockpit.countdownTitle')">{{ countdown }}s</span>
      <span class="cockpit-top__ustat" :class="'is-' + gatewayState">
        <span class="cockpit-top__dot" :class="gatewayState === 'running' ? 'is-ok' : gatewayState === 'stopped' ? 'is-err' : 'is-idle'" />
        Gateway{{ refreshing ? '…' : '' }}
      </span>
      <span v-for="pl in platforms" :key="pl.name + (pl.profile ? ':' + pl.profile : '')" class="cockpit-top__ustat"
        :class="pl.state === 'connected' ? 'is-running' : 'is-stopped'"
      ><CockpitIcon :name="pl.icon" :size="12" /> {{ pl.name }}<span v-if="pl.state !== 'connected'" class="cockpit-top__warn">!</span></span>
    </div>
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
    <!-- v12.4：三栏栏控迁各栏顶部控制条（页头集中簇退役） -->
    <div class="cockpit-top__div" />
    <!-- v12.4 视图切换器单按钮固定最右（显示目标视图：沟通协作 ⇄ IDE 工作台） -->
    <IaViewSwitcher />

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

    <!-- 探测结果下拉面板（必须在 cockpit-top 内部，才能相对其定位） -->
    <div v-if="showDetail" class="cockpit-probe" @click.stop>
      <div class="cockpit-probe__head">
        <span>Connected Platforms</span>
        <button type="button" class="cockpit-probe__close" @click="showDetail = false">×</button>
      </div>
      <div v-if="rawData" class="cockpit-probe__body">
        <div class="cockpit-probe__row">
          <span class="cockpit-probe__label">Gateway</span>
          <span class="cockpit-probe__val" :class="rawData.gateway_state === 'running' ? 'is-ok' : 'is-err'">
            <span :class="rawData.gateway_state === 'running' ? 'is-ok' : 'is-err'">
              <span class="cockpit-top__dot" :class="rawData.gateway_state === 'running' ? 'is-ok' : 'is-err'" />
              {{ rawData.gateway_state === 'running' ? 'running' : (rawData.gateway_state || 'stopped') }}
            </span>
          </span>
        </div>
        <div class="cockpit-probe__row">
          <span class="cockpit-probe__label">Active Agents</span>
          <span class="cockpit-probe__val">{{ rawData.active_agents ?? 0 }}</span>
        </div>
        <div v-if="platforms.length" class="cockpit-probe__section">
          <div class="cockpit-probe__section-title">Platforms</div>
          <div v-for="pl in platforms" :key="pl.name + (pl.profile ? ':' + pl.profile : '')" class="cockpit-probe__row">
            <span class="cockpit-probe__label"><CockpitIcon :name="pl.icon" :size="12" /> {{ pl.profile ? pl.profile + ': ' : '' }}{{ pl.name }}</span>
            <span class="cockpit-probe__val" :class="pl.state === 'connected' ? 'is-ok' : 'is-err'">
              {{ pl.state }}
            </span>
            <span v-if="pl.updated" class="cockpit-probe__ago">{{ platformUpdated(pl) }}</span>
          </div>
        </div>
        <div v-if="rawData.pid || rawData.version" class="cockpit-probe__footer">
          <span v-if="rawData.version">v{{ rawData.version }}</span>
          <span v-if="rawData.pid">PID {{ rawData.pid }}</span>
        </div>
      </div>
      <div v-else class="cockpit-probe__body cockpit-probe__body--empty">
        {{ refreshing ? t('cockpit.detecting') + '…' : t('cockpit.noData') }}
      </div>
    </div>
    <!-- 点击遮罩关闭 -->
    <div v-if="showDetail" class="cockpit-probe__mask" @click="showDetail = false" />
  </div>
</template>

<style scoped lang="scss">
.cockpit-top { flex-shrink: 0; height: 44px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; padding: 0 12px; position: relative; z-index: 10; }
.cockpit-top__brand { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px; white-space: nowrap; color: var(--text-primary); flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
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
