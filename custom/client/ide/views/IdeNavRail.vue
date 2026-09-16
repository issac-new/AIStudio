<script setup lang="ts">
// IdeNavRail — 左侧活动栏：列显隐开关（工作区/终端/会话）+ 回主功能链接。
// 只做布局开关与路由跳转，不承载业务状态。
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useIdeStore } from '../store/ide'

const ide = useIdeStore()
const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <nav class="ide-navrail" :aria-label="t('ide.railLabel')">
    <button
      type="button"
      class="ide-navrail__item"
      :class="{ 'is-active': ide.layout.workspaceVisible }"
      :title="t('ide.railWorkspace')"
      :aria-label="t('ide.railWorkspace')"
      @click="ide.layout.workspaceVisible = !ide.layout.workspaceVisible"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      </svg>
    </button>

    <button
      type="button"
      class="ide-navrail__item"
      :class="{ 'is-active': ide.layout.terminalOpen }"
      :title="t('ide.railTerminal')"
      :aria-label="t('ide.railTerminal')"
      @click="ide.layout.terminalOpen = !ide.layout.terminalOpen"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 9 3 3-3 3M13 15h4" />
      </svg>
    </button>

    <button
      type="button"
      class="ide-navrail__item"
      :class="{ 'is-active': ide.layout.chatVisible }"
      :title="t('ide.railChat')"
      :aria-label="t('ide.railChat')"
      @click="ide.layout.chatVisible = !ide.layout.chatVisible"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
      </svg>
    </button>

    <div class="ide-navrail__divider" />

    <button
      type="button"
      class="ide-navrail__item"
      :title="t('ide.links.cockpit')"
      :aria-label="t('ide.links.cockpit')"
      @click="router.push({ name: 'hermes.cockpit' })"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      </svg>
    </button>

    <button
      type="button"
      class="ide-navrail__item"
      :title="t('ide.links.workbench')"
      :aria-label="t('ide.links.workbench')"
      @click="router.push({ name: 'ia2.overview' })"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    </button>

    <button
      type="button"
      class="ide-navrail__item"
      :title="t('ide.links.loopGraph')"
      :aria-label="t('ide.links.loopGraph')"
      @click="router.push({ name: 'hermes.loop' })"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5" cy="6" r="2.5" />
        <circle cx="19" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <path d="M7.5 6h9M6 8.2l4.6 7.6M18 8.2l-4.6 7.6" />
      </svg>
    </button>
  </nav>
</template>

<style scoped lang="scss">
.ide-navrail {
  flex-shrink: 0;
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  background: var(--bg-secondary, #1b1e24);
}

.ide-navrail__item {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  cursor: pointer;

  &:hover {
    color: var(--text-primary, #e6e6e6);
    background: var(--bg-tertiary, #242830);
  }

  &.is-active {
    color: var(--accent-primary, #4cc9f0);
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
  }

  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.ide-navrail__divider {
  width: 24px;
  height: 1px;
  margin: 6px 0;
  background: var(--border-color, #26292f);
}
</style>
