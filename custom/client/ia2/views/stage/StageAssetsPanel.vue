<!-- ①搭建·环境与资产页签：密钥台账 + 应用资产规则 + 模型服务商（就地配置）。
     三个都是既有自足件；不在这里重复探测服务健康（运行监控在全流程推演）。 -->
<script setup lang="ts">
import KeyLedgerSection from '../gov/KeyLedgerSection.vue'
import GovRegistryRulesView from '../gov/GovRegistryRulesView.vue'
import GovModelProvidersSection from '../../components/gov/GovModelProvidersSection.vue'
</script>

<template>
  <div class="sap">
    <section class="sap__block">
      <h2 class="sap__h">密钥台账（不含密钥本体）</h2>
      <KeyLedgerSection />
    </section>
    <section class="sap__block">
      <h2 class="sap__h">应用资产与规则</h2>
      <GovRegistryRulesView />
    </section>
    <section class="sap__block">
      <h2 class="sap__h">模型服务商</h2>
      <GovModelProvidersSection />
    </section>
  </div>
</template>

<style scoped>
.sap { display: flex; flex-direction: column; gap: 12px; }
.sap__block { border: 1px solid var(--border-color); border-radius: 9px; padding: 12px 14px; }
.sap__h { margin: 0 0 10px; font-size: 13px; }
</style>
