<!-- ①搭建·环境与资产页签：密钥台账 + 应用资产规则 + 模型服务商入口。
     三个都是既有自足件；不在这里重复探测服务健康（运行监控在全流程推演）。 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import KeyLedgerSection from '../gov/KeyLedgerSection.vue'
import GovRegistryRulesView from '../gov/GovRegistryRulesView.vue'

const router = useRouter()
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
    <p class="sap__foot">
      模型服务商配置在单独页面维护。
      <button type="button" class="sap__link" @click="router.push({ name: 'ia2.modelProviders' })">打开模型服务商 →</button>
    </p>
  </div>
</template>

<style scoped>
.sap { display: flex; flex-direction: column; gap: 12px; }
.sap__block { border: 1px solid var(--border-color); border-radius: 9px; padding: 12px 14px; }
.sap__h { margin: 0 0 10px; font-size: 13px; }
.sap__foot { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.sap__link { border: 0; background: transparent; padding: 0; font-family: inherit; font-size: 12px; color: var(--accent-primary); cursor: pointer; }
</style>
