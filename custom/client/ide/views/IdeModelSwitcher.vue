<script setup lang="ts">
// IdeModelSwitcher — 会话内模型切换器（R4，antigravity 模型切换器语义）：
// 当前模型显示 + 下拉选择（按 provider 分组的 modelGroups 目录）→ setSessionModel 持久化。
// 落点：IdeChatPane 头部（与 antigravity 的「会话内切换+粘性」一致）。
// 目录未加载或 global codingAgent 会话（模型由 agent 底座管）时渲染诚实禁用态。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useAppStore } from '@/stores/hermes/app'
import { useIdeStore } from '../store/ide'

const { t } = useI18n()
const chatStore = useChatStore()
const appStore = useAppStore()
const ide = useIdeStore()

const open = ref(false)

const session = computed(() => chatStore.activeSession)
// switchSessionModel 对 codingAgentMode==='global' 的会话直接返回 false（模型由
// agent 底座管）；scoped 会话或已有具体 model 的会话才允许在工作台切
const switchable = computed(() => {
  const s = session.value
  if (!s) return false
  return s.codingAgentMode !== 'global' || !!s.model
})

const currentModel = computed(() => session.value?.model || '')

const groups = computed(() => appStore.modelGroups ?? [])
const catalogReady = computed(() => groups.value.length > 0)

async function pick(provider: string, model: string): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) return
  open.value = false
  await chatStore.switchSessionModel(model, provider, sid)
}
</script>

<template>
  <div v-if="switchable" class="ide-model-switcher">
    <button
      type="button"
      class="ide-model-switcher__trigger"
      data-testid="ide-model-switcher"
      :title="t('ide.modelSwitcher.title')"
      @click="open = !open"
    >
      <span class="ide-model-switcher__current">{{ currentModel || t('ide.modelSwitcher.empty') }}</span>
      <span class="ide-model-switcher__chevron">▾</span>
    </button>

    <div v-if="open" class="ide-model-switcher__panel" data-testid="ide-model-switcher-panel">
      <p v-if="!catalogReady" class="ide-model-switcher__state">{{ t('ide.modelSwitcher.loading') }}</p>
      <template v-else>
        <section v-for="g in groups" :key="g.provider" class="ide-model-switcher__group">
          <div class="ide-model-switcher__provider">{{ g.label || g.provider }}</div>
          <button
            v-for="m in g.models"
            :key="`${g.provider}/${m}`"
            type="button"
            class="ide-model-switcher__option"
            :class="{ 'is-active': m === currentModel && session?.provider === g.provider }"
            :data-testid="`ide-model-option-${m}`"
            @click="pick(g.provider, m)"
          >
            {{ m }}
          </button>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-model-switcher {
  position: relative;
}

.ide-model-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  max-width: 220px;

  &:hover { border-color: #61afef; color: #61afef; }
}

.ide-model-switcher__current {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}

.ide-model-switcher__chevron {
  font-size: 9px;
}

.ide-model-switcher__panel {
  position: absolute;
  left: 0;
  top: 24px;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  background: var(--bg-secondary, #1b1e24);
  border: 1px solid var(--border-color, #3a3f4b);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 330;
}

.ide-model-switcher__state {
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  padding: 4px;
}

.ide-model-switcher__provider {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #9aa0aa);
  padding: 4px 6px 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ide-model-switcher__option {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 12px;
  font-family: ui-monospace, monospace;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { background: rgba(255, 255, 255, 0.06); }

  &.is-active {
    color: #61afef;
    background: rgba(97, 175, 239, 0.12);
  }
}
</style>
