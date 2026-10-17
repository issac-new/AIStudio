<!-- overlay/custom/client/ia2/components/IaQuickNav.vue -->
<!-- 常用入口常驻条（2026-10-17 驾驶舱减负批）：日常高频的四个目的地——
     审批收件箱（等真人拍板）、看板（任务协同）、运行总览（整体进度）、
     监督面板（卡在哪/谁没动）。此前这四个入口分散在阶段页工具卡与两个
     中心的页签里，跨页往返要「先记路径再点三次」；本条常驻页头下方，
     任意页面一击可达，当前页高亮。零数据依赖（只做导航，不拉状态）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

interface QuickItem {
  key: string
  name: string
  icon: string
  zh: string
  en: string
}

const ITEMS: readonly QuickItem[] = [
  { key: 'inbox', name: 'ia2.inbox', icon: '📥', zh: '审批收件箱', en: 'Approvals Inbox' },
  { key: 'board', name: 'ia2.board', icon: '📋', zh: '看板', en: 'Board' },
  { key: 'sim', name: 'ia2.sim', icon: '🛰️', zh: '运行总览', en: 'Run Overview' },
  { key: 'supervision', name: 'ia2.simSupervision', icon: '👁️', zh: '监督面板', en: 'Supervision' },
]

const route = useRoute() as ReturnType<typeof useRoute> | undefined
const router = useRouter() as ReturnType<typeof useRouter> | undefined
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))

function isActive(item: QuickItem): boolean {
  return String(route?.name ?? '') === item.name
}

function go(item: QuickItem): void {
  if (isActive(item)) return
  void router?.push({ name: item.name })
}
</script>

<template>
  <nav class="iaq" aria-label="常用入口" data-testid="ia-quick-nav">
    <span class="iaq__label">{{ zh ? '常用' : 'Common' }}</span>
    <button
      v-for="item in ITEMS"
      :key="item.key"
      type="button"
      class="iaq__btn"
      :class="{ 'iaq__btn--active': isActive(item) }"
      :data-testid="`ia-quick-${item.key}`"
      :aria-current="isActive(item) ? 'page' : undefined"
      @click="go(item)"
    >
      <span class="iaq__icon" aria-hidden="true">{{ item.icon }}</span>
      <span class="iaq__text">{{ zh ? item.zh : item.en }}</span>
    </button>
  </nav>
</template>

<style scoped>
.iaq {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 26px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  overflow-x: auto;
  scrollbar-width: none;
}
.iaq__label {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  margin-right: 6px;
  text-transform: uppercase;
}
.iaq__btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-secondary);
}
.iaq__btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
.iaq__btn--active {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  font-weight: 600;
}
.iaq__icon { font-size: 12px; line-height: 1; }
</style>
