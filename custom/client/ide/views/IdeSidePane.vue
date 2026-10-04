<script setup lang="ts">
// IdeSidePane — 右侧辅助面板（对标 zcode sidePane 多标签容器，用户清单批）：
//   审查（变更 diff，复用 IdeGitPane）/ 浏览器（复用上游 DesktopBrowserView）/
//   Wiki 引用（IdeWikiPane）/ 辅助对话（快速追问 MVP：多活跃会话架构为 M4 项，
//   当前提供结构化追问复制 + 跳主会话）。
// 开关经 ide.toggleSidePane（IdeStatusBar 面板切换按钮），宽高偏好持久化在 ide store。
// R4 新增：hooks 只读页签（IdeHooksPane）+ 终端页签 actions 条（codex-product
// 项目级一键命令：工作区级命名命令一键写入活动终端）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useIdeStore, type IdeSidePaneTab } from '../store/ide'
import IdeFilesPane from './IdeFilesPane.vue'
import IdeGitPane from './IdeGitPane.vue'
import IdeWikiPane from './IdeWikiPane.vue'
import IdeStoragePane from './IdeStoragePane.vue'
import IdeMemoryPane from './IdeMemoryPane.vue'
import IdeMcpPane from './IdeMcpPane.vue'
import IdeWhiteboardPane from './IdeWhiteboardPane.vue'
import IdeKanbanPane from './IdeKanbanPane.vue'
import IdeToolsPane from './IdeToolsPane.vue'
import IdeWorkflowPane from './IdeWorkflowPane.vue'
import IdeTerminalDock from './IdeTerminalDock.vue'
import IdeHooksPane from './IdeHooksPane.vue'
import IdeSlashCommandsPane from './IdeSlashCommandsPane.vue'
import IdeTrajectoryPane from '../components/IdeTrajectoryPane.vue'
import IdeContextArchivePane from '../components/IdeContextArchivePane.vue'
import DesktopBrowserView from '@/views/hermes/DesktopBrowserView.vue'
import {
  loadTerminalActions,
  addTerminalAction,
  removeTerminalAction,
  fireTerminalAction,
  type TerminalAction,
} from '../utils/terminalActions'

const { t, locale } = useI18n()
const ide = useIdeStore()
const message = useMessage()

// 2026-10-04 辅助栏整合（用户裁定：17 平铺页签心智负担过重）——按研发直觉分 5 语义组：
// 编码（高频默认）/知识/观测/协作/工具与配置。组过滤条单选；tab 本体与 testid 全保留，
// 深链 setSidePaneTab 不受影响（切组兜底：目标 tab 不在当前组时自动回到「全部」）。
type SidePaneGroup = 'code' | 'knowledge' | 'observe' | 'collab' | 'config'
const TABS: Array<{ key: IdeSidePaneTab; icon: string; group: SidePaneGroup }> = [
  { key: 'files', icon: '🗁', group: 'code' },
  { key: 'review', icon: '⎇', group: 'code' },
  { key: 'terminal', icon: '⌨', group: 'code' },
  { key: 'wiki', icon: 'W', group: 'knowledge' },
  { key: 'memory', icon: '◈', group: 'knowledge' },
  { key: 'ctxarchive', icon: '▤', group: 'knowledge' },
  { key: 'tools', icon: '⚙', group: 'observe' },
  { key: 'trajectory', icon: '∿', group: 'observe' },
  { key: 'workflow', icon: '⟐', group: 'observe' },
  { key: 'kanban', icon: '▦', group: 'collab' },
  { key: 'assistant', icon: '✦', group: 'collab' },
  { key: 'board', icon: '✎', group: 'collab' },
  { key: 'browser', icon: '◍', group: 'config' },
  { key: 'storage', icon: '▤', group: 'config' },
  { key: 'mcp', icon: '⌗', group: 'config' },
  { key: 'hooks', icon: '⚓', group: 'config' },
  { key: 'slash', icon: '/', group: 'config' },
]

