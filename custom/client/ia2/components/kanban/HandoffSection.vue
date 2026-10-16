<!-- overlay/custom/client/ia2/components/kanban/HandoffSection.vue -->
<!-- 交接区（A1，对账总表 B3「协作与知识+交接并入」）：交接语义面——四种交接
     类型×五种状态的含义与走向图例（正本=kanban/handoff.ts 常量，本组件只渲染
     不复制）。交接记录数据端点未建=如实标注待接线；IDE 侧交接卡
     （IdeHandoffCard）是既有交接执行面，此处给入口说明。 -->
<script setup lang="ts">
import { HANDOFF_TYPES, HANDOFF_STATES, HANDOFF_TYPE_LABEL, HANDOFF_STATE_LABEL, type HandoffType, type HandoffState } from '../../../kanban/handoff'

const TYPE_HINT: Record<HandoffType, string> = {
  environment_preparation: '环境未就绪交给执行侧准备（依赖装齐/端口让位）',
  runtime_context: '运行期上下文交接（会话/路径/变量移交给接手方）',
  clarification: '需求澄清件（问题清单回给提出方，答复后回流）',
  rerun_command: '重跑指令件（带参数的复跑命令交接）',
}
const STATE_HINT: Record<HandoffState, string> = {
  requested: '已发起，待接',
  delivered: '已送达接手方',
  completed: '已办结',
  blocked: '被阻（原因随件）',
  failed: '失败（原因随件）',
}
</script>

<template>
  <section class="hds" data-testid="hds-section">
    <h3 class="hds__title">交接</h3>
    <p class="hds__sub">
      交接=卡流转中「这块得交给另一侧」的显式记录：类型说清交什么，状态说清走到哪。
      执行面在 IDE 任务面板的交接卡（IdeHandoffCard）；语义正本=handoff.ts（本区只渲染）。
    </p>
    <div class="hds__grid">
      <div class="hds__box">
        <h4 class="hds__h">四种类型</h4>
        <ul class="hds__list">
          <li v-for="t in HANDOFF_TYPES" :key="t" :data-testid="`hds-type-${t}`" class="hds__row">
            <span class="hds__key">{{ HANDOFF_TYPE_LABEL[t] }}</span>
            <span class="hds__hint">{{ TYPE_HINT[t] }}</span>
          </li>
        </ul>
      </div>
      <div class="hds__box">
        <h4 class="hds__h">五种状态</h4>
        <ul class="hds__list">
          <li v-for="st in HANDOFF_STATES" :key="st" :data-testid="`hds-state-${st}`" class="hds__row">
            <span class="hds__key">{{ HANDOFF_STATE_LABEL[st] }}</span>
            <span class="hds__hint">{{ STATE_HINT[st] }}</span>
          </li>
        </ul>
      </div>
    </div>
    <p class="hds__absent" data-testid="hds-absent">交接记录列表数据端点未建（挂账项）——当前呈现语义面；端点就绪后此处接记录表。</p>
  </section>
</template>

<style scoped lang="scss">
.hds { display: flex; flex-direction: column; gap: 8px; }
.hds__title { margin: 0; font-size: 14px; font-weight: 600; }
.hds__sub { margin: 0; font-size: 12px; color: var(--text-muted, #878c99); line-height: 1.6; }
.hds__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.hds__box { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 8px 10px; }
.hds__h { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.hds__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.hds__row { display: flex; flex-direction: column; gap: 1px; }
.hds__key { font-size: 12px; font-weight: 500; }
.hds__hint { font-size: 11px; color: var(--text-muted, #878c99); }
.hds__absent { margin: 0; font-size: 11px; color: var(--text-muted, #878c99); border: 1px dashed var(--border-color, #e5e7eb); border-radius: 4px; padding: 4px 8px; }
</style>
