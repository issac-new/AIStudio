<!-- overlay/custom/client/ia2/components/flow/AttentionList.vue -->
<!-- v13 右栏 · 需关注列表（attention 档）：multica 收件箱 severity 三档中的
     attention 层——受阻任务/失败运行/停滞循环。纯展示组件：行点击 emit open，
     装配与路由分派在 WorkbenchView。行形态对齐 WaitQueue（副文 i18n + 等待时长）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatWaitAge } from '../../adapters/waiting'
import type { AttentionRow } from '../../adapters/activity'

defineProps<{
  rows: AttentionRow[]
  now?: number
}>()

const emit = defineEmits<{
  (e: 'open', row: AttentionRow): void
}>()

const { t } = useI18n()

/** 行首图标（attention 三类的固定词表） */
const ICON: Record<AttentionRow['kind'], string> = {
  'task-blocked': '⛔',
  'run-failed': '✖',
  'loop-stuck': '🧱',
}

function age(ts: number, now?: number): string {
  const label = formatWaitAge((now ?? Date.now()) - ts)
  return label ? `· ${label}` : ''
}
</script>

<template>
  <div class="att" data-testid="attention-list">
    <button
      v-for="row in rows"
      :key="row.id"
      type="button"
      class="att__row"
      :class="`att__row--${row.kind}`"
      :data-testid="`att-${row.id}`"
      @click="emit('open', row)"
    >
      <span class="att__ico">{{ ICON[row.kind] }}</span>
      <span class="att__txt">
        <span class="att__title">{{ row.title }}</span>
        <span class="att__sub">{{ t(row.subKey) }} {{ age(row.ts, now) }}</span>
      </span>
    </button>
    <div v-if="!rows.length" class="att__empty" data-testid="att-empty">
      {{ t('ia2.att.empty') }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.att { display: flex; flex-direction: column; gap: 2px; }
.att__row {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 6px;
  border: none; border-left: 2px solid var(--warning); border-radius: 4px;
  background: transparent; cursor: pointer; text-align: left;
  &:hover { background: var(--bg-secondary); }
}
.att__row--run-failed, .att__row--loop-stuck { border-left-color: var(--error); }
.att__ico { flex-shrink: 0; font-size: 11px; }
.att__txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.att__title {
  font-size: 11px; color: var(--text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.att__sub { font-size: 10px; color: var(--text-muted); }
.att__empty { padding: 4px 6px; font-size: 10px; color: var(--text-muted); }
</style>
