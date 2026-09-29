<script setup lang="ts">
// IdeSidePane — 右侧辅助面板（对标 zcode sidePane 多标签容器，用户清单批）：
//   审查（变更 diff，复用 IdeGitPane）/ 浏览器（真·内置浏览器 DesktopBrowserPanel，代理可驱动——Computer Use 接线轮）/
//   Wiki 引用（IdeWikiPane）/ 辅助对话（快速追问 MVP：多活跃会话架构为 M4 项，
//   当前提供结构化追问复制 + 跳主会话）。
// 开关经 ide.toggleSidePane（IdeStatusBar 面板切换按钮），宽高偏好持久化在 ide store。
// R4 新增：hooks 只读页签（IdeHooksPane）+ 终端页签 actions 条（codex-product
// 项目级一键命令：工作区级命名命令一键写入活动终端）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useIdeStore, type IdeSidePaneTab } from '../store/ide'
import { CAPABILITY_TABS, loadCapabilityPack, packAllows, saveCapabilityPack } from '../utils/capabilityPack'
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
import IdeAutomationsPane from './IdeAutomationsPane.vue'
import IdeSlashCommandsPane from './IdeSlashCommandsPane.vue'
import IdeBrowserPane from './IdeBrowserPane.vue'
import {
  loadTerminalActions,
  addTerminalAction,
  removeTerminalAction,
  fireTerminalAction,
  type TerminalAction,
} from '../utils/terminalActions'

const { t } = useI18n()
const ide = useIdeStore()
const message = useMessage()

const TABS: Array<{ key: IdeSidePaneTab; icon: string }> = [
  { key: 'files', icon: '🗁' },
  { key: 'review', icon: '⎇' },
  { key: 'browser', icon: '◍' },
  { key: 'wiki', icon: 'W' },
  { key: 'assistant', icon: '✦' },
  { key: 'storage', icon: '▤' },
  { key: 'memory', icon: '◈' },
  { key: 'board', icon: '✎' },
  { key: 'kanban', icon: '▦' },
  { key: 'tools', icon: '⚙' },
  { key: 'workflow', icon: '⟐' },
  { key: 'mcp', icon: '⌗' },
  { key: 'terminal', icon: '⌨' },
  { key: 'hooks', icon: '⚓' },
  { key: 'slash', icon: '/' },
  { key: 'automations', icon: '⚡' },
]

// ── B1 项目能力包：工作区级页签 allow-list（null=全量默认）──
const capabilityPack = ref<IdeSidePaneTab[] | null>(null)
const packEditing = ref(false)
const packDraft = ref<IdeSidePaneTab[]>([])

watch(
  () => ide.workspace,
  (ws) => { capabilityPack.value = loadCapabilityPack(ws ?? '') },
  { immediate: true },
)

/** 能力包过滤后的可见页签（选择器始终列全量词表，新页签可发现）。 */
const visibleTabs = computed(() =>
  capabilityPack.value === null ? TABS : TABS.filter((t) => capabilityPack.value!.includes(t.key)))

// 当前页签被能力包裁掉 → 落回 files（files 不在包内则取首个可见页签）
watch([capabilityPack, () => ide.sidePane.tab], () => {
  if (!packAllows(capabilityPack.value, ide.sidePane.tab)) {
    const fallback = packAllows(capabilityPack.value, 'files')
      ? 'files'
      : (visibleTabs.value[0]?.key ?? 'files')
    if (fallback !== ide.sidePane.tab) ide.setSidePaneTab(fallback)
  }
})

function openPackEditor(): void {
  packDraft.value = capabilityPack.value === null ? [...CAPABILITY_TABS] : [...capabilityPack.value]
  packEditing.value = !packEditing.value
}

function toggleDraftTab(tab: IdeSidePaneTab): void {
  const idx = packDraft.value.indexOf(tab)
  if (idx >= 0) {
    // 至少保留一个（全隐会让侧栏失去落点）
    if (packDraft.value.length > 1) packDraft.value.splice(idx, 1)
  } else {
    packDraft.value.push(tab)
  }
}

