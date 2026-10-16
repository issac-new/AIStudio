<!-- overlay/custom/client/ia2/views/TasksView.vue -->
<!-- 工作台页签区（/app/board，swarm kanban 页）——A0 三中心拆分（2026-10-16，
     R8 导航按关注面归位）后收敛为工作台 3 键单层页签：
     页签 1 看板 = 内嵌 SwarmKanbanView 既有看板；
     页签 2 任务协同 = 人-Agent-控制点协同图（§2.3）；
     页签 3 协作与知识 = 协作断点/知识图谱/决策时间线（交接并入属 A1）。
     原 13 键中迁出的 10 键直达链接不死链：3 键落推演中心（trace/accounts/
     observatory → /app/sim/*），7 键落治理中心（gov-* → /app/gov，C1 前经
     既有重定向进治理内容）；未知 tab 值回落看板（不再静默保留旧签位）。
     直达链接预选：/app/board?tab=<key>&status=<kanban 状态>&task=<taskId>
     ——旧 ?tab=gov 别名映射 gov-org（工作台第 3 签，外部直达链接不死链）；
     status 预选看板状态过滤器、task 预选搜索框（合法状态词表校验，非法值忽略不炸页面）。 -->
<script lang="ts">
// A0 旧签重定向纯函数：迁出 10 键的 ?tab= 直达链接 → 目标中心既有路由名。
// 导出供单测正反例全覆盖（10 键映射 + board 3 键/别名/未知值回落 null）。
const LEGACY_TAB_REDIRECTS: Readonly<Record<string, string>> = {
  // → 推演中心（/app/sim 六签，B1 壳既有路由）
  trace: 'ia2.simTrace',
  accounts: 'ia2.simDelivery',
  observatory: 'ia2.simOps',
  // → 治理中心（/app/gov 七签壳，C1 升格；E1 拍摄位同步轮细化：旧 gov-* 键
  //    直落对应签路由——帧语义不断链且更准，capture-plan.env 旧键经此表全部可达）
  'gov-registry': 'ia2.govOrgAssets',
  'gov-audit': 'ia2.govAudit',
  'gov-docs': 'ia2.govDocs',
  'gov-harness': 'ia2.govMetrics',
  'gov-cluster': 'ia2.govMetrics',
  'gov-ontology': 'ia2.govMetrics',
  'gov-session-health': 'ia2.govMetrics',
}

/** 旧 board 页签直达链接 → 目标中心路由名；非迁出键（含 board 3 键与未知值）返回 null */
export function legacyTabRedirect(tab: string): { name: string } | null {
  const name = LEGACY_TAB_REDIRECTS[tab]
  return name ? { name } : null
}
</script>
<script setup lang="ts">
import type { KanbanTaskStatus } from '@/api/hermes/kanban'
import { onMounted, ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useKanbanStore } from '@/stores/hermes/kanban'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
import TabIntroBanner from '../components/TabIntroBanner.vue'
import GovOrgKnowledgeView from './gov/GovOrgKnowledgeView.vue'
import OrchestrationView from './orchestration/OrchestrationView.vue'
import { useTasksTabsText } from '../i18n-tasks-tabs'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const kanban = useKanbanStore()

/** 工作台页签全集（A0 三中心拆分）：文案单一事实源=i18n-tasks-tabs 模块字典 */
type TabKey = 'board' | 'orchestra' | 'gov-org'
const tab = ref<TabKey>('board')
const tabText = useTasksTabsText()

const TABS: ReadonlyArray<{ key: TabKey; testid: string }> = [
  { key: 'board', testid: 'ia-tasks-tab-board' },
  { key: 'orchestra', testid: 'ia-tasks-tab-orchestra' },
  { key: 'gov-org', testid: 'ia-tasks-tab-gov-org' },
]
type TabTextKey = 'tabBoard' | 'tabOrchestra' | 'tabGovOrg'
const TAB_LABEL_KEY: Record<TabKey, TabTextKey> = {
  board: 'tabBoard',
  orchestra: 'tabOrchestra',
  'gov-org': 'tabGovOrg',
}
const TAB_KEYS: ReadonlySet<string> = new Set(TABS.map(x => x.key))
/** 旧直达链接兼容：治理中心单页签时代的 ?tab=gov → 工作台治理签（协作与知识） */
const TAB_ALIASES: Readonly<Record<string, TabKey>> = { gov: 'gov-org' }

/** v12.6 右上角关闭钮（用户裁定：打开的 swarm kanban 页可关）——回到沟通协作
 *  工作台（页头视图切换器同义的回退动线） */
function closeBoard(): void {
  void router.push({ name: 'ia2.collab' })
}

/** kanban 任务状态词表（台账 T7 双源收敛：由上游 KanbanTaskStatus 类型派生，
 *  不再手抄字符串数组——上游词表变化时此处编译期报错，而非静默漂移） */
const KANBAN_STATUSES: ReadonlySet<KanbanTaskStatus> = new Set<KanbanTaskStatus>([
  'triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived',
])

