<script setup lang="ts">
// IdeChatPane — IDE 右侧 agent 会话列：zcode 会话面的全量复用。
//
// 复用 upstream 子组件（不嵌 ChatPanel 整面板，避免其自带会话侧栏）：
//   MessageList（消息流/工具调用卡/审批/澄清浮层/Todo/diff 内嵌）
//   ChatInput（附件/slash/排队/语音命令）
//   WorkspaceDiffPreview / FilePreview（toolPanel overlay 宿主渲染，与
//     ChatPanel 同款 watch 驱动）
// 任务计划/子代理为浮窗（09-20 裁定，对标 zcode 模式）：头部开关按钮 +
// IdeFloatPanel 壳（拖拽/右下锚定），不再占用页签。
// RunTrace 弹窗经 cockpitStore.openRunTrace 复用（IdeShell 挂载 modal）。
//
// 会话生命周期 = ChatView 挂载配方 + newChat codex 配方（ChatPanel.vue
// 新建会话处）：agent 底座默认 codex、codingAgentMode 'global'（走各 agent
// 自身登录，模型按钮禁用为诚实态；scoped 模式经 cockpit/聊天页配置）。
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  useChatStore,
  type Session,
} from '@/stores/hermes/chat'
import { useAppStore } from '@/stores/hermes/app'
import { useProfilesStore } from '@/stores/hermes/profiles'
import { useSettingsStore } from '@/stores/hermes/settings'
import { useFilesStore } from '@/stores/hermes/files'
import { useToolPanelStore } from '@/stores/hermes/tool-panel'
import MessageList from '@/components/hermes/chat/MessageList.vue'
import ChatInput from '@/components/hermes/chat/ChatInput.vue'
import WorkspaceDiffPreview from '@/components/hermes/files/WorkspaceDiffPreview.vue'
import FilePreview from '@/components/hermes/files/FilePreview.vue'
import {
  OPEN_SUBAGENT_STREAM_EVENT,
  type OpenSubagentStreamDetail,
} from '@/utils/hermes/subagent-stream'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import { isSessionModelInvalid } from '../utils/modelInvalid'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import IdePlanFloat from '../components/IdePlanFloat.vue'
import IdeSubagentsFloat from '../components/IdeSubagentsFloat.vue'
import IdeRunResultCard from './IdeRunResultCard.vue'
import IdeModelSwitcher from './IdeModelSwitcher.vue'
import IdeActivityInbox from './IdeActivityInbox.vue'
import IdeWorktreeBadge from './IdeWorktreeBadge.vue'
import IdeGoalBudgetFloat from './IdeGoalBudgetFloat.vue'
import { useIdeSessionHooks } from '../composables/useIdeSessionHooks'
import { matchMemory, recordSessionApproval, clearMemory, type ApprovalMemoryEntry } from '../utils/approvalLearning'
import { showToast } from '../utils/toast'

const ide = useIdeStore()
const chatStore = useChatStore()
const appStore = useAppStore()
const router = useRouter()
const profilesStore = useProfilesStore()
const settingsStore = useSettingsStore()
const filesStore = useFilesStore()
const toolPanelStore = useToolPanelStore()
const cockpitStore = useCockpitStore()
const { t } = useI18n()

// R2 会话钩子：runaway-guard 失控检测 + 子代理结果反注入 + 恢复 recap
const { recap, dismissRecap, flaggedSubagents } = useIdeSessionHooks()

// ChatPanel 上下文契约（ChatPanel.vue:84）——MessageList 的 workspace 文件
// 预览依赖此 provide，缺失会静默降级。
provide('hermesWorkspaceFilePreview', true)

// ── 会话生命周期（ChatView.vue 挂载配方）──

const ready = ref(false)

function sessionMatchesAgent(session: Session | undefined | null): boolean {
  return Boolean(session?.codingAgentId) && session?.codingAgentId === ide.agentId
}

function ensureSession() {
  if (sessionMatchesAgent(chatStore.activeSession)) return
  // 复用最近的同 agent 空会话，避免反复进出页面堆积空会话
  const reusable = chatStore.sessions.find(
    (session) => sessionMatchesAgent(session) && (session.messages?.length ?? 0) === 0,
  )
  if (reusable) {
    void chatStore.switchSession(reusable.id)
    return
  }
  chatStore.newChat({
    agent: ideAgentToChatAgent(ide.agentId) as never,
    codingAgentId: ide.agentId,
    codingAgentMode: 'global',
    source: 'coding_agent',
    workspace: ide.workspace,
  })
}

