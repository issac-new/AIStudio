<!-- overlay/custom/client/loop/components/VerifierPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'
import type { VerificationRecord } from '@/custom/loop/types'

const store = useLoopStore()

// Find verification records from events
const records = computed(() => {
  return store.currentEvents
    .filter(e => e.type === 'loop.verification-complete')
    .map(e => ({ contractId: (e as any).contractId, passed: (e as any).passed }))
})
</script>

<template>
  <div class="verifier-panel">
    <div v-for="r in records" :key="r.contractId" class="verifier-panel__record">
      <span>{{ r.contractId }}</span>
      <span :class="r.passed ? 'pass' : 'fail'">{{ r.passed ? '✅' : '❌' }}</span>
    </div>
  </div>
</template>
