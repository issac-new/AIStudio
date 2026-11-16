<!-- overlay/custom/client/ide/components/IdePanelShell.vue
     会话头部弹窗/面板统一外壳（2026-11-16 工具栏清晰化批）：
     - dialog 变体：遮罩 + 居中面板（统一宽度/标题栏/关闭/Esc）
     - panel 变体：停靠面板的统一标题条（不动物理停靠布局）
     - Esc：模块级开窗栈（后开先关，只关栈顶）＋ IME 守卫（isComposing/keyCode 229 不关）
     业务内容一律走 default 插槽；计数/状态走 tools 插槽。 -->
<script lang="ts">
// 模块级 Esc 开窗栈（终审 IMPORTANT 3）：所有挂载的 shell 共享一份栈，后开先关、
// 一次 Esc 只关栈顶——避免多层同开一次 Esc 全关，连坐清掉对照分屏选中态/侧问草稿。
// <script setup> 顶层是每实例执行，模块级状态必须放本块。
const escStack: symbol[] = []
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

withDefaults(defineProps<{
  title: string
  variant?: 'dialog' | 'panel'
  testid?: string
}>(), { variant: 'panel', testid: undefined })

const emit = defineEmits<{ (e: 'close'): void }>()

// 本实例的栈身份；listener 只在本实例是栈顶时放行 close。
const escToken = Symbol('ide-panel-shell-esc')

function onKeydown(e: KeyboardEvent): void {
  // IME 组词中的 Esc 是「取消候选词」不是关面板；Safari 老版不置 isComposing，退回 keyCode 229。
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'Escape' && escStack[escStack.length - 1] === escToken) emit('close')
}
onMounted(() => {
  escStack.push(escToken)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  const i = escStack.indexOf(escToken)
  if (i >= 0) escStack.splice(i, 1)
})
</script>

<template>
  <div v-if="variant === 'dialog'" :class="['ide-panel-shell', 'ide-panel-shell--dialog']" :data-testid="testid" role="dialog" :aria-label="title">
    <div class="ide-panel-shell__mask" @click="emit('close')" />
    <div class="ide-panel-shell__panel">
      <header class="ide-panel-shell__head">
        <span class="ide-panel-shell__title" data-testid="ide-panel-shell-title">{{ title }}</span>
        <span class="ide-panel-shell__tools"><slot name="tools" /></span>
        <button
          type="button" class="ide-panel-shell__close" data-testid="ide-panel-shell-close"
          aria-label="关闭" @click="emit('close')"
        >✕</button>
      </header>
      <div class="ide-panel-shell__body"><slot /></div>
    </div>
  </div>
  <div v-else :class="['ide-panel-shell', 'ide-panel-shell--panel']" :data-testid="testid">
    <header class="ide-panel-shell__head">
      <span class="ide-panel-shell__title" data-testid="ide-panel-shell-title">{{ title }}</span>
      <span class="ide-panel-shell__tools"><slot name="tools" /></span>
      <button
        type="button" class="ide-panel-shell__close" data-testid="ide-panel-shell-close"
        aria-label="关闭" @click="emit('close')"
      >✕</button>
    </header>
    <div class="ide-panel-shell__body"><slot /></div>
  </div>
</template>

<style scoped>
/* z 层单一事实源（终审 IMPORTANT 2）：60=浮窗（Btw/BgTasks/FindInSession 等后挂浮窗同层，
   同值按 DOM 序会画在遮罩上）、400=模态——必须压过既有 chrome（splitter 100/colhead 95/
   briefing 90）与全部 z-60 浮窗，模态语义才成立。改层先对齐 IdeShell.vue 的 chrome 层表。 */
.ide-panel-shell--dialog {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ide-panel-shell__mask {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 45%);
}
.ide-panel-shell__panel {
  position: relative;
  width: min(560px, calc(100vw - 48px));
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 8px);
  background: var(--bg-card, var(--color-bg-default));
  box-shadow: 0 12px 32px rgb(0 0 0 / 25%);
}
.ide-panel-shell--panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ide-panel-shell__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-primary);
  flex: none;
}
.ide-panel-shell__title {
  font-weight: 600;
}
.ide-panel-shell__tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--text-secondary);
}
.ide-panel-shell__close {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 7px;
}
.ide-panel-shell__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
}
</style>
