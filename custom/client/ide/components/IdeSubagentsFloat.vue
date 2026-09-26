<script setup lang="ts">
// IdeSubagentsFloat — 子代理名册浮窗：枚举 chatStore.subagentStreams 中当前
// 会话的全部子代理（key = sessionId:subagentId），点选即在浮窗内展开上游
// SubagentStreamPanel；focusId prop 承接消息流子代理工具卡的开窗请求。
// R2：idle/completed 状态标「可续话」提示（steer 通道落 R5，当前仅标记）；
// 命中注入指纹的子代理加来源徽标（claude-code 2.1.277 语义）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore, type SubagentStream } from '@/stores/hermes/chat'
import SubagentStreamPanel from '@/components/hermes/chat/SubagentStreamPanel.vue'
import { chatSessionAgentAvatar } from '@/utils/chat-agent-avatar'
import IdeFloatPanel from './IdeFloatPanel.vue'
import { useIdeStore } from '../store/ide'
import { formatRelativeTime } from '../utils/time'
import { scanInjection } from '../utils/subagentGuard'
import IdeTeamSummaryBar from './IdeTeamSummaryBar.vue'

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

// R2：命中注入指纹的子代理 id 集（摘要/末条文本任一命中即标记）
const flaggedIds = computed<Set<string>>(() => {
  const set = new Set<string>()
  for (const a of agents.value) {
    const texts: string[] = []
    if (a.summary) texts.push(a.summary)
    const lastText = [...a.entries].reverse().find((e) => e.kind === 'text' && e.text)
    if (lastText?.text) texts.push(lastText.text)
    if (texts.some((text) => scanInjection(text).length > 0)) set.add(a.subagentId)
  }
  return set
})

// R2：idle/完成态可续话标记（steer 通道落 R5，当前仅视觉提示）
const steerableIds = computed<Set<string>>(
  () => new Set(agents.value.filter((a) => a.status === 'completed' || a.status === 'interrupted').map((a) => a.subagentId)),
)

// R5 子代理 steer 续话（hermes /steer 通道）：注入 `/steer <@subagentId> <text>`
// 文本命令（session-command → bridge.steer → send_message），与 CLI 同一引擎。
const steerDraft = ref('')
watch(selectedId, () => { steerDraft.value = '' })
function sendSteer(): void {
  const text = steerDraft.value.trim()
  if (!text || !selectedId.value) return
  void chat.sendMessage(`/steer @${selectedId.value} ${text}`)
  steerDraft.value = ''
}
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
  <IdeTeamSummaryBar />
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
            <span
              v-if="flaggedIds.has(a.subagentId)"
              class="ide-agents__badge ide-agents__badge--injection"
              data-testid="ide-agent-injection-badge"
              :title="t('ide.injection.badgeTitle')"
            >⚠</span>
            <span
              v-if="steerableIds.has(a.subagentId)"
              class="ide-agents__badge ide-agents__badge--steer"
              :title="t('ide.agents.steerHint')"
            >↩</span>
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
      <!-- R5 子代理 steer（hermes send_message / /steer 通道）：idle/中断子代理
           续话输入，注入 /steer <@subagent> <text> 文本命令驱动同一引擎 -->
      <div v-if="selected && steerableIds.has(selected.subagentId)" class="ide-agents__steer" data-testid="ide-agent-steer">
        <input
          v-model="steerDraft"
          class="ide-agents__steer-input"
          :placeholder="t('ide.agents.steerPlaceholder')"
          data-testid="ide-agent-steer-input"
          @keydown.enter.prevent="sendSteer"
        >
        <button
          type="button"
          class="ide-agents__steer-btn"
          :disabled="!steerDraft.trim()"
          data-testid="ide-agent-steer-send"
          @click="sendSteer"
        >{{ t('ide.agents.steerSend') }}</button>
      </div>
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

.ide-agents__badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 3px;
  border-radius: 3px;

  &--injection {
    color: #f0a44c;
    background: rgba(240, 164, 76, 0.15);
  }

  &--steer {
    color: #61afef;
    background: rgba(97, 175, 239, 0.12);
  }
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

.ide-agents__steer {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color, #26292f);
}

.ide-agents__steer-input {
  flex: 1;
  border: 1px solid var(--border-color, #3a3f4b);
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #d7dae0);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;

  &::placeholder { color: var(--text-muted, #9aa0aa); }
}

.ide-agents__steer-btn {
  flex-shrink: 0;
  border: 1px solid #61afef66;
  background: #61afef22;
  color: #61afef;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) { background: #61afef33; }
  &:disabled { opacity: 0.4; cursor: default; }
}
</style>
