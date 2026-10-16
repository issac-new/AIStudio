<script setup lang="ts">
// A0 三中心导航（壳级内联版，2026-10-16 走查二修）：拆 part 双挂——
// centers=三中心场景条（IaShellHeader 行首），islands=岛屿组（右侧，Sitline 前）。
// 走查去重：设置钮让位用户钮（整钮即设置页）；IDE 岛让位 IaViewSwitcher（视图切换器）。
// 镜头切换器位：Phase D 镜头层已随需求 §六 Q1 解体取消，不建不渲染。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CENTER_NAVS, ISLAND_NAVS, centerForPath, useCenterNavLocale } from '../nav-centers'
import { features } from '../../../../config/features'

withDefaults(defineProps<{ part?: 'centers' | 'islands' }>(), { part: 'centers' })

const route = useRoute()
const router = useRouter()
const navLocale = useCenterNavLocale()
const activeCenter = computed(() => centerForPath(route.path))
// IDE 岛退役（走查去重：IDE 入口=IaViewSwitcher，一处不再两处）
const visibleIslands = computed(() =>
  ISLAND_NAVS.filter(i => features[i.featureKey] && i.testid !== 'ia-nav-island-ide'),
)
function onGoCenter(name: string): void {
  void router.push({ name })
}
</script>

<template>
  <div v-if="part === 'centers'" class="icn-inline" data-testid="ia-nav-centers">
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
  <div v-else class="icn-inline" data-testid="ia-nav-islands">
    <button
      v-for="isl in visibleIslands" :key="isl.testid" type="button"
      class="icn-inline__island-btn"
      :data-testid="isl.testid"
      :title="navLocale === 'zh' ? isl.labelZh : isl.labelEn"
      @click="onGoCenter(isl.name)"
    >{{ navLocale === 'zh' ? isl.labelZh : isl.labelEn }}</button>
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
}
.icn-inline__island-btn {
  display: flex; align-items: center; height: 26px; padding: 0 8px; margin-left: 2px;
  border-radius: 6px; border: 1px solid transparent; background: transparent;
  color: var(--text-secondary, inherit); cursor: pointer; font-size: 12px;
  font-family: inherit; white-space: nowrap; flex-shrink: 0;
  &:hover { background: var(--bg-secondary, #f1f2f4); color: var(--text-primary, inherit); }
}
</style>