onMounted(async () => {
  chatStore.setRuntimeMode('default')
  appStore.loadModels()
  await Promise.all([
    profilesStore.fetchProfiles(),
    settingsStore.fetchSettings(),
  ])
  await chatStore.loadSessions(chatStore.sessionProfileFilter)
  ready.value = true
  ensureSession()
})

// agent 底座切换 → 重建会话（旧会话保留在历史中）
watch(() => ide.agentId, () => {
  if (!ready.value) return
  ensureSession()
})

// ── M1.6 模型失效态（对标 zcode modelSelection.invalidated）──
// scoped 会话携带具体 model；模型目录已加载却不含该 model → 顶部警示条
// （global codingAgent 会话 model 为空，天然不触发；目录未加载不误报）。
const modelInvalidDismissed = ref(false)
const activeModelInvalid = computed(() =>
  isSessionModelInvalid(chatStore.activeSession, appStore.modelGroups),
)
const showModelInvalid = computed(() => activeModelInvalid.value && !modelInvalidDismissed.value)
function goReselectModel(): void {
  router.push({ name: 'hermes.settings' })
}

// ── R2 批准即学习（codex ApprovedForSession + minimax 五档语义）──
// MessageList 审批按钮发 overlay:approval-decision CustomEvent；此处记忆
// session 批准，后续匹配记忆的新审批会弹浮层提示「本次匹配记忆 <宽度>」。
interface ApprovalDecisionDetail {
  choice: 'once' | 'session' | 'always' | 'deny'
  sessionId: string | null
  toolName: string
  command: string
}
const approvalMemoryHint = ref<ApprovalMemoryEntry | null>(null)
function onApprovalDecision(evt: Event): void {
  const detail = (evt as CustomEvent<ApprovalDecisionDetail>).detail
  if (!detail) return
  if (detail.choice === 'session' && detail.sessionId) {
    recordSessionApproval(detail.sessionId, detail.toolName, detail.command)
    showToast(t('ide.approval.learned', { width: t(`ide.approval.width.${deriveWidthLabel(detail)}`) }), 'info', 4000)
  }
}
function deriveWidthLabel(detail: ApprovalDecisionDetail): string {
  const entry = detail.command ? matchMemory(detail.sessionId ?? '', detail.toolName, detail.command) : null
  return entry?.width ?? (detail.command ? 'byArgvPrefix2' : 'wholeTool')
}
// 新审批浮层出现时检查是否匹配记忆（宽度提示；auto-approve 仍交后端 session 档）
watch(
  () => chatStore.activePendingApproval,
  (pending) => {
    if (!pending) {
      approvalMemoryHint.value = null
      return
    }
    approvalMemoryHint.value = matchMemory(pending.sessionId, pending.description, pending.command)
  },
)
watch(
  () => chatStore.activeSessionId,
  (sid, prev) => {
    if (sid !== prev) approvalMemoryHint.value = null
  },
)
onMounted(() => window.addEventListener('overlay:approval-decision', onApprovalDecision))
onUnmounted(() => window.removeEventListener('overlay:approval-decision', onApprovalDecision))
// 会话清空时记忆随之重置（用户在 IDE 侧新开会话 = 新信任域）
watch(
  () => chatStore.activeSession?.createdAt,
  (created, prev) => {
    const sid = chatStore.activeSessionId
    if (sid && created && prev && created > prev) clearMemory(sid)
  },
)

// ── M1.7 会话诊断 popover（对标 zcode debugInfo：session/trace/task id + provider）──
const debugOpen = ref(false)
const debugInfo = computed(() => {
  const session = chatStore.activeSession
  return [
    { key: 'ide.debugInfo.sessionId', value: session?.id ?? '—' },
    { key: 'ide.debugInfo.agentSessionId', value: session?.agentSessionId ?? '—' },
    { key: 'ide.debugInfo.model', value: session?.model || '—' },
    { key: 'ide.debugInfo.provider', value: session?.provider || '—' },
  ]
})
const debugCopied = ref(false)

