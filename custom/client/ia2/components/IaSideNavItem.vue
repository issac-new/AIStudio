<!-- overlay/custom/client/ia2/components/IaSideNavItem.vue
     左侧栏统一行（2026-10-18 用户裁定）：常用/流程/整轮/专题/管理五组共用同一
     套行式——18px 前导槽（图标或 1-6 数字徽标）+ 标签 + 右侧槽（元信息/徽标/
     状态点）。行高、缩进、圆角、悬停与选中态一致，避免各组各长一样。 -->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** 前导槽内容：图标字符或阶段序号 */
  lead?: string
  /** number=数字徽标（流程组）；icon=普通图标槽 */
  leadKind?: 'icon' | 'number'
  label: string
  /** 右侧元信息（如快捷键、计数） */
  trail?: string
  /** 右侧数字徽标（如审批待办数） */
  badge?: number | string
  /** 右侧状态点（流程组） */
  status?: 'done' | 'current' | 'pending'
  /** 状态点的可访问说明（随语言） */
  statusLabel?: string
  active?: boolean
  testid?: string
  title?: string
}>(), {
  lead: '',
  leadKind: 'icon',
  trail: '',
  badge: '',
  status: undefined,
  statusLabel: '',
  active: false,
  testid: undefined,
  title: undefined,
})

const emit = defineEmits<{ (e: 'select'): void }>()

const statusGlyph = computed(() => {
  if (props.status === 'done') return '✓'
  if (props.status === 'current') return '●'
  return '○'
})
const statusTone = computed(() => props.status === 'done' ? 'done' : props.status === 'current' ? 'current' : 'pending')
</script>

<template>
  <button
    type="button"
    class="isn-item"
    :class="{ 'isn-item--active': active }"
    :data-testid="testid"
    :title="title"
    :aria-current="active ? 'page' : undefined"
    @click="emit('select')"
  >
    <span class="isn-item__lead" :class="{ 'isn-item__lead--number': leadKind === 'number' }">{{ lead }}</span>
    <span class="isn-item__label">{{ label }}</span>
    <span class="isn-item__trail">
      <span v-if="badge !== ''" class="isn-item__badge">{{ badge }}</span>
      <span v-else-if="status" class="isn-item__status" :class="`isn-item__status--${statusTone}`" :aria-label="statusLabel || undefined">
        {{ statusGlyph }}
      </span>
      <span v-else class="isn-item__meta" :title="trail">{{ trail }}</span>
    </span>
  </button>
</template>

<style scoped>
.isn-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.isn-item:hover { background: var(--bg-secondary); }
.isn-item:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.isn-item--active {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--accent-primary);
}
.isn-item__lead {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
}
.isn-item__lead--number {
  border: 1px solid var(--border-color);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.isn-item--active .isn-item__lead { color: var(--accent-primary); }
.isn-item--active .isn-item__lead--number { border-color: color-mix(in srgb, var(--accent-primary) 45%, var(--border-color)); }
.isn-item__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.isn-item__trail {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
  max-width: 94px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}
.isn-item__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11px;
}
.isn-item__badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--error);
  color: var(--text-on-accent);
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.isn-item__status {
  width: 14px;
  text-align: center;
  font-size: 11px;
  line-height: 1;
}
.isn-item__status--done { color: var(--ia-fresh); }
.isn-item__status--current { color: var(--ia-stale); }
.isn-item__status--pending { color: var(--text-muted); }
</style>
