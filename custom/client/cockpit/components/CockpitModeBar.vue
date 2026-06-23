<script setup lang="ts">
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
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
      :class="{ 'is-on': store.workspaceMode === 'chat' }"
      @click="store.setWorkspaceMode('chat')"
    >💬 {{ t('cockpit.modeChat') }} <span v-if="store.channelsForSelectedTask.length" class="cockpit-mode-bar__count">{{ store.channelsForSelectedTask.length }}</span></button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': store.workspaceMode === 'term' }"
      @click="store.enterTerminal()"
    >⌘ {{ t('cockpit.modeTerm') }}</button>
    <span class="cockpit-mode-bar__spacer" />
  </div>
</template>

<style scoped lang="scss">
.cockpit-mode-bar { display: flex; align-items: center; gap: 0; padding: 0 44px 0 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); }
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
</style>
