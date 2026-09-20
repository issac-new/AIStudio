<script setup lang="ts">
// IdeShell — IDE 工作台主页面壳（/ide，fullscreen 自带壳）。
//
// 布局（ZCode 3.12.3 对齐，09-18 用户裁定 A 案富侧栏，取代 9780cfe 收敛裁决）：
//   IdeTaskSidebar（富侧栏：新建/搜索/置顶/workspace 分组/归档区 + 底部驾驶舱入口）
//   | 会话列（IdeChatPane）| 右辅助面板（IdeSidePane，终端在其页签）
// 加 IdeStatusBar；顶区 = 共享 IaGlobalTop（页头+注意力条，与沟通协作一致，
// 09-20 裁定移除自有 IdeTopBar：⌘K/命令面板与功能导航入口都在命令面板）；
// RunTrace 弹窗复用 cockpit 组件（经 cockpitStore.openRunTrace 打开，store
// 惰性创建无重初始化成本）。
//
// 纪律：不嵌入 ChatPanel 整面板（自带会话侧栏，嵌套导航）；消息面
// 经 IdeChatPane 复用其子组件（MessageList/ChatInput/SubagentStreamPanel）。
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useIdeStore } from '../store/ide'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useChatStore } from '@/stores/hermes/chat'
import IaGlobalTop from '@/custom/ia2/components/IaGlobalTop.vue'
import IdeTaskSidebar from './IdeTaskSidebar.vue'
import IdeChatPane from './IdeChatPane.vue'
import IdeSidePane from './IdeSidePane.vue'
import IdeStatusBar from './IdeStatusBar.vue'
import IdeCommandPalette from '../components/IdeCommandPalette.vue'
import IdeDimsBar from '../components/IdeDimsBar.vue'
import IdeTaskContextBar from '../components/IdeTaskContextBar.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'

const { t } = useI18n()
const route = useRoute()
const ide = useIdeStore()
const cockpitStore = useCockpitStore()
const chatStore = useChatStore()

// ── v12 任务维度深链（/ide?task=<id>，工作台 ⌨ / 管理台 ⌨ 入口）──
// 绑定任务维度并尽力切到任务挂靠的 agent 会话（session_id 命中即 switch）。
watch(() => route.query.task, (taskId) => {
  const id = typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null
  ide.setActiveTask(id)
  if (id) ide.setDimension('task')
}, { immediate: true })

onMounted(() => {
  const id = ide.activeTaskId
  if (id) {
    const hit = (chatStore.sessions ?? []).find(s => s.id === id || s.agentSessionId === id)
    if (hit) chatStore.switchSession?.(hit.id)
  }
})

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
const sidebarShown = computed(() => !anyMax.value || ide.layout.sidebar.maximized)
const chatShown = computed(() => !anyMax.value || ide.layout.chat.maximized)
const sidepaneShown = computed(() => ide.layout.sidepane.maximized || (ide.sidePane.open && !anyMax.value))
const mainClass = computed(() => ({
  'has-max-sidebar': ide.layout.sidebar.maximized,
  'has-max-chat': ide.layout.chat.maximized,
  'has-max-sidepane': ide.layout.sidepane.maximized,
}))

onUnmounted(() => {
})
</script>

<template>
  <div class="ide-shell">
    <!-- v12.1 全局顶区常驻双视图（用户裁定）：页头+注意力条+右上角视图切换器 -->
    <IaGlobalTop @notify="cockpitStore.openNotify()" />
    <IdeDimsBar />
    <IdeTaskContextBar />
    <div class="ide-shell__main" :class="mainClass">
      <aside v-show="sidebarShown" class="ide-shell__sidebar" :class="{ 'is-folded': ide.layout.sidebar.folded }">
        <div v-if="ide.layout.sidebar.folded" class="ide-shell__fold-handle" data-testid="ide-fold-sidebar" :title="t('ide.pane.expand')" @click="ide.toggleFold('sidebar')">
          <span class="ide-shell__fold-label">›</span>
        </div>
        <template v-else>
        <div class="ide-shell__pane-tools">
          <button type="button" class="ide-shell__tool" data-testid="ide-fold-sidebar-btn" :title="t('ide.pane.fold')" @click="ide.toggleFold('sidebar')">‹</button>
          <button type="button" class="ide-shell__tool" data-testid="ide-max-sidebar-btn" :title="t('ide.pane.maximize')" @click="ide.toggleMax('sidebar')">{{ ide.layout.sidebar.maximized ? '⤡' : '⤢' }}</button>
        </div>
        <IdeTaskSidebar class="ide-shell__sidebar-body" />
        </template>
      </aside>
      <div v-show="chatShown" class="ide-shell__chat" :class="{ 'is-folded': ide.layout.chat.folded }">
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
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
  overflow: hidden;

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
  width: 18px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--bg-tertiary, #ebebeb);
  border-right: 1px solid var(--border-color, #e0e0e0);
  color: var(--accent-primary, #4cc9f0);

  &:hover { background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 18%, var(--bg-tertiary, #ebebeb)); }

  &--v { width: 18px; }
}

.ide-shell__fold-label { font-size: 11px; user-select: none; }

.ide-shell__pane-tools {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;
  background: var(--bg-primary, #14161a);
  border-right: 1px solid var(--border-color, #e0e0e0);

  &--chat { border-right: none; border-left: 1px solid var(--border-color, #e0e0e0); }
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
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #ebebeb); }
}

.ide-shell__main.has-max-sidebar .ide-shell__sidebar { flex: 1; }
.ide-shell__main.has-max-chat .ide-shell__chat { flex: 1; }
.ide-shell__main.has-max-sidepane .ide-sidepane { flex: 1; width: auto !important; }

.ide-shell__sidebar.is-folded,
.ide-shell__chat.is-folded { flex: 0 0 18px; min-width: 0; overflow: hidden; }

.ide-shell__chat {
  position: relative;
  flex: 1 1 auto;
  min-width: 320px;
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
