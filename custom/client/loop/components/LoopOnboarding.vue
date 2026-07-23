<!-- overlay/custom/client/loop/components/LoopOnboarding.vue -->
<!-- LoopOnboarding — 空状态引导卡片：让用户 3 步理解并使用循环工程 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ (e: 'create'): void }>()
const { t } = useI18n()

const steps = [
  { icon: '🎯', key: 'step1' },
  { icon: '🔍', key: 'step2' },
  { icon: '🔁', key: 'step3' },
]
</script>

<template>
  <div class="loop-onboarding">
    <h3 class="loop-onboarding__title">{{ t('loop.onboarding.title') }}</h3>
    <p class="loop-onboarding__desc">{{ t('loop.onboarding.desc') }}</p>
    <div class="loop-onboarding__steps">
      <div v-for="step in steps" :key="step.key" class="loop-onboarding__step">
        <span class="loop-onboarding__icon">{{ step.icon }}</span>
        <div class="loop-onboarding__text">
          <strong>{{ t(`loop.onboarding.${step.key}.title`) }}</strong>
          <p>{{ t(`loop.onboarding.${step.key}.desc`) }}</p>
        </div>
      </div>
    </div>
    <button class="loop-onboarding__cta" @click="emit('create')">{{ t('loop.onboarding.cta') }}</button>
  </div>
</template>

<style scoped>
.loop-onboarding {
  padding: 2rem;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  text-align: center;
  max-width: 640px;
  margin: 2rem auto;
}
.loop-onboarding__title { margin: 0 0 0.5rem; }
.loop-onboarding__desc { opacity: 0.7; margin-bottom: 1.5rem; }
.loop-onboarding__steps { text-align: left; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
.loop-onboarding__step { display: flex; gap: 1rem; align-items: flex-start; }
.loop-onboarding__icon { font-size: 1.5rem; }
.loop-onboarding__text p { margin: 0.25rem 0 0; opacity: 0.7; font-size: 0.85rem; }
.loop-onboarding__cta {
  padding: 0.6rem 2rem;
  border: none;
  border-radius: 6px;
  background: var(--color-primary, #3b82f6);
  color: white;
  font-size: 1rem;
  cursor: pointer;
}
.loop-onboarding__cta:hover { opacity: 0.9; }
</style>
