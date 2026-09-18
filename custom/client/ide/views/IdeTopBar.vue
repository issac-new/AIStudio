<script setup lang="ts">
// IdeTopBar — IDE 顶栏：品牌 | workspace 显示 | agent 底座选择 | 功能链接 | 主题/语言。
// fullscreen 路由下 AppSidebar 整体隐藏，故主题/语言切换在此提供。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { NDropdown, NSelect } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { useIdeStore } from '../store/ide'
import { loadAgentOptions, type IdeAgentOption } from '../api/agents'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import LanguageSwitch from '@/components/layout/LanguageSwitch.vue'

const ide = useIdeStore()
const router = useRouter()
const { t } = useI18n()

const agentOptions = ref<IdeAgentOption[]>([])

onMounted(async () => {
  agentOptions.value = await loadAgentOptions()
})

// computed 而非 ref 快照：标签含 t() 文案，locale 切换（本顶栏 LanguageSwitch）
// 时必须随响应式刷新（2026-09-17 评审）。
const agentSelectOptions = computed<Array<{ label: string; value: string; disabled?: boolean }>>(() =>
  agentOptions.value.length
    ? agentOptions.value.map((option) => ({
        label: option.installed
          ? `${option.label}${option.version ? ` · ${option.version}` : ''}`
          : `${option.label}（${t('ide.agentNotInstalled')}）`,
        value: option.id,
        disabled: !option.installed,
      }))
    : [{ label: 'codex', value: 'codex' }],
)

/** 功能链接：跳转既有页面（router-link 路由跳转，不新开） */
const linkGroups: Array<{ key: string; label: string; to: { name: string } | { path: string } }> = [
  // 统一导航（09-18）：workbench/cockpit/loopGraph 死链移除（⇄ 互跳归 NavRail 单按钮），
  // kanban/history 改指六场景目标
  { key: 'kanban', label: 'ide.links.kanban', to: { name: 'ia2.tasks' } },
  { key: 'history', label: 'ide.links.history', to: { name: 'ia2.collabHistory' } },
  { key: 'groupChat', label: 'ide.links.groupChat', to: { name: 'hermes.groupChat' } },
  { key: 'mcp', label: 'ide.links.mcp', to: { path: '/hermes/mcp' } },
  { key: 'skills', label: 'ide.links.skills', to: { path: '/hermes/skills' } },
  { key: 'logs', label: 'ide.links.logs', to: { name: 'hermes.logs' } },
  { key: 'usage', label: 'ide.links.usage', to: { name: 'hermes.usage' } },
  { key: 'settings', label: 'ide.links.settings', to: { name: 'hermes.settings' } },
]

const linkMenuOptions = computed<DropdownOption[]>(() =>
  linkGroups.map((item) => ({
    key: item.key,
    label: t(item.label),
  })),
)

function onLinkSelect(key: string | number) {
  const target = linkGroups.find((item) => item.key === key)
  if (!target) return
  router.push(target.to as never)
}
</script>

<template>
  <header class="ide-topbar">
    <div class="ide-topbar__brand">
      <svg viewBox="0 0 24 24" aria-hidden="true" class="ide-topbar__brand-icon">
        <path d="M8 6 3 12l5 6M16 6l5 6-5 6" />
      </svg>
      <span>{{ t('ide.brand') }}</span>
    </div>

    <div class="ide-topbar__workspace" :title="ide.workspace ?? t('ide.workspaceDefault')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      </svg>
      <span class="ide-topbar__workspace-path">{{ ide.workspace ?? t('ide.workspaceDefault') }}</span>
    </div>

    <div class="ide-topbar__agent">
      <span class="ide-topbar__agent-label">{{ t('ide.agentLabel') }}</span>
      <NSelect
        :value="ide.agentId"
        :options="agentSelectOptions"
        size="small"
        style="width: 200px"
        :consistent-menu-width="false"
        @update:value="ide.setAgentId($event as never)"
      />
    </div>

    <div class="ide-topbar__spacer" />

    <button
      type="button"
      class="ide-topbar__links"
      :title="t('ide.paletteOpen')"
      @click="ide.openPalette()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span>{{ t('ide.paletteOpen') }}</span>
    </button>

    <NDropdown
      trigger="click"
      :options="linkMenuOptions"
      @select="onLinkSelect"
    >
      <button type="button" class="ide-topbar__links">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
          <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
        </svg>
        <span>{{ t('ide.linksLabel') }}</span>
      </button>
    </NDropdown>

    <div class="ide-topbar__switches">
      <ThemeSwitch />
      <LanguageSwitch />
    </div>
  </header>
</template>

<style scoped lang="scss">
.ide-topbar {
  flex-shrink: 0;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ide-border, #2a2d33);
  background: var(--ide-bg-side, #1a1c20);
}

.ide-topbar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
}

.ide-topbar__brand-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--ide-accent, #5b9cf6);
}

.ide-topbar__workspace {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 360px;
  padding: 3px 10px;
  border: 1px solid var(--ide-border, #2a2d33);
  border-radius: 4px;
  font-size: 12px;
  color: var(--ide-text-muted, #8b8f97);

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }
}

.ide-topbar__workspace-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Menlo, Monaco, 'Courier New', monospace;
}

.ide-topbar__agent {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.ide-topbar__agent-label {
  font-size: 12px;
  color: var(--ide-text-muted, #8b8f97);
}

.ide-topbar__spacer {
  flex: 1;
}

.ide-topbar__links {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--ide-text, #d6d8dd);
  background: transparent;
  border: 1px solid var(--ide-border, #2a2d33);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    border-color: var(--ide-accent, #5b9cf6);
  }

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
}

.ide-topbar__switches {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
