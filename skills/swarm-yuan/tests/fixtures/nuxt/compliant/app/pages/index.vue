<script setup lang="ts">
// compliant fixture:
//   - useAsyncData 配显式 key 'home-now' → fw_nuxt_fetch_key pass
//   - Date.now() 在 onMounted 内（仅客户端）→ fw_nuxt_hydration pass
import { ref, onMounted } from 'vue';

const { data } = await useAsyncData('home-now', () => $fetch('/api/now'));

const renderedAt = ref<number>(0);
onMounted(() => {
  // 仅客户端执行，无 hydration mismatch
  renderedAt.value = Date.now();
});
</script>

<template>
  <div>
    <p>data: {{ data }}</p>
    <p>rendered at: {{ renderedAt }}</p>
  </div>
</template>
