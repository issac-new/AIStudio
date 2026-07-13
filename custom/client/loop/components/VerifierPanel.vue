<!-- overlay/custom/client/loop/components/VerifierPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import type { VerificationRecord } from '@/custom/loop/types'

const store = useLoopStore()
const { t } = useI18n()

// Find verification records from events
const records = computed(() => {
  return store.currentEvents
    .filter(e => e.type === 'loop.verification-complete')
    .map(e => ({ contractId: (e as any).contractId, passed: (e as any).passed }))
})
</script>

<template>
  <div class="verifier-panel">
    <div v-for="(r, index) in records" :key="r.contractId ?? index" class="verifier-panel__record">
      <span>{{ r.contractId }}</span>
      <span :class="r.passed ? 'verifier-panel__pass' : 'verifier-panel__fail'">{{ r.passed ? '✅' : '❌' }}</span>
    </div>
  </div>
</template>
