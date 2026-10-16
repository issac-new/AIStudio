<script setup lang="ts">
// A0 三中心导航（壳级内联版；2026-10-16 D8 全盘重规划：岛屿组退役顶栏，
// BPA/本体/评测/技能治理归治理中心「治理工作台」区；本组件只承载三中心条）。
// 镜头切换器位：Phase D 镜头层已随需求 §六 Q1 解体取消，不建不渲染。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CENTER_NAVS, centerForPath, useCenterNavLocale } from '../nav-centers'
import { useChatStore } from '@/stores/hermes/chat'


const route = useRoute()
const router = useRouter()
const navLocale = useCenterNavLocale()
const activeCenter = computed(() => centerForPath(route.path))
const chatStore = useChatStore()

/** D9 工作台分段：IDE 画布=工作台第二形态（isIde 判定同 IaViewSwitcher 原逻辑） */
const isIde = computed(() => route.path === '/app/ide' || route.path.startsWith('/app/ide/'))

function onGoCenter(name: string): void {
  void router.push({ name })
}

/** D9 分段切换带 URL 上下文（会话随行，语义承接 IaViewSwitcher toggleView） */
function onToggleWorkbench(): void {
  const sid = chatStore.activeSessionId
  if (isIde.value) {
    void router.push(sid ? { name: 'ia2.collabSession', params: { sessionId: sid } } : { name: 'ia2.collab' })
  } else {
    void router.push(sid ? { name: 'ide.shell', query: { session: sid } } : { name: 'ide.shell' })
  }
}
</script>

<template>
  <div class="icn-inline" data-testid="ia-nav-centers">
    <nav class="icn-inline__centers" aria-label="三中心导航">
      <template v-for="c in CENTER_NAVS" :key="c.key">
        <!-- D9：工作台=分段控件（沟通协作｜IDE 画布，同中心两形态） -->
        <span
          v-if="c.key === 'work'"
          class="icn-inline__work"
          :class="{ 'icn-inline__work--active': activeCenter === 'work' }"
          data-testid="ia-nav-center-work"
        >
          <button
            type="button"
            class="icn-inline__center-btn icn-inline__seg"
            :class="{ 'icn-inline__seg--cur': !isIde }"
            data-testid="ia-nav-center-work-collab"
            :aria-current="activeCenter === 'work' && !isIde ? 'page' : undefined"
            @click="onGoCenter('ia2.collab')"
          >{{ navLocale === 'zh' ? '工作台' : 'Workbench' }}</button>
          <button
            type="button"
            class="icn-inline__center-btn icn-inline__seg"
            :class="{ 'icn-inline__seg--cur': isIde }"
            data-testid="ia-nav-center-work-ide"
            :aria-current="activeCenter === 'work' && isIde ? 'page' : undefined"
            @click="onToggleWorkbench"
          >{{ navLocale === 'zh' ? 'IDE 画布' : 'IDE Canvas' }}</button>
        </span>
        <button
          v-else
          type="button"
          class="icn-inline__center-btn"
          :class="{ 'icn-inline__center-btn--active': activeCenter === c.key }"
          :data-testid="`ia-nav-center-${c.key}`"
          :aria-current="activeCenter === c.key ? 'page' : undefined"
          @click="onGoCenter(c.name)"
        >{{ navLocale === 'zh' ? c.labelZh : c.labelEn }}</button>
      </template>
    </nav>
  </div>
</template>

<style scoped>
.icn-inline { display: flex; align-items: center; height: 100%; flex-shrink: 0; }
.icn-inline__centers { display: flex; align-items: stretch; height: 100%; gap: 2px; }
.icn-inline__work { display: inline-flex; align-items: stretch; height: 100%; border-radius: 6px; overflow: hidden; }
.icn-inline__work--active .icn-inline__seg { color: var(--accent-primary, var(--color-primary, #3b82f6)); }
.icn-inline__seg--cur { background: color-mix(in srgb, var(--accent-primary, var(--color-primary, #3b82f6)) 12%, transparent); font-weight: 600; }
.icn-inline__center-btn {
  border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: 13px; padding: 0 12px; margin: 5px 0; border-radius: 6px;
  color: var(--text-muted, var(--color-text-secondary, #878c99)); white-space: nowrap;
  &:hover { color: var(--text-primary, inherit); background: var(--bg-secondary, #f1f2f4); }
  &--active {
    color: var(--accent-primary, var(--color-primary, #3b82f6));
    background: color-mix(in srgb, var(--accent-primary, var(--color-primary, #3b82f6)) 12%, transparent);
    font-weight: 600;
  }
}</style>
