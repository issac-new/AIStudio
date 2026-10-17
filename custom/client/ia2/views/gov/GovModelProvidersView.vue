<!-- overlay/custom/client/ia2/views/gov/GovModelProvidersView.vue -->
<!-- D20 模型服务商页（治理·系统设置 资产域路由页）：平铺承载
     GovModelProvidersSection（表单与 IDE 引擎目录同源同端点）。 -->
<script setup lang="ts">
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import GovModelProvidersSection from '../../components/gov/GovModelProvidersSection.vue'
</script>

<template>
  <div class="gmpv" data-testid="gmpv-page">
  <TabIntroBanner tab="model-providers" />
    <header class="gmpv__head">
      <h2 class="gmpv__title">设置 · 模型服务商</h2>
    </header>
    <GovModelProvidersSection />
  </div>
</template>

<style scoped>
.gmpv { display: flex; flex-direction: column; gap: 12px; padding: 16px 24px; height: 100%; overflow: auto; }
.gmpv__title { margin: 0; font-size: 15px; }
</style>
