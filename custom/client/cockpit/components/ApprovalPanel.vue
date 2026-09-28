<!-- overlay/custom/client/cockpit/components/ApprovalPanel.vue -->
<!-- P1 人工审批面板（2026-09-28 产品 UI 缺陷修复 §二）：
     待审列表（fleet 命令审批 + 评审卡）+ 就地裁决按钮 + 审批历史。
     数据源 /api/approvals/{pending,decide,history}；裁决成功后自动刷新两区。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchPendingApprovals, decideApproval, fetchApprovalHistory,
  type PendingApprovalItem, type ApprovalHistoryEntry,
} from '../api/approvals'

const props = withDefaults(defineProps<{
  /** 轮询间隔 ms；0 = 不轮询（外部控制刷新） */
  pollMs?: number
  /** 是否渲染历史区（收件箱页 true，嵌入条 false） */
  showHistory?: boolean
}>(), { pollMs: 10000, showHistory: true })

const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const items = ref<PendingApprovalItem[]>([])
const history = ref<ApprovalHistoryEntry[]>([])
const loading = ref(false)
const error = ref('')
const acting = ref<Set<string>>(new Set())
let timer: ReturnType<typeof setInterval> | null = null

const commandItems = computed(() => items.value.filter((i) => i.kind === 'command'))
const reviewItems = computed(() => items.value.filter((i) => i.kind === 'review'))

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [pending, hist] = await Promise.all([
      fetchPendingApprovals(),
      props.showHistory ? fetchApprovalHistory(50) : Promise.resolve({ entries: [] }),
    ])
    items.value = pending.items ?? []
    history.value = hist.entries ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function decide(item: PendingApprovalItem, decision: string): Promise<void> {
  if (acting.value.has(item.id)) return
  acting.value = new Set(acting.value).add(item.id)
  try {
    const res = await decideApproval(item.id, decision)
    if (res && (res as { ok?: boolean }).ok === false) {
      error.value = (res as { detail?: string }).detail || '决策失败'
    } else {
      emit('changed')
      await refresh()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    const next = new Set(acting.value)
    next.delete(item.id)
    acting.value = next
  }
}

function fmtTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

onMounted(() => {
  void refresh()
  if (props.pollMs > 0) timer = setInterval(() => void refresh(), props.pollMs)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

defineExpose({ refresh })
</script>

<template>
  <div class="approval-panel" data-testid="approval-panel">
    <div class="approval-panel__head">
      <h3 class="approval-panel__title">{{ t('approvals.title') }}
        <span v-if="items.length" class="approval-panel__count" data-testid="approval-pending-count">{{ t('approvals.pendingCount', { n: items.length }) }}</span>
      </h3>
      <button type="button" class="approval-panel__refresh" :aria-label="t('common.refresh')" @click="refresh()">⟳</button>
    </div>

    <div v-if="error" class="approval-panel__error" data-testid="approval-error">{{ t('approvals.loadFailed') }}：{{ error }}</div>

    <div v-if="!loading && items.length === 0" class="approval-panel__empty" data-testid="approval-empty">{{ t('approvals.empty') }}</div>

    <!-- 命令审批（agent 工具/命令请求） -->
    <section v-if="commandItems.length" class="approval-panel__group">
      <h4 class="approval-panel__group-title">{{ t('approvals.kindCommand') }}</h4>
      <div v-for="item in commandItems" :key="item.id" class="approval-row" data-testid="approval-row-command">
        <div class="approval-row__main">
          <div class="approval-row__title">{{ item.title }}</div>
          <code class="approval-row__detail">{{ item.detail }}</code>
          <div class="approval-row__meta">{{ fmtTime(item.createdAt) }}<template v-if="item.profile"> · {{ item.profile }}</template></div>
        </div>
        <div class="approval-row__actions">
          <button
            v-for="choice in (item.choices && item.choices.length ? item.choices : ['once', 'session', 'deny'])"
            :key="choice"
            type="button"
            class="approval-btn"
            :class="`approval-btn--${choice}`"
            :data-testid="`approval-btn-${choice}`"
            :disabled="acting.has(item.id)"
            @click="decide(item, choice)"
          >{{ t(`approvals.choice.${choice}`) }}</button>
        </div>
      </div>
    </section>

    <!-- 评审卡（review 域未裁决） -->
    <section v-if="reviewItems.length" class="approval-panel__group">
      <h4 class="approval-panel__group-title">{{ t('approvals.kindReview') }}</h4>
      <div v-for="item in reviewItems" :key="item.id" class="approval-row" data-testid="approval-row-review">
        <div class="approval-row__main">
          <div class="approval-row__title">{{ item.title }}</div>
          <div class="approval-row__detail">{{ item.detail }}</div>
          <div class="approval-row__meta">{{ fmtTime(item.createdAt) }}<template v-if="item.taskId"> · {{ item.taskId }}</template></div>
        </div>
        <div class="approval-row__actions">
          <button type="button" class="approval-btn approval-btn--once" data-testid="approval-btn-approve" :disabled="acting.has(item.id)" @click="decide(item, 'approve')">{{ t('approvals.choice.approve') }}</button>
          <button type="button" class="approval-btn approval-btn--deny" data-testid="approval-btn-request-changes" :disabled="acting.has(item.id)" @click="decide(item, 'request_changes')">{{ t('approvals.choice.request_changes') }}</button>
        </div>
      </div>
    </section>

    <!-- 审批历史 -->
    <section v-if="showHistory" class="approval-panel__history">
      <h4 class="approval-panel__group-title">{{ t('approvals.history') }}</h4>
      <div v-if="history.length === 0" class="approval-panel__empty">{{ t('approvals.historyEmpty') }}</div>
      <table v-else class="approval-history" data-testid="approval-history">
        <thead>
          <tr>
            <th>{{ t('approvals.colTime') }}</th>
            <th>{{ t('approvals.colActor') }}</th>
            <th>{{ t('approvals.colTarget') }}</th>
            <th>{{ t('approvals.colDecision') }}</th>
            <th>{{ t('approvals.colNote') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in history" :key="entry.id + entry.ts">
            <td>{{ fmtTime(entry.ts) }}</td>
            <td>{{ entry.actor }}</td>
            <td>{{ entry.targetTitle }}</td>
            <td><span class="approval-history__decision" :class="`is-${entry.decision}`">{{ t(`approvals.choice.${entry.decision}`) !== `approvals.choice.${entry.decision}` ? t(`approvals.choice.${entry.decision}`) : entry.decision }}</span></td>
            <td>{{ entry.note || '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped lang="scss">
.approval-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.approval-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.approval-panel__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.approval-panel__count {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-primary, #3b82f6);
}
.approval-panel__refresh {
  margin-left: auto;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 15px;
  color: var(--text-muted, #878c99);
  &:hover { color: inherit; }
}
.approval-panel__error {
  color: #dc2626;
  font-size: 12px;
}
.approval-panel__empty {
  color: var(--text-muted, #878c99);
  font-size: 13px;
  padding: 18px 0;
  text-align: center;
}
.approval-panel__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.approval-panel__group-title {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #878c99);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.approval-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-secondary, rgba(255, 255, 255, 0.55));
}
.approval-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.approval-row__title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.approval-row__detail {
  font-size: 12px;
  color: var(--text-muted, #878c99);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.approval-row__meta {
  font-size: 11px;
  color: var(--text-muted, #878c99);
  opacity: 0.8;
}
.approval-row__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.approval-btn {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: wait; }
  &--once, &--session, &--always, &--approve { color: #059669; border-color: #05966944; }
  &--deny, &--request_changes { color: #dc2626; border-color: #dc262644; }
  &:hover:not(:disabled) { background: var(--bg-secondary, #f1f2f4); }
}
.approval-panel__history {
  margin-top: 6px;
}
.approval-history {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  th, td {
    text-align: left;
    padding: 5px 8px;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
  }
  th { color: var(--text-muted, #878c99); font-weight: 500; }
  td { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.approval-history__decision {
  font-weight: 600;
  &.is-once, &.is-session, &.is-always, &.is-approve { color: #059669; }
  &.is-deny, &.is-request_changes { color: #dc2626; }
}
</style>
