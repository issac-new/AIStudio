<!-- overlay/custom/client/ia2/components/flow/TaskFeed.vue -->
<!-- v12 右栏 · 任务动态：循环事件 ∪ 运行尾部 ∪ 任务时戳混合流（倒序）。
     文案经 FeedRow.key + params 走 t()，行内不自算。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { FeedRow } from '../../adapters/flow'

defineProps<{ rows: Array<FeedRow & { time?: string }> }>()

const { t } = useI18n()

const ICON: Record<string, string> = { run: '▶', gate: '⧖', task: '📋', sys: '·' }
</script>

<template>
  <div class="tf" data-testid="tdp-feed">
    <div v-if="!rows.length" class="tf__empty">{{ t('ia2.tdp.feedEmpty') }}</div>
    <div v-for="r in rows" :key="r.id" class="tf__row" :data-testid="`tdp-feed-${r.id}`">
      <span class="tf__icon" :class="`tf__icon--${r.icon}`">{{ ICON[r.icon] ?? '·' }}</span>
      <span class="tf__text">{{ t(r.key, r.params ?? {}) }}</span>
      <span v-if="r.time" class="tf__time">{{ r.time }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tf { display: flex; flex-direction: column; gap: 1px; }
.tf__empty { padding: 8px 4px; font-size: 11px; color: var(--text-muted); }
.tf__row {
  display: flex; align-items: baseline; gap: 6px; padding: 3px 4px;
  font-size: 10.5px; color: var(--text-secondary);
}
.tf__icon { flex-shrink: 0; font-size: 10px; }
.tf__icon--gate { color: var(--warning); }
.tf__icon--run { color: var(--info); }
.tf__icon--task { color: var(--text-muted); }
.tf__text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf__time { flex-shrink: 0; font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
</style>
