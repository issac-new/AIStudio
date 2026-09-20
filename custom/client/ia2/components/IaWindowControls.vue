<!-- overlay/custom/client/ia2/components/IaWindowControls.vue -->
<!-- v12.3 栏控簇（2026-09-20 用户裁定：窗控改三栏栏控）：◀折叠左栏｜最大化中栏｜
     折叠右栏▶｜⧉独立窗口。按当前视图分派——/app 沟通协作三栏（工作流|对象画布|
     任务决策，flow.layout）；/ide 工作台三栏（侧栏|会话|辅助面板，ide.layout）。
     独立=桌面 IPC/web window.open（standalone=1 精简壳），合入按钮仍在独立窗
     IaPopoutBar。原页级 max=1 最小化任务栏入口退役（wm minimize 链路一并清理）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useFlowStore } from '../store/flow'
import { useIdeStore } from '@/custom/ide/store/ide'
import { openPanelWindow } from '../wm/popout'

const route = useRoute()
const { t } = useI18n()
const flow = useFlowStore()
const ide = useIdeStore()

const isIde = computed(() => route.path === '/ide' || route.path.startsWith('/ide/'))
const isMax = computed(() => isIde.value ? ide.layout.chat.maximized : flow.centerMaximized)

function toggleFoldLeft(): void {
  if (isIde.value) ide.toggleFold('sidebar')
  else flow.toggleFold('left')
}

/** 右栏折叠：IDE 侧无 sidepane folded 位（折叠由 sidePane.open 承载） */
function toggleFoldRight(): void {
  if (isIde.value) ide.toggleSidePane()
  else flow.toggleFold('right')
}

function toggleCenterMax(): void {
  if (isIde.value) ide.toggleMax('chat')
  else flow.toggleCenterMax()
}

/** 弹出独立窗口承载当前操作页（合入仍在独立窗内） */
function popOutCurrent(): void {
  void openPanelWindow({ path: route.fullPath })
}
</script>

<template>
  <div class="ia-wm" data-testid="ia-window-controls">
    <button type="button" class="ia-wm__btn" data-testid="ia-wm-fold-left"
      :title="t('ia2.wm.foldLeft')" @click="toggleFoldLeft"
    >◀</button>
    <button type="button" class="ia-wm__btn" data-testid="ia-wm-max-center"
      :title="isMax ? t('ia2.wm.restoreCenter') : t('ia2.wm.maxCenter')" @click="toggleCenterMax"
    >{{ isMax ? '⤡' : '⤢' }}</button>
    <button type="button" class="ia-wm__btn" data-testid="ia-wm-fold-right"
      :title="t('ia2.wm.foldRight')" @click="toggleFoldRight"
    >▶</button>
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
  color: var(--text-secondary); cursor: pointer; font-size: 12px; line-height: 1;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
</style>
