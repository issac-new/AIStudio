<script setup lang="ts">
// 步境标（定稿三·补）：每张卡/会话/待办带「幕·步」角标——任何内容可追溯到 26 步主链位置（§2.9/§3.3）。
const props = defineProps<{
  act?: number | null
  step?: number | null
}>()

// 七幕名（§2.9 七幕分组表），act 为 1-7。
const ACT_NAMES = [
  '序幕搭台', '第一幕上锁', '第二幕分析', '第三幕设计排期',
  '第四幕生产', '第五幕发布验收', '尾声复盘交付',
]
const actName = () => {
  const i = Number(props.act)
  return i >= 1 && i <= ACT_NAMES.length ? ACT_NAMES[i - 1]! : null
}
</script>

<template>
  <span
    v-if="props.act != null || props.step != null"
    class="sim-step-badge"
    data-testid="sim-step-badge"
  >{{ actName() ? `${actName()}${props.step != null ? ` · 步 ${props.step}` : ''}` : (props.step != null ? `步 ${props.step}` : '') }}</span>
</template>

<style scoped>
.sim-step-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #8b93a3;
  background: rgba(139, 147, 163, 0.12);
  border: 1px solid rgba(139, 147, 163, 0.3);
  white-space: nowrap;
}
</style>
