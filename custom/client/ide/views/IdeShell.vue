<script setup lang="ts">
// IdeShell — IDE 工作台主页面壳（/ide，fullscreen 自带壳）。
//
// 三列布局（zcode/Codex 形态）：
//   IdeNavRail（活动栏） | 工作区列（IdeWorkspacePane + IdeTerminalPanel）
//   | 会话列（IdeChatPane）
// 加 IdeTopBar / IdeStatusBar；RunTrace 弹窗复用 cockpit 组件（经
// cockpitStore.openRunTrace 打开，store 惰性创建无重初始化成本）。
//
// 纪律：不嵌入 ChatPanel 整面板（自带会话侧栏，嵌套导航）；消息面
// 经 IdeChatPane 复用其子组件（MessageList/ChatInput/SubagentStreamPanel）。
import { computed, onUnmounted } from 'vue'
import { useIdeStore } from '../store/ide'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import IdeTopBar from './IdeTopBar.vue'
import IdeNavRail from './IdeNavRail.vue'
import IdeWorkspacePane from './IdeWorkspacePane.vue'
import IdeTerminalPanel from './IdeTerminalPanel.vue'
import IdeChatPane from './IdeChatPane.vue'
import IdeStatusBar from './IdeStatusBar.vue'
import IdeCommandPalette from '../components/IdeCommandPalette.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'

const ide = useIdeStore()
const cockpitStore = useCockpitStore()

// 命令面板快捷键：Cmd/Ctrl+K 开关（对标 zcode quickPick；终端面板聚焦时
// xterm 可能吞键，面板入口在 TopBar 同步提供）。
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ide.togglePalette()
  }
}
window.addEventListener('keydown', onGlobalKeydown)
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

const chatColumnStyle = computed(() => ({
  width: `${ide.layout.chatVisible ? ide.layout.chatWidth : 0}px`,
}))

const terminalPanelStyle = computed(() => ({
  height: `${ide.layout.terminalHeight}px`,
}))

// 会话列宽度拖拽（右缘把手）。stop 闭包按次独立：共享单变量会让同把手
// 第二次 pointerdown 覆写清理函数，第一套 pointermove 监听永久残留
// （2026-09-17 评审）。卸载时兜底拆除。
let chatDragStop: (() => void) | null = null
function startChatResize(event: PointerEvent) {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = ide.layout.chatWidth
  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  const onMove = (moveEvent: PointerEvent) => {
    // 右侧列：向左拖增宽
    const width = startWidth + (startX - moveEvent.clientX)
    ide.layout.chatWidth = Math.min(720, Math.max(320, width))
  }
  const stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
    if (chatDragStop === stop) chatDragStop = null
  }
  const onUp = () => stop()
  chatDragStop = stop
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

// 终端面板高度拖拽（上缘把手）。stop 闭包按次独立（同 startChatResize）。
let terminalDragStop: (() => void) | null = null
function startTerminalResize(event: PointerEvent) {
  event.preventDefault()
  const startY = event.clientY
  const startHeight = ide.layout.terminalHeight
  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  const onMove = (moveEvent: PointerEvent) => {
    // 底部面板：向上拖增高
    const height = startHeight + (startY - moveEvent.clientY)
    ide.layout.terminalHeight = Math.min(640, Math.max(140, height))
  }
  const stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
    if (terminalDragStop === stop) terminalDragStop = null
  }
  const onUp = () => stop()
  terminalDragStop = stop
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

onUnmounted(() => {
  chatDragStop?.()
  terminalDragStop?.()
})
</script>

<template>
  <div class="ide-shell">
    <IdeTopBar />
    <div class="ide-shell__main">
      <IdeNavRail />
      <div v-show="ide.layout.workspaceVisible" class="ide-shell__workspace">
        <IdeWorkspacePane class="ide-shell__workspace-main" />
        <div
          v-if="ide.layout.terminalOpen"
          class="ide-shell__terminal"
          :style="terminalPanelStyle"
        >
          <div class="ide-shell__terminal-handle" @pointerdown="startTerminalResize" />
          <IdeTerminalPanel class="ide-shell__terminal-body" />
        </div>
      </div>
      <div v-if="ide.layout.chatVisible" class="ide-shell__chat" :style="chatColumnStyle">
        <div class="ide-shell__chat-handle" @pointerdown="startChatResize" />
        <IdeChatPane class="ide-shell__chat-body" />
      </div>
    </div>
    <IdeStatusBar />
    <CockpitRunTraceModal />
    <IdeCommandPalette />
  </div>
</template>

<style scoped lang="scss">
.ide-shell {
  height: calc(100 * var(--vh, 100vh));
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
  overflow: hidden;
}

.ide-shell__main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.ide-shell__workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color, #26292f);
  border-right: 1px solid var(--border-color, #26292f);
}

.ide-shell__workspace-main {
  flex: 1;
  min-height: 0;
}

.ide-shell__terminal {
  flex-shrink: 0;
  position: relative;
  display: flex;
  border-top: 1px solid var(--border-color, #26292f);
}

.ide-shell__terminal-handle {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
  cursor: row-resize;
  z-index: 2;
}

.ide-shell__terminal-body {
  flex: 1;
  min-height: 0;
}

.ide-shell__chat {
  position: relative;
  flex-shrink: 0;
  display: flex;
}

.ide-shell__chat-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
}

.ide-shell__chat-body {
  flex: 1;
  min-width: 0;
}
</style>
