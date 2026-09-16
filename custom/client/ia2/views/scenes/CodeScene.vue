<!-- overlay/custom/client/ia2/views/scenes/CodeScene.vue -->
<!-- Code 场景（Task 8 填充）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <section class="scene-frame" data-testid="scene-code">
    <header class="scene-frame__head">{{ t('loopCockpit.scene.code') }}</header>
  </section>
</template>

<style scoped>
.scene-frame { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 12px 16px; }
.scene-frame__head { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
</style>