/** UX 裁决 E：?new=1 直达链接直开列内建卡表单 */
const autoOpenCreate = computed(() => route.query.new === '1' || route.query.new === 'true')

/** route query → 看板预选（tab 切换 + status 过滤器 + task 搜索）。
 *  A0 旧签重定向：迁出 10 键整页跳目标中心（router.replace）；非法 status 忽略。 */
function applyQuery(q: Record<string, unknown>): void {
  if (typeof q.tab === 'string') {
    const raw = q.tab
    const key = TAB_ALIASES[raw] ?? raw
    if (TAB_KEYS.has(key)) {
      tab.value = key as TabKey
    } else {
      const redirect = legacyTabRedirect(raw)
      if (redirect) {
        // 旧签直达链接不死链：整页跳目标中心（本组件随路由卸载，本地状态不再处理）
        void router.replace(redirect)
        return
      }
      // 未知 tab 值回落看板（A0 裁定：迁出签位已消失，不再静默保留旧位置）
      tab.value = 'board'
    }
  }
  if (typeof q.status === 'string' && KANBAN_STATUSES.has(q.status)) {
    kanban.setStatusFilter(q.status)
  }
  if (typeof q.task === 'string' && q.task) {
    kanban.setSearchQuery(q.task)
  }
}

onMounted(() => applyQuery(route.query as Record<string, unknown>))
// 同路由 query 变化（已在 /app/board 时被直达链接再次唤起）同样生效
watch(
  () => route.query,
  (q) => { applyQuery(q as Record<string, unknown>) },
)

// 页签 → URL 回写（2026-10-03 走查 L4）：此前切换页签只改本地 tab，
// 刷新/分享后页签位置丢失。同值跳过避免与上方 query watch 互相触发。
// task/status 是一次性直达链接参数，回写时剥离——否则用户清掉的过滤器会在每次
// 切页签时被 URL 残影复活（query watch 重放 applyQuery 覆盖用户输入态）
watch(tab, (key) => {
  if (route.query.tab === key) return
  const { task: _t, status: _s, ...rest } = route.query as Record<string, unknown>
  void router.replace({ name: 'ia2.board', query: { ...rest, tab: key } })
})
</script>

<template>
  <div class="ia-area ia-tasks">
    <div class="ia-tasks__tabs" role="tablist">
      <button
        v-for="tb in TABS" :key="tb.key" type="button"
        class="ia-tasks__tab"
        :class="{ 'ia-tasks__tab--active': tab === tb.key }"
        role="tab"
        :aria-selected="tab === tb.key"
        :data-testid="tb.testid"
        @click="tab = tb.key"
      >
        {{ tabText[TAB_LABEL_KEY[tb.key]] }}
      </button>
      <!-- v12.6 右上角关闭钮（用户裁定：打开的 swarm kanban 页可关） -->
      <button
        type="button"
        class="ia-tasks__close"
        data-testid="ia-board-close"
        :title="t('cockpit.close')"
        :aria-label="t('cockpit.close')"
        @click="closeBoard"
      >×</button>
    </div>

    <TabIntroBanner :tab="tab" />

    <div v-if="tab === 'board'" class="ia-tasks__board">
      <SwarmKanbanView :auto-open-create="autoOpenCreate" />
    </div>
    <!-- 任务协同图（2026-10-10 麦肯锡概念一轮）：以业务结果根卡为锚的人-Agent-控制点
         协同图 + 五问面板；容器只收溢出，视图根 flex:1 自适应 -->
    <div v-else-if="tab === 'orchestra'" class="ia-area ia-tasks__observatory" data-testid="ia-tasks-panel-orchestra">
      <OrchestrationView />
    </div>
    <!-- 协作与知识（A0 三中心拆分后工作台治理签；交接并入属 A1 工单） -->
    <div v-else-if="tab === 'gov-org'" class="ia-area" data-testid="ia-tasks-panel-gov-org">
      <GovOrgKnowledgeView />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ia-tasks {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ia-tasks__tabs {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
  align-items: center;
}

.ia-tasks__close {
  margin-left: auto; flex-shrink: 0;
  width: 24px; height: 24px; padding: 0; margin-bottom: 2px;
  border: none; border-radius: 5px; background: transparent;
  color: var(--text-muted, #878c99); font-size: 16px; line-height: 1; cursor: pointer;
  &:hover { color: var(--text-primary, inherit); background: var(--bg-secondary, #f1f2f4); }
}

.ia-tasks__tab {
  border: none;
  background: transparent;
  padding: 6px 11px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;

  &:hover { color: inherit; }

  &--active {
    color: var(--accent-primary, var(--color-primary, #3b82f6));
    border-bottom-color: var(--accent-primary, var(--color-primary, #3b82f6));
    font-weight: 600;
  }
}

.ia-tasks__board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 任务协同签容器：.ia-area 已给定高 flex 列，面板根 flex:1 自适应；此处只收溢出 */
.ia-tasks__observatory {
  overflow: hidden;
}
</style>
