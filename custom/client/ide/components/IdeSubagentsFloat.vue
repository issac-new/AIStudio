<script setup lang="ts">
// IdeSubagentsFloat — 子代理名册浮窗：枚举 chatStore.subagentStreams 中当前
// 会话的全部子代理（key = sessionId:subagentId），点选即在浮窗内展开上游
// SubagentStreamPanel；focusId prop 承接消息流子代理工具卡的开窗请求。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore, type SubagentStream } from '@/stores/hermes/chat'
import SubagentStreamPanel from '@/components/hermes/chat/SubagentStreamPanel.vue'
import { chatSessionAgentAvatar } from '@/utils/chat-agent-avatar'
import IdeFloatPanel from './IdeFloatPanel.vue'
import { useIdeStore } from '../store/ide'
import { formatRelativeTime } from '../utils/time'

const props = defineProps<{ focusId?: string | null }>()
const { t } = useI18n()
const ide = useIdeStore()
const chat = useChatStore()

const agents = computed<SubagentStream[]>(() => {
  const sid = chat.activeSessionId
  if (!sid) return []
  const list: SubagentStream[] = []
  const prefix = `${sid}:`
  for (const [key, stream] of chat.subagentStreams) {
    if (key.startsWith(prefix)) list.push(stream)
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
})

const selectedId = ref<string | null>(null)
const selected = computed(() => agents.value.find(a => a.subagentId === selectedId.value) ?? null)

// 会话切换清选中；名册里选中项消失回落空态
watch(() => chat.activeSessionId, () => { selectedId.value = null })
watch(agents, (list) => {
  if (selectedId.value && !list.some(a => a.subagentId === selectedId.value)) {
    selectedId.value = null
  }
})

// 消息流开窗请求（IdeChatPane 转发）：开窗即选中目标子代理
watch(() => props.focusId, (id) => {
  if (id) selectedId.value = id
}, { immediate: true })

function select(stream: SubagentStream): void {
  selectedId.value = stream.subagentId
}
</script>

<template>
  <IdeFloatPanel :title="t('ide.float.agentsTitle')" testid="ide-float-agents" @close="ide.toggleFloat('agents')">
    <div class="ide-agents">
      <ul v-if="agents.length" class="ide-agents__list" data-testid="ide-float-agents-list">
        <li v-for="a in agents" :key="a.subagentId">
          <button
            type="button"
            class="ide-agents__item"
            :class="{ 'is-active': a.subagentId === selectedId }"
            :data-testid="`ide-float-agent-${a.subagentId}`"
            :title="a.goal || a.subagentId"
            @click="select(a)"
          >
            <span class="ide-agents__dot" :class="`is-${a.status}`" />
            <span class="ide-agents__name">{{ a.subagentId }}</span>
            <span class="ide-agents__time">{{ formatRelativeTime(t, a.updatedAt) }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="ide-float__empty" data-testid="ide-float-agents-empty">{{ t('ide.float.agentsEmpty') }}</p>
      <SubagentStreamPanel
        v-if="selected"
        class="ide-agents__panel"
        :agent="chatSessionAgentAvatar(chat.activeSession)"
        :stream="selected"
        @close="selectedId = null"
      />
    </div>
  </IdeFloatPanel>
</template>

<style scoped lang="scss">
.ide-agents {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ide-agents__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ide-agents__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  cursor: pointer;
  text-align: left;

  &:hover { background: var(--bg-tertiary, #ebebeb); }
  &.is-active {
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
    .ide-agents__name { color: var(--accent-primary, #4cc9f0); }
  }
}

.ide-agents__dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted, #9aa0aa);

  &.is-running { background: #4cc9f0; }
  &.is-completed { background: #98c379; }
  &.is-failed, &.is-error, &.is-cancelled, &.is-interrupted { background: #e06c75; }
}

.ide-agents__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}

.ide-agents__time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}

.ide-agents__panel {
  border-top: 1px solid var(--border-color, #26292f);
  padding-top: 6px;
}
</style>