// 漂移期本地字典兜底（i18n-observatory）：locale 词表键 tab_trajectory 尚未
// 收编进 473 单一事实源，缺键时 t() 回显键名——trajectory 页签 title 走本地字典。
// ctxarchive 同款（上下文无损滚存批）：本地字典，473 恢复后一并收编。
import { useRunSurfaceText } from '@/custom/ia2/i18n-observatory'
const obsTx = useRunSurfaceText()
const CTXARCHIVE_TAB_TITLE = { zh: '上下文档案', en: 'Context Archive' } as const

// 组词条（本地字典，漂移期通道先例；组名走说人话口径）
const GROUPS: Array<{ id: SidePaneGroup | 'all'; zh: string; en: string }> = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'code', zh: '编码', en: 'Code' },
  { id: 'knowledge', zh: '知识', en: 'Knowledge' },
  { id: 'observe', zh: '观测', en: 'Observe' },
  { id: 'collab', zh: '协作', en: 'Collab' },
  { id: 'config', zh: '工具与配置', en: 'Tools' },
]
const paneLocale = computed(() =>
  String((locale as unknown as { value?: string } | undefined)?.value ?? 'zh').startsWith('zh') ? 'zh' : 'en')
const groupFilter = ref<SidePaneGroup | 'all'>('code')
const visibleTabs = computed(() =>
  groupFilter.value === 'all' ? TABS : TABS.filter(x => x.group === groupFilter.value))
// 深链/外部切换兜底：目标页签不在当前组时自动切到其所在组（命令面板/BgTasks 跳
// workflow 等路径不因分组而断）
watch(() => ide.sidePane.tab, (k) => {
  if (!k) return
  if (!visibleTabs.value.some(x => x.key === k)) {
    groupFilter.value = TABS.find(x => x.key === k)?.group ?? 'all'
  }
})
function tabTitle(key: IdeSidePaneTab): string {
  if (key === 'trajectory') return obsTx.value.trajTabTitle
  if (key === 'ctxarchive') {
    const loc = String((locale as unknown as { value?: string } | undefined)?.value ?? 'zh')
    return loc.startsWith('zh') ? CTXARCHIVE_TAB_TITLE.zh : CTXARCHIVE_TAB_TITLE.en
  }
  return t(`ide.sidePane.tab_${key}`)
}

// R4 终端 actions（工作区级；MVP localStorage，团队共享归 R5+）
const termActions = ref<TerminalAction[]>([])
const newActionLabel = ref('')
const newActionCommand = ref('')

watch(
  () => ide.workspace,
  (ws) => {
    termActions.value = loadTerminalActions(ws ?? '')
    newActionLabel.value = ''
    newActionCommand.value = ''
  },
  { immediate: true },
)

function runAction(action: TerminalAction): void {
  // 终端页签可见才有一键命令的落点（sidePane.open + terminal 页签）
  ide.setSidePaneTab('terminal')
  fireTerminalAction(action.command)
}

function addAction(): void {
  if (!newActionLabel.value.trim() || !newActionCommand.value.trim()) return
  termActions.value = addTerminalAction(ide.workspace ?? '', newActionLabel.value, newActionCommand.value)
  newActionLabel.value = ''
  newActionCommand.value = ''
}

function removeAction(id: string): void {
  termActions.value = removeTerminalAction(ide.workspace ?? '', id)
}

const paneStyle = computed(() => ({ width: `${ide.sidePane.width}px` }))

// 辅助对话（selectionChat 对应物 MVP）：结构化追问复制 + 跳主会话
const assistantInput = ref('')
const assistantSelection = ref<'file' | 'code' | 'idea'>('idea')
const assistantCopied = ref(false)

