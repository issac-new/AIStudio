<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore, type TerminalLineKind } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const draft = ref('')

const root = computed(() => store.selectedTask?.workspace ?? '~')
const lines = computed(() => store.terminalLines)

const KIND_PREFIX: Record<TerminalLineKind, string> = {
  prompt: '❯',
  info: 'ℹ',
  ok: '✓',
  warn: '!',
  dim: '',
}

function onEnter() {
  if (!draft.value.trim()) return
  store.sendTerminalCommand(draft.value)
  draft.value = ''
}
</script>

<template>
  <div class="cockpit-terminal-pane">
    <div class="cockpit-terminal-pane__head">
      <span class="cockpit-terminal-pane__title">⌘ Claude Code</span>
      <code class="cockpit-terminal-pane__root">{{ root }}</code>
      <span class="cockpit-terminal-pane__sandbox">{{ t('cockpit.termSandbox') }}</span>
      <button type="button" data-action="exit" class="cockpit-terminal-pane__exit" @click="store.exitTerminal()">✕ {{ t('cockpit.termExit') }}</button>
    </div>
    <div class="cockpit-terminal-pane__body">
      <div v-for="(ln, i) in lines" :key="i" class="cockpit-terminal-pane__line" :class="'is-' + ln.kind">
        <span v-if="KIND_PREFIX[ln.kind]" class="cockpit-terminal-pane__prefix">{{ KIND_PREFIX[ln.kind] }}</span>
        <span class="cockpit-terminal-pane__text">{{ ln.text }}</span>
      </div>
    </div>
    <div class="cockpit-terminal-pane__comp">
      <span class="cockpit-terminal-pane__prompt">❯</span>
      <input v-model="draft" class="cockpit-terminal-pane__input" :placeholder="t('cockpit.termPlaceholder')" @keydown.enter="onEnter">
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-terminal-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; background: #1a1a1a; color: #d4d4d4; font-family: ui-monospace, 'SF Mono', monospace; }
.cockpit-terminal-pane__head { flex-shrink: 0; padding: 8px 14px; background: #0d0d0d; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #ccc; }
.cockpit-terminal-pane__title { color: #e0e0e0; font-weight: 600; }
.cockpit-terminal-pane__root { font-size: 10px; color: #888; background: #1a1a1a; padding: 2px 7px; border-radius: 3px; border: 1px solid #333; }
.cockpit-terminal-pane__sandbox { font-size: 9px; color: #999; border: 1px solid #444; border-radius: 3px; padding: 1px 6px; }
.cockpit-terminal-pane__exit { margin-left: auto; cursor: pointer; color: #888; font-size: 11px; border: none; background: transparent; font: inherit;
  &:hover { color: #fff; }
}
.cockpit-terminal-pane__body { flex: 1; overflow-y: auto; padding: 12px 14px; font-size: 12px; line-height: 1.7; }
.cockpit-terminal-pane__line { white-space: pre-wrap; word-break: break-word; display: flex; gap: 6px; }
.cockpit-terminal-pane__prefix { flex-shrink: 0; }
.cockpit-terminal-pane__line.is-prompt .cockpit-terminal-pane__prefix { color: #e8a838; }
.cockpit-terminal-pane__line.is-prompt .cockpit-terminal-pane__text { color: #fff; }
.cockpit-terminal-pane__line.is-info .cockpit-terminal-pane__prefix { color: #6ba3d6; }
.cockpit-terminal-pane__line.is-ok .cockpit-terminal-pane__prefix { color: #66bb6a; }
.cockpit-terminal-pane__line.is-warn .cockpit-terminal-pane__prefix { color: #e8a838; }
.cockpit-terminal-pane__line.is-dim { color: #666; }
.cockpit-terminal-pane__comp { flex-shrink: 0; padding: 8px 14px; border-top: 1px solid #333; background: #0d0d0d; display: flex; align-items: center; gap: 8px; }
.cockpit-terminal-pane__prompt { color: #e8a838; font-size: 12px; }
.cockpit-terminal-pane__input { flex: 1; font-family: inherit; font-size: 12px; border: none; background: transparent; color: #d4d4d4; outline: none; }
</style>
