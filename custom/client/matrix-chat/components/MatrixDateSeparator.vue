<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  date: Date | string
}

const props = defineProps<Props>()

const formattedDate = computed(() => {
  const d = typeof props.date === 'string' ? new Date(props.date) : props.date
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString()

  if (isToday) return 'Today'
  if (isYesterday) return 'Yesterday'

  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})
</script>

<template>
  <div class="mx_DateSeparator">
    <span class="mx_DateSeparator_text">{{ formattedDate }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_DateSeparator {
  display: flex;
  align-items: center;
  gap: var(--mx-space-2x, 8px);
  padding: var(--mx-space-2x, 8px) 0;
  margin: var(--mx-space-1x, 4px) 0;

  // Flanking hairlines (element style)
  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-color);
  }
}

.mx_DateSeparator_text {
  font-size: var(--mx-font-13px, 13px);
  font-weight: 500;
  color: var(--mx-text-tertiary, #{$text-muted});
  white-space: nowrap;
  // remove the old bordered-pill background/border
  background: none;
  border: none;
  padding: 0;
  border-radius: 0;
}
</style>
