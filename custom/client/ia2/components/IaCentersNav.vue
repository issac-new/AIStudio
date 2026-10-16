<script setup lang="ts">
// A0 三中心导航（壳级内联版；2026-10-16 D8 全盘重规划：岛屿组退役顶栏，
// BPA/本体/评测/技能治理归治理中心「治理工作台」区；本组件只承载三中心条）。
// 镜头切换器位：Phase D 镜头层已随需求 §六 Q1 解体取消，不建不渲染。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CENTER_NAVS, centerForPath, useCenterNavLocale } from '../nav-centers'


const route = useRoute()
const router = useRouter()
const navLocale = useCenterNavLocale()
const activeCenter = computed(() => centerForPath(route.path))
function onGoCenter(name: string): void {
  void router.push({ name })
}
</script>

<template>
  <div class="icn-inline" data-testid="ia-nav-centers">
    <nav class="icn-inline__centers" aria-label="三中心导航">
      <button
        v-for="c in CENTER_NAVS" :key="c.key" type="button"
        class="icn-inline__center-btn"
        :class="{ 'icn-inline__center-btn--active': activeCenter === c.key }"
        :data-testid="`ia-nav-center-${c.key}`"
        :aria-current="activeCenter === c.key ? 'page' : undefined"
        @click="onGoCenter(c.name)"
      >{{ navLocale === 'zh' ? c.labelZh : c.labelEn }}</button>
    </nav>
  </div>
</template>

<style scoped>
.icn-inline { display: flex; align-items: center; height: 100%; flex-shrink: 0; }
.icn-inline__centers { display: flex; align-items: stretch; height: 100%; gap: 2px; }
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
