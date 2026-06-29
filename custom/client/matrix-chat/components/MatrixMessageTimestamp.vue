<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  eventDate: Date | null
  alwaysShow?: boolean
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alwaysShow: false,
  visible: false,
})

const time = computed(() => {
  if (!props.eventDate) return ''
  return props.eventDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
})

const fullTime = computed(() => {
  if (!props.eventDate) return ''
  return props.eventDate.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})
</script>

<template>
  <div
    class="mx_MessageTimestamp"
    :class="{ 'mx_MessageTimestamp--visible': alwaysShow || visible }"
    :title="fullTime"
  >
    {{ time }}
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_MessageTimestamp {
  position: absolute;
  left: 0;
  top: 1px;
  width: 56px;
  text-align: center;
  font-size: 11px;
  color: $text-muted;
  opacity: 0;
  transition: opacity $transition-fast;
  pointer-events: none;

  &--visible {
    opacity: 1;
  }
}
</style>
