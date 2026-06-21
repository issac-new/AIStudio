<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
})
</script>

<template>
  <div v-if="visible" class="mx_ReadMarker">
    <div class="mx_ReadMarker_line" />
    <span class="mx_ReadMarker_text">{{ t('matrixChat.newMessages') }}</span>
    <div class="mx_ReadMarker_line" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_ReadMarker {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  margin: 4px 0;
}

.mx_ReadMarker_line {
  flex: 1;
  height: 2px;
  background: var(--accent-primary);
}

.mx_ReadMarker_text {
  font-size: 11px;
  color: var(--accent-primary);
  font-weight: 500;
  white-space: nowrap;
}
</style>
