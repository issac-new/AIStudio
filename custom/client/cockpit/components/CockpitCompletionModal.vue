<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// 完成校验弹窗：标记 done 前强制填完成摘要，summary 写入 patch.result。
const props = defineProps<{
  show: boolean
}>()
const emit = defineEmits<{
  submit: [summary: string]
  cancel: []
}>()

const { t } = useI18n()
const summary = ref('')

watch(() => props.show, (v) => {
  if (v) summary.value = ''
})
</script>

<template>
  <Transition name="cockpit-dialog">
    <div v-if="show" class="cockpit-modal" role="dialog" aria-modal="true">
      <div class="cockpit-modal__mask" @click="emit('cancel')" />
      <div class="cockpit-modal__box">
        <div class="cockpit-modal__title">{{ t('cockpit.moveToDone') }}</div>
        <div class="cockpit-modal__hint">{{ t('cockpit.completionSummaryRequired') }}</div>
        <textarea v-model="summary" class="cockpit-modal__textarea"
          :placeholder="t('cockpit.completionSummaryRequired')"
          @keydown.enter.meta="emit('submit', summary.trim())" />
        <div class="cockpit-modal__actions">
          <button type="button" class="cockpit-modal__btn" @click="emit('cancel')">
            {{ t('cockpit.handleLater') }}
          </button>
          <button type="button" class="cockpit-modal__btn is-pri"
            :disabled="!summary.trim()"
            @click="emit('submit', summary.trim())">
            {{ t('cockpit.moveToDone') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.cockpit-modal { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
.cockpit-modal__mask { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
.cockpit-modal__box { position: relative; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px 20px; max-width: 480px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.cockpit-modal__title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.cockpit-modal__hint { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }
.cockpit-modal__textarea { width: 100%; font-family: inherit; font-size: 13px; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; background: var(--bg-card); color: var(--text-primary); min-height: 80px; resize: vertical; box-sizing: border-box; }
.cockpit-modal__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.cockpit-modal__btn { font: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.cockpit-dialog-enter-active, .cockpit-dialog-leave-active { transition: opacity 0.15s ease; }
.cockpit-dialog-enter-from, .cockpit-dialog-leave-to { opacity: 0; }
</style>
