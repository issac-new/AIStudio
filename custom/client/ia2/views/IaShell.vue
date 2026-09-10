<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 六区域壳：左侧 IaNav 窄栏 + 右侧区域 router-view。
     路由路径 → 当前区域的投影经 store.syncFromPath（IaNav 高亮唯一驱动）。
     Task 8：fleet（看板聚合）WS 生命周期接管点——原 CockpitView unmount 调
     stopFleetStream；cockpit 退役后由本壳 unmount 承接（离开 /app 即断，
     区域间切换不断，与 Task 4 台账语义一致）。 -->
<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import IaNav from '@/custom/ia2/components/IaNav.vue'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useWorkspaceStore } from '@/custom/ia2/store/workspace'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const store = useIaStore()
const workspace = useWorkspaceStore()

watch(
  () => route.path,
  path => store.syncFromPath(path),
  { immediate: true },
)

onUnmounted(() => {
  workspace.stopFleetStream()
})
</script>

<template>
  <div class="ia-shell">
    <IaNav />
    <div class="ia-shell__main">
      <router-view />
    </div>
  </div>
</template>
