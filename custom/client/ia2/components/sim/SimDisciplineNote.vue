<script setup lang="ts">
// 纪律提示位（N2）：执行纪律在界面上可感的部分，长在操作现场——
// 在制 ≤2 随卡列表、不许谎报随结论输入框、测试者≠写码者随缺陷单。
const props = defineProps<{
  kind: 'wip-limit' | 'no-false-report' | 'tester-not-author'
  wip?: number
  limit?: number
}>()

const SENTENCE: Record<typeof props.kind, string> = {
  'wip-limit': '在制不超上限',
  'no-false-report': '不许谎报：未跑的如实写未跑',
  'tester-not-author': '测试者≠写码者',
}

const overLimit = props.kind === 'wip-limit' && props.wip != null && (props.limit ?? 2) < props.wip
</script>

<template>
  <span
    class="sim-disc"
    :class="{ 'sim-disc--over': overLimit }"
    data-testid="sim-disc-note"
  >{{
    kind === 'wip-limit' && wip != null
      ? `在制 ${wip}/≤${limit ?? 2}`
      : SENTENCE[kind]
  }}</span>
</template>

<style scoped>
.sim-disc {
  font-size: 12px;
  color: #999;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(127, 127, 127, 0.1);
}
.sim-disc--over {
  color: #d33;
  background: rgba(221, 51, 51, 0.12);
}
</style>
