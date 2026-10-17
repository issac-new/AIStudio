<!-- overlay/custom/client/ia2/views/sim/SimOrchestrationView.vue -->
<!-- 场景编排执行器挂面（B9 工单，A8+D9——设计正本 §二 S5）：OrchestrateView
     整件迁入挂壳层（非第七签）；启动/续跑实际执行仍由 harness 侧承担（Q2 裁定
     一键启动维持 replan Phase C），preflight 十六项检视灯=端点未接挂账态如实。 -->
<script setup lang="ts">
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OrchestrationView from '../orchestration/OrchestrationView.vue'

const route = useRoute()
const router = useRouter()
const backQuery = computed<Record<string, string> | undefined>(() => {
  const q: Record<string, string> = {}
  for (const key of ['run', 'from'] as const) {
    const v = route.query[key]
    if (typeof v === 'string' && v) q[key] = v
  }
  return Object.keys(q).length ? q : undefined
})
</script>

<template>
  <div class="orc" data-testid="orc-page">
  <IaBreadcrumb />
  <TabIntroBanner tab="orchestration" />
    <header class="orc__head">
      <h2 class="orc__title">运行编排</h2>
      <button class="orc__back" type="button" data-testid="orc-back" @click="void router.push({ name: 'ia2.sim', query: backQuery })">返回全流程推演</button>
    </header>
    <p class="orc__note" data-testid="orc-preflight-absent">
      启动前的自动检查暂未接入本页；实际启动与续跑由 harness 执行。起跑前请在 harness 侧确认检查全绿。
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
