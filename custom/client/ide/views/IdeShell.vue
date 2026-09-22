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
import { readColWidths, updateColWidth, onColWidthsChange } from '@/custom/ia2/utils/colWidths'
import IaGlobalTop from '@/custom/ia2/components/IaGlobalTop.vue'
import IaColumnControls from '@/custom/ia2/components/IaColumnControls.vue'
import { openPanelWindow } from '@/custom/ia2/wm/popout'
import IdeTaskSidebar from './IdeTaskSidebar.vue'
import IdeChatPane from './IdeChatPane.vue'
import IdeSidePane from './IdeSidePane.vue'
import IdeStatusBar from './IdeStatusBar.vue'
import IdeCommandPalette from '../components/IdeCommandPalette.vue'
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

// ── 三栏折叠/最大化（v12.4 用户裁定：栏控迁各栏顶部控制条右上角）──
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

// 左栏宽度样式（sidebarWidth 拖拽持久化）
const sidebarWidthStyle = computed(() => ide.layout.sidebarWidth ? { width: `${ide.layout.sidebarWidth}px`, flex: '0 0 auto' } : {})
// 右辅助面板宽度样式（sidePane.width 拖拽持久化，走 sidePane 独立 ref）
const sidepaneWidthStyle = computed(() => ide.sidePane.width ? { width: `${ide.sidePane.width}px`, flex: '0 0 auto' } : {})

// ── R6 补充：三栏宽度拖拽 + 同步联动（colWidths 单一事实源，协作沟通 ↔ IDE
// 工作台共享同一套宽度；拖任一边另一边跟随）──
const unsubscribeCols = onColWidthsChange((w) => {
  ide.layout.sidebarWidth = w.left
  ide.sidePane.width = w.right
})
onUnmounted(unsubscribeCols)
// 初次挂载：若 layout/sidePane 与共享源不一致（历史值），以共享源为准回填
{
  const shared = readColWidths()
  if (ide.layout.sidebarWidth !== shared.left) ide.layout.sidebarWidth = shared.left
  if (ide.sidePane.width !== shared.right) ide.sidePane.width = shared.right
}

let ideDragCol: 'sidebar' | 'sidepane' | null = null
let ideDragStartX = 0
let ideDragStartW = 0
function startIdeDrag(col: 'sidebar' | 'sidepane', e: MouseEvent): void {
  ideDragCol = col
  ideDragStartX = e.clientX
  ideDragStartW = col === 'sidebar'
    ? ide.layout.sidebarWidth
    : ide.sidePane.width
  window.addEventListener('mousemove', onIdeDrag)
  window.addEventListener('mouseup', endIdeDrag, { once: true })
  e.preventDefault()
}
function onIdeDrag(e: MouseEvent): void {
  if (!ideDragCol) return
  const delta = e.clientX - ideDragStartX
  const w = Math.round(ideDragCol === 'sidebar' ? ideDragStartW + delta : ideDragStartW - delta)
  // 实时写共享源（广播同步到另一边；mouseup 即最终值）
  updateColWidth(ideDragCol, w)
}
function endIdeDrag(): void {
  window.removeEventListener('mousemove', onIdeDrag)
  ideDragCol = null
}

/** 会话栏独立窗口：弹出当前 /ide 路由（standalone=1；合入在独立窗内） */
function onChatPopout(): void {
  void openPanelWindow({ path: route.fullPath })
}

onUnmounted(() => {
})
</script>

