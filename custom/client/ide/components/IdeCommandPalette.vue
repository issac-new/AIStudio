<script setup lang="ts">
// IdeCommandPalette — 命令面板（Cmd/Ctrl+K，对标 zcode quickPick/commandCenter）。
//
// 三态两区 MVP：命令区（布局开关/新会话/RunTrace/功能页导航——ide.links.*
// 功能导航的唯一事实源，IdeTopBar 已于 09-20 重构退役）+ 任务区
// （chatStore.sessions 标题过滤 → switchSession，对标 zcode taskSearch）。
// 文件区列 backlog（需非递归目录 API 之外的树搜索通道，见 parity-analysis §二）。
// 键盘：↑↓ 跨区扁平导航、Enter 执行、Esc 关闭；输入即时过滤。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useIdeStore, type IdeSidePaneTab } from '../store/ide'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { ideAgentToChatAgent } from '../store/ide'
import { useChatStore } from '@/stores/hermes/chat'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { buildMcpConfigPrompt } from '../utils/mcpConfigPrompt'
import { buildReviewPrompt } from '../utils/reviewPrompt'
import { engineDefaultFromCache } from '../utils/engine-models'
import { interfaceModeEffects } from '../utils/interface-mode'
import { buildNewTaskOptions } from '../utils/task-mode'

interface PaletteItem {
  id: string
  /** i18n 键（导航项复用 ide.links.*，命令用 ide.paletteCmd*）；label 在场的运行时文案二选一 */
  labelKey?: string
  /** 运行时数据文案（会话标题/本地字典等，不走 i18n；非空时优先于 labelKey） */
  label?: string
  run: () => void
}

interface PaletteSection {
  key: 'commands' | 'tasks'
  labelKey: string
  items: PaletteItem[]
}

const ide = useIdeStore()
const { root } = useIdeWorkspace()
const chatStore = useChatStore()
const cockpitStore = useCockpitStore()
const router = useRouter()
const { t, locale } = useI18n()

const query = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const activeIndex = ref(0)

// 功能页导航（ide.links.* 唯一事实源；「功能导航」下拉已随 IdeTopBar 退役）

/** 辅助页签直达（21 个）：不经过分组过滤，命令面板搜「页签」即可全量到达 */
const PANE_TARGETS: IdeSidePaneTab[] = [
  'files', 'review', 'terminal', 'wiki', 'memory', 'ctxarchive', 'tools', 'trajectory', 'workflow',
  'kanban', 'assistant', 'board', 'browser', 'storage', 'mcp', 'hooks', 'slash',
  'deliver', 'genui', 'remote', 'plugins',
]
function paneLabel(key: IdeSidePaneTab): string {
  const text = IDE_LOCAL_TEXT[ideLocaleOf(locale)].panes[key]
  return `${ideLocaleOf(locale) === 'zh' ? '页签' : 'Pane'}: ${text}`
}

const NAV_TARGETS: Array<{ key: string; to: { name: string } | { path: string } }> = [
  // 统一导航（09-18）：workbench/cockpit/loopGraph 死链移除，kanban/history 指六场景
  { key: 'kanban', to: { name: 'ia2.board' } },
  { key: 'history', to: { name: 'ia2.collabHistory' } },
  { key: 'groupChat', to: { name: 'hermes.groupChat' } },
  { key: 'mcp', to: { path: '/hermes/mcp' } },
  { key: 'skills', to: { path: '/hermes/skills' } },
  { key: 'logs', to: { name: 'hermes.logs' } },
  { key: 'usage', to: { name: 'hermes.usage' } },
  { key: 'settings', to: { name: 'hermes.settings' } },
]

