<!-- overlay/custom/client/ia2/views/sim/SimFlowStrip.vue -->
<!-- 使用动线条（U1 可用性批）：把六签串成「怎么用仿真中心」的三段流程——
     开轮准备 → 运行监控 → 收尾复盘。每段一句话说明+直达签；当前签所属段
     高亮（由路由推导，不猜运行状态）。回答用户「从哪开始、下一步去哪」。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

type StageKey = 'prepare' | 'monitor' | 'close'
interface Stage {
  key: StageKey
  title: string
  hint: string
  target: string // 路由名
  signs: string[] // 该段覆盖的签路由名（用于高亮判定）
}

const STAGES: ReadonlyArray<Stage> = [
  {
    key: 'prepare', title: '① 开轮准备', hint: '清偿门清零、编制核对、场景与姿态——准备就绪才开新轮',
    target: 'ia2.simOrchestration', signs: ['ia2.simOrchestration', 'ia2.simSettings'],
  },
  {
    key: 'monitor', title: '② 运行监控', hint: '开轮后盯这里：卡在哪、谁没动、服务是否健康',
    target: 'ia2.simSupervision', signs: ['ia2.simSupervision', 'ia2.simOps', 'ia2.simEvidence', 'ia2.sim'],
  },
  {
    key: 'close', title: '③ 收尾复盘', hint: '跑完对账：交付齐不齐、每条需求判了什么',
    target: 'ia2.simTrace', signs: ['ia2.simTrace', 'ia2.simDelivery'],
  },
]

const currentStage = computed<StageKey | null>(() => {
  const name = String(route.name ?? '')
  return STAGES.find(s => s.signs.includes(name))?.key ?? null
})

function go(target: string): void {
  void router.push({ name: target })
}
</script>

<template>
  <nav class="sfs" data-testid="sim-flow-strip" aria-label="仿真中心使用动线">
    <button
      v-for="st in STAGES"
      :key="st.key"
      type="button"
      class="sfs__stage"
      :class="{ 'sfs__stage--cur': currentStage === st.key }"
      :data-testid="`sim-flow-${st.key}`"
      @click="go(st.target)"
    >
      <span class="sfs__title">{{ st.title }}</span>
      <span class="sfs__hint">{{ st.hint }}</span>
    </button>
    <span class="sfs__arrow">→</span>
  </nav>
</template>

<style scoped lang="scss">
.sfs { display: flex; align-items: stretch; gap: 6px; flex-shrink: 0; }
.sfs__stage {
  display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer;
  padding: 6px 12px; min-width: 200px;
  &:hover { background: rgba(127, 127, 127, 0.08); }
}
.sfs__stage--cur {
  border-color: var(--accent-primary, var(--color-primary));
  background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 10%, transparent);
}
.sfs__title { font-size: 12px; font-weight: 600; }
.sfs__hint { font-size: 11px; color: var(--text-muted); text-align: left; }
.sfs__arrow { align-self: center; color: var(--text-muted); font-size: 14px; }
</style>
