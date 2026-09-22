<!-- overlay/custom/client/ia2/components/NotifyDropdownPanel.vue -->
<!-- v12.3 通知下拉（2026-09-20 用户裁定：点击通知下拉显示所有待人工处理的
     决策消息，允许清除已读未读状态；替代退役的居中模态 CockpitNotifyModal）。
     双页签：①待人工决策 = buildWaiting 三源（review 任务/中断运行/fleet 审批）
     + 评审中心 pendingReviews（delivery R/G 门）；②消息 = 统一收件箱
     （未读消息/待办提醒）。已读态走 notify-read store（kv 持久化）；
     铃铛徽章 = 待决策未读数（装配方 IaShellHeader）。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useFlowStore } from '../store/flow'
import { useNotifyReadStore } from '../store/notify-read'
import { useReviewCenterStore } from '@/custom/matrix-teams/stores/review-center'
import { useDecisionActions } from '../composables/useDecisionActions'
import { useDecisionRows, type DecisionRow } from '../composables/useDecisionRows'

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const router = useRouter()
const cockpit = useCockpitStore()
const flow = useFlowStore()
const read = useNotifyReadStore()
const reviewCenter = useReviewCenterStore()
const { approveTask, rejectTask, approveRun, approveFleet } = useDecisionActions()
const { decisionRows, decisionIds, decisionUnread, gateRows } = useDecisionRows()

const tab = ref<'decisions' | 'messages'>('decisions')

const messageRows = computed(() => cockpit.inboxItems ?? [])

// R6 补充：消息未读计数（messages tab 徽章；与顶部通知徽章双计数同源）
const messageUnread = computed(() =>
  messageRows.value.reduce((n: number, i: { count?: number }) => n + (i.count ?? 0), 0),
)

/** 相对时间（分/时/天，i18n 词表复用 cockpit.justNow 族） */
function timeAgo(ts: number): string {
  if (!ts) return ''
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return t('cockpit.justNow')
  if (mins < 60) return t('cockpit.minutesAgo', { n: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('cockpit.hoursAgo', { n: hrs })
  return t('cockpit.daysAgo', { n: Math.floor(hrs / 24) })
}

/** 决策行点击：跳对应对象（任务→看板预选；运行→运行详情；fleet/gate→工作台/评审区） */
function onDecisionOpen(row: DecisionRow): void {
  if (row.taskId) void router.push({ name: 'ia2.board', query: { task: row.taskId } })
  else if (row.runId) void router.push({ name: 'ia2.runDetail', params: { runId: row.runId } })
  else if (row.kind === 'gate-review') flow.openGov('review')
  else void router.push({ path: '/app' })
  read.markRead(row.id)
  emit('close')
}

function onMessageOpen(routeTarget: unknown): void {
  if (routeTarget) void router.push(routeTarget as never)
}

function onGateVerdict(row: DecisionRow, verdict: 'pass' | 'reject'): void {
  const hit = gateRows.value.find(x => x.id === row.id)
  if (!hit) return
  void reviewCenter.sendVerdict({
    caseId: hit.caseId,
    gate: hit.gate as never,
    verdict,
    reason: verdict === 'reject' ? t('ia2.notify.gateRejectReason') : undefined,
  })
}
</script>

<template>
  <div class="ndp" data-testid="notify-dropdown" @click.stop>
    <div class="ndp__head">
      <button
        type="button" class="ndp__tab" :class="{ 'ndp__tab--on': tab === 'decisions' }"
        data-testid="notify-tab-decisions" @click="tab = 'decisions'"
      >{{ t('ia2.notify.tabDecisions') }}
        <span v-if="decisionUnread" class="ndp__badge">{{ decisionUnread }}</span>
      </button>
      <button
        type="button" class="ndp__tab" :class="{ 'ndp__tab--on': tab === 'messages' }"
        data-testid="notify-tab-messages" @click="tab = 'messages'"
      >{{ t('ia2.notify.tabMessages') }}
        <!-- R6 补充：消息未读计数（下拉对消息单独计数） -->
        <span v-if="messageUnread" class="ndp__badge ndp__badge--msg" data-testid="notify-messages-badge">{{ messageUnread }}</span>
      </button>
      <span class="ndp__spacer" />
      <button
        v-if="tab === 'decisions'" type="button" class="ndp__act"
        data-testid="notify-mark-all" :title="t('ia2.notify.markAllTitle')" @click="read.markManyRead(decisionIds)"
      >✓ {{ t('ia2.notify.markAll') }}</button>
      <button
        type="button" class="ndp__act" data-testid="notify-clear-read"
        :title="t('ia2.notify.clearReadTitle')" @click="read.clearRead()"
      >↺ {{ t('ia2.notify.clearRead') }}</button>
      <button type="button" class="ndp__close" data-testid="notify-close" @click="emit('close')">×</button>
    </div>

    <div class="ndp__body">
      <!-- ① 待人工决策：waiting 三源 + 评审门；行上就地处置 -->
      <template v-if="tab === 'decisions'">
        <div v-if="!decisionRows.length" class="ndp__empty">{{ t('ia2.notify.emptyDecisions') }}</div>
        <div v-for="row in decisionRows" :key="row.id" class="ndp__row" :class="{ 'ndp__row--read': read.isRead(row.id) }">
          <button type="button" class="ndp__main" :title="row.title" @click="onDecisionOpen(row)">
            <span class="ndp__dot" :class="read.isRead(row.id) ? 'is-read' : 'is-unread'" />
            <span class="ndp__name">{{ row.title }}</span>
            <span class="ndp__sub">{{ t(row.subKey) }}</span>
            <span class="ndp__ago">{{ timeAgo(row.ts) }}</span>
          </button>
          <span class="ndp__acts">
            <template v-if="row.kind === 'task-review' && row.taskId">
              <button type="button" class="ndp__act-btn ndp__act-btn--ok" @click="approveTask(row.taskId)">{{ t('ia2.sit.actApprove') }}</button>
              <button type="button" class="ndp__act-btn ndp__act-btn--no" @click="rejectTask(row.taskId)">{{ t('ia2.sit.actReject') }}</button>
            </template>
            <button v-else-if="row.runId" type="button" class="ndp__act-btn ndp__act-btn--ok" @click="approveRun(row)">{{ t('ia2.sit.actContinue') }}</button>
            <button v-else-if="row.sessionId && row.approvalId" type="button" class="ndp__act-btn ndp__act-btn--ok" @click="approveFleet(row)">{{ t('ia2.sit.actApprove') }}</button>
            <template v-else-if="row.kind === 'gate-review'">
              <button type="button" class="ndp__act-btn ndp__act-btn--ok" @click="onGateVerdict(row, 'pass')">{{ t('ia2.notify.gatePass') }}</button>
              <button type="button" class="ndp__act-btn ndp__act-btn--no" @click="onGateVerdict(row, 'reject')">{{ t('ia2.notify.gateReject') }}</button>
            </template>
          </span>
        </div>
      </template>

      <!-- ② 消息：统一收件箱（未读消息/待办提醒），点击跳对象 -->
      <template v-else>
        <div v-if="!messageRows.length" class="ndp__empty">{{ t('ia2.notify.emptyMessages') }}</div>
        <button
          v-for="m in messageRows" :key="m.id" type="button" class="ndp__row ndp__row--msg"
          :title="m.title" @click="onMessageOpen(m.routeTarget)"
        >
          <span class="ndp__dot" :class="m.count && m.count > 0 ? 'is-unread' : 'is-read'" />
          <span class="ndp__name">{{ m.title }}</span>
          <span v-if="m.count && m.count > 1" class="ndp__cnt">{{ m.count > 99 ? '99+' : m.count }}</span>
          <span class="ndp__ago">{{ timeAgo(m.ts) }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ndp {
  position: absolute; top: 100%; right: 8px; width: 400px; max-width: calc(100vw - 24px);
  max-height: 420px; display: flex; flex-direction: column;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14); z-index: 999; overflow: hidden;
}
.ndp__head {
  display: flex; align-items: center; gap: 4px; padding: 6px 8px;
  border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); flex-shrink: 0;
}
.ndp__tab {
  height: 24px; padding: 0 10px; border: 1px solid transparent; border-radius: 12px;
  background: transparent; color: var(--text-secondary); font-size: 12px; cursor: pointer;
  font-family: inherit; white-space: nowrap; position: relative;
  &:hover { color: var(--text-primary); }
}
.ndp__tab--on { background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary); font-weight: 600; }
.ndp__badge {
  display: inline-flex; align-items: center; justify-content: center; margin-left: 4px;
  min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px;
  background: var(--error); color: #fff; font-size: 9px; font-weight: 700;
}