/** 命令区：布局开关 + 会话动作 + 导航（全量构建后按 query 过滤） */
const commandItems = computed<PaletteItem[]>(() => {
  const modeText = IDE_LOCAL_TEXT[ideLocaleOf(locale)].mode
  const effects = interfaceModeEffects(ide.interfaceMode ?? 'coding')
  // 工作模式隐藏终端/审查直达项（zcode quickPick supportsTerminal/supportsReview=false）
  const paneTargets = PANE_TARGETS.filter((pane) =>
    (pane !== 'terminal' || effects.showTerminal) && (pane !== 'review' || effects.showReview))
  const items: PaletteItem[] = [
    {
      id: 'cmd:new-session',
      labelKey: 'ide.paletteCmdNewSession',
      run: () => {
        // 与输入区/标题栏的新会话一致：编程任务取 ZCode 目录默认模型，工作任务走通用助手。
        const d = engineDefaultFromCache()
        chatStore.newChat(buildNewTaskOptions({
          mode: ide.taskMode ?? 'coding',
          codingAgentId: ide.agentId,
          chatAgent: ideAgentToChatAgent(ide.agentId),
          workspace: root.value,
          model: d?.model,
          provider: d?.provider,
        }) as unknown as Parameters<typeof chatStore.newChat>[0])
      },
    },
    {
      // 编程/工作界面模式切换（Cmd/Ctrl+Shift+U 同源动作；zcode office/coding 语义）
      id: 'cmd:toggle-interface-mode',
      label: (ide.interfaceMode ?? 'coding') === 'work' ? modeText.switchToCoding : modeText.switchToWork,
      run: () => { ide.toggleInterfaceMode() },
    },
    ...(effects.showTerminal ? [{
      id: 'cmd:toggle-terminal',
      labelKey: 'ide.paletteCmdToggleTerminal',
      run: () => { ide.toggleSidePane('terminal') },
    }] : []),
    {
      id: 'cmd:toggle-workspace',
      labelKey: 'ide.paletteCmdToggleWorkspace',
      // v12.4 栏控重构后布局语义是 folded/maximized；工作区列=左侧任务栏折叠
      run: () => { ide.toggleFold('sidebar') },
    },
    {
      id: 'cmd:toggle-chat',
      labelKey: 'ide.paletteCmdToggleChat',
      run: () => { ide.toggleFold('chat') },
    },
    {
      // 2026-10-18 回归配套：把会话/文件/Git/存储/命令/工作流/深链等只读探针
      // 串成一张报告，日常改完 IDE 点一次即可看全链路。
      id: 'cmd:self-check',
      label: IDE_LOCAL_TEXT[ideLocaleOf(locale)].selfCheckCommand,
      run: () => { ide.openSelfCheck() },
    },
    ...paneTargets.map(pane => ({
      id: `pane:${pane}`,
      label: paneLabel(pane),
      run: () => { ide.sidePane.open = true; ide.setSidePaneTab(pane) },
    })),
  ]
  if (chatStore.activeSessionId) {
    items.push({
      id: 'cmd:run-trace',
      labelKey: 'ide.paletteCmdRunTrace',
      run: () => { cockpitStore.openRunTrace({ sessionId: chatStore.activeSessionId }) },
    })
    // M3 对话式 MCP 配置（kimi /mcp-config 范式）：注入引导提示词到当前会话
    items.push({
      id: 'cmd:mcp-config',
      labelKey: 'ide.paletteCmdMcpConfig',
      run: () => {
        void chatStore.sendMessage(buildMcpConfigPrompt({ agentId: ide.agentId }))
        ide.setChatFocus()
      },
    })
    // R3 /review 评审模式（codex-product 语义）：注入只读评审提示词到当前会话
    items.push({
      id: 'cmd:review',
      labelKey: 'ide.paletteCmdReview',
      run: () => {
        void chatStore.sendMessage(buildReviewPrompt())
        ide.setChatFocus()
      },
    })
  }
  for (const nav of NAV_TARGETS) {
    items.push({
      id: `nav:${nav.key}`,
      labelKey: `ide.links.${nav.key}`,
      run: () => { void router.push(nav.to as never) },
    })
  }
  return items
})

/** 任务区：现有会话按标题过滤切换（排除当前会话；标题为运行时数据不走 i18n） */
const taskItems = computed<PaletteItem[]>(() =>
  chatStore.sessions
    .filter((session) => session.id !== chatStore.activeSessionId)
    .map((session) => ({
      id: `task:${session.id}`,
      labelKey: '',
      label: session.title?.trim() || t('ide.chatUntitled'),
      run: () => { void chatStore.switchSession(session.id) },
    })),
)

