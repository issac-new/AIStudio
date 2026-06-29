<script setup lang="ts">
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const emit = defineEmits<{ (e: 'fold'): void }>()

// 双态切换：最大（全屏）↔ 还原（原页面布局）
function onRightMaximize() {
  store.toggleMaximized('right')
}

// Chat 子路由名称集合 → 高亮 Chat 按钮
const chatNames = new Set([
  'hermes.chat', 'hermes.session', 'hermes.history', 'hermes.historySession',
  'hermes.globalAgent', 'hermes.globalAgentSession',
  'hermes.matrixChat', 'hermes.matrixChatRoom',
  'hermes.groupChat', 'hermes.groupChatRoom',
  'hermes.workflow', 'hermes.swarmKanban',
])

function goWork() {
  if (chatNames.has(route.name as string)) router.push({ name: 'hermes.cockpit' })
  store.setWorkspaceMode('work')
}
function goWorkspace() {
  if (chatNames.has(route.name as string)) router.push({ name: 'hermes.cockpit' })
  store.setWorkspaceMode('workspace')
}
function goTerminal() {
  if (chatNames.has(route.name as string)) router.push({ name: 'hermes.cockpit' })
  store.enterTerminal()
}
function goChat() {
  router.push({ name: 'hermes.matrixChat' })
}
</script>

<template>
  <div class="cockpit-mode-bar">
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': !chatNames.has(route.name as string) && store.workspaceMode === 'work' }"
      @click="goWork"
    >⚡ {{ t('cockpit.modeWork') }}</button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': !chatNames.has(route.name as string) && store.workspaceMode === 'workspace' }"
      @click="goWorkspace"
    >📁 {{ t('cockpit.modeWorkspace') }}</button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': !chatNames.has(route.name as string) && store.workspaceMode === 'term' }"
      @click="goTerminal"
    >⌘ {{ t('cockpit.modeTerm') }}</button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': chatNames.has(route.name as string) }"
      @click="goChat"
    >💬 Chat</button>
    <span class="cockpit-mode-bar__spacer" />
    <button
      type="button"
      class="cockpit-mode-bar__max"
      :title="store.maximized.right ? t('cockpit.restore') : t('cockpit.maximize')"
      @click="onRightMaximize"
    >
      <svg v-if="store.maximized.right" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2" fill="currentColor"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
    </button>
    <button type="button" class="cockpit-mode-bar__fold" title="折叠右栏" @click="emit('fold')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
    </button>
  </div>
</template>

<style scoped lang="scss">
.cockpit-mode-bar { display: flex; align-items: center; gap: 0; padding: 0 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); }
.cockpit-mode-bar__mode {
  padding: 9px 12px; font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; border: none; border-bottom: 2px solid transparent; background: transparent;
  font-family: inherit; margin-bottom: -1px; display: flex; align-items: center; gap: 6px;
  transition: color 0.12s, border-color 0.12s;
  &:hover { color: var(--text-primary); }
  &.is-on { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
}
.cockpit-mode-bar__count { font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px; padding: 0 5px; }
.is-on .cockpit-mode-bar__count { background: var(--accent-primary); color: var(--text-on-accent); }
.cockpit-mode-bar__spacer { flex: 1; }
.cockpit-mode-bar__max {
  width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; font-size: 14px; display: flex;
  align-items: center; justify-content: center;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-mode-bar__fold {
  width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
