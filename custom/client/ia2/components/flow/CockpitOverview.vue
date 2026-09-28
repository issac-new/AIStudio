<!-- overlay/custom/client/ia2/components/flow/CockpitOverview.vue -->
<!-- P5 驾驶舱概览（2026-09-28 产品 UI 缺陷修复 §六 / V4 域5「为审查者设计接口」）：
     无选中对象时的中栏 landing——三卡真实数据聚合：
     ① 我的待办（审批待审 + 看板 RACI 等我卡）② 评审闸口（待裁决 + 最近裁决留痕）
     ③ 交付进度（全局任务状态分布 + 完成率条）。
     数据全 props（WorkbenchView 装配：approvals API + workspace.tasks）；
     动作全 emit。不耦合推演步数——闸门态势以产品真实评审域呈现。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { PendingApprovalItem, ApprovalHistoryEntry } from '@/custom/cockpit/api/approvals'
import { needsMyAction, parseTaskRaci } from '@/custom/kanban/utils/raci'
import type { KanbanTask } from '@/api/hermes/kanban'

const props = defineProps<{
  tasks: CockpitTask[]
  pending: PendingApprovalItem[]
  history: ApprovalHistoryEntry[]
  username: string
}>()

const emit = defineEmits<{
  (e: 'open-inbox'): void
  (e: 'open-board'): void
  (e: 'open-task', taskId: string): void
}>()

const { t } = useI18n()

// ① 我的待办：审批待审 + 我在 RACI 中担 R/A 的卡
const myRaciTasks = computed(() =>
  props.tasks.filter((t) => needsMyAction(t as unknown as KanbanTask, props.username)),
)
const myTodoCount = computed(() => props.pending.length + myRaciTasks.value.length)

// ② 评审闸口：待裁决评审 + 最近裁决（history 中 review 类）
const pendingReviews = computed(() => props.pending.filter((i) => i.kind === 'review'))
const recentVerdicts = computed(() =>
  props.history.filter((h) => h.targetKind === 'review').slice(0, 5),
)

// ③ 交付进度：状态分布 + 完成率
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
const progressPct = computed(() => {
  const total = props.tasks.length
  return total ? Math.round((statusCount.value.done / total) * 100) : 0
})

function fmtTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getMonth() + 1)}-${String(d.getDate())} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 卡片 RACI 摘要（首行列表用）
function raciOf(t: CockpitTask) {
  return parseTaskRaci(t as unknown as KanbanTask)
}
</script>

