<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 六区域壳：左侧 IaNav 窄栏 + 右侧区域 router-view。
     路由路径 → 当前区域的投影经 store.syncFromPath（IaNav 高亮唯一驱动）。 -->
<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import IaNav from '@/custom/ia2/components/IaNav.vue'
import { useIaStore } from '@/custom/ia2/store/ia'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const store = useIaStore()

watch(
  () => route.path,
  path => store.syncFromPath(path),
  { immediate: true },
)
</script>

<template>
  <div class="ia-shell">
    <IaNav />
    <div class="ia-shell__main">
      <router-view />
    </div>
  </div>
</template>
