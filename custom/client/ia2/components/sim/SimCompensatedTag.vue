<script setup lang="ts">
// 代偿紫标（N1）：代偿相关内容紫色标记＋「净额口径不计入」提示；对任何人不隐藏。
const props = defineProps<{
  count?: number | null
  label?: string
}>()
</script>

<template>
  <span
    class="sim-comp-tag"
    data-testid="sim-comp-tag"
    title="净额口径不计入"
  >{{ props.label || '代偿' }}{{ props.count == null ? '' : ` ${props.count}` }}</span>
</template>

<style scoped>
.sim-comp-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--ia-compensated);
  background: rgba(150, 84, 214, 0.18);
  border: 1px solid rgba(150, 84, 214, 0.45);
}
</style>
