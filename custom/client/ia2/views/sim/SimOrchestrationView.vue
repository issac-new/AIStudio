<!-- overlay/custom/client/ia2/views/sim/SimOrchestrationView.vue -->
<!-- 场景编排执行器挂面（B9 工单，A8+D9——设计正本 §二 S5）：OrchestrateView
     整件迁入挂壳层（非第七签）；启动/续跑实际执行仍由 harness 侧承担（Q2 裁定
     一键启动维持 replan Phase C），preflight 十六项检视灯=端点未接挂账态如实。 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import OrchestrationView from '../orchestration/OrchestrationView.vue'

const router = useRouter()
</script>

<template>
  <div class="orc" data-testid="orc-page">
    <header class="orc__head">
      <h2 class="orc__title">场景编排</h2>
      <button class="orc__back" type="button" data-testid="orc-back" @click="void router.push({ name: 'ia2.sim' })">返回仿真中心</button>
    </header>
    <p class="orc__note" data-testid="orc-preflight-absent">
      preflight 十六项检视灯=端点未接（挂账项，随 harness 产品化实装）；启动/续跑的实际执行由 harness 侧承担，本面承载编排与发起（Q2 裁定）。
    </p>
    <div class="orc__body">
      <OrchestrationView />
    </div>
  </div>
</template>

<style scoped lang="scss">
.orc { display: flex; flex-direction: column; gap: 10px; height: 100%; padding: 12px 16px; overflow: hidden; }
.orc__head { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.orc__title { margin: 0; font-size: 15px; }
.orc__back {
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.orc__note {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  flex-shrink: 0;
}
.orc__body { flex: 1; min-height: 0; overflow: auto; }
</style>
