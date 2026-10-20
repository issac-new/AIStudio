<!-- overlay/custom/client/ia2/components/AttentionStrip.vue -->
<!-- 总览注意力条：收编 cockpit CockpitAttention 的 blocked/review/triage 梯队模型
     （归并逻辑在 adapters/overview.ts mergeAttention 纯函数，本组件纯展示）。
     2026-10-19 P1 降噪批（全页面走查 §四 P1-1）：条目多时不再把十来个 chip
     横排截断塞满首屏——只保留最高优先的前 3 条，其余收进「N 项待处理」入口，
     点开按梯队分组的抽屉；行点击直达对象，抽屉底部保留「打开看板」。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AttentionRow } from '../adapters/overview'

const MAX_INLINE = 3
const TIER_ORDER = ['blocked', 'review', 'triage'] as const
const TIER_LABEL: Record<AttentionRow['status'], string> = {
  blocked: 'ia2.overview.tierBlocked',
  review: 'ia2.overview.tierReview',
  triage: 'ia2.overview.tierTriage',
}

const props = defineProps<{ items: AttentionRow[] }>()

const emit = defineEmits<{
  (e: 'select', row: AttentionRow): void
  (e: 'open-board'): void
}>()

const i18nCtx = useI18n() as { t: (key: string) => string; locale?: { value?: string } }
const { t } = i18nCtx
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

/** 行内只留前 3 条（mergeAttention 已按优先级排序，前缀=最高优先）。 */
const inlineItems = computed(() => props.items.slice(0, MAX_INLINE))
const groups = computed(() =>
  TIER_ORDER
    .map(status => ({ status, label: t(TIER_LABEL[status]), rows: props.items.filter(r => r.status === status) }))
    .filter(g => g.rows.length > 0))
const summaryLabel = computed(() =>
  zh.value ? `${props.items.length} 项待处理` : `${props.items.length} pending`)

function pick(row: AttentionRow): void {
  open.value = false
  emit('select', row)
}

function openBoard(): void {
  open.value = false
  emit('open-board')
}

function onDocPointerDown(e: MouseEvent): void {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootEl" class="ia-attn" data-testid="ia-attn">
    <button
      type="button"
      class="ia-attn__label ia-attn__label--btn" data-testid="ia-attn-label"
      :title="t('ia2.overview.swarmKanbanHint')" @click="emit('open-board')" @dblclick="emit('open-board')"
      @keydown.enter="emit('open-board')"
    >{{ t('ia2.overview.swarmKanbanLabel') }}</button>

    <div class="ia-attn__items">
      <span v-if="items.length === 0" class="ia-attn__empty">{{ t('ia2.overview.attentionEmpty') }}</span>
      <button
        v-for="row in inlineItems"
        :key="row.id"
        type="button"
        class="ia-attn__item"
        :class="[`ia-attn__item--${row.status}`, `ia-attn__item--${row.severity}`]"
        :title="row.title"
        @click="emit('select', row)"
      >
        <span class="ia-attn__bar" />
        <span class="ia-attn__tier">{{ t(TIER_LABEL[row.status]) }}</span>
        <span class="ia-attn__text">{{ row.title }}</span>
      </button>
      <button
        v-if="items.length > 0"
        type="button"
        class="ia-attn__summary"
        :class="{ 'is-open': open }"
        data-testid="ia-attn-summary"
        :aria-expanded="open"
        @click="open = !open"
      >
        {{ summaryLabel }}<span class="ia-attn__caret" aria-hidden="true">▾</span>
      </button>
    </div>

    <div v-if="open" class="ia-attn__panel" data-testid="ia-attn-panel" role="dialog" :aria-label="summaryLabel">
      <div class="ia-attn__panel-head">
        <span>{{ zh ? '待处理事项' : 'Pending items' }}</span>
        <button type="button" class="ia-attn__panel-close" :aria-label="zh ? '关闭' : 'Close'" @click="open = false">✕</button>
      </div>
      <div class="ia-attn__panel-body">
        <div v-for="g in groups" :key="g.status" class="ia-attn__group" :data-testid="`ia-attn-group-${g.status}`">
          <div class="ia-attn__group-head">
            <span>{{ g.label }}</span>
            <span class="ia-attn__group-n">{{ g.rows.length }}</span>
          </div>
          <button
            v-for="row in g.rows"
            :key="row.id"
            type="button"
            class="ia-attn__row"
            :data-testid="`ia-attn-row-${row.id}`"
            @click="pick(row)"
          >
            <span class="ia-attn__row-dot" :class="`is-${row.severity}`" aria-hidden="true" />
            <span class="ia-attn__row-title">{{ row.title }}</span>
            <span class="ia-attn__row-go" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
      <div class="ia-attn__panel-foot">
        <button type="button" class="ia-attn__panel-board" data-testid="ia-attn-panel-board" @click="openBoard">
          {{ zh ? '打开看板' : 'Open board' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ia-attn { position: relative; display: flex; align-items: center; gap: 8px; }
.ia-attn__label {
  flex-shrink: 0; display: inline-flex; align-items: center;
  padding: 3px 10px; font-size: 11px; font-weight: 600;
  color: var(--text-primary); background: var(--bg-secondary, rgba(128, 128, 128, 0.1));
  border: 1px solid var(--border-color); border-radius: 6px;
  cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--accent-info); color: var(--accent-info); }
}
.ia-attn__items { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.ia-attn__tier { margin-inline-end: 6px; }

.ia-attn__summary {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px;
  border: 1px solid var(--border-color); border-radius: 12px;
  background: transparent; color: var(--text-secondary);
  font-size: 11px; font-family: inherit; cursor: pointer;
  &:hover, &.is-open { color: var(--text-primary); border-color: var(--accent-info); }
}
.ia-attn__caret { font-size: 9px; opacity: .7; }

.ia-attn__panel {
  position: absolute; top: calc(100% - 2px); right: 0; z-index: var(--ia-z-header-panel);
  width: min(460px, 72vw); max-height: 60vh;
  display: flex; flex-direction: column;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}
.ia-attn__panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border-color);
  font-size: 12px; font-weight: 600;
}
.ia-attn__panel-close {
  border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px;
  &:hover { color: var(--text-primary); }
}
.ia-attn__panel-body { overflow-y: auto; padding: 4px 0; }
.ia-attn__group-head {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px 2px; font-size: 10px; text-transform: uppercase;
  letter-spacing: .04em; color: var(--text-muted);
}
.ia-attn__group-n {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 15px; padding: 0 4px; border-radius: 8px;
  background: var(--hover-bg); font-size: 9px; color: var(--text-secondary);
}
.ia-attn__row {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; border: none; background: none;
  color: var(--text-primary); font-size: 12px; text-align: left; cursor: pointer;
  &:hover { background: var(--hover-bg); }
}
.ia-attn__row-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
.ia-attn__row-dot.is-high { background: var(--error); }
.ia-attn__row-dot.is-medium { background: var(--warning); }
.ia-attn__row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ia-attn__row-go { color: var(--text-muted); }
.ia-attn__panel-foot { padding: 8px 12px; border-top: 1px solid var(--border-color); }
.ia-attn__panel-board {
  border: 1px solid var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-secondary); font-size: 11px; padding: 4px 10px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
/* 窄屏：收起逐条 chip，只留总数入口，避免首行被截断文字占满 */
@media (max-width: 720px) {
  .ia-attn__item { display: none; }
  .ia-attn__empty { display: none; }
}
</style>
