<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const router = useRouter()
const { t } = useI18n()

const draft = ref('')

const channel = computed(() => store.activeChannel)
const messages = computed(() => store.messagesForActiveChannel)

function send() {
  const text = draft.value.trim()
  if (!text) return
  void store.sendMessage(text)
  draft.value = ''
}

function openFull() {
  if (channel.value?.routeTarget) {
    router.push(channel.value.routeTarget)
  }
}
</script>

<template>
  <div class="cockpit-chat-pane">
    <template v-if="channel">
      <div class="cockpit-chat-pane__header">
        <span class="cockpit-chat-pane__label">{{ channel.label }}</span>
        <span class="cockpit-chat-pane__kind">{{ channel.kind }}</span>
        <button v-if="channel.routeTarget" class="cockpit-chat-pane__open" @click="openFull">↗</button>
      </div>
      <div class="cockpit-chat-pane__messages">
        <div
          v-for="m in messages"
          :key="m.id"
          :data-message-id="m.id"
          class="cockpit-chat-pane__msg"
          :class="{ 'is-me': m.isMe }"
        >
          <span class="cockpit-chat-pane__author">{{ m.author }}</span>
          <span class="cockpit-chat-pane__text">{{ m.text }}</span>
        </div>
        <div v-if="messages.length === 0" class="cockpit-chat-pane__no-msg">{{ t('cockpit.noMessages') }}</div>
      </div>
      <div class="cockpit-chat-pane__composer">
        <input
          v-model="draft"
          class="cockpit-chat-pane__input"
          :placeholder="t('cockpit.saySomething')"
          @keydown.enter.prevent="send"
        />
        <button data-action="send" class="cockpit-chat-pane__send" @click="send">{{ t('cockpit.send') }}</button>
      </div>
    </template>
    <div v-else class="cockpit-chat-pane__empty">
      {{ t('cockpit.noTaskSelected') }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-chat-pane { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cockpit-chat-pane__header { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border-color); }
.cockpit-chat-pane__label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.cockpit-chat-pane__kind { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--bg-secondary); color: var(--text-muted); text-transform: uppercase; }
.cockpit-chat-pane__open { margin-left: auto; border: none; background: none; cursor: pointer; color: var(--text-muted); font-size: 14px; }
.cockpit-chat-pane__messages { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
.cockpit-chat-pane__msg { font-size: 13px; }
.cockpit-chat-pane__msg.is-me { align-self: flex-end; text-align: right; }
.cockpit-chat-pane__author { font-weight: 600; margin-right: 6px; color: var(--text-secondary); }
.cockpit-chat-pane__text { color: var(--text-primary); }
.cockpit-chat-pane__no-msg { color: var(--text-muted); font-size: 12px; text-align: center; padding: 16px; }
.cockpit-chat-pane__composer { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border-color); }
.cockpit-chat-pane__input { flex: 1; padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; }
.cockpit-chat-pane__send { padding: 6px 14px; border: none; border-radius: 6px; background: var(--accent-primary); color: #fff; cursor: pointer; font-size: 13px; }
.cockpit-chat-pane__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }
</style>
