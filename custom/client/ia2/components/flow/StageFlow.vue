<!-- overlay/custom/client/ia2/components/flow/StageFlow.vue -->
<!-- v12 运行画布 · 阶段流（动线③执行追踪）：①-⑤ 胶囊链——done ✓轮次 /
     run ◐ 当前（蓝描边加粗）/ todo 待进入。阶段名走 i18n（discovery→…）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LOOP_STAGE_ORDER } from '../../adapters/flow'

const props = defineProps<{
  stageIndex: number
  stageTotal?: number
  stageTone: 'done' | 'run' | 'err' | 'todo'
  /** 循环累计轮次（done 段 ✓N 与 run 段副注） */
  iterations?: number
}>()

const { t } = useI18n()
const CIRCLED = '①②③④⑤⑥⑦⑧⑨'

type Seg = { idx: number; tone: 'done' | 'run' | 'err' | 'todo' }

function segments(): Seg[] {
  const total = props.stageTotal ?? LOOP_STAGE_ORDER.length
  return Array.from({ length: total }, (_, i): Seg => ({
    idx: i,
    tone: i < props.stageIndex ? 'done' : i === props.stageIndex ? props.stageTone : 'todo',
  }))
}
</script>

<template>
  <div class="sf" data-testid="stage-flow">
    <template v-for="(seg, i) in segments()" :key="seg.idx">
      <button
        type="button"
        class="sf__node"
        :class="[`sf__node--${seg.tone}`, { 'sf__node--cur': seg.idx === stageIndex }]"
        :data-testid="`stage-node-${seg.idx}`"
        :title="t(`ia2.loop.stage.${LOOP_STAGE_ORDER[seg.idx]}`)"
      >
        <span class="sf__idx">{{ CIRCLED[seg.idx] ?? seg.idx + 1 }}</span>
        <span class="sf__name">{{ t(`ia2.loop.stage.${LOOP_STAGE_ORDER[seg.idx]}`) }}</span>
        <span v-if="seg.tone === 'done' && iterations" class="sf__round">✓</span>
        <span v-else-if="seg.tone === 'run'" class="sf__live">◐</span>
      </button>
      <span v-if="i < segments().length - 1" class="sf__arrow">→</span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.sf { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sf__node {
  display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px;
  border: 1px solid var(--border-color); border-radius: 13px;
  background: transparent; color: var(--text-secondary); font-size: 11px;
  font-family: inherit; cursor: default; white-space: nowrap;
}
.sf__node--done { border-color: var(--success); color: var(--success); }
.sf__node--run { border-color: var(--primary); color: var(--primary); font-weight: 700; box-shadow: 0 0 0 1px var(--primary); }
.sf__node--err { border-color: var(--error); color: var(--error); }
.sf__node--todo { color: var(--text-muted); }
.sf__idx { font-size: 11px; }
.sf__name { font-size: 11px; }
.sf__round { font-size: 10px; }
.sf__live { font-size: 10px; animation: sf-pulse 1.6s ease-in-out infinite; }
.sf__arrow { color: var(--text-muted); font-size: 10px; }
@keyframes sf-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}
</style>