async function copyAssistantPrompt(): Promise<void> {
  const text = assistantInput.value.trim()
  if (!text) return
  const kind = { file: 'ide.task.assistantKind_file', code: 'ide.task.assistantKind_code', idea: 'ide.task.assistantKind_idea' }[assistantSelection.value]
  const prompt = `[${t(kind)}] ${text}`
  try {
    await navigator.clipboard.writeText(prompt)
    assistantCopied.value = true
    message.success(t('ide.task.assistantCopied'))
    setTimeout(() => { assistantCopied.value = false }, 1500)
  } catch {
    message.error(t('ide.wiki.copyFailed'))
  }
}

function focusMainChat(): void {
  ide.setChatFocus()
}
</script>

<template>
  <aside v-if="ide.sidePane.open" class="ide-sidepane" :class="{ 'is-max': ide.layout.sidepane.maximized }" :style="paneStyle" data-testid="ide-sidepane">
    <div class="ide-sidepane__tabs" role="tablist" :aria-label="t('ide.sidePane.togglePanel')">
      <div class="ide-sidepane__groups" data-testid="ide-sidepane-groups">
        <button
          v-for="g in GROUPS" :key="g.id" type="button"
          class="ide-sidepane__group"
          :class="{ 'is-active': groupFilter === g.id }"
          :data-testid="`ide-sidepane-group-${g.id}`"
          @click="groupFilter = g.id"
        >{{ paneLocale === 'zh' ? g.zh : g.en }}</button>
      </div>
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        type="button"
        role="tab"
        class="ide-sidepane__tab"
        :class="{ 'is-active': ide.sidePane.tab === tab.key }"
        :aria-selected="ide.sidePane.tab === tab.key"
        :data-testid="`ide-sidepane-tab-${tab.key}`"
        :title="tabTitle(tab.key)"
        @click="ide.setSidePaneTab(tab.key)"
      >
        <span class="ide-sidepane__tab-icon" aria-hidden="true">{{ tab.icon }}</span>
      </button>
      <span class="ide-sidepane__spacer" />
      <button
        type="button"
        class="ide-sidepane__tab"
        data-testid="ide-sidepane-max"
        :title="t('ide.pane.maximize')"
        :aria-label="t('ide.pane.maximize')"
        @click="ide.toggleMax('sidepane')"
      >{{ ide.layout.sidepane.maximized ? '⤡' : '⤢' }}</button>
      <button
        type="button"
        class="ide-sidepane__tab ide-sidepane__tab--close"
        :title="t('ide.sidePane.collapse')"
        :aria-label="t('ide.sidePane.collapse')"
        @click="ide.sidePane.open = false"
      >✕</button>
    </div>

    <div class="ide-sidepane__body">
      <IdeFilesPane v-if="ide.sidePane.tab === 'files'" class="ide-sidepane__fill" data-testid="ide-sidepane-files" />
      <IdeGitPane v-else-if="ide.sidePane.tab === 'review'" class="ide-sidepane__fill" data-testid="ide-sidepane-review" />
      <DesktopBrowserView v-else-if="ide.sidePane.tab === 'browser'" class="ide-sidepane__fill" />
      <IdeWikiPane v-else-if="ide.sidePane.tab === 'wiki'" class="ide-sidepane__fill" />
      <IdeStoragePane v-else-if="ide.sidePane.tab === 'storage'" class="ide-sidepane__fill" />
      <IdeMemoryPane v-else-if="ide.sidePane.tab === 'memory'" class="ide-sidepane__fill" />
      <IdeWhiteboardPane v-else-if="ide.sidePane.tab === 'board'" class="ide-sidepane__fill" />
      <IdeKanbanPane v-else-if="ide.sidePane.tab === 'kanban'" class="ide-sidepane__fill" data-testid="ide-sidepane-kanban" />
      <IdeToolsPane v-else-if="ide.sidePane.tab === 'tools'" class="ide-sidepane__fill" data-testid="ide-sidepane-tools" />
      <IdeWorkflowPane v-else-if="ide.sidePane.tab === 'workflow'" class="ide-sidepane__fill" data-testid="ide-sidepane-workflow" />
      <IdeMcpPane v-else-if="ide.sidePane.tab === 'mcp'" class="ide-sidepane__fill" data-testid="ide-sidepane-mcp" />
      <template v-else-if="ide.sidePane.tab === 'terminal'">
        <div class="ide-sidepane__termwrap">
          <!-- R4 终端 actions 条（codex-product 项目级一键命令） -->
          <div class="ide-sidepane__actions" data-testid="ide-terminal-actions">
            <span v-for="a in termActions" :key="a.id" class="ide-sidepane__action-wrap">
              <button
                type="button"
                class="ide-sidepane__action"
                :title="a.command"
                data-testid="ide-terminal-action"
                @click="runAction(a)"
              >▸ {{ a.label }}</button>
              <button
                type="button"
                class="ide-sidepane__action-remove"
                :title="t('ide.termActions.remove', { label: a.label })"
                :data-testid="`ide-terminal-action-remove-${a.id}`"
                @click="removeAction(a.id)"
              >✕</button>
            </span>
            <template v-if="termActions.length < 12">
              <input
                v-model="newActionLabel"
                class="ide-sidepane__action-input"
                :placeholder="t('ide.termActions.labelPlaceholder')"
                data-testid="ide-terminal-action-label"
              >
              <input
                v-model="newActionCommand"
                class="ide-sidepane__action-input is-cmd"
                :placeholder="t('ide.termActions.commandPlaceholder')"
                data-testid="ide-terminal-action-command"
                @keydown.enter.prevent="addAction"
              >
            <button
              type="button"
              class="ide-sidepane__action ide-sidepane__action--add"
              :disabled="!newActionLabel.trim() || !newActionCommand.trim()"
              data-testid="ide-terminal-action-add"
              @click="addAction"
            >＋</button>
          </template>
        </div>
          <IdeTerminalDock class="ide-sidepane__fill" data-testid="ide-sidepane-terminal" />
        </div>
      </template>
      <IdeHooksPane v-else-if="ide.sidePane.tab === 'hooks'" class="ide-sidepane__fill" data-testid="ide-sidepane-hooks" />
      <IdeSlashCommandsPane v-else-if="ide.sidePane.tab === 'slash'" class="ide-sidepane__fill" data-testid="ide-sidepane-slash" />
      <IdeTrajectoryPane v-else-if="ide.sidePane.tab === 'trajectory'" class="ide-sidepane__fill" data-testid="ide-sidepane-trajectory" />
      <IdeContextArchivePane v-else-if="ide.sidePane.tab === 'ctxarchive'" class="ide-sidepane__fill" data-testid="ide-sidepane-ctxarchive" />
      <div v-else class="ide-sidepane__assistant">
        <p class="ide-sidepane__assistant-hint">{{ t('ide.task.assistantHint') }}</p>
        <div class="ide-sidepane__assistant-kinds">
          <button
            v-for="kind in (['file', 'code', 'idea'] as const)"
            :key="kind"
            type="button"
            class="ide-sidepane__kind"
            :class="{ 'is-active': assistantSelection === kind }"
            @click="assistantSelection = kind"
          >{{ t(`ide.task.assistantKind_${kind}`) }}</button>
        </div>
        <textarea
          v-model="assistantInput"
          class="ide-sidepane__assistant-input"
          rows="5"
          :placeholder="t('ide.task.assistantPlaceholder')"
          data-testid="ide-sidepane-assistant-input"
        />
        <div class="ide-sidepane__assistant-actions">
          <button type="button" class="ide-sidepane__assistant-btn" :disabled="!assistantInput.trim()" data-testid="ide-sidepane-assistant-copy" @click="copyAssistantPrompt">
            {{ assistantCopied ? t('ide.debugInfo.copied') : t('ide.task.assistantCopy') }}
          </button>
          <button type="button" class="ide-sidepane__assistant-btn ide-sidepane__assistant-btn--primary" @click="focusMainChat">{{ t('ide.task.assistantGoChat') }}</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.ide-sidepane {
  /* 跟随 panewrap 拖拽宽度：min-width 曾 280px，与 colWidths MIN_W=180 不齐——
   * 拖到 280 以下可见面板冻住（2026-09-22 收口对齐）；显式 100% 防内容回缩留缝 */
  width: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-left: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary, #1b1e24);
  min-height: 0;
}

