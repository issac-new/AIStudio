<script setup lang="ts">
// 一级导航（壳级内联版；2026-10-16 D8 全盘重规划：岛屿组退役顶栏，
// BPA/本体/评测/技能治理归治理中心「治理工作台」区；本组件只承载六阶段条）。
// D18（2026-10-17 设计正本 §5.8）：IDE 分段从①搭建移到④开发——IDE 工作区
// 是开发阶段的生产位，挂①下是 D13 语义错位；标签由 nav-centers 的
// CENTER_NAVS 派生（单一事实源），本组件不写死阶段文案。
// 镜头切换器位：Phase D 镜头层已随需求 §六 Q1 解体取消，不建不渲染。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CENTER_NAVS, activeStagesForRoute, useCenterNavLocale } from '../nav-centers'
import { useChatStore } from '@/stores/hermes/chat'


const route = useRoute()
const router = useRouter()
const navLocale = useCenterNavLocale()
// 阶段归属（2026-10-17 页签级）：来路 from 优先；无来路按归属表，多归属亮多个，
// 全程工具（运行总览/系统设置等）不高亮——如实呈现「到处都要用」。
const activeStages = computed(() => activeStagesForRoute(String(route.name ?? ''), route.path, route.query.from))
const isActive = (key: string): boolean => activeStages.value.includes(key as (typeof activeStages.value)[number])
const chatStore = useChatStore()

/** D9/D18 开发阶段分段：IDE 工作区=开发阶段第二形态（isIde 判定同 IaViewSwitcher 原逻辑） */
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
  <div class="icn-inline" data-testid="ia-nav-centers" :data-active-stages="activeStages.join(',')">
    <nav class="icn-inline__centers" aria-label="六阶段一级导航">
      <template v-for="c in CENTER_NAVS" :key="c.key">
        <!-- D9/D18：④开发=分段控件（沟通协作｜IDE 工作区，同阶段两形态） -->
        <span
          v-if="c.key === 'stage4'"
          class="icn-inline__work"
          :class="{ 'icn-inline__work--active': isActive('stage4') }"
          data-testid="ia-nav-center-work"
        >
          <button
            type="button"
            class="icn-inline__center-btn icn-inline__seg"
            :class="{ 'icn-inline__seg--cur': isActive('stage4') && !isIde }"
            data-testid="ia-nav-center-work-collab"
            :aria-current="isActive('stage4') && !isIde ? 'page' : undefined"
            @click="onGoCenter('ia2.stage4')"
          >{{ navLocale === 'zh' ? c.labelZh : c.labelEn }}</button>
          <button
            type="button"
            class="icn-inline__center-btn icn-inline__seg"
            :class="{ 'icn-inline__seg--cur': isIde }"
            data-testid="ia-nav-center-work-ide"
            :aria-current="isActive('stage4') && isIde ? 'page' : undefined"
            @click="onToggleWorkbench"
          >{{ navLocale === 'zh' ? 'IDE 工作区' : 'IDE Workspace' }}</button>
        </span>
        <button
          v-else
          type="button"
          class="icn-inline__center-btn"
          :class="{ 'icn-inline__center-btn--active': isActive(c.key) }"
          :data-testid="`ia-nav-center-${c.key}`"
          :aria-current="isActive(c.key) ? 'page' : undefined"
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
.icn-inline__work--active .icn-inline__seg { color: var(--accent-primary, var(--color-primary)); }
.icn-inline__seg--cur { background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 12%, transparent); font-weight: 600; }
.icn-inline__center-btn {
  border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: 13px; padding: 0 12px; margin: 5px 0; border-radius: 6px;
  color: var(--text-muted, var(--color-text-secondary)); white-space: nowrap;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
  &--active {
    color: var(--accent-primary, var(--color-primary));
    background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 12%, transparent);
    font-weight: 600;
  }
}</style>
