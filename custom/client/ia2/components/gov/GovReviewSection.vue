<!-- overlay/custom/client/ia2/components/gov/GovReviewSection.vue -->
<!-- v12 管理台 · 评审中心区（M-C）：待审清单（R/G 门聚合投影）+ 逐卡签核操作。
     数据单一事实源 = matrix-teams review-center store（delivery.gate 事件流）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReviewCenterStore } from '@/custom/matrix-teams/stores/review-center'
import GateReviewCard from '@/custom/matrix-teams/components/GateReviewCard.vue'

const { t } = useI18n()
const review = useReviewCenterStore()

const pending = computed(() => review.pendingReviews)
const settled = computed(() => review.reviewItems.filter(i => !i.pending))

function onSign(caseId: string, gate: string, payload: { verdict: 'pass' | 'reject'; reason?: string }): void {
  void review.sendVerdict({ caseId, gate, verdict: payload.verdict, reason: payload.reason })
}
</script>

<template>
  <div class="grs" data-testid="gov-review-section">
    <div class="grs__head">
      <span class="grs__title">{{ t('ia2.gov.review.title') }}</span>
      <span class="grs__sub">{{ t('ia2.gov.review.sub') }}</span>
    </div>
    <div class="grs__body">
      <div class="grs__card">
        <div class="grs__card-head">{{ t('ia2.gov.review.pending') }}</div>
        <div v-if="!pending.length" class="grs__empty">{{ t('ia2.gov.review.pendingEmpty') }}</div>
        <GateReviewCard
          v-for="item in pending" :key="`${item.caseId}:${item.gate}`"
          :case-id="item.caseId" :gate="item.gate" :verdict="item.verdict"
          :signoffs="item.signoffs" :reason="undefined" :evidence-summary="undefined"
          :pending="item.pending" :can-sign="item.isHumanGate"
          @sign="(p) => onSign(item.caseId, item.gate, p)"
        />
      </div>
      <div class="grs__card">
        <div class="grs__card-head">{{ t('ia2.gov.review.settled') }}</div>
        <div v-if="!settled.length" class="grs__empty">{{ t('ia2.gov.review.settledEmpty') }}</div>
        <div
          v-for="item in settled" :key="`${item.caseId}:${item.gate}`"
          class="grs__row" :data-testid="`gov-review-row-${item.caseId}-${item.gate}`"
        >
          <span class="grs__row-gate">{{ item.gate }}</span>
          <span class="grs__row-case">{{ item.caseId }}</span>
          <span class="grs__row-badge" :class="`grs__row-badge--${item.verdict === 'pass' ? 'pass' : 'reject'}`">
            {{ item.verdict === 'pass' ? t('ia2.review.state.pass') : t('ia2.review.state.reject') }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.grs { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.grs__head { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid var(--border-color); }
.grs__title { font-weight: 700; }
.grs__sub { font-size: 10px; color: var(--text-muted); }
.grs__body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.grs__card { border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
.grs__card-head { font-size: 10px; text-transform: uppercase; color: var(--text-muted); }
.grs__empty { padding: 8px 4px; color: var(--text-muted); font-size: 11px; }
.grs__row { display: flex; align-items: center; gap: 8px; padding: 5px 4px; }
.grs__row-gate { font-weight: 700; color: var(--text-primary); }
.grs__row-case { color: var(--text-muted); font-size: 11px; }
.grs__row-badge { margin-left: auto; padding: 1px 8px; border-radius: 8px; font-size: 10px; background: var(--bg-secondary); color: var(--text-secondary); }
.grs__row-badge--pass { background: var(--success); color: #fff; }
.grs__row-badge--reject { background: var(--error); color: #fff; }
</style>
