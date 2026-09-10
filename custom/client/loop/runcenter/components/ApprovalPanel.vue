<!-- overlay/custom/loop/runcenter/components/ApprovalPanel.vue -->
<!-- ApprovalPanel — 审批面板（task-7）：interrupt payload 结构化展示（prompt/契约摘要/
     policy/approvers/已等时长/超时策略）+ approve/reject 决策（reject 必填原因）。
     提交走 store.resumeRun → REST 成功后 store 落本地 resume 事件（乐观投影，
     不等 socket 回声）。上一轮 resume 带 auto 标记时显示"超时自动通过"横幅（A2 联动）。
     投影逻辑在 adapters/intervention.ts（纯函数），本组件只做展示与提交。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '../store/runs'
import {
  formatDurationMs, latestResumeIsAuto, parseApprovalInterrupt,
} from '../adapters/intervention'
import { eventTsMs } from '../adapters/run-graph'
import type { RunSummary } from '../types'

const props = defineProps<{ run: RunSummary }>()

const { t } = useI18n()
const store = useRunCenterStore()

/** 未决审批 interrupt 的结构化视图（无未决中断 → null，面板只渲染空壳） */
const view = computed(() => parseApprovalInterrupt(props.run.events))
/** 上一轮 resume 是否超时自动通过（A2：auto-approve-with-log 后 repair 重开新 interrupt） */
const autoBanner = computed(() => latestResumeIsAuto(props.run.events))
/** 已等时长（挂起时刻 → 现在；raisedAt 双词汇：ISO 字符串 ∪ 日志 epoch ms，统一归一 ms） */
const waitingLabel = computed(() => {
  const v = view.value
  if (!v || v.raisedAt == null) return null
  const raised = eventTsMs({ ts: v.raisedAt })
  if (!raised) return null
  return formatDurationMs(Math.max(0, Date.now() - raised))
})

const reason = ref('')
const reasonError = ref(false)
const busy = ref(false)
const submitError = ref<string | null>(null)

async function submit(decision: 'approved' | 'rejected'): Promise<void> {
  if (busy.value || !view.value) return
  submitError.value = null
  const text = reason.value.trim()
  if (decision === 'rejected' && !text) {
    reasonError.value = true
    return
  }
  reasonError.value = false
  busy.value = true
  try {
    await store.resumeRun(props.run.runId, decision === 'approved'
      ? { decision: 'approved' }
      : { decision: 'rejected', comment: text })
    reason.value = ''
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

/** 超时时长标签（value.timeout.ms；locale 无关毫秒标签） */
const timeoutLabel = computed(() => {
  const ms = view.value?.timeout?.ms
  return typeof ms === 'number' ? formatDurationMs(ms) : null
})
</script>

<template>
  <div class="ap-panel" data-approval-panel>
    <template v-if="view">
      <div class="ap-panel__head">
        <strong>{{ t('runcenter.approval.title') }}</strong>
        <span v-if="waitingLabel" class="ap-panel__waiting">
          {{ t('runcenter.approval.waiting') }} {{ waitingLabel }}
        </span>
      </div>

      <p class="ap-panel__prompt">{{ view.prompt }}</p>

      <div v-if="view.contractSummary" class="ap-panel__contract">
        <span class="ap-panel__contract-id">{{ view.contractSummary.id }}</span>
        <span class="ap-panel__contract-ref">
          {{ view.contractSummary.source }}:{{ view.contractSummary.ref }}
        </span>
        <span class="ap-panel__contract-summary">{{ view.contractSummary.summary }}</span>
        <span v-if="view.contractSummary.attempts !== undefined" class="ap-panel__contract-attempts">
          {{ t('runcenter.approval.attempts', { n: String(view.contractSummary.attempts) }) }}
        </span>
      </div>

      <dl class="ap-panel__meta">
        <div class="ap-panel__meta-row">
          <dt>{{ t('runcenter.approval.policyLabel') }}</dt>
          <dd>{{ view.policy ? t(`runcenter.approval.policy.${view.policy}`) : '—' }}</dd>
        </div>
        <div class="ap-panel__meta-row">
          <dt>{{ t('runcenter.approval.approvers') }}</dt>
          <dd>{{ view.approversLabel || '—' }}</dd>
        </div>
        <div class="ap-panel__meta-row">
          <dt>{{ t('runcenter.approval.onReject') }}</dt>
          <dd>{{ view.onReject || '—' }}</dd>
        </div>
        <div v-if="timeoutLabel" class="ap-panel__meta-row">
          <dt>{{ t('runcenter.approval.timeout') }}</dt>
          <dd>{{ timeoutLabel }} · {{ view.timeout?.onTimeout ?? '—' }}</dd>
        </div>
      </dl>

      <div v-if="autoBanner" class="ap-panel__auto">
        {{ t('runcenter.approval.autoBanner') }}
      </div>

      <textarea
        v-model="reason"
        class="ap-panel__reason"
        rows="2"
        :placeholder="t('runcenter.approval.rejectReasonPlaceholder')"
      />
      <div v-if="reasonError" class="ap-panel__reason-error">
        {{ t('runcenter.approval.rejectReasonRequired') }}
      </div>
      <div v-if="submitError" class="ap-panel__error">{{ submitError }}</div>

      <div class="ap-panel__actions">
        <button
          class="ap-panel__decision ap-panel__decision--approve"
          :disabled="busy"
          @click="submit('approved')"
        >
          {{ t('runcenter.approval.approve') }}
        </button>
        <button
          class="ap-panel__decision ap-panel__decision--reject"
          :disabled="busy"
          @click="submit('rejected')"
        >
          {{ t('runcenter.approval.reject') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ap-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-warning, #f59e0b);
  border-radius: var(--radius-standard, 6px);
  background: rgba(var(--color-warning-rgb, 245, 158, 11), 0.05);
  font-size: 12px;
}
.ap-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.ap-panel__waiting {
  color: var(--color-warning, #f59e0b);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ap-panel__prompt {
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.ap-panel__contract {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
}
.ap-panel__contract-id {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 600;
}
.ap-panel__contract-ref {
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ap-panel__contract-attempts {
  margin-left: auto;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ap-panel__meta {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 4px 16px;
}
.ap-panel__meta-row { display: flex; gap: 6px; }
.ap-panel__meta-row dt {
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  flex-shrink: 0;
}
.ap-panel__meta-row dd { margin: 0; word-break: break-all; }

.ap-panel__auto {
  padding: 6px 8px;
  border: 1px solid var(--color-warning, #f59e0b);
  border-radius: var(--radius-micro, 3px);
  color: var(--color-warning, #f59e0b);
}
.ap-panel__reason {
  resize: vertical;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
}
.ap-panel__reason-error { color: var(--color-danger, #e11d48); }
.ap-panel__error {
  color: var(--color-danger, #e11d48);
  word-break: break-all;
}
.ap-panel__actions { display: flex; gap: 8px; }
.ap-panel__decision {
  padding: 5px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.ap-panel__decision:disabled { opacity: 0.5; cursor: default; }
.ap-panel__decision--approve {
  border-color: var(--color-success, #28bf5c);
  color: var(--color-success, #28bf5c);
}
.ap-panel__decision--reject {
  border-color: var(--color-danger, #e11d48);
  color: var(--color-danger, #e11d48);
}
</style>
