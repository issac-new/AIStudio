<script setup lang="ts">
// IdeMcpPane — 右侧面板「MCP」页签（M3，kimi /mcp 状态面板 + /mcp-config
// 对话式配置入口的移植）。只读状态投影：fetchMcpServers（/api/hermes/mcp，
// cockpit 健康轮询同源）；两个动作：对话式配置（注入引导提示词到当前会话）、
// 跳 /hermes/mcp 管理页。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import type { McpServerInfo } from '@/api/hermes/mcp'
import { fetchMcpServers } from '@/api/hermes/mcp'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { buildMcpConfigPrompt } from '../utils/mcpConfigPrompt'

const { t } = useI18n()
const router = useRouter()
const message = useMessage()
const ide = useIdeStore()
const chatStore = useChatStore()

const servers = ref<McpServerInfo[]>([])
const totalTools = ref(0)
const loadError = ref('')
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await fetchMcpServers()
    servers.value = res.servers ?? []
    totalTools.value = res.total_tools ?? 0
    loadError.value = res.error ?? ''
  } catch (err) {
    servers.value = []
    totalTools.value = 0
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)

const connectedCount = computed(() => servers.value.filter((s) => s.connected).length)
const summary = computed(() =>
  `${connectedCount.value}/${servers.value.length} ${t('ide.mcp.connectedShort')} · ${totalTools.value} ${t('ide.mcp.toolsShort')}`)

const canChat = computed(() => Boolean(chatStore.activeSessionId))

// kimi 范式：无专用写工具——注入引导提示词，配置对话交给 agent 的
// 文件工具 + 编辑审批门（见 utils/mcpConfigPrompt.ts 头注）
function startConfigChat(): void {
  if (!canChat.value) return
  void chatStore.sendMessage(buildMcpConfigPrompt({ agentId: ide.agentId }))
  ide.setChatFocus()
  message.success(t('ide.mcp.configChatSent'))
}

function openManage(): void {
  void router.push('/hermes/mcp')
}
</script>

<template>
  <div class="ide-mcp" data-testid="ide-mcp-pane">
    <header class="ide-mcp__head">
      <span class="ide-mcp__title">{{ t('ide.mcp.title') }}</span>
      <button
        type="button"
        class="ide-mcp__btn"
        data-testid="ide-mcp-refresh"
        :disabled="loading"
        @click="load"
      >{{ t('ide.mcp.refresh') }}</button>
    </header>

    <p v-if="servers.length" class="ide-mcp__summary" data-testid="ide-mcp-summary">{{ summary }}</p>
    <p v-else-if="loadError" class="ide-mcp__error" data-testid="ide-mcp-load-error">{{ loadError }}</p>
    <p v-else class="ide-mcp__empty" data-testid="ide-mcp-empty">{{ t('ide.mcp.empty') }}</p>

    <ul v-if="servers.length" class="ide-mcp__list">
      <li
        v-for="server in servers"
        :key="server.name"
        class="ide-mcp__server"
        :data-testid="`ide-mcp-server-${server.name}`"
      >
        <div class="ide-mcp__server-row">
          <span class="ide-mcp__dot" :class="server.connected ? 'is-on' : 'is-off'" />
          <span class="ide-mcp__name" :title="server.name">{{ server.name }}</span>
          <span class="ide-mcp__transport">{{ server.transport }}</span>
          <span class="ide-mcp__tools">{{ server.tools }} {{ t('ide.mcp.toolsShort') }}</span>
        </div>
        <div v-if="server.error" class="ide-mcp__server-error" :title="server.error">
          {{ t('ide.mcp.errorRow') }}: {{ server.error }}
        </div>
      </li>
    </ul>

    <footer class="ide-mcp__actions">
      <button
        type="button"
        class="ide-mcp__btn ide-mcp__btn--primary"
        data-testid="ide-mcp-config-chat"
        :disabled="!canChat"
        :title="canChat ? '' : t('ide.mcp.chatMissing')"
        @click="startConfigChat"
      >{{ t('ide.mcp.configChat') }}</button>
      <button type="button" class="ide-mcp__btn" data-testid="ide-mcp-manage" @click="openManage">
        {{ t('ide.mcp.manage') }}
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.ide-mcp {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 8px;
  overflow-y: auto;
  font-size: 12px;
}

.ide-mcp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ide-mcp__title {
  font-weight: 600;
  color: var(--text-primary, #e6e6e6);
}

.ide-mcp__summary {
  margin: 0;
  color: var(--text-muted, #9aa0aa);
  font-variant-numeric: tabular-nums;
}

.ide-mcp__empty,
.ide-mcp__error {
  margin: 0;
  line-height: 1.6;
}

.ide-mcp__error { color: #e06c75; }

.ide-mcp__list {
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ide-mcp__server {
  padding: 6px 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
}

.ide-mcp__server-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ide-mcp__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &.is-on { background: var(--success-color, #98c379); }
  &.is-off { background: #e06c75; }
}

.ide-mcp__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, #e6e6e6);
}

.ide-mcp__transport,
.ide-mcp__tools {
  flex-shrink: 0;
  color: var(--text-muted, #9aa0aa);
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
}

.ide-mcp__server-error {
  margin-top: 4px;
  color: #e06c75;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-mcp__actions {
  display: flex;
  gap: 6px;
}

.ide-mcp__btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--primary {
    flex: 1;
    border-color: color-mix(in srgb, var(--accent-primary, #4cc9f0) 50%, transparent);
    color: var(--accent-primary, #4cc9f0);
  }
}
</style>