// ZCode「已工作 N 分 N 秒」状态条对应物（M1 布局对齐）
const running = computed(() => Boolean(chatStore.isRunActive || chatStore.abortState))
const runStartMap = computed(() => chatStore.runStartedAt as unknown as Map<string, number>)
const runStartedAt = computed(() => {
  const sid = chatStore.activeSessionId
  return (sid && runStartMap.value?.get(sid)) || null
})
const nowTick = ref(Date.now())
let runTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  runTimer = setInterval(() => { nowTick.value = Date.now() }, 1000)
})
onUnmounted(() => { if (runTimer) clearInterval(runTimer) })
const runElapsed = computed(() => {
  if (!runStartedAt.value) return ''
  const total = Math.max(0, Math.floor((nowTick.value - runStartedAt.value) / 1000))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return m > 0 ? `${m} ${t('ide.min')} ${sec} ${t('ide.sec')}` : `${sec} ${t('ide.sec')}`
})
const lastCompletedSummary = computed(() => {
  const session = chatStore.activeSession
  if (!session?.messages?.length) return ''
  const last = session.messages[session.messages.length - 1]
  if (!last || last.role !== 'assistant') return ''
  const text = typeof last.content === 'string' ? last.content.replace(/\s+/g, ' ').trim() : ''
  return text.slice(0, 40)
})
async function copyDebugInfo(): Promise<void> {
  try {
    const text = debugInfo.value.map(item => `${item.key}: ${item.value}`).join('\n')
    await navigator.clipboard.writeText(text)
    debugCopied.value = true
    setTimeout(() => { debugCopied.value = false }, 1500)
  } catch { /* 剪贴板不可用时静默 */ }
}

// ── 子代理浮窗（消息流中点击子代理工具卡 → window 事件，开浮窗并选中）──

const pendingSubagentId = ref<string | null>(null)

function handleOpenSubagentStreamRequest(event: Event) {
  const detail = (event as CustomEvent<OpenSubagentStreamDetail>).detail
  if (!detail?.sessionId || detail.sessionId !== chatStore.activeSessionId) return
  pendingSubagentId.value = detail.subagentId
  ide.floats.agents = true
}

onMounted(() => {
  window.addEventListener(OPEN_SUBAGENT_STREAM_EVENT, handleOpenSubagentStreamRequest)
})
onUnmounted(() => {
  window.removeEventListener(OPEN_SUBAGENT_STREAM_EVENT, handleOpenSubagentStreamRequest)
})

// ── toolPanel overlay 宿主渲染（workspaceDiff / 文件预览；ChatPanel 同款 watch）──

const showOverlay = computed(() => Boolean(toolPanelStore.workspaceDiff || filesStore.previewFile))

function closeOverlay() {
  if (toolPanelStore.workspaceDiff) toolPanelStore.closeWorkspaceDiff()
  if (filesStore.previewFile) filesStore.closePreview()
}

// ── 动作 ──

function newSession() {
  chatStore.newChat({
    agent: ideAgentToChatAgent(ide.agentId) as never,
    codingAgentId: ide.agentId,
    codingAgentMode: 'global',
    source: 'coding_agent',
    workspace: ide.workspace,
  })
  pendingSubagentId.value = null
  ide.floats.agents = false
}

const canOpenTrace = computed(() => Boolean(chatStore.activeSessionId))

function openRunTrace() {
  if (!chatStore.activeSessionId) return
  cockpitStore.openRunTrace({ sessionId: chatStore.activeSessionId })
}

const sessionTitle = computed(
  () => chatStore.activeSession?.title?.trim() || t('ide.chatUntitled'),
)

// global 模式由 agent 自身管理模型配置，模型按钮禁用为诚实态
const modelDisabled = computed(() => true)
</script>