const sections = computed<PaletteSection[]>(() => {
  const q = query.value.trim().toLowerCase()
  const match = (text: string) => !q || text.toLowerCase().includes(q)
  const result: PaletteSection[] = []
  const commands = commandItems.value.filter((item) => match(label(item)))
  if (commands.length) {
    result.push({ key: 'commands', labelKey: 'ide.paletteSectionCommands', items: commands })
  }
  const tasks = taskItems.value.filter((item) => match(label(item)))
  if (tasks.length) {
    result.push({ key: 'tasks', labelKey: 'ide.paletteSectionTasks', items: tasks })
  }
  return result
})

const flatItems = computed<PaletteItem[]>(() => sections.value.flatMap((s) => s.items))

watch(query, () => { activeIndex.value = 0 })
// ide.paletteOpen 在 Pinia setup store 上已被解包为普通布尔值——直接传值给
// watch 不会触发（2026-10-18 实测焦点永不进入输入框，Escape 也只在输入框内
// 生效）。必须用 getter 形式。
watch(() => ide.paletteOpen, async (open) => {
  if (open) {
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    // 由外部按钮（侧栏「搜索」）打开时，点击后的默认聚焦会落回按钮，
    // 同步 focus 会被盖掉；下一帧再聚焦确保输入框拿到焦点（侧栏入口另加
    // @mousedown.prevent 阻止按钮抢焦点）。
    const focusInput = () => inputEl.value?.focus()
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusInput)
    else setTimeout(focusInput, 0)
  }
})

// 兜底：焦点不在输入框时 Esc 也要能关面板（2026-10-18 实测侧栏搜索入口
// 打开后焦点留在按钮，input 上的 @keydown 收不到 Escape）。
function onWindowKeydown(event: KeyboardEvent): void {
  if (!ide.paletteOpen || event.key !== 'Escape') return
  event.preventDefault()
  ide.closePalette()
}
onMounted(() => { window.addEventListener('keydown', onWindowKeydown) })
onUnmounted(() => { window.removeEventListener('keydown', onWindowKeydown) })

function label(item: PaletteItem): string {
  return item.label ?? t(item.labelKey)
}

function run(item: PaletteItem): void {
  ide.closePalette()
  item.run()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (flatItems.value.length) {
      activeIndex.value = (activeIndex.value + 1) % flatItems.value.length
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (flatItems.value.length) {
      activeIndex.value = (activeIndex.value - 1 + flatItems.value.length) % flatItems.value.length
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = flatItems.value[activeIndex.value]
    if (item) run(item)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    ide.closePalette()
  }
}

function onOverlayClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) ide.closePalette()
}

onMounted(() => { void chatStore.loadSessions(chatStore.sessionProfileFilter) })
</script>

<template>
  <Teleport to="body">
    <div v-if="ide.paletteOpen" class="ide-palette" @click="onOverlayClick">
      <div class="ide-palette__panel" role="dialog" aria-modal="true">
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          class="ide-palette__input"
          :placeholder="t('ide.palettePlaceholder')"
          @keydown="onKeydown"
        >
        <div class="ide-palette__list">
          <div v-if="!flatItems.length" class="ui-empty-state">
            {{ t('ide.paletteEmpty') }}
          </div>
          <template v-for="section in sections" :key="section.key">
            <div class="ide-palette__section-label">{{ t(section.labelKey) }}</div>
            <button
              v-for="item in section.items"
              :key="item.id"
              type="button"
              class="ide-palette__item"
              :class="{ 'is-active': flatItems[activeIndex]?.id === item.id }"
              @mouseenter="activeIndex = flatItems.findIndex((i) => i.id === item.id)"
              @click="run(item)"
            >
              <span class="ide-palette__item-label">{{ label(item) }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.ide-palette {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.45);
}

.ide-palette__panel {
  width: min(560px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.ide-palette__input {
  padding: 12px 14px;
  font: inherit;
  font-size: 14px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-color);
  outline: none;

  &::placeholder { color: var(--text-muted); }
}

.ide-palette__list {
  max-height: 46vh;
  overflow-y: auto;
  padding: 6px 0;
}


.ide-palette__section-label {
  padding: 6px 14px 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.ide-palette__item {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 7px 14px;
  font: inherit;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;

  &.is-active {
    background: var(--accent-primary-soft, rgba(76, 201, 240, 0.14));
  }
}

.ide-palette__item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
