<script setup lang="ts">
// 介入卡（R5）：14 个人工介入点的统一待办卡——人形图标＋批准/打回双钮＋留痕。
// 留痕由消费方落账（approved.events 等），组件只发出动作与载荷。
// 2026-10-16 三篇调研轮 A 件两修：
// ①对齐端点真实形状（sourceKind 五类）——原卡片读 point.source 恒空的接线缺陷修复；
// ②新增决策前提行 belief（麦肯锡「what you'd have to believe」：批准前必须成立的前提，
//   服务端静态登记自方案判据与事故锚；旧后端缺席=如实显示缺席不硬凑）。
export type InterventionSource = 'gate' | 'clearance' | 'approval' | 'uat' | 'registry'

const props = defineProps<{
  point: {
    id: string
    title: string
    sourceKind: InterventionSource
    sourceKey?: string
    belief?: string | null
    evidenceAnchor?: string | null
    pending?: boolean | null
  }
}>()

const emit = defineEmits<{
  approve: [payload: { id: string; belief?: string | null; evidenceAnchor?: string | null }]
  reject: [payload: { id: string; belief?: string | null; evidenceAnchor?: string | null }]
}>()

const SOURCE_LABEL: Record<InterventionSource, string> = {
  gate: '关卡',
  clearance: '遗留项清算',
  approval: '审批',
  uat: '验收',
  registry: '登记',
}

function actPayload(): { id: string; belief?: string | null; evidenceAnchor?: string | null } {
  return { id: props.point.id, belief: props.point.belief ?? null, evidenceAnchor: props.point.evidenceAnchor ?? null }
}
</script>

<template>
  <div class="sim-interv" data-testid="sim-interv-card">
    <span class="sim-interv__icon" aria-label="等人决定" data-testid="sim-interv-icon">👤</span>
    <div class="sim-interv__body">
      <div class="sim-interv__title" data-testid="sim-interv-title">{{ props.point.title }}</div>
      <div
        v-if="props.point.belief"
        class="sim-interv__belief"
        data-testid="sim-interv-belief"
      >须先确认：{{ props.point.belief }}</div>
      <div
        v-else
        class="sim-interv__belief sim-interv__belief--absent"
        data-testid="sim-interv-belief-absent"
      >缺决策前提（旧后端未供）</div>
      <div class="sim-interv__meta">
        <span class="sim-interv__source" data-testid="sim-interv-source">{{ SOURCE_LABEL[props.point.sourceKind] }}</span>
        <span
          v-if="props.point.evidenceAnchor"
          class="sim-interv__anchor"
          data-testid="sim-interv-anchor"
          :title="props.point.evidenceAnchor"
        >依据 {{ props.point.evidenceAnchor }}</span>
        <span
          v-else-if="props.point.sourceKey"
          class="sim-interv__anchor"
          data-testid="sim-interv-key"
          :title="props.point.sourceKey"
        >键 {{ props.point.sourceKey }}</span>
        <span v-else class="sim-interv__anchor sim-interv__anchor--absent" data-testid="sim-interv-anchor-absent">缺依据锚</span>
      </div>
    </div>
    <div class="sim-interv__actions">
      <button
        class="sim-interv__btn sim-interv__btn--approve"
        data-testid="sim-interv-approve"
        type="button"
        @click="emit('approve', actPayload())"
      >批准</button>
      <button
        class="sim-interv__btn sim-interv__btn--reject"
        data-testid="sim-interv-reject"
        type="button"
        @click="emit('reject', actPayload())"
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
.sim-interv__belief {
  margin-top: 3px;
  padding: 2px 6px;
  border-left: 3px solid var(--ia-stale);
  background: rgba(217, 164, 65, 0.08);
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  color: var(--ia-stale);
}
.sim-interv__belief--absent {
  border-left-color: rgba(127, 127, 127, 0.4);
  background: none;
  color: var(--text-muted);
}
.sim-interv__meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
}
.sim-interv__source {
  color: var(--accent-info);
}
.sim-interv__anchor {
  font-family: ui-monospace, monospace;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sim-interv__anchor--absent {
  color: var(--ia-fail);
}
.sim-interv__actions {
  display: flex;
  gap: 6px;
}
.sim-interv__btn {
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: none;
  color: var(--text-primary);
  padding: 3px 12px;
  cursor: pointer;
  font-size: 12px;
}
.sim-interv__btn--approve {
  border-color: var(--ia-fresh);
  color: var(--success);
}
.sim-interv__btn--reject {
  border-color: var(--error);
  color: var(--ia-fail);
}
</style>
