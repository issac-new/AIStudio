<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const draft = ref('')

const channel = computed(() => store.activeChannel)
const messages = computed(() => store.messagesForActiveChannel)

function onSend() {
  if (!draft.value.trim()) return
  store.sendMessage(draft.value)
  draft.value = ''
}
</script>

<template>
  <div class="cockpit-chat-pane">
    <template v-if="channel">
      <div class="cockpit-chat-pane__head">
        <div>
          <div class="cockpit-chat-pane__title">{{ channel.label }}</div>
          <div class="cockpit-chat-pane__sub">{{ channel.members.join(' · ') }}</div>
        </div>
        <button type="button" class="cockpit-chat-pane__back" @click="store.setWorkspaceMode('work')">{{ t('cockpit.backToWork') }}</button>
      </div>
      <div class="cockpit-chat-pane__msgs">
        <div
          v-for="m in messages"
          :key="m.id"
          :data-message-id="m.id"
          class="cockpit-chat-pane__msg"
          :class="{ 'is-me': m.isMe }"
        >
          <div class="cockpit-chat-pane__msg-author">{{ m.author }}</div>
          <div class="cockpit-chat-pane__msg-text">{{ m.text }}</div>
        </div>
      </div>
      <div class="cockpit-chat-pane__comp">
        <input v-model="draft" class="cockpit-chat-pane__input" :placeholder="t('cockpit.saySomething')" @keydown.enter="onSend">
        <button type="button" data-action="send" class="cockpit-chat-pane__send" @click="onSend">{{ t('cockpit.send') }}</button>
      </div>
    </template>
    <div v-else class="cockpit-chat-pane__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-chat-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--bg-card); }
.cockpit-chat-pane__head { flex-shrink: 0; padding: 10px 16px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 8px; }
.cockpit-chat-pane__title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.cockpit-chat-pane__sub { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.cockpit-chat-pane__back { margin-left: auto; font-size: 10px; color: var(--accent-primary); cursor: pointer; border: none; background: transparent; font: inherit;
  &:hover { text-decoration: underline; }
}
.cockpit-chat-pane__msgs { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.cockpit-chat-pane__msg { display: flex; flex-direction: column; gap: 2px; max-width: 80%;
  &.is-me { align-self: flex-end; align-items: flex-end; }
}
.cockpit-chat-pane__msg-author { font-size: 10px; color: var(--text-muted); }
.cockpit-chat-pane__msg-text { font-size: 12px; color: var(--text-primary); background: var(--bg-secondary); border-radius: 0 6px 6px 6px; padding: 8px 12px; line-height: 1.6; }
.is-me .cockpit-chat-pane__msg-text { background: var(--accent-primary); color: var(--text-on-accent); border-radius: 6px 0 6px 6px; }
.cockpit-chat-pane__comp { flex-shrink: 0; padding: 10px 16px; border-top: 1px solid var(--border-color); display: flex; gap: 8px; align-items: center; }
.cockpit-chat-pane__input { flex: 1; font: inherit; font-size: 12px; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 11px; color: var(--text-primary); }
.cockpit-chat-pane__send { font: inherit; font-size: 12px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--accent-primary); background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-weight: 600; }
.cockpit-chat-pane__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
</style>
