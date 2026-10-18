<script setup lang="ts">
// 自动代处理紫标（N1）：紫色标记＋「不计入人工完成数」提示；对任何人不隐藏。
const props = defineProps<{
  count?: number | null
  label?: string
}>()
</script>

<template>
  <span
    class="sim-comp-tag"
    data-testid="sim-comp-tag"
    title="自动代处理不计入人工完成数"
  >{{ props.label || '自动代处理' }}{{ props.count == null ? '' : ` ${props.count}` }}</span>
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
