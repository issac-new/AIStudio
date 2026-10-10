<!-- overlay/custom/client/ia2/components/flow/AttentionList.vue -->
<!-- v13 右栏 · 需关注列表（attention 档）：受阻任务/失败运行/停滞循环。
     纯展示组件：行点击 emit open，装配在 WorkbenchView（useAttentionRows 单一
     装配，2026-10-03 裁决 B）。行模型=adapters/overview.AttentionRow（kind 五源 +
     status 三档）——2026-10-10 本体轮修：此前组件仍消费旧 activity.AttentionRow
     （subKey 字段），装配统一后 subKey 恒 undefined，vue-i18n t(undefined) 抛
     "Invalid arguments" 炸渲染链（blocked 数据一出现即触发）。现副文键按
     kind×status 组件内派生，t() 永不收 undefined。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatWaitAge } from '../../adapters/waiting'
import type { AttentionRow } from '../../adapters/overview'

defineProps<{
  rows: AttentionRow[]
  now?: number
}>()

const emit = defineEmits<{
  (e: 'open', row: AttentionRow): void
}>()

const { t } = useI18n()

/** 行首图标（五源固定词表） */
const ICON: Record<NonNullable<AttentionRow['kind']>, string> = {
  task: '⛔',
  loop: '🧱',
  run: '✖',
  fleet: '⏳',
  session: '💥',
}

/** 副文 i18n 键派生（kind × status；无组合走等我兜底键——t() 不收 undefined） */
const SUB_KEY: Record<string, string> = {
  'task:blocked': 'ia2.att.subTaskBlocked',
  'loop:blocked': 'ia2.att.subLoopStuck',
  'session:blocked': 'ia2.att.subSessionBlocked',
  'session:review': 'ia2.att.subSessionFailed',
  'run:review': 'ia2.wait.subRun',
  'task:review': 'ia2.wait.subReview',
  'fleet:review': 'ia2.wait.subFleet',
}

function subKeyOf(row: AttentionRow): string {
  return SUB_KEY[`${row.kind ?? 'task'}:${row.status}`] ?? 'ia2.wait.subReview'
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
      :class="`att__row--${row.severity}`"
      :data-testid="`att-${row.id}`"
      @click="emit('open', row)"
    >
      <span class="att__ico">{{ ICON[row.kind ?? 'task'] }}</span>
      <span class="att__txt">
        <span class="att__title">{{ row.title }}</span>
        <span class="att__sub">{{ t(subKeyOf(row)) }} {{ age(row.createdAt, now) }}</span>
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
.att__row--high { border-left-color: var(--error); }
.att__ico { flex-shrink: 0; font-size: 11px; }
.att__txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.att__title {
  font-size: 11px; color: var(--text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.att__sub { font-size: 10px; color: var(--text-muted); }
.att__empty { padding: 4px 6px; font-size: 10px; color: var(--text-muted); }
</style>
