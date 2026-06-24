<script setup lang="ts">
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { computed } from 'vue'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

// 双态切换：最大（全屏）↔ 还原（原页面布局）
const colMaxIcon = computed(() => store.maximized.right ? '🗗' : '⛶')
const colMaxTitle = computed(() => store.maximized.right ? t('cockpit.restore') : t('cockpit.maximize'))
function onRightMaximize() {
  store.toggleMaximized('right')
}
</script>

<template>
  <div class="cockpit-mode-bar">
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': store.workspaceMode === 'work' }"
      @click="store.setWorkspaceMode('work')"
    >⚡ {{ t('cockpit.modeWork') }}</button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': store.workspaceMode === 'workspace' }"
      @click="store.setWorkspaceMode('workspace')"
    >📁 {{ t('cockpit.modeWorkspace') }}</button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': store.workspaceMode === 'term' }"
      @click="store.enterTerminal()"
    >⌘ {{ t('cockpit.modeTerm') }}</button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      @click="router.push('/hermes/matrix-chat')"
    >💬 {{ t('cockpit.addCollab') }}</button>
    <span class="cockpit-mode-bar__spacer" />
    <button
      type="button"
      class="cockpit-mode-bar__max"
      :title="colMaxTitle"
      @click="onRightMaximize"
    >{{ colMaxIcon }}</button>
  </div>
</template>

<style scoped lang="scss">
.cockpit-mode-bar { display: flex; align-items: center; gap: 0; padding: 0 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); }
.cockpit-mode-bar__mode {
  padding: 9px 12px; font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; border: none; border-bottom: 2px solid transparent; background: transparent;
  font-family: inherit; margin-bottom: -1px; display: flex; align-items: center; gap: 6px;
  &:hover { color: var(--text-primary); }
  &.is-on { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
}
.cockpit-mode-bar__count { font-size: 9px; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px; padding: 0 5px; }
.is-on .cockpit-mode-bar__count { background: var(--accent-primary); color: var(--text-on-accent); }
.cockpit-mode-bar__spacer { flex: 1; }
.cockpit-mode-bar__max {
  width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; font-size: 14px; display: flex;
  align-items: center; justify-content: center;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
</style>
