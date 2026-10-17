<!-- ⑥治理·度量检查页签：容量灯 + AI 产出质量 + 研发效能，一屏内按序排列。 -->
<script setup lang="ts">
import CapacityLampBanner from '../gov/CapacityLampBanner.vue'
import GovAiQualitySection from '../gov/GovAiQualitySection.vue'
import GovHarnessView from '../gov/GovHarnessView.vue'
</script>

<template>
  <div class="smp">
    <CapacityLampBanner />
    <GovAiQualitySection />
    <GovHarnessView />
  </div>
</template>

<style scoped>
.smp { display: flex; flex-direction: column; gap: 12px; }
</style>
