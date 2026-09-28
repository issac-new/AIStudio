<!-- overlay/custom/client/cockpit/components/ApprovalPanel.vue -->
<!-- P1 人工审批面板（2026-09-28 产品 UI 缺陷修复 §二）：
     待审列表（fleet 命令审批 + 评审卡）+ 就地裁决按钮 + 审批历史。
     数据源 /api/approvals/{pending,decide,history}；裁决成功后自动刷新两区。
     U2 改版（推演报告审计二轮）：hideTitle 收敛双标题、刷新钮显性化、
     行内风险徽章 + 主次按钮、决策徽章化、时间随界面语言。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchPendingApprovals, decideApproval, fetchApprovalHistory,
  type PendingApprovalItem, type ApprovalHistoryEntry, type ApprovalRiskTier,
} from '../api/approvals'

const props = withDefaults(defineProps<{
  /** 轮询间隔 ms；0 = 不轮询（外部控制刷新） */
  pollMs?: number
  /** 是否渲染历史区（收件箱页 true，嵌入条 false） */
  showHistory?: boolean
  /** 隐藏面板内标题（外层页面栏已给出标题时置 true，收敛双标题） */
  hideTitle?: boolean
}>(), { pollMs: 10000, showHistory: true, hideTitle: false })

const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()
const items = ref<PendingApprovalItem[]>([])
const history = ref<ApprovalHistoryEntry[]>([])
const loading = ref(false)
const error = ref('')
const acting = ref<Set<string>>(new Set())
let timer: ReturnType<typeof setInterval> | null = null

/** V4-N1 风险三档分组：高危置顶红标逐条裁决，低风险标"可自动通过·抽检"。
 *  服务端 pending 已按档排序，这里仅按档聚桶；缺档（老服务端）按 medium 兜底。 */
