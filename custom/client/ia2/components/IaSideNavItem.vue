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
  /** 右侧状态点（流程组）：红黄绿交通灯（2026-10-22 用户裁定，二轮去棕改灯胆）——
   *  绿✓=已完成、黄灯胆=进行中、红灯胆=有阻塞、灰○=未开始 */
  status?: 'done' | 'current' | 'pending' | 'blocked'
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

/** 徽标展示文本：>99 封顶「99+」，防三位数撑爆 18px 行槽（2026-10-22 待办徽标轮） */
const badgeText = computed(() => {
  const n = typeof props.badge === 'number' ? props.badge : Number(props.badge)
  return Number.isFinite(n) && n > 99 ? '99+' : String(props.badge)
})

const statusGlyph = computed(() => {
  if (props.status === 'done') return '✓'
  if (props.status === 'pending') return '○'
  // current/blocked＝实心灯胆：视觉由 CSS 提供（文字型黄色在浅底无合格对比度）
  return ''
})
const statusTone = computed(() =>
  props.status === 'done' ? 'done'
    : props.status === 'current' ? 'current'
      : props.status === 'blocked' ? 'blocked' : 'pending')
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
      <!-- 2026-10-22 待办徽标轮：徽标与状态点共存（阶段③④既显示在办数也保留
           当前阶段状态点），元信息槽只在两者都缺席时显示 -->
      <span v-if="badge !== ''" class="isn-item__badge">{{ badgeText }}</span>
      <span v-if="status" class="isn-item__status" :class="`isn-item__status--${statusTone}`" :aria-label="statusLabel || undefined">
        {{ statusGlyph }}
      </span>
      <span v-if="badge === '' && !status" class="isn-item__meta" :title="trail">{{ trail }}</span>
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
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
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
/* 徽标走「淡底+语义字色」而非实心红：整列三项实心红会把导航压成告警墙，
   计数仍可读但不抢标题层级（2026-10-24 全页视觉走查）。 */
.isn-item__badge {
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--error) 14%, transparent);
  color: var(--error);
  font-size: 10.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
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
/* 交通灯（2026-10-22 用户两轮裁定：红黄绿＋「不要棕色」）：绿✓=完成（文本色，
   合格对比度）；黄/红＝实心圆灯胆（灯胆 token 单一源 ia2.scss，不随主题反转——
   自发光图形；内描环保证浅底可见）。黄色作文本色在浅底无 ≥4.5:1 合格值，
   实心灯胆是交通灯的正确形态。 */
.isn-item__status--done { color: var(--ia-fresh); }
.isn-item__status--current,
.isn-item__status--blocked {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.isn-item__status--current { background: var(--ia-warn-lamp); box-shadow: inset 0 0 0 1px rgba(66, 44, 0, 0.35); }
.isn-item__status--blocked { background: var(--ia-fail-lamp); box-shadow: inset 0 0 0 1px rgba(82, 0, 0, 0.28); }
.isn-item__status--pending { color: var(--text-muted); }
</style>