function savePack(): void {
  saveCapabilityPack(ide.workspace ?? '', packDraft.value)
  capabilityPack.value = loadCapabilityPack(ide.workspace ?? '')
  packEditing.value = false
}

function resetPack(): void {
  saveCapabilityPack(ide.workspace ?? '', [])
  capabilityPack.value = null
  packEditing.value = false
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
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        type="button"
        role="tab"
        class="ide-sidepane__tab"
        :class="{ 'is-active': ide.sidePane.tab === tab.key }"
        :aria-selected="ide.sidePane.tab === tab.key"
        :data-testid="`ide-sidepane-tab-${tab.key}`"
        :title="t(`ide.sidePane.tab_${tab.key}`)"
        @click="ide.setSidePaneTab(tab.key)"
      >
        <span class="ide-sidepane__tab-icon" aria-hidden="true">{{ tab.icon }}</span>
      </button>
      <button
        type="button"
        class="ide-sidepane__tab"
        data-testid="ide-sidepane-pack"
        :title="capabilityPack === null ? '项目能力包（当前：全量）' : `项目能力包（当前：${capabilityPack.length} 项）`"
        @click="openPackEditor"
      >☰</button>
      <button
        type="button"
        class="ide-sidepane__tab ide-sidepane__tab--add"
        data-testid="ide-sidepane-add"
        :title="t('ide.sidePane.addTab')"
        :aria-label="t('ide.sidePane.addTab')"
        @click="ide.toggleSidePane('wiki')"
      >＋</button>
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

    <div v-if="packEditing" class="ide-sidepane__pack" data-testid="ide-sidepane-pack-editor">
      <div class="ide-sidepane__pack-title">能力包：声明本工作区需要的页签</div>
      <div class="ide-sidepane__pack-list">
        <label v-for="tab in CAPABILITY_TABS" :key="tab" class="ide-sidepane__pack-item">
          <input
            type="checkbox"
            :checked="packDraft.includes(tab)"
            :data-testid="`ide-pack-check-${tab}`"
            @change="toggleDraftTab(tab)"
          >{{ t(`ide.sidePane.tab_${tab}`) }}
        </label>
      </div>
      <div class="ide-sidepane__pack-actions">
        <button type="button" class="ide-sidepane__pack-btn" data-testid="ide-pack-save" @click="savePack">保存</button>
        <button type="button" class="ide-sidepane__pack-btn" data-testid="ide-pack-reset" @click="resetPack">恢复全量默认</button>
      </div>
    </div>

    <div class="ide-sidepane__body">
      <IdeFilesPane v-if="ide.sidePane.tab === 'files'" class="ide-sidepane__fill" data-testid="ide-sidepane-files" />
      <IdeGitPane v-else-if="ide.sidePane.tab === 'review'" class="ide-sidepane__fill" data-testid="ide-sidepane-review" />
      <IdeBrowserPane v-else-if="ide.sidePane.tab === 'browser'" class="ide-sidepane__fill" data-testid="ide-sidepane-browser" />
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
      <IdeAutomationsPane v-else-if="ide.sidePane.tab === 'automations'" class="ide-sidepane__fill" data-testid="ide-sidepane-automations" />
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

.ide-sidepane__pack {
  border-bottom: 1px solid var(--border-color, #eee); padding: 8px 10px;
  display: flex; flex-direction: column; gap: 6px;
}
.ide-sidepane__pack-title { font-size: 11px; font-weight: 600; color: var(--text-color-2, #555); }
.ide-sidepane__pack-list {
  display: flex; flex-wrap: wrap; gap: 4px 10px; max-height: 140px; overflow-y: auto;
}
.ide-sidepane__pack-item {
  display: inline-flex; gap: 4px; align-items: center; font-size: 11px;
  color: var(--text-color-2, #555); cursor: pointer;
}
.ide-sidepane__pack-actions { display: flex; gap: 8px; }
.ide-sidepane__pack-btn {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  font-size: 11px; padding: 2px 10px; cursor: pointer; color: var(--text-color-2, #555);
}
.ide-sidepane__pack-btn:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
</style>
