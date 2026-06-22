<script setup lang="ts">
interface Props {
  size?: number
}
withDefaults(defineProps<Props>(), { size: 18 })
</script>

<template>
  <div
    class="mx_Spinner"
    :style="{ width: size + 'px', height: size + 'px' }"
    role="status"
    aria-label="Loading"
  />
</template>

<style scoped lang="scss">
.mx_Spinner {
  border: 2px solid var(--border-color, #e0e0e0);
  border-top-color: var(--accent-primary, #333333);
  border-radius: 50%;
  animation: mx-spin 0.7s linear infinite;
  display: inline-block;
}

@keyframes mx-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