<template>
  <section class="ide-chat">
    <header class="ide-chat__head">
      <span class="ide-chat__title" :title="sessionTitle">{{ sessionTitle }}</span>
      <!-- R5 会话工作树隔离徽标（worktree 域显性化） -->
      <IdeWorktreeBadge />
      <!-- R4 会话内模型切换器（antigravity 语义：切换+粘性） -->
      <IdeModelSwitcher />
      <!-- R5 goal 预算浮层（zcode goal stats 语义：工具/迭代/上下文消耗面） -->
      <IdeGoalBudgetFloat />
      <div class="ide-chat__actions">
        <button
          type="button"
          class="ide-chat__action"
          data-testid="ide-chat-new"
          :title="t('ide.chatNewSession')"
          @click="newSession"
        >＋</button>
        <button
          type="button"
          class="ide-chat__action"
          :class="{ 'is-on': ide.floats.plan }"
          data-testid="ide-chat-float-plan"
          :title="t('ide.float.planTitle')"
          :aria-label="t('ide.float.planTitle')"
          @click="ide.toggleFloat('plan')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11" />
          </svg>
        </button>
        <button
          type="button"
          class="ide-chat__action"
          :class="{ 'is-on': ide.floats.agents }"
          data-testid="ide-chat-float-agents"
          :title="t('ide.float.agentsTitle')"
          :aria-label="t('ide.float.agentsTitle')"
          @click="ide.toggleFloat('agents')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
            <circle cx="17" cy="9" r="2.4" />
            <path d="M14.8 19a4.6 4.6 0 0 1 5.7-4.4" />
          </svg>
        </button>
        <button
          type="button"
          class="ide-chat__action"
          :disabled="!canOpenTrace"
          :title="t('ide.chatTabTrace')"
          @click="openRunTrace"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12h4l2-6 4 12 2-6h6" />
          </svg>
        </button>
        <div class="ide-chat__debug">
          <button
            type="button"
            class="ide-chat__action"
            data-testid="ide-debug-info"
            :title="t('ide.debugInfo.label')"
            :aria-label="t('ide.debugInfo.label')"
            @click="debugOpen = !debugOpen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
          </button>
          <div v-if="debugOpen" class="ide-chat__debug-popover" data-testid="ide-debug-popover">
            <div class="ide-chat__debug-title">{{ t('ide.debugInfo.label') }}</div>
            <dl>
              <template v-for="item in debugInfo" :key="item.key">
                <dt>{{ t(item.key) }}</dt>
                <dd :title="item.value">{{ item.value }}</dd>
              </template>
            </dl>
            <button type="button" class="ide-chat__debug-copy" data-testid="ide-debug-copy" @click="copyDebugInfo">
              {{ debugCopied ? t('ide.debugInfo.copied') : t('ide.debugInfo.copy') }}
            </button>
          </div>
        </div>
        <!-- R4 活动收件箱（claude-code 通知耗时 + codex-product 三态语义） -->
        <IdeActivityInbox />
      </div>
    </header>

    <div v-if="showModelInvalid" class="ide-chat__model-invalid" data-testid="ide-model-invalid">
      <span class="ide-chat__model-invalid-text">
        {{ t('ide.modelInvalid.title') }}（{{ chatStore.activeSession?.model }}）— {{ t('ide.modelInvalid.hint') }}
      </span>
      <button type="button" class="ide-chat__model-invalid-btn" @click="goReselectModel">{{ t('ide.modelInvalid.reselect') }}</button>
      <button type="button" class="ide-chat__model-invalid-dismiss" :aria-label="t('ide.modelInvalid.dismiss')" @click="modelInvalidDismissed = true">✕</button>
    </div>

    <!-- R2 会话恢复 recap（claude-code 2.1.108 语义：切回旧会话给“上次谈到哪”） -->
    <div v-if="recap" class="ide-chat__recap" data-testid="ide-session-recap">
      <span class="ide-chat__recap-kicker">{{ t('ide.recap.title') }}</span>
      <span class="ide-chat__recap-last">{{ recap.lastUserText }}</span>
      <span v-if="recap.items.length" class="ide-chat__recap-items" :title="recap.items.join('\n')">
        {{ recap.items.slice(0, 3).join(' · ') }}
      </span>
      <button type="button" class="ide-chat__recap-dismiss" data-testid="ide-recap-dismiss" :aria-label="t('ide.recap.dismiss')" @click="dismissRecap">✕</button>
    </div>

    <!-- R2 子代理反注入：任一子代理命中注入指纹时的会话级提示条 -->
    <div v-if="flaggedSubagents.size > 0" class="ide-chat__injection" data-testid="ide-injection-banner">
      <span>{{ t('ide.injection.banner', { count: flaggedSubagents.size }) }}</span>
    </div>

    <!-- R2 批准即学习：新审批匹配本会话记忆时的宽度提示条 -->
    <div v-if="approvalMemoryHint" class="ide-chat__approval-hint" data-testid="ide-approval-memory-hint">
      <span>{{ t('ide.approval.memoryHint', { width: t(`ide.approval.width.${approvalMemoryHint.width}`) }) }}</span>
    </div>

    <div class="ide-chat__runline" data-testid="ide-chat-runline">
      <template v-if="running">
        <span class="ide-chat__runline-time">{{ t('ide.working') }} {{ runElapsed }}</span>
      </template>
      <template v-else-if="lastCompletedSummary">
        <span class="ide-chat__runline-done">✓ {{ lastCompletedSummary }}</span>
      </template>
    </div>

    <!-- R3 轮结果卡（时长 + 验证 bullet + per-turn 文件变更） -->
    <IdeRunResultCard />

    <div class="ide-chat__body">
      <MessageList
        v-if="ready"
        class="ide-chat__messages"
        approval-portal-to-body
        scroll-scope="ide"
      />
      <ChatInput :model-disabled="modelDisabled" persist-draft />

      <!-- toolPanel overlay：会话 workspace diff / 文件预览（ChatPanel 宿主同款） -->
      <div v-if="showOverlay" class="ide-chat__overlay">
        <WorkspaceDiffPreview
          v-if="toolPanelStore.workspaceDiff"
          :custom-close="closeOverlay"
        />
        <FilePreview
          v-else-if="filesStore.previewFile"
          :custom-close="closeOverlay"
        />
      </div>

      <!-- 浮窗（对标 zcode：任务计划 / 子代理名册，拖拽壳见 IdeFloatPanel） -->
      <IdePlanFloat v-if="ide.floats.plan" />
      <IdeSubagentsFloat v-if="ide.floats.agents" :focus-id="pendingSubagentId" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.ide-chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-primary, #14161a);
}

