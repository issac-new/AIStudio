<!-- overlay/custom/client/matrix-teams/components/GateReviewCard.vue -->
<!-- M-C 评审卡片：门禁事件三态（待审/通过/驳回）+ signoffs 逐人签核状态 + 签核操作。
     纯展示组件：数据与动作均由容器（沟通视图/管理台）经 props/emits 接线。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  caseId: string
  gate: string
  verdict: 'pass' | 'conditional' | 'reject'
  signoffs: Array<{ decidedBy: string; verdict: 'pass' | 'conditional' | 'reject'; at: number }>
  reason?: string
  evidenceSummary?: string
  pending: boolean
  canSign: boolean
}>()
const emit = defineEmits<{
  (e: 'sign', payload: { verdict: 'pass' | 'reject'; reason?: string }): void
}>()

const { t } = useI18n()
const rejecting = ref(false)
const reasonInput = ref('')
const reasonError = ref(false)

// 三态：pending → 待审；聚合 pass → 通过；聚合 reject → 驳回（conditional 归待审）。
const state = computed<'pending' | 'pass' | 'reject'>(() => {
  if (props.verdict === 'pass') return 'pass'
  if (props.verdict === 'reject') return 'reject'
  return 'pending'
})

function signPass(): void {
  emit('sign', { verdict: 'pass' })
}

function submitReject(): void {
  if (!reasonInput.value.trim()) {
    reasonError.value = true
    return
  }
  reasonError.value = false
  emit('sign', { verdict: 'reject', reason: reasonInput.value.trim() })
}

function shortUser(mxId: string): string {
  return mxId.startsWith('@') ? mxId.slice(1).split(':')[0] : mxId
}
</script>

<template>
  <div class="grc" :class="`grc--${state}`" :data-testid="`gate-card-${caseId}-${gate}`">
    <div class="grc__head">
      <span class="grc__gate">{{ t('ia2.review.gate') }} {{ gate }}</span>
      <span class="grc__case">{{ caseId }}</span>
      <span class="grc__badge" :data-testid="`gate-card-state-${caseId}-${gate}`">{{ t(`ia2.review.state.${state}`) }}</span>
    </div>
    <div v-if="evidenceSummary" class="grc__evidence">{{ evidenceSummary }}</div>
    <ul v-if="signoffs.length" class="grc__signoffs" :data-testid="`gate-signoffs-${caseId}-${gate}`">
      <li v-for="s in signoffs" :key="s.decidedBy + s.at" class="grc__signoff">
        <span class="grc__signoff-user">{{ shortUser(s.decidedBy) }}</span>
        <span class="grc__signoff-verdict" :class="`grc__signoff-verdict--${s.verdict}`">{{ t(`ia2.review.state.${s.verdict === 'conditional' ? 'pending' : s.verdict}`) }}</span>
      </li>
    </ul>
    <div v-if="reason" class="grc__reason" :data-testid="`gate-reason-${caseId}-${gate}`">
      {{ t('ia2.review.reason') }}：{{ reason }}
    </div>
    <div v-if="canSign && pending" class="grc__actions">
      <button type="button" class="grc__btn grc__btn--pass" :data-testid="`gate-pass-${caseId}-${gate}`" @click="signPass">
        {{ t('ia2.review.actionPass') }}
      </button>
      <button v-if="!rejecting" type="button" class="grc__btn grc__btn--reject" :data-testid="`gate-reject-${caseId}-${gate}`" @click="rejecting = true">
        {{ t('ia2.review.actionReject') }}
      </button>
      <template v-else>
        <input
          v-model="reasonInput"
          class="grc__reason-input" :class="{ 'grc__reason-input--err': reasonError }"
          :placeholder="t('ia2.review.reasonPlaceholder')" :data-testid="`gate-reason-input-${caseId}-${gate}`"
        >
        <button type="button" class="grc__btn grc__btn--reject" :data-testid="`gate-reject-submit-${caseId}-${gate}`" @click="submitReject">
          {{ t('ia2.review.actionConfirmReject') }}
        </button>
      </template>
      <div v-if="reasonError" class="grc__reason-err">{{ t('ia2.review.reasonRequired') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.grc {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px;
  background: var(--bg-card); display: flex; flex-direction: column; gap: 6px;
}
.grc--pass { border-color: var(--success, #34c77b); }
.grc--reject { border-color: var(--danger, #e05656); }
.grc__head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.grc__gate { font-weight: 700; color: var(--text-primary); }
.grc__case { color: var(--text-muted); }
.grc__badge {
  margin-left: auto; padding: 1px 8px; border-radius: 8px; font-size: 11px;
  background: var(--bg-secondary); color: var(--text-secondary);
}
.grc--pass .grc__badge { background: var(--success, #34c77b); color: #fff; }
.grc--reject .grc__badge { background: var(--danger, #e05656); color: #fff; }
.grc__evidence { font-size: 12px; color: var(--text-secondary); }
.grc__signoffs { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.grc__signoff { display: flex; gap: 8px; font-size: 11px; }
.grc__signoff-user { color: var(--text-secondary); }
.grc__signoff-verdict { color: var(--text-muted); }
.grc__signoff-verdict--pass { color: var(--success, #34c77b); }
.grc__signoff-verdict--reject { color: var(--danger, #e05656); }
.grc__reason { font-size: 11px; color: var(--danger, #e05656); }
.grc__actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.grc__btn {
  border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary);
  color: var(--text-primary); font-size: 11px; padding: 3px 10px; cursor: pointer; font-family: inherit;
}
.grc__btn--pass { border-color: var(--success, #34c77b); color: var(--success, #34c77b); }
.grc__btn--reject { border-color: var(--danger, #e05656); color: var(--danger, #e05656); }
.grc__reason-input {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 8px;
  font-size: 11px; min-width: 160px; background: var(--bg-primary); color: var(--text-primary);
}
.grc__reason-input--err { border-color: var(--danger, #e05656); }
.grc__reason-err { width: 100%; font-size: 10px; color: var(--danger, #e05656); }
</style>
