<script setup lang="ts">
// IdeShell — IDE 工作台主页面壳（/ide，fullscreen 自带壳）。
//
// 布局（ZCode 3.12.3 对齐，09-18 用户裁定 A 案富侧栏，取代 9780cfe 收敛裁决）：
//   IdeTaskSidebar（富侧栏：新建/搜索/置顶/workspace 分组/归档区 + 底部驾驶舱入口）
//   | 会话列（IdeChatPane）| 右辅助面板（IdeSidePane，终端在其页签）
// 加 IdeTopBar / IdeStatusBar；RunTrace 弹窗复用 cockpit 组件（经
// cockpitStore.openRunTrace 打开，store 惰性创建无重初始化成本）。
//
// 纪律：不嵌入 ChatPanel 整面板（自带会话侧栏，嵌套导航）；消息面
// 经 IdeChatPane 复用其子组件（MessageList/ChatInput/SubagentStreamPanel）。
import { computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdeStore } from '../store/ide'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import IdeTopBar from './IdeTopBar.vue'
import IdeTaskSidebar from './IdeTaskSidebar.vue'
import IdeChatPane from './IdeChatPane.vue'
import IdeSidePane from './IdeSidePane.vue'
import IdeStatusBar from './IdeStatusBar.vue'
import IdeCommandPalette from '../components/IdeCommandPalette.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'

const { t } = useI18n()
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

// ── 三栏折叠/最大化（用户裁定：每栏可最大化/最小化/向侧边折叠）──
type PaneKey = 'sidebar' | 'chat' | 'sidepane'
const anyMax = computed(() => (['sidebar', 'chat', 'sidepane'] as PaneKey[]).some(k => ide.layout[k].maximized))
const chatShown = computed(() => !anyMax.value || ide.layout.chat.maximized)
const sidepaneShown = computed(() => ide.layout.sidepane.maximized || (ide.sidePane.open && !anyMax.value))
const mainClass = computed(() => ({
  'has-max-sidebar': ide.layout.sidebar.maximized,
  'has-max-chat': ide.layout.chat.maximized,
  'has-max-sidepane': ide.layout.sidepane.maximized,
}))

const chatColumnStyle = computed(() => ({
  width: `${ide.layout.chatVisible ? ide.layout.chatWidth : 0}px`,
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

onUnmounted(() => {
  chatDragStop?.()
})
</script>

<template>
  <div class="ide-shell">
    <IdeTopBar />
    <div class="ide-shell__main" :class="mainClass">
      <aside v-show="sidebarShown" class="ide-shell__sidebar" :class="{ 'is-folded': ide.layout.sidebar.folded }">
        <div v-if="ide.layout.sidebar.folded" class="ide-shell__fold-handle" data-testid="ide-fold-sidebar" :title="t('ide.pane.expand')" @click="ide.toggleFold('sidebar')">
          <span class="ide-shell__fold-label">‹</span>
        </div>
        <IdeTaskSidebar v-else />
      </aside>
      <div v-show="chatShown" class="ide-shell__chat" :class="{ 'is-folded': ide.layout.chat.folded }" :style="chatColumnStyle">
        <div class="ide-shell__chat-handle" @pointerdown="startChatResize" />
        <div v-if="ide.layout.chat.folded" class="ide-shell__fold-handle ide-shell__fold-handle--v" data-testid="ide-fold-chat" :title="t('ide.pane.expand')" @click="ide.toggleFold('chat')">
          <span class="ide-shell__fold-label">›</span>
        </div>
        <template v-else>
        <div class="ide-shell__pane-tools ide-shell__pane-tools--chat">
          <button type="button" class="ide-shell__tool" data-testid="ide-fold-chat-btn" :title="t('ide.pane.fold')" @click="ide.toggleFold('chat')">›</button>
          <button type="button" class="ide-shell__tool" data-testid="ide-max-chat-btn" :title="t('ide.pane.maximize')" @click="ide.toggleMax('chat')">{{ ide.layout.chat.maximized ? '⤡' : '⤢' }}</button>
        </div>
        <IdeChatPane class="ide-shell__chat-body" />
        </template>
      </div>
      <IdeSidePane v-show="sidepaneShown" :class="{ 'is-max': ide.layout.sidepane.maximized }" />
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
  background: var(--ide-bg-chat, #202226);
  color: var(--ide-text, #d6d8dd);
  overflow: hidden;

  // ZCode 3.12.3 暗色令牌（pixel-spec.md §五，仅 /ide 作用域内生效）
  --ide-bg-side: #1a1c20;
  --ide-bg-chat: #202226;
  --ide-bg-card: #23262b;
  --ide-border: #2a2d33;
  --ide-border-strong: #2f3238;
  --ide-text: #d6d8dd;
  --ide-text-muted: #8b8f97;
  --ide-accent: #5b9cf6;
  --ide-green: #6fbf73;
  --ide-red: #e06c75;
}

.ide-shell__main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.ide-shell__sidebar {
  flex-shrink: 0;
  display: flex;
  min-height: 0;
}

.ide-shell__fold-handle {
  width: 14px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--ide-bg-side, #1a1c20);
  border-right: 1px solid var(--ide-border, #2a2d33);
  color: var(--ide-text-muted, #8b8f97);

  &--v { width: 14px; }
}

.ide-shell__fold-label { font-size: 11px; user-select: none; }

.ide-shell__pane-tools {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;
  background: var(--ide-bg-chat, #202226);
  border-right: 1px solid var(--ide-border, #2a2d33);

  &--chat { border-right: none; border-left: 1px solid var(--ide-border, #2a2d33); }
}

.ide-shell__tool {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ide-text-muted, #8b8f97);
  font-size: 11px;
  cursor: pointer;

  &:hover { color: var(--ide-text, #d6d8dd); background: var(--ide-bg-card, #23262b); }
}

.ide-shell__main.has-max-sidebar .ide-shell__sidebar { flex: 1; }
.ide-shell__main.has-max-chat .ide-shell__chat { flex: 1; }
.ide-shell__main.has-max-sidepane .ide-sidepane { flex: 1; width: auto !important; }

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
