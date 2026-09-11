<script setup lang="ts">
defineProps<{ label: string }>()
defineEmits<{ (e: 'expand'): void }>()
</script>

<template>
  <div class="cockpit-rail" role="button" tabindex="0"
       @click="$emit('expand')" @keydown.enter="$emit('expand')">
    <span class="cockpit-rail__label">{{ label }}</span>
  </div>
</template>
