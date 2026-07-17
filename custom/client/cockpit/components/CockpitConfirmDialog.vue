<script setup lang="ts">
import { useI18n } from 'vue-i18n'
// 轻量确认弹窗：vanilla div + transition，复用 cockpit CSS 变量，不引入 Naive UI。
const props = defineProps<{
  show: boolean
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
}>()
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const { t } = useI18n()
</script>

<template>
  <Transition name="cockpit-dialog">
    <div v-if="show" class="cockpit-confirm" role="dialog" aria-modal="true">
      <div class="cockpit-confirm__mask" @click="emit('cancel')" />
      <div class="cockpit-confirm__box">
        <div v-if="title" class="cockpit-confirm__title">{{ title }}</div>
        <div class="cockpit-confirm__content">{{ content }}</div>
        <div class="cockpit-confirm__actions">
          <button type="button" class="cockpit-confirm__btn" @click="emit('cancel')">
            {{ cancelText || t('common.cancel') }}
          </button>
          <button type="button" class="cockpit-confirm__btn is-pri" @click="emit('confirm')">
            {{ confirmText || t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.cockpit-confirm { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
.cockpit-confirm__mask { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
.cockpit-confirm__box { position: relative; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px 20px; max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.cockpit-confirm__title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.cockpit-confirm__content { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px; }
.cockpit-confirm__actions { display: flex; justify-content: flex-end; gap: 8px; }
.cockpit-confirm__btn { font: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}
.cockpit-dialog-enter-active, .cockpit-dialog-leave-active { transition: opacity 0.15s ease; }
.cockpit-dialog-enter-from, .cockpit-dialog-leave-to { opacity: 0; }
</style>
