<!-- 阶段页·质量门页签薄壳：按 gates 过滤修复单；空数组=全部。 -->
<script setup lang="ts">
import GateRepairsPanel from '../gov/GateRepairsPanel.vue'

withDefaults(defineProps<{ gates?: string[] }>(), { gates: () => [] })
</script>

<template>
  <GateRepairsPanel :gates="gates" />
</template>
