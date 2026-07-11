<!-- overlay/custom/client/loop/components/LoopApprovalDialog.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'

const store = useLoopStore()
const emit = defineEmits<{ (e: 'approve' | 'reject' | 'changes-requested'): void }>()
const comment = ref('')
</script>

<template>
  <div class="approval-dialog">
    <div class="approval-dialog__overlay" @click="emit('reject')"></div>
    <div class="approval-dialog__dialog">
      <h3>人工审批</h3>
      <p>请审查 worktree 中的变更后决定：</p>
      <textarea v-model="comment" placeholder="评语（退回修改时给 maker agent）"></textarea>
      <div class="approval-dialog__actions">
        <button @click="emit('approve')">✅ 批准</button>
        <button @click="emit('reject')">❌ 拒绝</button>
        <button @click="emit('changes-requested')">↩ 退回修改</button>
      </div>
    </div>
  </div>
</template>
