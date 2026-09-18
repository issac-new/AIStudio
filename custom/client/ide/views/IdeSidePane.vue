<script setup lang="ts">
// IdeSidePane — 右侧辅助面板（对标 zcode sidePane 多标签容器，用户清单批）：
//   审查（变更 diff，复用 IdeGitPane）/ 浏览器（复用上游 DesktopBrowserView）/
//   Wiki 引用（IdeWikiPane）/ 辅助对话（快速追问 MVP：多活跃会话架构为 M4 项，
//   当前提供结构化追问复制 + 跳主会话）。
// 开关经 ide.toggleSidePane（IdeStatusBar 面板切换按钮），宽高偏好持久化在 ide store。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useIdeStore, type IdeSidePaneTab } from '../store/ide'
import IdeGitPane from './IdeGitPane.vue'
import IdeWikiPane from './IdeWikiPane.vue'
import IdeStoragePane from './IdeStoragePane.vue'
import IdeMemoryPane from './IdeMemoryPane.vue'
import IdeWhiteboardPane from './IdeWhiteboardPane.vue'
import DesktopBrowserView from '@/views/hermes/DesktopBrowserView.vue'

const { t } = useI18n()
const ide = useIdeStore()
const message = useMessage()

const TABS: Array<{ key: IdeSidePaneTab; icon: string }> = [
  { key: 'review', icon: '⎇' },
  { key: 'browser', icon: '◍' },
  { key: 'wiki', icon: 'W' },
  { key: 'assistant', icon: '✦' },
  { key: 'storage', icon: '▤' },
  { key: 'memory', icon: '◈' },
  { key: 'board', icon: '✎' },
]

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
  ide.setChatTab('messages')
  ide.layout.chatVisible = true
}
</script>

<template>
  <aside v-if="ide.sidePane.open" class="ide-sidepane" :style="paneStyle" data-testid="ide-sidepane">
    <div class="ide-sidepane__tabs" role="tablist" :aria-label="t('ide.sidePane.togglePanel')">
      <button
        v-for="tab in TABS"
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
      <span class="ide-sidepane__spacer" />
      <button
        type="button"
        class="ide-sidepane__tab ide-sidepane__tab--close"
        :title="t('ide.sidePane.collapse')"
        :aria-label="t('ide.sidePane.collapse')"
        @click="ide.sidePane.open = false"
      >✕</button>
    </div>

    <div class="ide-sidepane__body">
      <IdeGitPane v-if="ide.sidePane.tab === 'review'" class="ide-sidepane__fill" data-testid="ide-sidepane-review" />
      <DesktopBrowserView v-else-if="ide.sidePane.tab === 'browser'" class="ide-sidepane__fill" />
      <IdeWikiPane v-else-if="ide.sidePane.tab === 'wiki'" class="ide-sidepane__fill" />
      <IdeStoragePane v-else-if="ide.sidePane.tab === 'storage'" class="ide-sidepane__fill" />
      <IdeMemoryPane v-else-if="ide.sidePane.tab === 'memory'" class="ide-sidepane__fill" />
      <IdeWhiteboardPane v-else-if="ide.sidePane.tab === 'board'" class="ide-sidepane__fill" />
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
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 280px;
  border-left: 1px solid var(--border-color, #26292f);
  background: var(--bg-secondary, #1b1e24);
  min-height: 0;
}

.ide-sidepane__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-color, #26292f);
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

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #242830); }
  &.is-active {
    color: var(--accent-primary, #4cc9f0);
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
  }

  &--close:hover { background: rgba(220, 60, 60, 0.4); }
}

.ide-sidepane__tab-icon { font-size: 13px; line-height: 1; }

.ide-sidepane__spacer { flex: 1; }

.ide-sidepane__body { flex: 1; min-height: 0; display: flex; }

.ide-sidepane__fill { flex: 1; min-width: 0; min-height: 0; }

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
  border: 1px solid var(--border-color, #26292f);
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
  border: 1px solid var(--border-color, #26292f);
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
  border: 1px solid var(--border-color, #26292f);
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