<template>
  <div class="ide-shell">
    <!-- v12.1 全局顶区常驻双视图；v12.6 维度条（工作空间行）退役——与三栏
         功能重叠（任务/会话在侧栏与会话列直达，辅助面板页签自持） -->
    <IaGlobalTop @notify="cockpitStore.openNotify()" />
    <IdeTaskContextBar />
    <div class="ide-shell__main" :class="mainClass">
      <aside v-show="sidebarShown" class="ide-shell__sidebar" :class="{ 'is-folded': ide.layout.sidebar.folded }" :style="sidebarWidthStyle">
        <div v-if="ide.layout.sidebar.folded" class="ide-shell__fold-handle" data-testid="ide-fold-sidebar" :title="t('ide.pane.expand')" @click="ide.toggleFold('sidebar')">
          <span class="ide-shell__fold-label">›</span>
        </div>
        <div v-else class="ide-shell__col ide-shell__col--sidebar">
          <!-- R6 补充：栏控迁独立控制条行（不占内容区，根治绝对定位遮罩） -->
          <div class="ide-shell__colhead" data-testid="ide-colhead-sidebar">
            <IaColumnControls
              testid="ide-col-sidebar" fold="left" show-max :maximized="ide.layout.sidebar.maximized"
              @fold="ide.toggleFold('sidebar')" @max="ide.toggleMax('sidebar')"
            />
          </div>
          <!-- R6 补充：左栏右缘拖拽分割条（调整左栏宽度） -->
          <div class="ide-shell__split ide-shell__split--l" data-testid="ide-split-l" @mousedown="startIdeDrag('sidebar', $event)" />
          <IdeTaskSidebar class="ide-shell__colbody" />
        </div>
      </aside>
      <div v-show="chatShown" class="ide-shell__chat" :class="{ 'is-folded': ide.layout.chat.folded }">
        <div v-if="ide.layout.chat.folded" class="ide-shell__fold-handle ide-shell__fold-handle--v" data-testid="ide-fold-chat" :title="t('ide.pane.expand')" @click="ide.toggleFold('chat')">
          <span class="ide-shell__fold-label">›</span>
        </div>
        <div v-else class="ide-shell__col ide-shell__col--chat">
          <div class="ide-shell__colhead" data-testid="ide-colhead-chat">
            <IaColumnControls
              testid="ide-col-chat" fold="left" show-max :maximized="ide.layout.chat.maximized" show-popout
              @fold="ide.toggleFold('chat')" @max="ide.toggleMax('chat')" @popout="onChatPopout"
            />
          </div>
          <IdeChatPane class="ide-shell__colbody" />
        </div>
      </div>
      <div v-show="sidepaneShown" class="ide-shell__panewrap" :style="sidepaneWidthStyle">
        <!-- R6 补充：右栏左缘拖拽分割条（调整右辅助面板宽度） -->
        <div class="ide-shell__split ide-shell__split--r" data-testid="ide-split-r" @mousedown="startIdeDrag('sidepane', $event)" />
        <IdeSidePane :class="{ 'is-max': ide.layout.sidepane.maximized }" />
      </div>
      <!-- v12.6：侧板收起态右缘导轨（侧栏 footer 功能行退役后的重开入口） -->
      <div v-if="!ide.sidePane.open && !anyMax" class="ide-shell__pane-rail" data-testid="ide-sidepane-rail">
        <button type="button" class="ide-shell__rail-btn" data-testid="ide-sidepane-open"
          :title="t('ide.sidePane.togglePanel')" @click="ide.sidePane.open = true"
        >◀</button>
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

.ide-shell__sidebar {
  flex-shrink: 0;
  display: flex;
  min-height: 0;
  position: relative;
}

/* R6 补充：三栏宽度拖拽分割条（左栏右缘/右栏左缘，hover 加粗可见） */
.ide-shell__split {
  position: absolute; top: 0; bottom: 0; width: 6px; z-index: 6;
  cursor: col-resize; background: transparent;
  &:hover, &:active { background: color-mix(in srgb, #61afef 30%, transparent); }
}
.ide-shell__split--l { right: -3px; }
.ide-shell__split--r { left: -3px; }

/* R6 右辅助面板宽度容器（分割条 relative 父级） */
.ide-shell__panewrap {
  flex-shrink: 0;
  display: flex;
  min-height: 0;
  position: relative;
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

/* v12.6 栏控迁独立控制条行（不占内容区，根治绝对定位遮罩，R6 补充） */
.ide-shell__col { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.ide-shell__colhead {
  flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center;
  height: 26px; padding: 0 6px; border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-primary, #14161a); border-radius: 6px 6px 0 0;
}
.ide-shell__colctl { display: none; }
/* 旧绝对定位让位规则已退役（栏控迁 colhead 不占内容区） */
.ide-shell__colbody { flex: 1; min-height: 0; }
.ide-shell__pane-rail {
  flex-shrink: 0; width: 18px; display: flex; align-items: flex-start; justify-content: center;
  padding-top: 4px;
}
.ide-shell__rail-btn {
  width: 16px; height: 40px; border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px;
  background: var(--bg-primary, #14161a); color: var(--text-muted, #9aa0aa); cursor: pointer;
  font-size: 10px; line-height: 1; padding: 0;
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
</style>
