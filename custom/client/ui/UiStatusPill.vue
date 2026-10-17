// overlay/custom/client/ui/UiStatusPill.vue
// 共享状态徽章（批 B1）。消费 ui/status.ts 单一事实源：语义九态（STATUS_COLORS）
// 或流水线五态（--ia-* token）。视觉=「同族透明底 + 半透明边 + 语义色文字」，
// 与治理域批 A 状态章同形——全产品状态徽章从此一处定义。
// 用法：<UiStatusPill tone="fail" label="失败" /> 或 <UiStatusPill tone="review" />
// （无 label 时渲染缺省映射词）。
<script setup lang="ts">
import { computed } from 'vue'
import { toneColor, type UiTone } from './status'

const props = withDefaults(defineProps<{
  tone: UiTone
  label?: string
  /** 前置圆点（状态列表场景）；默认关（徽章场景） */
  dot?: boolean
}>(), { dot: false })

const DEFAULT_LABEL: Record<string, string> = {
  blocked: '受阻', triage: '待分诊', review: '待评审', todo: '待办',
  ok: '正常', warning: '注意', error: '错误', info: '信息', muted: '静默',
  fresh: '新鲜', stale: '停滞', fail: '失败', pass: '通过', compensated: '已代偿',
}

const color = computed(() => toneColor(props.tone))
const text = computed(() => props.label ?? DEFAULT_LABEL[props.tone] ?? props.tone)
</script>

<template>
  <span class="ui-status-pill" :data-tone="tone">
    <span v-if="dot" class="ui-status-pill__dot" />
    {{ text }}
  </span>
</template>

<style scoped>
.ui-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: var(--ia-fs-aux, 11px);
  line-height: 1.7;
  white-space: nowrap;
  color: v-bind(color);
  background: color-mix(in srgb, v-bind(color) 10%, transparent);
  border: 1px solid color-mix(in srgb, v-bind(color) 35%, transparent);
}
.ui-status-pill__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: v-bind(color);
  flex-shrink: 0;
}
</style>
