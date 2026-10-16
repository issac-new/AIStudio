<script setup lang="ts">
// A0 三中心导航条（壳级，2026-10-16 走查修正版）：原挂 WorkbenchView 中栏画布，
// sim/gov 路由不渲染画布致跨中心切换断链（用户走查发现）——升为 IaGlobalTop 顶部行，
// 所有 /app 子路由（工作台/推演中心/治理中心）通用一处渲染。
// 左=三中心场景条（当前中心高亮，按路由前缀判定）；右=岛屿入口组+[设置]。
// 镜头切换器位：Phase D 镜头层已随需求 §六 Q1 解体取消，不建不渲染。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CENTER_NAVS, ISLAND_NAVS, centerForPath, useCenterNavLocale } from '../nav-centers'
import { features } from '../../../../config/features'

const route = useRoute()
const router = useRouter()
const navLocale = useCenterNavLocale()
const activeCenter = computed(() => centerForPath(route.path))
const visibleIslands = computed(() => ISLAND_NAVS.filter(i => features[i.featureKey]))
function onGoCenter(name: string): void {
  void router.push({ name })
}
function onGoSettings(): void {
  void router.push({ name: 'hermes.settings' })
}
</script>

<template>
  <header class="icn" data-testid="ia-nav-centers">
    <nav class="icn__centers" aria-label="三中心导航">
      <button
        v-for="c in CENTER_NAVS" :key="c.key" type="button"
        class="icn__center-btn"
        :class="{ 'icn__center-btn--active': activeCenter === c.key }"
        :data-testid="`ia-nav-center-${c.key}`"
        :aria-current="activeCenter === c.key ? 'page' : undefined"
        @click="onGoCenter(c.name)"
      >{{ navLocale === 'zh' ? c.labelZh : c.labelEn }}</button>
    </nav>
    <div class="icn__spacer" />
    <div class="icn__islands" data-testid="ia-nav-islands">
      <button
        v-for="isl in visibleIslands" :key="isl.testid" type="button"
        class="icn__island-btn"
        :data-testid="isl.testid"
        :title="navLocale === 'zh' ? isl.labelZh : isl.labelEn"
        @click="onGoCenter(isl.name)"
      >{{ navLocale === 'zh' ? isl.labelZh : isl.labelEn }}</button>
      <button
        type="button" class="icn__island-btn"
        data-testid="ia-nav-settings"
        @click="onGoSettings"
      >{{ navLocale === 'zh' ? '设置' : 'Settings' }}</button>
    </div>
  </header>
</template>

<style scoped>
.icn {
  height: 40px; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px; padding: 0 10px;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px;
}
.icn__centers { display: flex; align-items: stretch; height: 100%; gap: 2px; }
.icn__center-btn {
  border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: 13px; padding: 0 14px; margin: 5px 0; border-radius: 6px;
  color: var(--text-muted, var(--color-text-secondary, #878c99)); white-space: nowrap;
  &:hover { color: var(--text-primary, inherit); background: var(--bg-secondary, #f1f2f4); }
  &--active {
    color: var(--accent-primary, var(--color-primary, #3b82f6));
    background: color-mix(in srgb, var(--accent-primary, var(--color-primary, #3b82f6)) 12%, transparent);
    font-weight: 600;
  }
}
.icn__spacer { flex: 1; }
.icn__islands { display: flex; align-items: center; gap: 4px; }
.icn__island-btn {
  display: flex; align-items: center; height: 26px; padding: 0 9px;
  border-radius: 6px; border: 1px solid transparent; background: transparent;
  color: var(--text-secondary, inherit); cursor: pointer; font-size: 12px;
  font-family: inherit; white-space: nowrap; flex-shrink: 0;
  &:hover { background: var(--bg-secondary, #f1f2f4); color: var(--text-primary, inherit); }
}
</style>
