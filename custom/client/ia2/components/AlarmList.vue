<!-- overlay/custom/client/ia2/components/AlarmList.vue -->
<!-- 熔断/停滞告警列表（P3 Task 5 源④）：render TriageEntry(kind='alarm') 子集，
     每条显示 loop 名 + 告警等级 + 已等待时长；点击 emit open（深链 /app/runs?loop=）。
     纯展示薄壳：数据来自 projectTriage 归一口，动作转发父层。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatDurationMs } from '@/custom/loop/runcenter/adapters/intervention'
import type { TriageEntry } from '../adapters/inbox-center'

defineProps<{
  /** 告警条目（调用方保证 kind='alarm'；组件内不再过滤） */
  entries: TriageEntry[]
}>()

const emit = defineEmits<{
  (e: 'open', entry: TriageEntry): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="alarm-list" data-alarm-list>
    <div class="alarm-list__head">{{ t('ia2.inbox.alarmHead') }}</div>
    <div v-if="entries.length === 0" class="alarm-list__empty">
      {{ t('ia2.inbox.alarmEmpty') }}
    </div>
    <ul v-else class="alarm-list__items">
      <li v-for="entry in entries" :key="entry.id">
        <button
          type="button"
          class="alarm-list__item"
          :class="{ 'alarm-list__item--escalated': entry.severity === 'high' }"
          :title="t('ia2.inbox.open')"
          @click="emit('open', entry)"
        >
          <span class="alarm-list__dot" aria-hidden="true" />
          <span class="alarm-list__name">{{ entry.title }}</span>
          <span class="alarm-list__wait">{{ entry.waitMs > 0 ? formatDurationMs(entry.waitMs) : '—' }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.alarm-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.alarm-list__head {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.alarm-list__empty {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.alarm-list__items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.alarm-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: var(--bg-card);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
  }
  &:focus-visible {
    outline: 2px solid var(--primary-color, var(--text-primary));
    outline-offset: -2px;
  }
}
.alarm-list__dot {
  flex: 0 0 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning, var(--color-warning, #f59e0b));
}
.alarm-list__item--escalated .alarm-list__dot {
  background: var(--error, var(--color-danger, #e11d48));
}
.alarm-list__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm-list__wait {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-variant-numeric: tabular-nums;
}
</style>
