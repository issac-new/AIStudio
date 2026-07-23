<!-- overlay/custom/client/loop/components/LoopModal.vue -->
<!-- LoopModal — 循环工程全屏弹窗（位于 AI 协作中心顶栏下方，不遮挡注意力栏） -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import LoopSpineView from '@/custom/loop/views/LoopSpineView.vue'

const { t } = useI18n()
const store = useCockpitStore()

function onClose() {
  store.closeLoop()
}
</script>

<template>
  <div class="loop-modal" @click.self="onClose">
    <div class="loop-modal__panel" @click.stop>
      <div class="loop-modal__head">
        <span class="loop-modal__title">🔄 {{ t('loop.title') }}</span>
        <button class="loop-modal__close" @click="onClose">×</button>
      </div>
      <div class="loop-modal__body">
        <LoopSpineView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.loop-modal {
  position: fixed;
  /* TopBar (44px) + Attention bar (40px) + 12px gap — attention bar stays visible */
  top: 96px;
  left: 24px;
  right: 24px;
  bottom: 24px;
  z-index: 1001;
  display: flex;
}
.loop-modal__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--color-bg-primary));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
.loop-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.loop-modal__title { font-size: 14px; font-weight: 700; }
.loop-modal__close {
  width: 28px; height: 28px;
  border: none; border-radius: 6px;
  background: transparent; cursor: pointer;
  font-size: 18px; line-height: 1;
  color: var(--text-secondary);
}
.loop-modal__close:hover { background: var(--hover-bg); }
.loop-modal__body {
  flex: 1;
  overflow: auto;
}
</style>
