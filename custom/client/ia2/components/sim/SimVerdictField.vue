<script setup lang="ts">
// 判词结构位（R3）：结论只认结构化字段渲染——正文提及不判定。
// 故意不接收 prose 参数：正文文字进不来，从接口上杜绝「从叙述猜判词」。
export type VerdictProvenance = 'agent' | 'human-role' | 'compensated'

const props = defineProps<{
  verdict?: { value: string; provenance?: VerdictProvenance } | null
  criteria?: string | null
}>()

const PROVENANCE_LABEL: Record<VerdictProvenance, string> = {
  agent: 'agent 判',
  'human-role': '人类角色判',
  compensated: '代偿代判',
}
</script>

<template>
  <span class="sim-verdict" data-testid="sim-verdict-field">
    <template v-if="props.verdict">
      <span class="sim-verdict__label">判词</span>
      <span class="sim-verdict__value" data-testid="sim-verdict-value">{{ props.verdict.value }}</span>
      <span
        v-if="props.verdict.provenance"
        class="sim-verdict__prov"
        :class="{ 'sim-verdict__prov--compensated': props.verdict.provenance === 'compensated' }"
        data-testid="sim-verdict-provenance"
      >{{ PROVENANCE_LABEL[props.verdict.provenance] }}</span>
    </template>
    <span v-else class="sim-verdict__absent" data-testid="sim-verdict-absent">无判定</span>
    <span
      v-if="props.criteria"
      class="sim-verdict__criteria"
      data-testid="sim-verdict-criteria"
      :title="props.criteria"
    >判据可查</span>
  </span>
</template>

<style scoped>
.sim-verdict {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}
.sim-verdict__label {
  color: #999;
}
.sim-verdict__value {
  font-weight: 600;
}
.sim-verdict__prov {
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(127, 127, 127, 0.15);
}
.sim-verdict__prov--compensated {
  color: #b98ee0;
  background: rgba(150, 84, 214, 0.18);
}
.sim-verdict__absent {
  color: #999;
}
.sim-verdict__criteria {
  color: #7ab0e8;
  text-decoration: underline dotted;
  cursor: help;
}
</style>
