<!-- overlay/custom/loop/runcenter/components/ApprovalPanel.vue -->
<!-- ApprovalPanel — 审批面板（task-7）：interrupt payload 结构化展示（prompt/契约摘要/
     policy/approvers/已等时长/超时策略）+ approve/reject 决策（reject 必填原因）。
     提交走 store.resumeRun → REST 成功后 store 落本地 resume 事件（乐观投影，
     不等 socket 回声）。上一轮 resume 带 auto 标记时显示"超时自动通过"横幅（A2 联动）。
     P3 台账（specified 审批身份）：resume 值携带 approver = 当前用户名（上游 token
     载荷解析，cockpit currentUserName 同源）；身份不可得时决策按钮置灰并 tooltip 说明
     （specified 策略按 approver 匹配，无名可署等于无法裁决）。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStoredUsername } from '@/api/client'
import { useRunCenterStore } from '../store/runs'
import {
  formatDurationMs, latestResumeIsAuto, parseApprovalInterrupt,
} from '../adapters/intervention'
import {
  alwaysAllowApprover, isAlwaysAllowed, loadAlwaysAllow, saveAlwaysAllow, tryMarkAutoFired, withRule,
} from '../adapters/always-allow'
import { eventTsMs } from '../adapters/run-graph'
import type { RunSummary } from '../types'

const props = defineProps<{ run: RunSummary }>()

const { t } = useI18n()
const store = useRunCenterStore()

/** 当前审批人身份（token 载荷 username；面板生命周期内取一次） */
const approver: string | null = getStoredUsername()
const hasIdentity = approver != null

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

// ── Always allow 按类型记忆（P4 T9 / §7B.5）──
/** 复选框态：挂载/换 interrupt 时按规则表初始化；审批成功后按最终态沉淀或撤销 */
const ruleChecked = ref(false)
/** 本次面板生命周期内已自动放行的 interruptId（模块级 tryMarkAutoFired 承担跨面板
 *  防重发；本 ref 保留作同实例内横幅语义锚点） */
const autoFiredFor = ref<string | null>(null)
/** 自动放行的审批类别（撤销规则用——壳关闭后 view 已 null，不能再读） */
const autoFiredType = ref<string | null>(null)
/** 自动放行横幅（留痕说明） */
const autoPassed = ref(false)
/** 类别展示名（已知两类走 i18n，未知类型回原值） */
const typeLabel = computed(() => {
  const type = view.value?.nodeType
  if (!type) return ''
  const known: Record<string, string> = {
    human: t('runcenter.approval.type.human'),
    validation: t('runcenter.approval.type.validation'),
  }
  return known[type] ?? type
})

watch(() => view.value?.interruptId, id => {
  // 仅在新 interrupt 出现时重置上一轮的横幅/勾选态；id=undefined 是壳关闭
  // （resume 乐观投影），横幅与撤销入口须存活
  if (id == null) return
  autoPassed.value = false
  ruleChecked.value = isAlwaysAllowed(loadAlwaysAllow(), view.value?.nodeType)
  // 规则命中 + 有身份 + 模块级占坑成功 → 自动批准并留痕（approver=always-allow:<user>）；
  // 无身份不自动（specified 策略无名可署等于无法裁决）。占坑在规则判定之后——
  // 规则未命中不消费 id，后续「先勾选再复现」的路径不受影响。
  if (hasIdentity && view.value
    && isAlwaysAllowed(loadAlwaysAllow(), view.value.nodeType)
    && tryMarkAutoFired(id)) {
    autoFiredFor.value = id
    autoFiredType.value = view.value.nodeType
    autoPassed.value = true
    submit('approved', alwaysAllowApprover(approver ?? '')).catch(() => {})
    // submit 内部已吞错落 submitError；catch 兜底防未处理拒绝噪音
  }
}, { immediate: true })

/** 撤销「始终允许」规则（自动放行已发生，本条不回收；下一次同类不再自动） */
function revokeRule(): void {
  const type = autoFiredType.value ?? view.value?.nodeType
  if (!type) return
  saveAlwaysAllow(withRule(loadAlwaysAllow(), type, false))
  ruleChecked.value = false
}

async function submit(decision: 'approved' | 'rejected', approverOverride?: string): Promise<void> {
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
    // P3 台账：resume 值带 approver（服务端 evaluateApprovalPolicy 的 specified
    // 分支按 approver 匹配名单）；无身份时按钮已置灰，此路径不可达。
    // P4 T9：自动放行路径 approver 覆写为 always-allow:<user>（留痕可区分人与规则）。
    // nodeType/勾选态先捕获——resume 成功的乐观投影会关闭未决 interrupt（view 变 null），
    // await 之后再读 view 拿不到类别。
    const nodeType = view.value.nodeType
    const persistRule = ruleChecked.value
    const effectiveApprover = approverOverride ?? approver ?? undefined
    await store.resumeRun(props.run.runId, decision === 'approved'
      ? { decision: 'approved', approver: effectiveApprover }
      : { decision: 'rejected', comment: text, approver: effectiveApprover })
    reason.value = ''
    // 审批成功才沉淀/撤销规则（失败不记——规则只能由成功路径写入）。
    // 自动放行路径（approverOverride）不沉淀：规则已在表内，重写会在
    // 「撤销规则 vs 迟到的 submit 完成」竞态下覆盖用户的撤销。
    if (decision === 'approved' && nodeType && !approverOverride) {
      saveAlwaysAllow(withRule(loadAlwaysAllow(), nodeType, persistRule))
    }
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
    <!-- 自动放行横幅在未决 interrupt 壳之外：resume 成功的乐观投影会立刻关闭壳
         （view 变 null），「已自动放行 + 可撤销规则」必须存活到下一次 interrupt -->
    <div v-if="autoPassed" class="ap-panel__auto-passed" data-approval-auto-passed>
      {{ t('runcenter.approval.autoPassed') }}
      <button
        class="ap-panel__revoke"
        data-approval-revoke-always-allow
        @click="revokeRule"
      >
        {{ t('runcenter.approval.revokeAlwaysAllow') }}
      </button>
    </div>
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
          :disabled="busy || !hasIdentity"
          :title="hasIdentity ? undefined : t('runcenter.approval.noIdentity')"
          @click="submit('approved')"
        >
          {{ t('runcenter.approval.approve') }}
        </button>
        <button
          class="ap-panel__decision ap-panel__decision--reject"
          :disabled="busy || !hasIdentity"
          :title="hasIdentity ? undefined : t('runcenter.approval.noIdentity')"
          @click="submit('rejected')"
        >
          {{ t('runcenter.approval.reject') }}
        </button>
        <span v-if="!hasIdentity" class="ap-panel__no-identity">
          {{ t('runcenter.approval.noIdentity') }}
        </span>
        <label v-if="typeLabel" class="ap-panel__always-allow" data-approval-always-allow>
          <input v-model="ruleChecked" type="checkbox" />
          {{ t('runcenter.approval.alwaysAllow', { type: typeLabel }) }}
        </label>
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
.ap-panel__auto-passed {
  padding: 6px 8px;
  border: 1px solid var(--color-success, #28bf5c);
  border-radius: var(--radius-micro, 3px);
  color: var(--color-success, #28bf5c);
}
.ap-panel__revoke {
  margin-left: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.ap-panel__always-allow {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-size: 11px;
  cursor: pointer;
  user-select: none;
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
.ap-panel__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ap-panel__no-identity {
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-size: 11px;
}
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
