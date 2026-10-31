<!-- overlay/custom/client/ia2/components/flow/CockpitOverview.vue -->
<!-- J 批工作台概览（spec 2026-10-31-cockpit-attention-panel §4.1）：按三问重排——
     ① 现在需要我做什么（等你批准 + 等你决定 + 异常时的系统问题）② 系统是否健康
     （仅异常显形，健康态零占位）③ 工作进展（完成率 + 状态分布 + 最近一条工作历史）。
     注意力经济守门（§4.2）：健康态不占空间、异常最多 3 条、计数=列表长度、
     用户可见文案写「等谁 + 要什么」且不出现内部代码。数据全 props（WorkbenchView
     装配：approvals API + workspace.tasks + sim topology），动作全 emit。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CockpitTask } from '@/custom/shared/adapters/task-adapter'
import type { PendingApprovalItem } from '@/custom/shared/api/approvals'
import { needsMyAction } from '@/custom/kanban/utils/raci'
import type { KanbanTask } from '@/api/hermes/kanban'

/** 健康信号（spec §4.3）：空数组=健康——健康态不渲染任何占位（§4.2 规则一）。 */
export interface HealthSignal {
  id: string
  /** 用户可见的「哪里有问题」 */
  label: string
  /** 「需要谁做什么」 */
  detail: string
  /** 点击落点（路由名或任务 id，由装配方解释） */
  target?: string
  severity: 'blocker' | 'warning'
}

const props = withDefaults(defineProps<{
  tasks: CockpitTask[]
  pending: PendingApprovalItem[]
  username: string
  health?: HealthSignal[]
}>(), { health: () => [] })

const emit = defineEmits<{
  (e: 'open-inbox'): void
  (e: 'open-board'): void
  (e: 'open-task', taskId: string): void
  (e: 'open-health', signal: HealthSignal): void
}>()

const i18nApi = useI18n() as unknown as {
  t: (key: string, named?: Record<string, unknown>) => string
  te?: (key: string) => boolean
}
const { t } = i18nApi

/** 词条存在性：真实 i18n 有 te；测试替身没有时用「翻译结果≠键名」判定。 */
function hasMessage(key: string): boolean {
  return typeof i18nApi.te === 'function' ? i18nApi.te(key) : t(key) !== key
}

// ① 现在需要我做什么：审批待审 + 我在 RACI 中担 R/A 的卡
const myRaciTasks = computed(() =>
  props.tasks.filter((t) => needsMyAction(t as unknown as KanbanTask, props.username)),
)
const myTodoCount = computed(() => props.pending.length + myRaciTasks.value.length)

// ② 系统是否健康：只渲染异常；最多 3 条，超出用「还有 N 条」折叠（§4.2 规则二）
const healthSignals = computed(() => props.health ?? [])
const visibleHealth = computed(() => healthSignals.value.slice(0, 3))
const healthMoreCount = computed(() => Math.max(0, healthSignals.value.length - visibleHealth.value.length))
const topBlocker = computed(() => healthSignals.value.find(s => s.severity === 'blocker') ?? null)

// ③ 工作进展：状态分布 + 完成率 + 最近一条工作历史
const statusCount = computed(() => {
  const c = { done: 0, running: 0, review: 0, blocked: 0, open: 0 }
  for (const t of props.tasks) {
    const s = String((t as { status?: string }).status ?? '')
    if (s === 'done' || s === 'archived') c.done++
    else if (s === 'running') c.running++
    else if (s === 'review') c.review++
    else if (s === 'blocked') c.blocked++
    else c.open++
  }
  return c
})
/** 完成度只向下取一位小数：四舍五入会把 1149/1154 显示成 100%，让未完成工作消失。 */
const progressPct = computed(() => {
  const total = props.tasks.length
  if (!total) return 0
  if (statusCount.value.done >= total) return 100
  return Math.floor((statusCount.value.done / total) * 1000) / 10
})
const progressComplete = computed(() => props.tasks.length > 0 && statusCount.value.done >= props.tasks.length)

/** 最近一条工作历史：CockpitTask 只有 createdAt（无 updatedAt，spec §8 未决项），
 *  取创建时间最新的一条作为「最近」；单遍取最大，不改 props 顺序。 */
