<script setup lang="ts">
// IdeTerminalDock — 终端多开容器（M4c，对标 zcode 终端多实例/分屏）：
// tab 条 + 每页签一个独立 IdeTerminalPanel 实例（script setup 闭包状态实例级
// 隔离，每实例独立 PTY WebSocket）。v-show 保活切换不重连。
// R4 终端 actions：监听 overlay:terminal-action（IdeSidePane 按钮触发），
// 把命令写入当前活动页签终端（panel 暴露 writeCommand）。
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IdeTerminalPanel from './IdeTerminalPanel.vue'
import { TERMINAL_ACTION_EVENT } from '../utils/terminalActions'

const { t } = useI18n()

interface TermTab {
  id: number
}

let nextId = 1
const tabs = ref<TermTab[]>([{ id: nextId++ }])
const activeId = ref(tabs.value[0].id)
/** 分屏模式（v4Pane 对应物）：全部终端并排展示，页签栏隐藏 */
const split = ref(false)

const panelRefs = ref<Array<{ writeCommand?: (command: string) => void } | null>>([])

function onTerminalAction(evt: Event): void {
  const command = (evt as CustomEvent<{ command?: string }>).detail?.command
  if (!command) return
  const idx = tabs.value.findIndex((tab) => tab.id === activeId.value)
  const panel = panelRefs.value[idx]
  panel?.writeCommand?.(command)
}

onMounted(() => window.addEventListener(TERMINAL_ACTION_EVENT, onTerminalAction))
onUnmounted(() => window.removeEventListener(TERMINAL_ACTION_EVENT, onTerminalAction))

function addTab(): void {
  const tab: TermTab = { id: nextId++ }
  tabs.value = [...tabs.value, tab]
  activeId.value = tab.id
}

function closeTab(id: number): void {
  if (tabs.value.length <= 1) return
  const idx = tabs.value.findIndex(tab => tab.id === id)
  if (idx < 0) return
  tabs.value = tabs.value.filter(tab => tab.id !== id)
  if (activeId.value === id) {
    activeId.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id
  }
}
</script>

<template>
  <div class="ide-termdock" data-testid="ide-termdock">
    <div v-if="!split" class="ide-termdock__tabs" role="tablist">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="ide-termdock__tab"
        :class="{ 'is-active': activeId === tab.id }"
        :data-testid="`ide-termdock-tab-${tab.id}`"
        role="tab"
        :aria-selected="activeId === tab.id"
        @click="activeId = tab.id"
      >
        <span class="ide-termdock__tab-label">{{ t('ide.terminalTitle') }} {{ index + 1 }}</span>
        <button
          v-if="tabs.length > 1"
          type="button"
          class="ide-termdock__close"
          :aria-label="t('ide.terminalCloseTab')"
          @click.stop="closeTab(tab.id)"
        >✕</button>
      </div>
      <button
        type="button"
        class="ide-termdock__add"
        data-testid="ide-termdock-add"
        :title="t('ide.terminalNewTab')"
        :aria-label="t('ide.terminalNewTab')"
        @click="addTab"
      >＋</button>
      <button
        type="button"
        class="ide-termdock__add"
        :class="{ 'is-active': split }"
        data-testid="ide-termdock-split"
        :title="t('ide.terminalSplit')"
        :aria-label="t('ide.terminalSplit')"
        @click="split = !split"
      >◫</button>
    </div>
    <div class="ide-termdock__panes">
      <IdeTerminalPanel
        v-for="(tab, index) in tabs"
        :key="tab.id"
        :ref="(el) => { panelRefs[index] = el as never }"
        v-show="split || activeId === tab.id"
        class="ide-termdock__pane"
        :class="{ 'is-split': split }"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-termdock {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ide-termdock__tabs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px 0;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-termdock__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); }
  &.is-active {
    background: var(--bg-primary, #14161a);
    border-color: var(--border-color, #e0e0e0);
    color: var(--text-primary, #e6e6e6);
  }
}

.ide-termdock__tab-label { user-select: none; }

.ide-termdock__close {
  border: none;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 10px;
  cursor: pointer;
  padding: 0;

  &:hover { color: #e06c75; }
}

.ide-termdock__add {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 13px;
  cursor: pointer;

  &:hover { color: var(--accent-primary, #4cc9f0); background: var(--bg-tertiary, #ebebeb); }
}

.ide-termdock__panes {
  flex: 1;
  min-height: 0;
  display: flex;
}

.ide-termdock__pane {
  flex: 1;
  min-width: 0;
  min-height: 0;

  &.is-split {
    border-right: 1px solid var(--border-color, #e0e0e0);
    &:last-child { border-right: none; }
  }
}
</style>
