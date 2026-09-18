<script setup lang="ts">
// IdeStatusBar — 底部状态栏：终端状态 | agent 底座 | workspace | 会话运行态。
// 只读投影（ide store + chat store），不含动作。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdeStore } from '../store/ide'
import { useChatStore } from '@/stores/hermes/chat'

const ide = useIdeStore()
const chatStore = useChatStore()
const { t } = useI18n()

const running = computed(() => Boolean(chatStore.isRunActive || chatStore.abortState))

const sessionState = computed(() =>
  running.value ? t('ide.statusRunning') : t('ide.statusIdle'),
)
</script>

<template>
  <footer class="ide-statusbar">
    <span class="ide-statusbar__item">
      {{ ide.layout.terminalOpen ? t('ide.terminalTitle') : t('ide.terminalClosed') }}
    </span>
    <span class="ide-statusbar__item ide-statusbar__agent">{{ ide.agentId }}</span>
    <span class="ide-statusbar__item" :title="ide.workspace ?? ''">
      {{ ide.workspace ?? t('ide.workspaceDefault') }}
    </span>
    <span class="ide-statusbar__spacer" />
    <button
      type="button"
      class="ide-statusbar__pane-toggle"
      :class="{ 'is-active': ide.sidePane.open }"
      data-testid="ide-statusbar-sidepane"
      :title="t('ide.sidePane.togglePanel')"
      :aria-label="t('ide.sidePane.togglePanel')"
      @click="ide.toggleSidePane()"
    >◫ {{ t('ide.sidePane.togglePanel') }}</button>
    <span class="ide-statusbar__item" :class="{ 'is-running': running }">{{ sessionState }}</span>
  </footer>
</template>

<style scoped lang="scss">
.ide-statusbar {
  flex-shrink: 0;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--ide-text-muted, #8b8f97);
  background: var(--ide-bg-side, #1a1c20);
  border-top: 1px solid var(--ide-border, #2a2d33);
}

.ide-statusbar__item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-running {
    color: var(--success-color, #98c379);
  }
}

.ide-statusbar__agent {
  font-family: Menlo, Monaco, 'Courier New', monospace;
}

.ide-statusbar__spacer {
  flex: 1;
}

.ide-statusbar__pane-toggle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 8px;
  border: 1px solid var(--ide-border, #2a2d33);
  border-radius: 4px;
  background: transparent;
  color: var(--ide-text-muted, #8b8f97);
  font-size: 11px;
  cursor: pointer;

  &:hover { color: var(--ide-text, #d6d8dd); }
  &.is-active {
    color: var(--ide-accent, #5b9cf6);
    border-color: color-mix(in srgb, var(--ide-accent, #5b9cf6) 50%, transparent);
  }
}
</style>
