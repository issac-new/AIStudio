<script setup lang="ts">
// 介入卡（R5）：14 个人工介入点的统一待办卡——人形图标＋批准/打回双钮＋留痕。
// 留痕由消费方落账（approved.events 等），组件只发出动作与载荷。
export type InterventionSource = 'gate' | 'clearance' | 'approval' | 'uat'

const props = defineProps<{
  point: {
    id: string
    title: string
    evidenceAnchor?: string | null
    source: InterventionSource
  }
}>()

const emit = defineEmits<{
  approve: [payload: { id: string; evidenceAnchor?: string | null }]
  reject: [payload: { id: string; evidenceAnchor?: string | null }]
}>()

const SOURCE_LABEL: Record<InterventionSource, string> = {
  gate: '关卡',
  clearance: '清偿门',
  approval: '审批',
  uat: '验收',
}
</script>

<template>
  <div class="sim-interv" data-testid="sim-interv-card">
    <span class="sim-interv__icon" aria-label="等人决定" data-testid="sim-interv-icon">👤</span>
    <div class="sim-interv__body">
      <div class="sim-interv__title" data-testid="sim-interv-title">{{ props.point.title }}</div>
      <div class="sim-interv__meta">
        <span class="sim-interv__source" data-testid="sim-interv-source">{{ SOURCE_LABEL[props.point.source] }}</span>
        <span
          v-if="props.point.evidenceAnchor"
          class="sim-interv__anchor"
          data-testid="sim-interv-anchor"
          :title="props.point.evidenceAnchor"
        >依据 {{ props.point.evidenceAnchor }}</span>
        <span v-else class="sim-interv__anchor sim-interv__anchor--absent" data-testid="sim-interv-anchor-absent">缺依据锚</span>
      </div>
    </div>
    <div class="sim-interv__actions">
      <button
        class="sim-interv__btn sim-interv__btn--approve"
        data-testid="sim-interv-approve"
        type="button"
        @click="emit('approve', { id: props.point.id, evidenceAnchor: props.point.evidenceAnchor ?? null })"
      >批准</button>
      <button
        class="sim-interv__btn sim-interv__btn--reject"
        data-testid="sim-interv-reject"
        type="button"
        @click="emit('reject', { id: props.point.id, evidenceAnchor: props.point.evidenceAnchor ?? null })"
      >打回</button>
    </div>
  </div>
</template>

<style scoped>
.sim-interv {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid rgba(127, 127, 127, 0.3);
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.06);
}
.sim-interv__icon {
  font-size: 16px;
  line-height: 1.2;
}
.sim-interv__body {
  flex: 1;
  min-width: 0;
}
.sim-interv__title {
  font-size: 13px;
  font-weight: 600;
}
.sim-interv__meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
}
.sim-interv__source {
  color: #7ab0e8;
}
.sim-interv__anchor {
  font-family: ui-monospace, monospace;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sim-interv__anchor--absent {
  color: #d33;
}
.sim-interv__actions {
  display: flex;
  gap: 6px;
}
.sim-interv__btn {
  border-radius: 4px;
  border: 1px solid #555;
  background: none;
  color: #e8e8e8;
  padding: 3px 12px;
  cursor: pointer;
  font-size: 12px;
}
.sim-interv__btn--approve {
  border-color: #2e9e5b;
  color: #4fc07d;
}
.sim-interv__btn--reject {
  border-color: #b04040;
  color: #e07070;
}
</style>
