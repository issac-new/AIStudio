<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

interface MenuItem {
  key: string
  label: string
  description?: string
  selected?: boolean
}
interface Props {
  items: MenuItem[]
  // 相对触发按钮的定位(top/right,px)
  top?: number
  right?: number
}
const props = withDefaults(defineProps<Props>(), { top: 40, right: 0 })
const emit = defineEmits<{ select: [key: string]; close: [] }>()

function onDocClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (!el.closest('.mx_ContextMenu')) emit('close')
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  // next click after open(避免触发 open 的那次 click 立即关闭)
  setTimeout(() => {
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKeyDown)
  }, 0)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div
    class="mx_ContextMenu"
    :style="{ top: top + 'px', right: right + 'px' }"
    role="menu"
  >
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      role="menuitemradio"
      :aria-checked="item.selected ? 'true' : 'false'"
      class="mx_ContextMenu_item"
      :class="{ selected: item.selected }"
      @click.stop="emit('select', item.key)"
    >
      <span v-if="item.selected" class="mx_ContextMenu_check" aria-hidden="true">✓</span>
      <span v-else class="mx_ContextMenu_check-spacer" aria-hidden="true" />
      <span class="mx_ContextMenu_item-label">
        <span class="mx_ContextMenu_item-title">{{ item.label }}</span>
        <span v-if="item.description" class="mx_ContextMenu_item-desc">{{ item.description }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.mx_ContextMenu {
  position: absolute;
  z-index: 1000;
  min-width: 200px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
}
.mx_ContextMenu_item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: start;
  &:hover {
    background: var(--bg-card-hover, rgba(0, 0, 0, 0.04));
  }
}
.mx_ContextMenu_check {
  color: var(--text-primary);
  font-size: 12px;
  margin-top: 2px;
}
.mx_ContextMenu_check-spacer {
  width: 12px;
  flex-shrink: 0;
}
.mx_ContextMenu_item-label {
  display: flex;
  flex-direction: column;
}
.mx_ContextMenu_item-title {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}
.mx_ContextMenu_item-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
</style>
