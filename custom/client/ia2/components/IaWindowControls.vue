<!-- overlay/custom/client/ia2/components/IaWindowControls.vue -->
<!-- 窗口管理窗控簇（2026-09-18 统一导航 /goal 追加）：作用于「当前操作页」——
     最大化（URL max=1，壳隐藏页头/场景条）/ 最小化（收进底部任务栏，主区回总览）/
     弹出独立窗口（桌面 IPC / web window.open，standalone=1）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWmStore } from '../wm/store'
import { openPanelWindow } from '../wm/popout'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const wm = useWmStore()

const isMaximized = computed(() => route.query.max === '1')

/** 最大化/还原：URL query 携带（可书签；弹出窗内同样生效） */
function toggleMaximize(): void {
  const query = { ...route.query }
  if (isMaximized.value) delete query.max
  else query.max = '1'
  void router.replace({ query })
}

/** 最小化：当前页收进任务栏，主区回总览 */
function minimizeCurrent(): void {
  wm.minimize(route.fullPath)
  if (route.path !== '/app') void router.push('/app')
}

/** 弹出独立窗口承载当前操作页 */
function popOutCurrent(): void {
  void openPanelWindow({ path: route.fullPath })
}
</script>

<template>
  <div class="ia-wm" data-testid="ia-window-controls">
    <button type="button" class="ia-wm__btn" data-testid="ia-wm-maximize"
      :title="isMaximized ? t('ia2.wm.restore') : t('ia2.wm.maximize')"
      @click="toggleMaximize"
    >{{ isMaximized ? '⤡' : '⤢' }}</button>
    <button type="button" class="ia-wm__btn" data-testid="ia-wm-minimize"
      :title="t('ia2.wm.minimize')" @click="minimizeCurrent"
    >▁</button>
    <button type="button" class="ia-wm__btn" data-testid="ia-wm-popout"
      :title="t('ia2.wm.popOut')" @click="popOutCurrent"
    >⧉</button>
  </div>
</template>

<style scoped lang="scss">
.ia-wm { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.ia-wm__btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 6px; background: transparent;
  color: var(--text-secondary); cursor: pointer; font-size: 13px; line-height: 1;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
</style>