/* R6 消息计数徽章（与决策红色区分，蓝色语义） */
.ndp__badge--msg { background: #61afef; }
.ndp__spacer { flex: 1; }
.ndp__act {
  height: 22px; padding: 0 8px; border: none; border-radius: 4px; background: transparent;
  color: var(--text-muted); font-size: 11px; cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--text-primary); background: var(--bg-card); }
}
.ndp__close { border: none; background: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1;
  &:hover { color: var(--text-primary); } }
.ndp__body { overflow-y: auto; padding: 4px 0; }
.ndp__empty { padding: 28px 0; text-align: center; color: var(--text-muted); font-size: 12px; }
.ndp__row {
  display: flex; align-items: center; gap: 6px; padding: 4px 10px;
  &:hover { background: var(--bg-secondary); }
}
.ndp__row--read .ndp__name { color: var(--text-muted); }
.ndp__main {
  display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; padding: 2px 4px;
  border: none; background: transparent; cursor: pointer; font-family: inherit; text-align: left;
  &:hover .ndp__name { color: var(--primary, #3b82f6); }
}
.ndp__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.ndp__dot.is-unread { background: var(--error); }
.ndp__dot.is-read { background: var(--border-color); }
.ndp__name {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; color: var(--text-primary);
}
.ndp__sub { font-size: 10px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
.ndp__ago { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.ndp__cnt {
  flex-shrink: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--error); color: #fff; font-size: 9px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.ndp__acts { display: inline-flex; gap: 4px; flex-shrink: 0; }
.ndp__act-btn {
  height: 22px; padding: 0 8px; border-radius: 4px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary); font-size: 11px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.ndp__act-btn--ok { color: var(--success); border-color: var(--success); }
.ndp__act-btn--no { color: var(--error); border-color: var(--error); }
</style>