.ide-sidepane__groups {
  display: flex; gap: 2px; width: 100%; padding: 3px 6px 0 6px; flex-wrap: wrap;
}
.ide-sidepane__group {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 999px;
  background: var(--bg-primary, #fff); color: var(--text-muted, #878c99);
  font-size: 10px; padding: 1px 8px; cursor: pointer; font-family: inherit;
  &.is-active { color: var(--text-primary, inherit); border-color: var(--text-muted, #878c99); font-weight: 600; }
}
.ide-sidepane__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-sidepane__tab {
  width: 30px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #ebebeb); }
  &.is-active {
    color: var(--accent-primary, #4cc9f0);
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
  }

  &--close:hover { background: rgba(220, 60, 60, 0.4); }
}

.ide-sidepane__tab-icon { font-size: 13px; line-height: 1; }

.ide-sidepane.is-max { flex: 1 !important; width: auto !important; min-width: 320px; }

.ide-sidepane__tab--add {
  color: var(--text-muted, #9aa0aa);

  &:hover { color: var(--accent-primary, #4cc9f0); background: var(--bg-tertiary, #ebebeb); }
}

.ide-sidepane__spacer { flex: 1; }

.ide-sidepane__body { flex: 1; min-height: 0; display: flex; }

.ide-sidepane__fill { flex: 1; min-width: 0; min-height: 0; }

/* R4 终端页签容器 + actions 条 */
.ide-sidepane__termwrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ide-sidepane__actions {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color, #26292f);
  font-size: 11px;
}

.ide-sidepane__action-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.ide-sidepane__action {
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }

  &--add {
    padding: 2px 6px;

    &:disabled { opacity: 0.4; cursor: default; }
  }
}

.ide-sidepane__action-remove {
  border: none;
  background: none;
  color: var(--text-muted, #9aa0aa);
  font-size: 10px;
  cursor: pointer;
  padding: 0 2px;

  &:hover { color: var(--error-color, #d03050); }
}

.ide-sidepane__action-input {
  width: 72px;
  border: 1px solid var(--border-color, #3a3f4b);
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #d7dae0);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;

  &.is-cmd { width: 130px; font-family: ui-monospace, monospace; }

  &::placeholder { color: var(--text-muted, #9aa0aa); }
}

.ide-sidepane__assistant {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.ide-sidepane__assistant-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, #9aa0aa);
  line-height: 1.5;
}

.ide-sidepane__assistant-kinds { display: flex; gap: 4px; }

.ide-sidepane__kind {
  flex: 1;
  height: 24px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  cursor: pointer;

  &.is-active {
    border-color: var(--accent-primary, #4cc9f0);
    color: var(--accent-primary, #4cc9f0);
  }
}

.ide-sidepane__assistant-input {
  width: 100%;
  resize: vertical;
  padding: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  font-family: inherit;
  outline: none;

  &:focus { border-color: var(--accent-primary, #4cc9f0); }
}

.ide-sidepane__assistant-actions { display: flex; gap: 6px; }

.ide-sidepane__assistant-btn {
  flex: 1;
  height: 28px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--primary {
    border-color: color-mix(in srgb, var(--accent-primary, #4cc9f0) 50%, transparent);
    color: var(--accent-primary, #4cc9f0);
  }
}
</style>
