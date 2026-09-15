<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 驾驶舱单页壳（2026-09-14 重构：IaNav 六菜单栏退役）。
     overview 区 = 循环驾驶舱本体（自带页头与数据武装，无壳级页头）；
     其余区域（编排/运行/介入/工作项/沟通）渲染 slim 子页头：返回驾驶舱 + 区域标题。
     workspace 流生命周期：视图自武装自回收（LoopCockpitView），壳级卸载兜底
     停止（2026-09-16 审查恢复——InboxView 等子页只武装不回收，离开 /app 必须停）。
     两处挂载点 /app 与 /hermes/loop 行为一致。 -->
<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useWorkspaceStore } from '../store/workspace'
import { IA_AREAS } from '@/custom/ia2/routes'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const store = useIaStore()
const workspace = useWorkspaceStore()

watch(
  () => route.path,
  path => store.syncFromPath(path),
  { immediate: true },
)

// 离开 /app 即停（幂等；视图级回收在 LoopCockpitView onUnmounted，先于本壳执行）
onUnmounted(() => {
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
})

watch(
  () => route.path,
  path => store.syncFromPath(path),
  { immediate: true },
)

/** 驾驶舱区无子页头；其余区域 → slim 页头元数据 */
const subArea = computed(() =>
  store.currentArea === 'overview'
    ? null
    : IA_AREAS.find(a => a.key === store.currentArea) ?? null)
</script>

<template>
  <div class="ia-shell">
    <header v-if="subArea" class="ia-subhead" data-testid="ia-subhead">
      <button
        type="button"
        class="ia-subhead__back"
        data-testid="ia-subhead-back"
        @click="router.push({ name: 'ia2.overview' })"
      >‹ {{ t('loopCockpit.back') }}</button>
      <span class="ia-subhead__title">{{ t(subArea.labelKey) }}</span>
    </header>
    <div class="ia-shell__main">
      <router-view />
    </div>
  </div>
</template>