<template>
  <div class="ov" data-testid="cockpit-overview">
    <div class="ov__title">{{ t('ia2.overviewDash.title') }}</div>
    <div class="ov__grid">
      <!-- ① 我的待办 -->
      <section class="ov__card" data-testid="ov-todo">
        <div class="ov__card-head">
          <span>{{ t('ia2.overviewDash.myTodo') }}</span>
          <span v-if="myTodoCount" class="ov__n ov__n--hot">{{ myTodoCount }}</span>
        </div>
        <button type="button" class="ov__row" data-testid="ov-todo-approvals" @click="emit('open-inbox')">
          <span class="ov__row-label">{{ t('ia2.overviewDash.waitingApproval') }}</span>
          <b>{{ pending.length }}</b>
        </button>
        <button type="button" class="ov__row" data-testid="ov-todo-raci" @click="emit('open-board')">
          <span class="ov__row-label">{{ t('ia2.overviewDash.myRaci') }}</span>
          <b>{{ myRaciTasks.length }}</b>
        </button>
        <div v-if="myRaciTasks.length" class="ov__mini">
          <button
            v-for="t in myRaciTasks.slice(0, 3)" :key="t.id"
            type="button" class="ov__mini-row" :data-testid="`ov-mytask-${t.id}`"
            @click="emit('open-task', t.id)"
          >{{ t.title }}</button>
        </div>
      </section>

      <!-- ② 评审闸口 -->
      <section class="ov__card" data-testid="ov-gates">
        <div class="ov__card-head">
          <span>{{ t('ia2.overviewDash.gateReview') }}</span>
          <span v-if="pendingReviews.length" class="ov__n ov__n--warn">{{ pendingReviews.length }}</span>
        </div>
        <button type="button" class="ov__row" data-testid="ov-gates-pending" @click="emit('open-inbox')">
          <span class="ov__row-label">{{ t('ia2.overviewDash.pendingReview') }}</span>
          <b>{{ pendingReviews.length }}</b>
        </button>
        <div class="ov__sub">{{ t('ia2.overviewDash.recentVerdicts') }}</div>
        <div v-if="!recentVerdicts.length" class="ov__empty">{{ t('ia2.overviewDash.noVerdicts') }}</div>
        <div v-for="v in recentVerdicts" :key="v.id + v.ts" class="ov__verdict" :data-testid="`ov-verdict-${v.targetId}`">
          <span class="ov__verdict-badge" :class="v.decision === 'approve' ? 'is-ok' : 'is-no'">
            {{ t(`approvals.choice.${v.decision}`) }}
          </span>
          <span class="ov__verdict-title">{{ v.targetTitle }}</span>
          <span class="ov__verdict-meta">{{ v.actor }} · {{ fmtTime(v.ts) }}</span>
        </div>
      </section>

      <!-- ③ 交付进度 -->
      <section class="ov__card" data-testid="ov-progress">
        <div class="ov__card-head"><span>{{ t('ia2.overviewDash.progress') }}</span></div>
        <div class="ov__bar" role="progressbar" :aria-valuenow="progressPct">
          <div class="ov__bar-fill" data-testid="ov-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <div class="ov__pct">{{ t('ia2.overviewDash.doneOfTotal', { done: statusCount.done, total: tasks.length, pct: progressPct }) }}</div>
        <div class="ov__dist">
          <span>{{ t('ia2.overviewDash.running') }} {{ statusCount.running }}</span>
          <span>{{ t('ia2.overviewDash.review') }} {{ statusCount.review }}</span>
          <span>{{ t('ia2.overviewDash.blocked') }} {{ statusCount.blocked }}</span>
          <span>{{ t('ia2.overviewDash.open') }} {{ statusCount.open }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ov { padding: 18px 20px; overflow-y: auto; height: 100%; box-sizing: border-box; }
.ov__title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.ov__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.ov__card {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: var(--radius-panel, 8px);
  padding: 12px 14px; background: var(--bg-card, #fff);
}
.ov__card-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;
  text-transform: uppercase; letter-spacing: .04em;
}
.ov__n { border-radius: var(--radius-panel, 8px); padding: 0 7px; font-size: 11px; }
.ov__n--hot { background: #dc262614; color: #dc2626; }
.ov__n--warn { background: #d9770614; color: #d97706; }
.ov__row {
  display: flex; justify-content: space-between; width: 100%; padding: 6px 8px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; margin-bottom: 6px;
  background: var(--bg-secondary, #fafafa); cursor: pointer; font-size: 12px;
  &:hover { border-color: var(--accent-primary, #2563eb); }
}
.ov__row-label { color: var(--text-secondary); }
.ov__mini { border-top: 1px dashed var(--border-color, #e5e7eb); padding-top: 6px; }
.ov__mini-row {
  display: block; width: 100%; text-align: left; border: none; background: transparent;
  padding: 3px 4px; font-size: 11.5px; color: var(--accent-primary, #2563eb); cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  &:hover { text-decoration: underline; }
}
.ov__sub { font-size: 11px; color: var(--text-muted); margin: 8px 0 4px; }
.ov__empty { font-size: 11.5px; color: var(--text-muted); padding: 4px 0; }
.ov__verdict { display: flex; align-items: baseline; gap: 6px; padding: 3px 0; font-size: 11.5px; }
.ov__verdict-badge { font-size: 10px; padding: 0 5px; border-radius: 3px; flex-shrink: 0; }
.ov__verdict-badge.is-ok { color: var(--success, #2e7d32); background: rgba(var(--success-rgb, 46, 125, 50), 0.08); }
.ov__verdict-badge.is-no { color: var(--error, #c62828); background: rgba(var(--error-rgb, 198, 40, 40), 0.08); }
.ov__verdict-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov__verdict-meta { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.ov__bar { height: 8px; border-radius: var(--radius-micro, 3px); background: var(--bg-secondary, #eef1f4); overflow: hidden; }
.ov__bar-fill { height: 100%; background: var(--accent-primary); transition: width .3s; }
.ov__pct { font-size: 12px; font-weight: 600; margin-top: 6px; }
.ov__dist { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--text-muted); margin-top: 6px; }
</style>
