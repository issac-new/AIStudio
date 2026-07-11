<!-- overlay/custom/client/loop/views/LoopSpineView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopSidebar from '@/custom/loop/components/LoopSidebar.vue'
import LoopTable from '@/custom/loop/components/LoopTable.vue'
import LoopCreateWizard from '@/custom/loop/components/LoopCreateWizard.vue'

const store = useLoopStore()
const router = useRouter()
const showWizard = ref(false)

onMounted(() => { store.fetchLoops() })

function onSelect(id: string) {
  router.push({ name: 'hermes.loopDetail', params: { id } })
}
</script>

<template>
  <div class="loop-spine">
    <div class="loop-spine__sidebar">
      <LoopSidebar />
      <button class="loop-spine__new" @click="showWizard = true">+ 新建 Loop</button>
    </div>
    <div class="loop-spine__main">
      <h2 class="loop-spine__title">Loop Engineering</h2>
      <LoopTable @select="onSelect" />
    </div>
    <LoopCreateWizard v-if="showWizard" @close="showWizard = false" />
  </div>
</template>
