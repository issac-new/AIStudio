// overlay/custom/client/ui/UiEmptyState.vue
// 共享空态基元（批 B1）。纯文本空态直接用 .ui-empty-state 类（ui.scss，零 import）；
// 需要「标题 + 提示 + 动作槽」分层时用本组件。视觉与类版一致，单一事实源在
// ui.scss——组件只做结构分层，不另起样式（除动作行间距）。
<script setup lang="ts">
withDefaults(defineProps<{
  /** 主文案（一行，说清"这里为什么是空的"） */
  title: string
  /** 辅助提示（可选，说清"下一步能做什么"） */
  hint?: string
  /** 可选图标字符（2026-10-23 走查批：页面级空态从孤悬文字升级为
   *  图标+标题+副文三层，紧凑档可不传保持单行形态） */
  icon?: string
  compact?: boolean
  boxed?: boolean
}>(), { hint: '', icon: '', compact: false, boxed: false })
</script>

<template>
  <div class="ui-empty-state" :class="{ 'ui-empty-state--compact': compact, 'ui-empty-state--boxed': boxed }">
    <div v-if="icon" class="ui-empty-state__icon" aria-hidden="true">{{ icon }}</div>
    <div class="ui-empty-state__title">{{ title }}</div>
    <div v-if="hint" class="ui-empty-state__hint">{{ hint }}</div>
    <div v-if="$slots.action" class="ui-empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.ui-empty-state__icon {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
}
.ui-empty-state--compact .ui-empty-state__icon { display: none; }
.ui-empty-state__title { color: var(--text-muted); }
.ui-empty-state__hint { color: var(--text-muted); opacity: 0.85; font-size: var(--ia-fs-aux, 11px); }
.ui-empty-state__action { margin-top: var(--ia-sp-2, 8px); display: flex; gap: var(--ia-sp-2, 8px); }
</style>
