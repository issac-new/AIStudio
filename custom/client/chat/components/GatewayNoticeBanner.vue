<template>
  <div v-if="showBanner" class="gateway-notice-banner">
    <span class="gateway-notice-icon">⚠️</span>
    <span class="gateway-notice-text">{{ noticeMessage }}</span>
    <button class="gateway-notice-close" @click="dismiss" title="关闭">×</button>
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import { useGatewayNoticeBanner, type Message } from '@/custom/chat/useGatewayNoticeBanner'

const props = defineProps<{
  sessionId: string | null
  messages: readonly Message[]
}>()

const sessionIdRef = toRef(props, 'sessionId')
const messagesRef = toRef(props, 'messages')

const { showBanner, noticeMessage, dismiss } = useGatewayNoticeBanner(sessionIdRef, messagesRef)
</script>

<style scoped>
.gateway-notice-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 193, 7, 0.1);
  border-bottom: 1px solid rgba(255, 193, 7, 0.3);
  font-size: 0.85em;
  color: var(--text-secondary, #888);
  flex-shrink: 0;
}

.gateway-notice-icon {
  flex-shrink: 0;
  line-height: 1.4;
}

.gateway-notice-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  line-height: 1.4;
}

.gateway-notice-close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2em;
  line-height: 1;
  color: var(--text-secondary, #888);
  padding: 0 4px;
  opacity: 0.6;
}

.gateway-notice-close:hover {
  opacity: 1;
}
</style>
