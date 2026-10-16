<script setup lang="ts">
// RACI 角标（定稿三·补）：卡/审批/消息的责任方带职能角标（需求分析AI 式）——「谁负责结果」永远可见（§2.2/§2.9）。
const props = defineProps<{
  role: string
  raci?: 'R' | 'A' | 'C' | 'I' | null
}>()

const RACI_DESC: Record<string, string> = {
  R: 'R 负责执行', A: 'A 最终负责（结果归此职）', C: 'C 被咨询', I: 'I 被知会',
}
const title = () => (props.raci && RACI_DESC[props.raci]) || ''
</script>

<template>
  <span
    class="sim-raci-badge"
    data-testid="sim-raci-badge"
    :title="title()"
  >{{ props.role }}{{ props.raci ? ` · ${props.raci}` : '' }}</span>
</template>

<style scoped>
.sim-raci-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #4c7fd0;
  background: rgba(76, 127, 208, 0.1);
  border: 1px solid rgba(76, 127, 208, 0.3);
  white-space: nowrap;
}
</style>