const tierGroups = computed(() => {
  const buckets: Record<ApprovalRiskTier, PendingApprovalItem[]> = { high: [], medium: [], low: [] }
  for (const item of items.value) buckets[item.risk ?? 'medium'].push(item)
  return (['high', 'medium', 'low'] as const)
    .map((key) => ({ key, rows: buckets[key] }))
    .filter((g) => g.rows.length > 0)
})

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
  return new Date(ts).toLocaleString(locale.value)
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
      <h3 v-if="!hideTitle" class="approval-panel__title">{{ t('approvals.title') }}</h3>
      <span v-if="items.length" class="approval-panel__count" data-testid="approval-pending-count">{{ t('approvals.pendingCount', { n: items.length }) }}</span>
      <span v-else class="approval-panel__count approval-panel__count--idle">{{ t('approvals.empty') }}</span>
      <button
        type="button"
        class="approval-panel__refresh"
        :aria-label="t('common.refresh')"
        :disabled="loading"
        @click="refresh()"
      >{{ t('common.refresh') }}</button>
    </div>

    <div v-if="error" class="approval-panel__error" data-testid="approval-error">{{ t('approvals.loadFailed') }}：{{ error }}</div>

    <!-- 空态：图标 + 文案的暖空态（对照 Run Center 3 步引导范式，不再裸灰字） -->
    <div v-if="!loading && items.length === 0" class="approval-panel__empty" data-testid="approval-empty">
      <span class="approval-panel__empty-icon" aria-hidden="true">✓</span>
      <span class="approval-panel__empty-text">{{ t('approvals.empty') }}</span>
    </div>

    <!-- V4-N1 风险三档分区：高危（红标逐条）/ 常规 / 低风险（可自动通过·抽检） -->
    <section
      v-for="group in tierGroups"
      :key="group.key"
      class="approval-panel__group"
      :class="`approval-panel__group--${group.key}`"
      :data-testid="`approval-tier-${group.key}`"
    >
      <h4 class="approval-panel__group-title">
        <span class="risk-dot" :class="`risk-dot--${group.key}`"></span>{{ t(`approvals.risk.${group.key}`) }}
        <span v-if="group.key === 'high'" class="risk-hint risk-hint--high">{{ t('approvals.risk.highHint') }}</span>
        <span v-if="group.key === 'low'" class="risk-hint risk-hint--low">{{ t('approvals.risk.autoSample') }}</span>
      </h4>
      <div
        v-for="item in group.rows"
        :key="item.id"
        class="approval-row"
        :class="{ 'approval-row--high': group.key === 'high' }"
        :data-testid="item.kind === 'command' ? 'approval-row-command' : 'approval-row-review'"
      >
        <div class="approval-row__main">
          <div class="approval-row__title">
            <span class="approval-row__kind">{{ t(item.kind === 'command' ? 'approvals.kindCommand' : 'approvals.kindReview') }}</span>
            <span class="risk-badge" :class="`risk-badge--${group.key}`" data-testid="approval-row-risk">{{ t(`approvals.risk.${group.key}`) }}</span>
            {{ item.title }}
          </div>
          <code v-if="item.kind === 'command'" class="approval-row__detail">{{ item.detail }}</code>
          <div v-else class="approval-row__detail">{{ item.detail }}</div>
          <div class="approval-row__meta">
            {{ fmtTime(item.createdAt) }}
            <template v-if="item.profile"> · {{ item.profile }}</template>
            <template v-if="item.taskId"> · {{ item.taskId }}</template>
          </div>
        </div>
        <div class="approval-row__actions">
          <template v-if="item.kind === 'command'">
            <button
              v-for="choice in (item.choices && item.choices.length ? item.choices : ['once', 'session', 'deny'])"
              :key="choice"
              type="button"
              class="approval-btn"
              :class="[`approval-btn--${choice}`, { 'approval-btn--primary': choice === 'once' }]"
              :data-testid="`approval-btn-${choice}`"
              :disabled="acting.has(item.id)"
              @click="decide(item, choice)"
            >{{ t(`approvals.choice.${choice}`) }}</button>
          </template>
          <template v-else>
            <button type="button" class="approval-btn approval-btn--once approval-btn--primary" data-testid="approval-btn-approve" :disabled="acting.has(item.id)" @click="decide(item, 'approve')">{{ t('approvals.choice.approve') }}</button>
            <button type="button" class="approval-btn approval-btn--deny" data-testid="approval-btn-request-changes" :disabled="acting.has(item.id)" @click="decide(item, 'request_changes')">{{ t('approvals.choice.request_changes') }}</button>
          </template>
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
            <th>{{ t('approvals.colRisk') }}</th>
            <th>{{ t('approvals.colDecision') }}</th>
            <th>{{ t('approvals.colNote') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in history" :key="entry.id + entry.ts">
            <td>{{ fmtTime(entry.ts) }}</td>
            <td>{{ entry.actor }}</td>
            <td>{{ entry.targetTitle }}</td>
            <td><span v-if="entry.risk" class="risk-badge" :class="`risk-badge--${entry.risk}`" data-testid="approval-history-risk">{{ t(`approvals.risk.${entry.risk}`) }}</span></td>
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
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-primary, #3b82f6);
  &--idle { color: var(--text-muted, #878c99); font-weight: 400; }
}
.approval-panel__refresh {
  margin-left: auto;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
  font-size: 12px;
  padding: 3px 10px;
  color: var(--text-muted, #878c99);
  &:hover:not(:disabled) { color: inherit; background: var(--bg-secondary, #f1f2f4); }
  &:disabled { opacity: 0.5; cursor: wait; }
}
.approval-panel__error {
  color: var(--error, #c62828);
  font-size: 12px;
}
.approval-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 0;
  text-align: center;
}
.approval-panel__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-secondary, #f0f0f0);
  color: var(--success, #2e7d32);
  font-size: 18px;
}
.approval-panel__empty-text {
  color: var(--text-muted, #878c99);
  font-size: 13px;
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
  padding: 10px 12px;
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
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: wait; }
  &--once, &--session, &--always, &--approve { color: var(--success, #2e7d32); border-color: rgba(var(--success-rgb, 46, 125, 50), 0.27); }
  &--deny, &--request_changes { color: var(--error, #c62828); border-color: rgba(var(--error-rgb, 198, 40, 40), 0.27); }
  &--primary {
    background: var(--success, #2e7d32);
    border-color: var(--success, #2e7d32);
    color: #fff;
    font-weight: 600;
  }
  &:hover:not(:disabled) { filter: brightness(1.05); }
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: var(--radius-micro, 3px);
  font-size: 11px;
  font-weight: 600;
  /* 形状+符号编码，不仅颜色（红绿色盲可辨） */
  &::before { font-size: 10px; }
  &.is-once, &.is-session, &.is-always, &.is-approve {
    color: var(--success, #2e7d32);
    background: rgba(var(--success-rgb, 46, 125, 50), 0.1);
    &::before { content: '✓'; }
  }
  &.is-deny, &.is-request_changes {
    color: var(--error, #c62828);
    background: rgba(var(--error-rgb, 198, 40, 40), 0.1);
    &::before { content: '✕'; }
  }
}

/* V4-N1 风险三档（§一 域1）：高危红标、低风险绿标、常规中性 */
.risk-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: 1px;
  &--high { background: var(--error-color, #dc2626); }
  &--medium { background: var(--warning-color, #d97706); }
  &--low { background: var(--success-color, #059669); }
}
.risk-hint {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: none;
  letter-spacing: 0;
  &--high { color: var(--error-color, #dc2626); background: rgba(220, 38, 38, 0.08); }
  &--low { color: var(--success-color, #059669); background: rgba(5, 150, 105, 0.08); }
}
.approval-row--high {
  border-left: 3px solid var(--error-color, #dc2626);
}
.approval-row__kind {
  display: inline-block;
  margin-right: 6px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted, #878c99);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  vertical-align: 1px;
}
.risk-badge {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  font-size: 11px;
  border-radius: 4px;
  &--high { color: var(--error-color, #dc2626); background: rgba(220, 38, 38, 0.08); }
  &--medium { color: var(--warning-color, #d97706); background: rgba(217, 119, 6, 0.08); }
  &--low { color: var(--success-color, #059669); background: rgba(5, 150, 105, 0.08); }
}
</style>