const recentTask = computed<CockpitTask | null>(() => {
  let best: CockpitTask | null = null
  for (const t of props.tasks) {
    if (!best || (t.createdAt ?? 0) > (best.createdAt ?? 0)) best = t
  }
  return best
})

/** 状态词只经词表转中文；词表缺键时落「状态未知」，绝不把内部状态码直接甩给用户。 */
function statusLabel(status: string): string {
  const key = `ia2.overviewDash.status.${status}`
  return hasMessage(key) ? t(key) : t('ia2.overviewDash.status.unknown')
}
</script>

<template>
  <div class="ov" data-testid="cockpit-overview">
    <div class="ov__title">{{ t('ia2.overviewDash.title') }}</div>
    <p class="ov__flow-hint" data-testid="ov-flow-hint">{{ t('ia2.overviewDash.flowHint') }}</p>
    <div class="ov__grid">
      <!-- ① 现在需要我做什么 -->
      <section class="ov__card ov__card--click" data-testid="ov-need-me" role="button" :title="t('ia2.overviewDash.cardHint')" @click="emit('open-inbox')">
        <div class="ov__card-head">
          <span>{{ t('ia2.overviewDash.needMe') }}</span>
          <span v-if="myTodoCount" class="ov__n ov__n--hot" data-testid="ov-need-me-count">{{ myTodoCount }}</span>
        </div>
        <button type="button" class="ov__row" data-testid="ov-todo-approvals" @click.stop="emit('open-inbox')">
          <span class="ov__row-label">{{ t('ia2.overviewDash.waitingApproval') }}</span>
          <b>{{ pending.length }}</b>
        </button>
        <button type="button" class="ov__row" data-testid="ov-todo-raci" @click.stop="emit('open-board')">
          <span class="ov__row-label">{{ t('ia2.overviewDash.myRaci') }}</span>
          <b>{{ myRaciTasks.length }}</b>
        </button>
        <div v-if="myRaciTasks.length" class="ov__mini">
          <button
            v-for="task in myRaciTasks.slice(0, 3)" :key="task.id"
            type="button" class="ov__mini-row" :data-testid="`ov-mytask-${task.id}`"
            @click.stop="emit('open-task', task.id)"
          >{{ task.title }}</button>
        </div>
        <!-- 异常时的系统问题一句话：点进对应修复面（§4.1） -->
        <button v-if="topBlocker" type="button" class="ov__issue" data-testid="ov-system-issue" @click.stop="emit('open-health', topBlocker)">
          {{ t('ia2.overviewDash.systemIssue', { label: topBlocker.label }) }}
        </button>
      </section>

      <!-- ② 系统是否健康、在做对的事：健康态零占位（§4.2 规则一） -->
      <section v-if="healthSignals.length" class="ov__card" data-testid="ov-health">
        <div class="ov__card-head">
          <span>{{ t('ia2.overviewDash.healthTitle') }}</span>
          <span class="ov__n ov__n--warn" data-testid="ov-health-count">{{ healthSignals.length }}</span>
        </div>
        <button
          v-for="signal in visibleHealth" :key="signal.id"
          type="button" class="ov__health-row" :class="`ov__health-row--${signal.severity}`"
          :data-testid="`ov-health-signal-${signal.id}`"
          @click="emit('open-health', signal)"
        >
          <span class="ov__health-label">{{ signal.label }}</span>
          <span class="ov__health-detail">{{ signal.detail }}</span>
        </button>
        <div v-if="healthMoreCount" class="ov__health-more" data-testid="ov-health-more">
          {{ t('ia2.overviewDash.healthMore', { n: healthMoreCount }) }}
        </div>
      </section>

      <!-- ③ 工作进展 -->
      <section class="ov__card ov__card--click" data-testid="ov-progress" role="button" :title="t('ia2.overviewDash.cardHint')" @click="emit('open-board')">
        <div class="ov__card-head"><span>{{ t('ia2.overviewDash.progress') }}</span></div>
        <div class="ov__bar" role="progressbar" :aria-valuenow="progressPct">
          <div class="ov__bar-fill" data-testid="ov-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <div class="ov__pct" data-testid="ov-progress-pct" :data-complete="progressComplete">{{ t('ia2.overviewDash.doneOfTotal', { done: statusCount.done, total: tasks.length, pct: progressPct }) }}</div>
        <div class="ov__dist">
          <span>{{ t('ia2.overviewDash.running') }} {{ statusCount.running }}</span>
          <span>{{ t('ia2.overviewDash.review') }} {{ statusCount.review }}</span>
          <span>{{ t('ia2.overviewDash.blocked') }} {{ statusCount.blocked }}</span>
          <span>{{ t('ia2.overviewDash.open') }} {{ statusCount.open }}</span>
        </div>
        <!-- 最近一条工作历史：复用既有 open-task（进入任务详情/时间线，D5） -->
        <div class="ov__sub">{{ t('ia2.overviewDash.recentWork') }}</div>
        <button v-if="recentTask" type="button" class="ov__recent" data-testid="ov-recent-task" @click.stop="emit('open-task', recentTask.id)">
          <span class="ov__recent-title">{{ recentTask.title }}</span>
          <span class="ov__recent-stage">{{ statusLabel(recentTask.status) }}</span>
        </button>
        <div v-else class="ui-empty-state ui-empty-state--compact" data-testid="ov-recent-empty">{{ t('ia2.overviewDash.recentWorkEmpty') }}</div>
        <p class="ov__scope" data-testid="ov-progress-scope">{{ t('ia2.overviewDash.scopeNote') }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ov { padding: 18px 20px; overflow-y: auto; height: 100%; box-sizing: border-box; }
.ov__title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.ov__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.ov__card--click { cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
.ov__card--click:hover { border-color: var(--primary); box-shadow: 0 1px 6px rgba(0, 0, 0, .08); }
.ov__card {
  border: 1px solid var(--border-color); border-radius: 10px;
  padding: 12px 14px; background: var(--bg-card);
}
.ov__card-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;
  text-transform: uppercase; letter-spacing: .04em;
}
.ov__n { border-radius: 10px; padding: 0 7px; font-size: 11px; }
.ov__n--hot { background: rgba(var(--error-rgb), 0.08); color: var(--error); }
.ov__n--warn { background: rgba(var(--warning-rgb), 0.08); color: var(--ia-stale); }
.ov__row {
  display: flex; justify-content: space-between; width: 100%; padding: 6px 8px;
  border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 6px;
  background: var(--bg-secondary); cursor: pointer; font-size: 12px;
  &:hover { border-color: var(--accent-primary); }
}
.ov__row-label { color: var(--text-secondary); }
.ov__mini { border-top: 1px dashed var(--border-color); padding-top: 6px; }
.ov__mini-row {
  display: block; width: 100%; text-align: left; border: none; background: transparent;
  padding: 3px 4px; font-size: 11.5px; color: var(--accent-primary); cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  &:hover { text-decoration: underline; }
}
.ov__issue {
  display: block; width: 100%; margin-top: 6px; padding: 5px 8px; text-align: left;
  border: 1px dashed rgba(var(--error-rgb), 0.45); border-radius: 6px;
  background: transparent; color: var(--error); font-size: 11.5px; cursor: pointer;
}
.ov__health-row {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 6px;
  margin-bottom: 6px; background: var(--bg-secondary); cursor: pointer; font-size: 12px;
}
.ov__health-row--blocker { border-color: rgba(var(--error-rgb), 0.35); }
.ov__health-row--warning { border-color: rgba(var(--warning-rgb), 0.35); }
.ov__health-label { color: var(--error); font-weight: 600; }
.ov__health-row--warning .ov__health-label { color: var(--ia-stale); }
.ov__health-detail { color: var(--text-secondary); font-size: 11px; }
.ov__health-more { font-size: 11px; color: var(--text-muted); }
.ov__sub { font-size: 11px; color: var(--text-muted); margin: 8px 0 4px; }
.ov__recent {
  display: flex; justify-content: space-between; gap: 8px; width: 100%;
  padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-secondary); cursor: pointer; font-size: 12px;
  &:hover { border-color: var(--accent-primary); }
}
.ov__recent-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov__recent-stage { flex-shrink: 0; color: var(--text-muted); font-size: 11px; }
.ov__bar { height: 8px; border-radius: 4px; background: var(--bg-secondary); overflow: hidden; }
.ov__bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent-primary), var(--success)); transition: width .3s; }
.ov__pct { font-size: 12px; font-weight: 600; margin-top: 6px; }
.ov__dist { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--text-muted); margin-top: 6px; }
.ov__scope { margin: 6px 0 0; font-size: 10.5px; color: var(--text-muted); }
</style>
