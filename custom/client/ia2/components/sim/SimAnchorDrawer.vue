<script setup lang="ts">
// 锚点抽屉（R7）：全产品唯一反查交互——点任何数字/判词直达证据原文。
// 右滑出，宽 480px；证据原文与锚类型/锚号只读展示，跳转由消费方接锚处理。
const props = defineProps<{
  open: boolean
  title?: string
  anchorType?: 'event' | 'commit' | 'card' | 'room' | null
  anchorId?: string | null
  evidence?: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const ANCHOR_LABEL: Record<NonNullable<typeof props.anchorType>, string> = {
  event: '事件',
  commit: '提交',
  card: '卡',
  room: '房间',
}
</script>

<template>
  <div
    class="sim-anchor-drawer"
    :class="{ 'sim-anchor-drawer--open': props.open }"
    data-testid="sim-anchor-drawer"
    role="dialog"
    :aria-hidden="!props.open"
  >
    <div class="sim-anchor-drawer__head">
      <span class="sim-anchor-drawer__title" data-testid="sim-anchor-drawer-title">{{ props.title || '证据原文' }}</span>
      <button
        class="sim-anchor-drawer__close"
        data-testid="sim-anchor-drawer-close"
        type="button"
        @click="emit('close')"
      >关闭</button>
    </div>
    <div v-if="props.anchorType && props.anchorId" class="sim-anchor-drawer__anchor" data-testid="sim-anchor-drawer-anchor">
      {{ ANCHOR_LABEL[props.anchorType] }}锚：{{ props.anchorId }}
    </div>
    <div v-else class="sim-anchor-drawer__anchor sim-anchor-drawer__anchor--absent" data-testid="sim-anchor-drawer-anchor-absent">
      无锚（缺席如实呈现）
    </div>
    <pre class="sim-anchor-drawer__evidence" data-testid="sim-anchor-drawer-evidence">{{ props.evidence ?? '（证据原文缺席）' }}</pre>
  </div>
</template>

<style scoped>
.sim-anchor-drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 480px;
  box-sizing: border-box;
  padding: 12px 16px;
  background: #1d1f23;
  color: #e8e8e8;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
  transform: translateX(100%);
  transition: transform 0.2s ease;
  z-index: 60;
  overflow-y: auto;
}
.sim-anchor-drawer--open {
  transform: translateX(0);
}
.sim-anchor-drawer__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.sim-anchor-drawer__title {
  font-weight: 600;
}
.sim-anchor-drawer__close {
  background: none;
  border: 1px solid #555;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 2px 10px;
  cursor: pointer;
}
.sim-anchor-drawer__anchor {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  margin-bottom: 8px;
}
.sim-anchor-drawer__anchor--absent {
  color: #999;
}
.sim-anchor-drawer__evidence {
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  background: rgba(127, 127, 127, 0.12);
  border-radius: 6px;
  padding: 10px;
  margin: 0;
}
</style>
