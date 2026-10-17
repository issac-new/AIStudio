<!-- overlay/custom/client/ia2/views/sim/SimFlowStrip.vue -->
<!-- 运行流程条（内容减负批，2026-10-17）：原三张带说明的导览卡压缩为一行
     文字流程——启动准备 → 运行监控 → 运行复盘。只保留当前阶段高亮与直达，
     不再渲染每段说明，把首屏空间还给运行数据。术语按 2026-10-17 映射表：
     开轮→启动运行、收尾→复盘。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { stageContextQuery } from '../../nav-centers'

const route = useRoute()
const router = useRouter()

type StageKey = 'prepare' | 'monitor' | 'close'
interface Stage {
  key: StageKey
  title: string
  target: string // 路由名
  signs: string[] // 该段覆盖的签路由名（用于高亮判定）
}

const STAGES: ReadonlyArray<Stage> = [
  { key: 'prepare', title: '启动准备', target: 'ia2.simOrchestration', signs: ['ia2.simOrchestration', 'ia2.simSettings'] },
  { key: 'monitor', title: '运行监控', target: 'ia2.simSupervision', signs: ['ia2.simSupervision', 'ia2.simOps', 'ia2.simEvidence', 'ia2.sim'] },
  { key: 'close', title: '运行复盘', target: 'ia2.simTrace', signs: ['ia2.simTrace', 'ia2.simDelivery'] },
]

const currentStage = computed<StageKey | null>(() => {
  const name = String(route.name ?? '')
  return STAGES.find(s => s.signs.includes(name))?.key ?? null
})

function go(target: string): void {
  void router.push({ name: target, query: stageContextQuery(route.query.from) })
}
</script>

<template>
  <nav class="sfs" data-testid="sim-flow-strip" aria-label="运行流程">
    <span class="sfs__label">运行流程</span>
    <template v-for="(st, i) in STAGES" :key="st.key">
      <span v-if="i > 0" class="sfs__arrow" aria-hidden="true">→</span>
      <button
        type="button"
        class="sfs__stage"
        :class="{ 'sfs__stage--cur': currentStage === st.key }"
        :data-testid="`sim-flow-${st.key}`"
        :aria-current="currentStage === st.key ? 'step' : undefined"
        @click="go(st.target)"
      >{{ st.title }}</button>
    </template>
  </nav>
</template>

<style scoped lang="scss">
.sfs { display: flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 12px; }
.sfs__label { font-size: 11px; color: var(--text-muted); margin-right: 2px; }
.sfs__stage {
  border: none; background: transparent; color: var(--text-secondary);
  cursor: pointer; font-family: inherit; font-size: 12px; padding: 2px 6px; border-radius: 4px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
  &--cur { color: var(--accent-primary, var(--color-primary)); font-weight: 600; }
}
.sfs__arrow { color: var(--text-muted); font-size: 11px; }
</style>
