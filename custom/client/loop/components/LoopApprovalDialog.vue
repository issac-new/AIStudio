<!-- overlay/custom/client/loop/components/LoopApprovalDialog.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'

const store = useLoopStore()
const { t } = useI18n()
// M8: emit 时携带 comment(退回修改时给 maker agent 用)。
const emit = defineEmits<{
  (e: 'approve', comment: string): void
  (e: 'reject', comment: string): void
  (e: 'changes-requested', comment: string): void
}>()
const comment = ref('')
</script>

<template>
  <div class="approval-dialog">
    <div class="approval-dialog__overlay" @click="emit('reject', comment)"></div>
    <div class="approval-dialog__dialog">
      <h3>{{ t('loop.approval.title') }}</h3>
      <p>{{ t('loop.approval.prompt') }}</p>
      <textarea v-model="comment" :placeholder="t('loop.approval.comment')"></textarea>
      <div class="approval-dialog__actions">
        <button @click="emit('approve', comment)">{{ t('loop.approval.approve') }}</button>
        <button @click="emit('reject', comment)">{{ t('loop.approval.reject') }}</button>
        <button @click="emit('changes-requested', comment)">{{ t('loop.approval.changesRequested') }}</button>
      </div>
    </div>
  </div>
</template>
