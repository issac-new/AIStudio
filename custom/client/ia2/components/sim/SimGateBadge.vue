<script setup lang="ts">
// 闸全名徽（定稿三·补）：闸相关界面一律全名首现（G1 需求冻结…G6 复盘，§5.3）；
// 徽标=状态色+首过/打回次数；provenance 标注判词来源（代偿代判=紫，§2.6.5）。
const props = defineProps<{
  gate: string
  status?: 'pass' | 'fail' | 'pending' | 'unknown'
  firstPass?: boolean
  rejectCount?: number | null
  provenance?: 'agent' | 'human-sim' | 'compensated' | null
}>()

const GATE_NAMES: Record<string, string> = {
  G1: 'G1 需求冻结', G2: 'G2 架构评审', G3: 'G3 代码门禁',
  G4: 'G4 独立验证', G5: 'G5 发布准出', G6: 'G6 复盘', UAT: 'UAT 验收',
}
const fullName = () => GATE_NAMES[props.gate?.toUpperCase?.() ?? ''] ?? props.gate
const PROV: Record<string, { text: string; cls: string }> = {
  'agent': { text: 'agent 判', cls: 'prov' },
  'human-sim': { text: '人类角色模拟', cls: 'prov' },
  'compensated': { text: '代偿代判', cls: 'prov prov-comp' },
}
</script>

<template>
  <span class="sim-gate-badge" data-testid="sim-gate-badge">
    <span class="gate-name" :class="props.status ?? 'unknown'">{{ fullName() }}</span>
    <span v-if="props.firstPass" class="first-pass" data-testid="sim-gate-first">首过</span>
    <span v-if="props.rejectCount != null && props.rejectCount > 0" class="reject" data-testid="sim-gate-reject">打回 {{ props.rejectCount }}</span>
    <span v-if="props.provenance && PROV[props.provenance]" :class="PROV[props.provenance]!.cls" data-testid="sim-gate-prov">{{ PROV[props.provenance]!.text }}</span>
  </span>
</template>

<style scoped>
.sim-gate-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
}
.gate-name { font-weight: 500; }
.gate-name.pass { color: var(--ia-pass); }
.gate-name.fail { color: var(--error); }
.gate-name.pending { color: var(--ia-stale); }
.gate-name.unknown { color: var(--text-muted); }
.first-pass {
  padding: 0 5px; border-radius: 4px; font-size: 10px;
  color: var(--ia-pass); background: rgba(18, 161, 80, 0.12);
  border: 1px solid rgba(18, 161, 80, 0.35);
}
.reject {
  padding: 0 5px; border-radius: 4px; font-size: 10px;
  color: var(--error); background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.3);
}
.prov {
  padding: 0 5px; border-radius: 4px; font-size: 10px;
  color: var(--text-muted); background: rgba(139, 147, 163, 0.12);
}
.prov-comp {
  color: var(--ia-compensated); background: rgba(150, 84, 214, 0.18);
  border: 1px solid rgba(150, 84, 214, 0.45);
}
</style>