.ide-chat__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-chat__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}


.ide-chat__runline {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 2px 12px;
  font-size: 12px;
  color: var(--text-muted, #9aa0aa);
}

/* R2：recap 横幅（恢复会话回笼摘要） */
.ide-chat__recap {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: color-mix(in srgb, #61afef 10%, transparent);
  color: var(--text-secondary, #b0b5be);
}

.ide-chat__recap-kicker {
  flex-shrink: 0;
  font-weight: 600;
  color: #61afef;
}

.ide-chat__recap-last {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-chat__recap-items {
  margin-left: auto;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
}

.ide-chat__recap-dismiss {
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--text-muted, #9aa0aa);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0 2px;

  &:hover { color: var(--text-primary, #d7dae0); }
}

/* R2：子代理结果反注入提示条 */
.ide-chat__injection {
  flex-shrink: 0;
  padding: 5px 12px;
  font-size: 12px;
  color: #f0a44c;
  background: rgba(240, 164, 76, 0.1);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

/* R2：批准即学习记忆命中提示条 */
.ide-chat__approval-hint {
  flex-shrink: 0;
  padding: 4px 12px;
  font-size: 11px;
  color: #61afef;
  background: rgba(97, 175, 239, 0.08);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-chat__runline-done {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--success-color, #98c379);
}

.ide-chat__agent {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  font-family: Menlo, Monaco, 'Courier New', monospace;
}

.ide-chat__actions {
  display: flex;
  gap: 6px;
}

.ide-chat__action {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 14px;
  color: var(--text-muted, #9aa0aa);
  background: transparent;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--text-primary, #e6e6e6);
    border-color: var(--accent-primary, #4cc9f0);
  }

  /* 浮窗开关激活态 */
  &.is-on {
    color: var(--accent-primary, #4cc9f0);
    border-color: color-mix(in srgb, var(--accent-primary, #4cc9f0) 55%, transparent);
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 10%, transparent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.ide-chat__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.ide-chat__messages {
  flex: 1;
  min-height: 0;
}

.ide-chat__overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  background: var(--bg-primary, #14161a);
}

/* M1.6 模型失效警示条 */
.ide-chat__model-invalid {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: color-mix(in srgb, #f0a44c 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, #f0a44c 30%, transparent);
  color: #f0c98c;
  font-size: 12px;
}

.ide-chat__model-invalid-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-chat__model-invalid-btn {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, #f0a44c 50%, transparent);
  border-radius: 5px;
  background: transparent;
  color: #f0c98c;
  font-size: 12px;
  padding: 2px 10px;
  cursor: pointer;

  &:hover { background: color-mix(in srgb, #f0a44c 15%, transparent); }
}

.ide-chat__model-invalid-dismiss {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  cursor: pointer;
  font-size: 12px;

  &:hover { color: var(--text-primary, #e6e6e6); }
}

/* M1.7 会话诊断 popover */
.ide-chat__debug {
  position: relative;
  display: inline-flex;
}

.ide-chat__debug-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  width: 300px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  background: var(--bg-secondary, #1b1e24);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.ide-chat__debug-title {
  font-size: 12px;
  color: var(--text-muted, #9aa0aa);
  margin-bottom: 6px;
}

.ide-chat__debug-popover dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  font-size: 12px;
}

.ide-chat__debug-popover dt {
  color: var(--text-muted, #9aa0aa);
}

.ide-chat__debug-popover dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}

.ide-chat__debug-copy {
  margin-top: 8px;
  width: 100%;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: var(--bg-tertiary, #ebebeb);
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  padding: 4px 0;
  cursor: pointer;

  &:hover { border-color: var(--accent-primary, #4cc9f0); }
}
</style>
