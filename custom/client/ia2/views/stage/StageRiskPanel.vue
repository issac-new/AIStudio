<!-- ④开发·风险与交接页签：容量水位 + 交接类型说明（既有两件合一屏）。 -->
<script setup lang="ts">
import CapacityLampBanner from '../gov/CapacityLampBanner.vue'
import HandoffSection from '../../components/kanban/HandoffSection.vue'
</script>

<template>
  <div class="srp">
    <CapacityLampBanner />
    <HandoffSection />
  </div>
</template>

<style scoped>
.srp { display: flex; flex-direction: column; gap: 12px; }
</style>
