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
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
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
import IdeTurnRail from '../components/IdeTurnRail.vue'
import IdeHandoffCard from '../components/IdeHandoffCard.vue'
import IdeRecoveryDialog from '../components/IdeRecoveryDialog.vue'
import IdePermissionSwitcher from '../components/IdePermissionSwitcher.vue'
import IdeAskCard from '../components/IdeAskCard.vue'
import IdeMentionChip from '../components/IdeMentionChip.vue'
import IdeRunLogPanel from '../components/IdeRunLogPanel.vue'
import IdeQueuePanel from '../components/IdeQueuePanel.vue'
import IdeRecapCard from '../components/IdeRecapCard.vue'
import IdeTaskGroupsPanel from '../components/IdeTaskGroupsPanel.vue'
import IdeReviewPanel from '../components/IdeReviewPanel.vue'
import IdeMentionPicker from '../components/IdeMentionPicker.vue'
import IdeInlineDiff from '../components/IdeInlineDiff.vue'
import type { InlineDiffUndoContext } from '../components/IdeInlineDiff.vue'
import IdeVideoFramesDialog from '../components/IdeVideoFramesDialog.vue'
import IdeFindInSession from '../components/IdeFindInSession.vue'
import IdeHistoryBrowser from '../components/IdeHistoryBrowser.vue'
import IdeBtwPanel from '../components/IdeBtwPanel.vue'
import IdeBgTasksPanel from '../components/IdeBgTasksPanel.vue'
import IdeSideSessionPane from '../components/IdeSideSessionPane.vue'
import IdeAgentsView from '../components/IdeAgentsView.vue'
import IdeResumeAdvisor from '../components/IdeResumeAdvisor.vue'
import IdeSecurityBoostBar from '../components/IdeSecurityBoostBar.vue'
import IdeImportHistory from '../components/IdeImportHistory.vue'
import IdeKnowledgeBar from '../components/IdeKnowledgeBar.vue'
import { ideRunsApi } from '../api/runs'
import IdeContextBar from '../components/IdeContextBar.vue'
import IdeCompactionCard from '../components/IdeCompactionCard.vue'
import {
  engineDefaultModel, fetchEngineCatalog, rememberEngineDefault,
  type EngineCatalogGroup, type EngineDefault,
} from '../utils/engine-models'
import WorkspaceDiffPreview from '@/components/hermes/files/WorkspaceDiffPreview.vue'
import FilePreview from '@/components/hermes/files/FilePreview.vue'
import {
  OPEN_SUBAGENT_STREAM_EVENT,
  type OpenSubagentStreamDetail,
} from '@/utils/hermes/subagent-stream'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import { useToolTraceVisibility } from '@/composables/useToolTraceVisibility'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { isSessionModelInvalid, firstAvailableModel } from '../utils/modelInvalid'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import IdePlanFloat from '../components/IdePlanFloat.vue'
import IdeSubagentsFloat from '../components/IdeSubagentsFloat.vue'
import IdeRunResultCard from './IdeRunResultCard.vue'
import IdeModBand from '../components/IdeModBand.vue'
import IdeReplayTheater from '../components/IdeReplayTheater.vue'
import { useModBand, type ModBandSpec } from '../composables/useModBand'
import IdeTodoBar from '../components/IdeTodoBar.vue'
// ZCode 输入框对齐批（2026-10-18）：头部 IdeModelSwitcher 退役，模型选择/Auto 路由/
// 管理入口全部并入输入区模型面板；管理对话框在此挂载（保存后写穿重拉目录）。
import IdeEngineModelsDialog from '../components/IdeEngineModelsDialog.vue'
import { autoRoute, type CostTier } from '../../../server/modelroute/model-routing'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'
import IdeShareEntry from './IdeShareEntry.vue'
import IdeActivityInbox from './IdeActivityInbox.vue'
import IdeWorktreeBadge from './IdeWorktreeBadge.vue'
import IdeGoalBudgetFloat from './IdeGoalBudgetFloat.vue'
import { useIdeSessionHooks } from '../composables/useIdeSessionHooks'
import { useIdeBoot } from '../composables/useIdeBoot'
import { useAuthedMediaRewrite } from '../utils/authedMedia'
import { resolveBootSession } from '../utils/sessionBoot'
import { matchMemory, recordSessionApproval, clearMemory, type ApprovalMemoryEntry } from '../utils/approvalLearning'
import { showToast } from '../utils/toast'
import { authFetch } from '../utils/auth-fetch'
import { buildNewTaskOptions, sessionTaskMode, explicitTaskMode, type IdeTaskMode } from '../utils/task-mode'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const ide = useIdeStore()
const { root } = useIdeWorkspace()
const chatStore = useChatStore()
const ideBoot = useIdeBoot()
const mediaRoot = ref<HTMLElement | null>(null)
useAuthedMediaRewrite(mediaRoot)
const appStore = useAppStore()
const router = useRouter()
const route = useRoute()
const profilesStore = useProfilesStore()
const settingsStore = useSettingsStore()
const filesStore = useFilesStore()
const toolPanelStore = useToolPanelStore()
const cockpitStore = useCockpitStore()
const { t, locale } = useI18n()
const message = useMessage()
// composer 工具条/模型面板文案（IDE 本地字典，ZCode 对齐批）
const tx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].composer)

// 编程/工作双模式：新建任务模式决定模型取源（编程=Ycode 目录，工作=Hermes 目录）；
// 工作空态只看当前会话是否真是工作任务；界面模式（ide.interfaceMode）决定呈现降噪。
const isWorkSession = computed(() => ((ide.taskMode as IdeTaskMode | undefined) ?? 'coding') === 'work')
const isWorkTask = computed(() => sessionTaskMode(chatStore.activeSession) === 'work')
const modeText = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].mode)
const workStarters = computed(() => [
  { key: 'doc', label: modeText.value.starterDoc, prompt: '请帮我起草一份文档：先问我用途、读者和篇幅，再给出提纲并开始写。' },
  { key: 'sheet', label: modeText.value.starterSheet, prompt: '请帮我整理一份表格：先确认字段、数据来源和输出格式（xlsx/csv），再开始。' },
  { key: 'slides', label: modeText.value.starterSlides, prompt: '请帮我做一份演示文稿：先确认主题、受众和页数，再给出结构并逐页生成。' },
  { key: 'research', label: modeText.value.starterResearch, prompt: '请帮我做一次调研：先明确问题和范围，列出信息源与检索计划，再汇总成带引用的报告。' },
])
const showWorkEmpty = computed(() => isWorkTask.value
  && (chatStore.activeSession?.messages?.length ?? 0) === 0)
function startWork(prompt: string): void {
  void chatStore.sendMessage(prompt)
  ide.setChatFocus()
}
// 会话切换（含 ?session= 深链）时让新建任务模式跟随当前会话类型：
// 模型取源与空态都按任务类型走，避免工作会话拿 Ycode 模型目录误报失效。
watch(() => chatStore.activeSessionId, () => {
  const explicit = explicitTaskMode(chatStore.activeSession)
  if (explicit) ide.setTaskMode(explicit)
})

// R2 会话钩子：runaway-guard 失控检测 + 子代理结果反注入 + 恢复 recap
const { recap, dismissRecap, flaggedSubagents } = useIdeSessionHooks()
// P4 模组横幅带 specs：六条注册（priority 小者在上；visible=有内容才占位）
const band = useModBand()
const modBandSpecs = computed<ModBandSpec[]>(() => [
  { id: 'recap', priority: 10, visible: !!recap.value, hideable: false },
  { id: 'injection', priority: 20, visible: flaggedSubagents.value.size > 0 },
  { id: 'approval-hint', priority: 30, visible: !!approvalMemoryHint.value },
  { id: 'runline', priority: 40, visible: running.value || !!lastCompletedSummary.value },
  { id: 'run-result', priority: 50, visible: true },
  { id: 'replay', priority: 55, visible: true },
  { id: 'todo', priority: 60, visible: true },
])


// ChatPanel 上下文契约（ChatPanel.vue:84）——MessageList 的 workspace 文件
// 预览依赖此 provide，缺失会静默降级。
provide('hermesWorkspaceFilePreview', true)
// 本地媒体交容器内鉴权 blob 重写（Markdown 侧只出占位，不带 token）
provide('ideDeferLocalMedia', true)

// ── 会话生命周期（ChatView.vue 挂载配方）──

const ready = ref(false)

function sessionMatchesAgent(session: Session | undefined | null): boolean {
  return Boolean(session?.codingAgentId) && session?.codingAgentId === ide.agentId
}

// Ycode 默认模型（2026-10-18 用户指令）：新会话与可复用的空会话都用 ZCode 目录默认，
// 不再继承 Hermes 的 aim/qwen 等别名（它们不在 ZCode 目录里 → 一进 IDE 就报失效）。
// 载荷统一走 buildNewTaskOptions（utils/task-mode.ts），此处不再保留第二份配方。

// 空会话（无消息）若没有模型或模型已不在 ZCode 目录（历史 aim 等），就地换成默认模型；
// 有对话的会话不动（模型失效由横幅交用户决定）。
function adoptDefaultModelIfEmpty(session: Session | undefined | null): void {
  if (!session || (session.messages?.length ?? 0) > 0) return
  if (engineDefault.value && !catalogHasModel(session.model)) {
    void chatStore.switchSessionModel(engineDefault.value.model, engineDefault.value.provider, session.id)
  }
}

function ensureSession() {
  const active = chatStore.activeSession
  // 工作会话（无 codingAgentId）在任意编码 agent 选择下都保留：切 agent 不应把
  // 通用工作任务顶掉（2026-10-18 双模式轮）。
  if (active && sessionTaskMode(active) === 'work') return
  if (sessionMatchesAgent(active)) {
    // 恢复的活动会话也可能是「选择模型...」的空会话（2026-10-18 复测实录）——同样补默认。
    adoptDefaultModelIfEmpty(active)
    return
  }
  // 无活动会话时按新建任务模式；已有编程会话但 agent 不匹配=用户切了编码底座，按编程建。
  const mode: IdeTaskMode = active ? 'coding' : ((ide.taskMode as IdeTaskMode | undefined) ?? 'coding')
  if (mode === 'work') {
    const reusableWork = chatStore.sessions.find(
      (session) => !session.codingAgentId && (session.messages?.length ?? 0) === 0,
    )
    if (reusableWork) {
      void chatStore.switchSession(reusableWork.id)
      return
    }
    chatStore.newChat(buildNewTaskOptions({
      mode: 'work',
      codingAgentId: ide.agentId,
      chatAgent: ideAgentToChatAgent(ide.agentId),
      workspace: root.value,
    }) as unknown as Parameters<typeof chatStore.newChat>[0])
    return
  }
  // 复用最近的同 agent 空会话，避免反复进出页面堆积空会话
  const reusable = chatStore.sessions.find(
    (session) => sessionMatchesAgent(session) && (session.messages?.length ?? 0) === 0,
  )
  if (reusable) {
    void chatStore.switchSession(reusable.id)
    adoptDefaultModelIfEmpty(reusable)
    return
  }
  chatStore.newChat(buildNewTaskOptions({
    mode: 'coding',
    codingAgentId: ide.agentId,
    chatAgent: ideAgentToChatAgent(ide.agentId),
    workspace: root.value,
    model: engineDefault.value?.model,
    provider: engineDefault.value?.provider,
  }) as unknown as Parameters<typeof chatStore.newChat>[0])
}

onMounted(async () => {
  // overlay 挂载面须容忍上游 store 版本漂移：缺方法即跳过，不炸挂载
  chatStore.setRuntimeMode?.('default')
  appStore.loadModels?.()
  // 目录与身份/设置并行拉取：ensureSession 建会话前必须已拿到 ZCode 默认模型。
  const catalogLoaded = loadCatalog()
  await Promise.all([
    profilesStore.fetchProfiles?.() ?? Promise.resolve(),
    settingsStore.fetchSettings?.() ?? Promise.resolve(),
    catalogLoaded,
  ])
  await ideBoot.ensureSessions()
  ready.value = true
  // ?session= 深链必须压过 ensureSession：imported/CLI 会话的 agent 与 IDE
  // 底座不同，原 ensureSession 会新建空会话把直链目标顶掉（冷启动 12s 实测
  // 目标会话被替换为「新会话」）。loadSessions 完成后再落一次选择，覆盖
  // IdeShell watch 与本次 load 的竞态。
  const boot = resolveBootSession(
    route?.query?.session,
    chatStore.sessions.map(session => session.id),
    chatStore.activeSessionId,
  )
  if (boot.matched) {
    if (boot.switchTo) await chatStore.switchSession?.(boot.switchTo)
    return
  }
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
// 2026-10-18：失效判定跟随实际选择源（Ycode 引擎目录 / 独立目录），
// 不再用 Hermes appStore 目录误判引擎模型为「已移除」。
const activeModelInvalid = computed(() =>
  isSessionModelInvalid(chatStore.activeSession, modelGroupsView.value),
)
const showModelInvalid = computed(() => activeModelInvalid.value && !modelInvalidDismissed.value)
function goReselectModel(): void {
  // 就地开模型选择器（不跳设置页）——选择源已切换到 Ycode 目录
  modelPickerOpen.value = true
}

// 一键回退（2026-10-07 run10 实证修复）：模型被移除时横幅内直接回退到目录首个
// 可用模型，不强制跳设置页；复用 pickModel 的 scoped/global 双路径。
const fallbackModelTarget = computed(() => {
  const d = engineDefault.value
  if (d && catalogHasModel(d.model)) return { provider: d.provider, id: d.model }
  return firstAvailableModel(modelGroupsView.value)
})
async function onFallbackModel(): Promise<void> {
  const target = fallbackModelTarget.value
  if (!target) return
  const sid = chatStore.activeSessionId
  if (sid) {
    const ok = await chatStore.switchSessionModel(target.id, target.provider, sid)
    if (!ok) await appStore.switchModel(target.id, target.provider)
  } else {
    await appStore.switchModel(target.id, target.provider)
  }
  modelInvalidDismissed.value = true
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
  const mode: IdeTaskMode = (ide.taskMode as IdeTaskMode | undefined) ?? 'coding'
  chatStore.newChat(buildNewTaskOptions({
    mode,
    codingAgentId: ide.agentId,
    chatAgent: ideAgentToChatAgent(ide.agentId),
    workspace: root.value,
    model: mode === 'coding' ? engineDefault.value?.model : undefined,
    provider: mode === 'coding' ? engineDefault.value?.provider : undefined,
  }) as unknown as Parameters<typeof chatStore.newChat>[0])
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

// 输入框模型按钮（2026-09-26 修复：此前写死禁用）：独立目录优先+hermes 回落，
// 目录就绪即可选；有会话切会话粘性，无会话设新会话默认模型。
const engineGroups = ref<EngineCatalogGroup[]>([])
const usingIndependent = ref(false)
const engineDefault = ref<EngineDefault | null>(null)
// P3：服务端档位映射（engine-models config.route）；Auto 路由优先于 localStorage。
const serverRoute = ref<Partial<Record<'economy' | 'standard' | 'power', { providerId: string; modelId: string }>>>({})

// 目录可重入装载（2026-10-18 管理入口并轮）：管理对话框保存后写穿重拉，
// 写穿结果立即可选（与退役的 IdeModelSwitcher A8 同语义）。
async function loadCatalog(): Promise<void> {
  try {
    const catalog = await fetchEngineCatalog()
    engineGroups.value = catalog.groups
    usingIndependent.value = catalog.independent
    engineDefault.value = engineDefaultModel(catalog)
    rememberEngineDefault(engineDefault.value)
    serverRoute.value = catalog.route ?? {}
  } catch {
    engineGroups.value = []
    usingIndependent.value = false
    engineDefault.value = null
    serverRoute.value = {}
  }
}

// 两源目录形态不同（Ycode/独立目录为 {id} 对象组，Hermes 为 string[]）：
// 统一成 { provider, label, models: [{id, reasoningLevels?}] }，选择器/失效判定/
// 思考档共用同一视图（reasoningLevels=ZCode manifest 档位，随目录下发）。
interface ViewModelGroup {
  provider: string
  label: string
  models: Array<{ id: string; reasoningLevels?: string[] }>
}
const modelGroupsView = computed<ViewModelGroup[]>(() => {
  // 工作任务用 Hermes 目录（Ycode/zcode 模型 id 不在 Hermes 目录内，混用会误报失效）；
  // 编程任务沿用 Ycode/独立目录优先。
  const useEngineCatalog = !isWorkSession.value && usingIndependent.value
  const raw = (useEngineCatalog ? engineGroups.value : (appStore.modelGroups ?? [])) as Array<{
    provider?: string
    label?: string
    models?: Array<string | { id: string; reasoningLevels?: string[] }>
  }>
  return raw.map(group => ({
    provider: group.provider ?? '',
    label: group.label || group.provider || '',
    models: (group.models ?? []).map(m => (typeof m === 'string' ? { id: m } : m)),
  }))
})
function catalogHasModel(model?: string | null): boolean {
  if (!model) return false
  return modelGroupsView.value.some(g => g.models.some(m => m.id === model))
}
const modelDisabled = computed(() => modelGroupsView.value.length === 0)
const modelPickerOpen = ref(false)
const recoveryOpen = ref(false)
// A7 视频抽帧入会话（/api/ide/video-frames 客户端接通）：帧 PNG File 经
// ChatInput defineExpose(addFiles) 入输入框附件列（与粘贴/选文件同一附件链）。
const videoFramesOpen = ref(false)
const chatInputEl = ref<{ addFiles?: (files: File[]) => void } | null>(null)
function onVideoFrames(files: File[]): void {
  chatInputEl.value?.addFiles?.(files)
}
// B4 会话内查找条（zcode findInTask 对照）：开关注入+自动聚焦。
const findOpen = ref(false)
const findRef = ref<{ open?: () => void } | null>(null)
function openFind(): void {
  findOpen.value = true
  void nextTick(() => findRef.value?.open?.())
}
// B2 侧问浮窗开关
const btwOpen = ref(false)
// B1 后台任务开关
const bgTasksOpen = ref(false)
// #10 History 浏览器开关（minimax /history Web 化：user 消息历史×搜索×定位/复制/编辑重发）
const historyOpen = ref(false)
// B6 对照分屏开关（只读第二会话）
const sideSessionOpen = ref(false)
// S1 inline diff：当前会话最近 run 首文件的 patch 文本（真实数据链：
// fetchWorkspaceRunChangesForSession → 首文件详情端点 patch）；无 diff 不渲染。
// A1 接线（2026-09-29）：同时捕获 undo 上下文（changeId/fileId/workspace），
// 逐处拒绝经 /api/ide/run-undo hunkIndexes 真回滚；workspace 缺失时不传上下文，
// 组件降级为本地标记。
const latestDiff = ref('')
const latestDiffUndoCtx = ref<InlineDiffUndoContext | null>(null)
async function loadLatestDiff(): Promise<void> {
  const sid = chatStore.activeSessionId
  // 本地草稿会话尚未在服务端落库，workspace-run-changes 必 404；此前冷启动
  // 每 3s 轮询打一条 404（2026-10-18 回归实测 12s 内 4 条）。
  if (!sid || chatStore.activeSession?.isLocalOnly) return
  try {
    const summaries = await ideRunsApi.changes(sid)
    if (chatStore.activeSessionId !== sid) return // 会话已切换，弃旧响应防乱序回写
    const latest = summaries[0]
    const file = (latest as unknown as { files?: Array<{ id: number; change_id: string; path: string }> }).files?.[0]
    if (!file) return
    const res = await authFetch(`/api/studio/sessions/${encodeURIComponent(sid)}/workspace-run-changes/${encodeURIComponent(file.change_id)}/files/${file.id}`)
    if (!res.ok) return
    const body = (await res.json()) as { file?: { patch?: string } }
    if (chatStore.activeSessionId !== sid) return // 文件详情返回前再次校验
    latestDiff.value = body.file?.patch ?? ''
    const ws = root.value
    latestDiffUndoCtx.value = latestDiff.value && ws
      ? { sessionId: sid, changeId: file.change_id, fileId: file.id, workspace: ws }
      : null
  } catch { /* 无 diff 保持不渲染 */ }
}
onMounted(() => { void loadLatestDiff() })
// 会话切换即清空并重拉：inline diff 只属于当前会话，残留即跨会话串显。
watch(() => chatStore.activeSessionId, () => {
  latestDiff.value = ''
  latestDiffUndoCtx.value = null
  void loadLatestDiff()
})
const modelLabel = computed(() => {
  const m = chatStore.activeSession?.model || appStore.selectedModel || ''
  return m || t('ide.chatSelectModel')
})
// 「重选」已改为就地打开本页选择器（D-7/D-9），旧文案「去设置重选」不再属实。
// 词条在 patch 473，禁 inject 期不改补丁只制造漂移，故按 locale 就地取字。
const reselectLabel = computed(() => {
  const l = String(locale?.value ?? '')
  return l.startsWith('zh') || !l ? '重选模型' : 'Reselect model'
})

function onModelClick(): void {
  modelPickerOpen.value = !modelPickerOpen.value
}

async function pickModel(provider: string, model: string): Promise<void> {
  modelPickerOpen.value = false
  const sid = chatStore.activeSessionId
  if (sid) {
    const ok = await chatStore.switchSessionModel(model, provider, sid)
    // 存量 global 模式会话（改 scoped 前创建）不支持会话内切换：写默认模型并
    // 提示——新会话（已改 scoped）即用所选模型。
    if (!ok) {
      await appStore.switchModel(model, provider)
      message.info(t('ide.chatModelNeedsScopedSession'))
    }
  } else {
    await appStore.switchModel(model, provider)
  }
}

// ── Auto 模型路由（D3，自退役的 IdeModelSwitcher 迁入；qoder 语义：复杂度→成本档）──
// 判定 v1=启发式（最近 user 消息长度+任务关键词），理由透明（toast 展示，不黑箱）；
// 档位→模型映射优先级=服务端 config.route > localStorage 覆盖 > 目录摊平序。
const AUTO_MAP_KEY = 'ide_auto_tier_map'
function tierModels(): Record<CostTier, { provider: string; model: string } | null> {
  const fromServer = (tier: CostTier): { provider: string; model: string } | null => {
    const r = serverRoute.value[tier]
    return r ? { provider: r.providerId, model: r.modelId } : null
  }
  const served: Partial<Record<CostTier, { provider: string; model: string } | null>> = {
    economy: fromServer('economy'), standard: fromServer('standard'), power: fromServer('power'),
  }
  if (served.economy && served.standard && served.power) return served as Record<CostTier, { provider: string; model: string }>
  let ls: Record<string, { provider?: string; model?: string }> | null = null
  try { ls = JSON.parse(localStorage.getItem(AUTO_MAP_KEY) ?? 'null') } catch { /* 坏档回默认 */ }
  const flat: Array<{ provider: string; model: string }> = []
  for (const g of modelGroupsView.value) for (const m of g.models) flat.push({ provider: g.provider, model: m.id })
  const pickAt = (i: number) => flat[Math.min(i, flat.length - 1)] ?? null
  const fallback = { economy: pickAt(0), standard: pickAt(Math.floor((flat.length - 1) / 2)), power: pickAt(flat.length - 1) }
  const merged: Record<CostTier, { provider: string; model: string } | null> = {
    economy: null, standard: null, power: null,
  }
  for (const tier of ['economy', 'standard', 'power'] as const) {
    merged[tier] = served[tier] ?? (ls?.[tier]?.model ? { provider: ls[tier].provider ?? '', model: ls[tier].model as string } : null) ?? fallback[tier]
  }
  return merged
}

function judgeComplexity(): 'simple' | 'standard' | 'complex' {
  const msgs = (chatStore.activeSession?.messages ?? []) as Array<Record<string, unknown>>
  let lastUser = ''
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { lastUser = String(msgs[i].content ?? ''); break }
  }
  if (/重构|排查|架构|设计|迁移|审计|全量|端到端/i.test(lastUser)) return 'complex'
  if (lastUser.length <= 24 && !/[？?]/.test(lastUser)) return 'simple'
  return 'standard'
}

async function pickAuto(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) return
  const route = autoRoute({ complexity: judgeComplexity() })
  const target = tierModels()[route.tier]
  modelPickerOpen.value = false
  if (!target) return
  await chatStore.switchSessionModel(target.model, target.provider, sid)
  // 判定理由透明（不黑箱）：toast 告知档位与依据。
  showToast(`Auto：${route.detail} → ${target.model}`, 'info', 3200)
}

// ── 模型面板管理入口（ZCode chat.toolbar.model.manageModels 对应物）──
const manageOpen = ref(false)
function onManageSaved(): void {
  void loadCatalog()
}

// ── 电脑操作（ZCode composer CUA 入口对应物；声明式，spec D-2）──
// ZCode CUA=宿主插件深集成（权限代理/Helper），IDE 引擎桥无该通道；与 websearch
// 档同一既有模式：开/关各向当前会话发一条声明，实际能力以会话工具面为准。
const CU_KEY = 'ide-computer-use:'
function cuStorageKey(): string { return CU_KEY + (chatStore.activeSessionId ?? 'default') }
const computerUseOn = ref(localStorage.getItem(CU_KEY + 'default') === 'on')
watch(() => chatStore.activeSessionId, (sid, prev) => {
  if (sid !== prev) computerUseOn.value = localStorage.getItem(cuStorageKey()) === 'on'
})
async function toggleComputerUse(): Promise<void> {
  computerUseOn.value = !computerUseOn.value
  localStorage.setItem(cuStorageKey(), computerUseOn.value ? 'on' : 'off')
  await chatStore.sendMessage(
    `[computer-use-policy] enabled=${computerUseOn.value} —— 声明式：允许使用电脑操作/浏览器控制工具；实际能力以会话工具面为准。`,
  )
}


// ── Ycode 思考档（2026-10-18 用户指令：档位与 ZCode 一致，不用 Hermes 配置）──
// 档位来源=引擎目录 per-model reasoningLevels（服务端按 ZCode manifest
// modelConfigRules 补齐，如 glm-5.3 → low/high/max）；写入会话与 ChatInput
// 内置控件同一字段（setSessionReasoningEffort），引擎侧消费路径不变。
const effortOpen = ref(false)
const EFFORT_LABELS: Record<'zh' | 'en', Record<string, string>> = {
  zh: { disabled: '关', enabled: '开', none: '关', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '中高', max: '最高', ultra: '超高' },
  en: { disabled: 'Off', enabled: 'On', none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Med', high: 'High', xhigh: 'X-High', max: 'Max', ultra: 'Ultra' },
}
const isZhLocale = computed(() => {
  const l = String(locale?.value ?? '')
  return !l || l.startsWith('zh')
})
function effortLevelLabel(lv: string): string {
  const map = isZhLocale.value ? EFFORT_LABELS.zh : EFFORT_LABELS.en
  return map[lv] ?? lv
}
const effortDefaultLabel = computed(() => (isZhLocale.value ? '默认' : 'Default'))
const sessionModelEntry = computed(() => {
  const s = chatStore.activeSession
  if (!s?.model) return null
  const group = modelGroupsView.value.find(g => g.provider === (s.provider || '') && g.models.some(m => m.id === s.model))
    ?? modelGroupsView.value.find(g => g.models.some(m => m.id === s.model))
  return group?.models.find(m => m.id === s.model) ?? null
})
const effortLevels = computed(() => sessionModelEntry.value?.reasoningLevels ?? [])
const sessionEffort = computed(() => chatStore.activeSession?.reasoningEffort || '')
const effortLabelShort = computed(() =>
  (isZhLocale.value ? '思考' : 'Think') + ': ' + (sessionEffort.value ? effortLevelLabel(sessionEffort.value) : effortDefaultLabel.value),
)
async function pickEffort(value: string): Promise<void> {
  effortOpen.value = false
  composerSettingsOpen.value = false
  const sid = chatStore.activeSessionId
  if (!sid) return
  await chatStore.setSessionReasoningEffort?.(sid, value)
}

// ── composer「设置」菜单（bee7c5e4，2026-10-18 用户指令：模式/模型要能在设置里调）──
// 模式（七档，与 IdePermissionSwitcher 同 localStorage 键，经事件同步）/ 模型（打开
// Ycode 模型选择器）/ 思考（档位 chips）/ 显示工具调用（useToolTraceVisibility 单一
// 事实源）。本批（e0a3c301）把 ⚙ 按钮收进 composer 工具条行（ZCode 对齐五控件同排），
// 原Teleport 进 ChatInput .input-top-bar 的宿主机制退役——行内直接渲染无需宿主解析。
const composerSettingsOpen = ref(false)
const PERM_MODES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'readonly', label: '只读', hint: 'read only — 仅查看（plan 档同义）' },
  { key: 'plan', label: '计划', hint: 'plan — 只规划不执行' },
  { key: 'default', label: '标准', hint: 'default — 写免审、执行需批（engine: edit）' },
  { key: 'acceptEdits', label: '自动编辑', hint: 'acceptEdits — 编辑免审（engine: autoEdit）' },
  { key: 'dontAsk', label: '少问', hint: 'dontAsk — 执行免审（engine: auto）' },
  { key: 'auto', label: '全自动', hint: 'auto — 全免审' },
  { key: 'bypassPermissions', label: '绕过', hint: 'bypassPermissions — 最高信任（engine: yolo）' },
]
const PERM_KEY = 'ide-permission-mode:'
const PERM_MODE_EVENT = 'ide-perm-mode-changed'
function permStorageKey(): string { return PERM_KEY + (chatStore.activeSessionId ?? 'default') }
const permMode = ref('default')
function syncPermMode(): void { permMode.value = localStorage.getItem(permStorageKey()) || 'default' }
function pickPermMode(key: string): void {
  permMode.value = key
  localStorage.setItem(permStorageKey(), key)
  window.dispatchEvent(new CustomEvent(PERM_MODE_EVENT, { detail: { key, sessionId: chatStore.activeSessionId } }))
}
const permModeLabel = computed(() => PERM_MODES.find(m => m.key === permMode.value)?.label ?? permMode.value)
const { toolTraceVisible, toggleToolTraceVisible } = useToolTraceVisibility()
const labels = computed(() => isZhLocale.value
  ? { settings: '设置', mode: '模式', model: '模型', think: '思考', toolTrace: '显示工具调用', changeModel: '打开模型选择器' }
  : { settings: 'Settings', mode: 'Mode', model: 'Model', think: 'Think', toolTrace: 'Show tool calls', changeModel: 'Open model picker' })
onMounted(() => {
  syncPermMode()
  window.addEventListener(PERM_MODE_EVENT, syncPermMode)
})
onUnmounted(() => window.removeEventListener(PERM_MODE_EVENT, syncPermMode))
watch(() => chatStore.activeSessionId, syncPermMode)
</script>

<template>
  <section class="ide-chat" :class="{ 'is-ide-work-mode': Boolean(ide.isWorkMode) }">
    <header class="ide-chat__head">
      <span class="ide-chat__title" :title="sessionTitle">{{ sessionTitle }}</span>
      <!-- R5 会话工作树隔离徽标（worktree 域显性化） -->
      <IdeWorktreeBadge />
      <!-- 2026-10-18 ZCode 对齐：模型选择/模式控件迁输入区下方 composer 工具条，
           头部不再保留双入口（IdeModelSwitcher/IdePermissionSwitcher 退役迁入）。 -->
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
          data-testid="ide-chat-recovery"
          :disabled="!chatStore.activeSessionId"
          :title="t('ide.chatRecovery')"
          @click="recoveryOpen = true"
        >⏎</button>
        <IdeShareEntry :session-id="chatStore.activeSessionId ?? ''" />
        <button
          type="button"
          class="ide-chat__action"
          data-testid="ide-chat-video-frames"
          title="视频抽帧入会话（按路径抽帧投喂，agent 录屏产物适用）"
          @click="videoFramesOpen = true"
        >🎞</button>
        <button
          type="button"
          class="ide-chat__action"
          data-testid="ide-chat-find"
          title="会话内查找（跳转定位；行内高亮待上游 MessageList 补丁）"
          @click="openFind"
        >🔍</button>
        <button
          type="button"
          class="ide-chat__action"
          data-testid="ide-chat-history"
          :class="{ 'is-on': historyOpen }"
          title="历史提示浏览器（搜索过往提示：定位/复制/编辑重发；运行中只读）"
          @click="historyOpen = !historyOpen"
        >🕘</button>
        <button
          type="button"
          class="ide-chat__action"
          data-testid="ide-chat-btw"
          title="侧问（/btw：旁路提问不打断主任务，答完可复制旁注回主会话）"
          @click="btwOpen = !btwOpen"
        >⇋</button>
        <button
          type="button"
          class="ide-chat__action"
          data-testid="ide-chat-bgtasks"
          title="后台任务（子代理/自治队列/工作流运行 跨源总览）"
          @click="bgTasksOpen = !bgTasksOpen"
        >⏱</button>
        <button
          type="button"
          class="ide-chat__action"
          data-testid="ide-chat-sidesession"
          :class="{ 'is-on': sideSessionOpen }"
          title="对照分屏：右半屏只读另一会话（主屏不动，边看边干）"
          @click="sideSessionOpen = !sideSessionOpen"
        >⇔</button>
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
          :title="canOpenTrace ? t('ide.chatTabTrace') : t('ide.chatTabTraceDisabled')"
          data-testid="ide-chat-trace-btn"
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
      <button
        v-if="fallbackModelTarget"
        type="button"
        class="ide-chat__model-invalid-btn"
        data-testid="ide-model-invalid-fallback"
        @click="onFallbackModel"
      >{{ t('ide.modelInvalid.fallback', { model: fallbackModelTarget.id }) }}</button>
      <button type="button" class="ide-chat__model-invalid-btn" @click="goReselectModel">{{ reselectLabel }}</button>
      <button type="button" class="ide-chat__model-invalid-dismiss" :aria-label="t('ide.modelInvalid.dismiss')" @click="modelInvalidDismissed = true">✕</button>
    </div>

    <!-- P4 模组横幅带（2026-10-04 九源轮）：输入区上方注册式插槽（dsh band 语义）。
         六条迁入：recap(10,自带关闭钮不可带级隐藏)/反注入(20)/审批记忆(30)/
         运行行(40)/轮结果卡(50,自隐藏组件)/todo 条(60,自隐藏组件)。 -->
    <IdeModBand :mods="modBandSpecs">
      <template #recap>
        <!-- R2 会话恢复 recap（claude-code 2.1.108 语义：切回旧会话给“上次谈到哪”） -->
        <div v-if="recap" class="ide-chat__recap" data-testid="ide-session-recap">
          <span class="ide-chat__recap-kicker">{{ t('ide.recap.title') }}</span>
          <span class="ide-chat__recap-last">{{ recap.lastUserText }}</span>
          <span v-if="recap.items.length" class="ide-chat__recap-items" :title="recap.items.join('\n')">
            {{ recap.items.slice(0, 3).join(' · ') }}
          </span>
          <button type="button" class="ide-chat__recap-dismiss" data-testid="ide-recap-dismiss" :aria-label="t('ide.recap.dismiss')" @click="dismissRecap">✕</button>
        </div>
      </template>
      <template #injection>
        <!-- R2 子代理反注入：任一子代理命中注入指纹时的会话级提示条 -->
        <div v-if="flaggedSubagents.size > 0" class="ide-chat__injection" data-testid="ide-injection-banner">
          <span>{{ t('ide.injection.banner', { count: flaggedSubagents.size }) }}</span>
        </div>
      </template>
      <template #approval-hint>
        <!-- R2 批准即学习：新审批匹配本会话记忆时的宽度提示条 -->
        <div v-if="approvalMemoryHint" class="ide-chat__approval-hint" data-testid="ide-approval-memory-hint">
          <span>{{ t('ide.approval.memoryHint', { width: t(`ide.approval.width.${approvalMemoryHint.width}`) }) }}</span>
        </div>
      </template>
      <template #runline>
        <div class="ide-chat__runline" data-testid="ide-chat-runline">
          <template v-if="running">
            <span class="ide-chat__runline-time">{{ t('ide.working') }} {{ runElapsed }}</span>
          </template>
          <template v-else-if="lastCompletedSummary">
            <span class="ide-chat__runline-done">✓ {{ lastCompletedSummary }}</span>
          </template>
        </div>
      </template>
      <template #replay>
        <!-- P5 编辑时间轴回放：无快照时入口仍显示（点击给空态说明，不误导） -->
        <IdeReplayTheater />
      </template>
      <template #run-result>
        <!-- R3 轮结果卡（时长 + 验证 bullet + per-turn 文件变更） -->
        <IdeRunResultCard />
      </template>
      <template #todo>
        <!-- B5 todo 常驻条：最新 todo_list 快照的进度+展开清单（无 todo 自隐藏） -->
        <IdeTodoBar />
      </template>
    </IdeModBand>

    <div ref="mediaRoot" class="ide-chat__body">
      <div class="ide-chat__messages-anchor" :style="sideSessionOpen ? { paddingRight: '348px' } : undefined">
        <div v-if="showWorkEmpty" class="ide-work-empty" data-testid="ide-work-empty">
          <h3 class="ide-work-empty__title">{{ modeText.workEmptyTitle }}</h3>
          <p class="ide-work-empty__desc">{{ modeText.workEmptyDesc }}</p>
          <div class="ide-work-empty__starters">
            <button
              v-for="s in workStarters"
              :key="s.key"
              type="button"
              class="ide-work-empty__starter"
              :data-testid="`ide-work-starter-${s.key}`"
              @click="startWork(s.prompt)"
            >{{ s.label }}</button>
          </div>
        </div>
        <MessageList
          v-if="ready"
          class="ide-chat__messages"
          approval-portal-to-body
          scroll-scope="ide"
        />
        <IdeTurnRail />
      </div>
      <IdeSideSessionPane v-if="sideSessionOpen" @close="sideSessionOpen = false" />
      <IdeMentionPicker />
      <IdeInlineDiff :diff-text="latestDiff" :undo-context="latestDiffUndoCtx" />
      <IdeAgentsView />
      <IdeResumeAdvisor />
      <IdeSecurityBoostBar />
      <IdeImportHistory />
      <IdeKnowledgeBar />
      <IdeQueuePanel />
      <IdeRecapCard />
      <IdeTaskGroupsPanel />
      <IdeReviewPanel />
      <IdeAskCard />
      <IdeMentionChip />
      <IdeRunLogPanel />
      <IdeHandoffCard />
      <IdeRecoveryDialog v-if="recoveryOpen" :open="recoveryOpen" @close="recoveryOpen = false" />
      <IdeVideoFramesDialog v-if="videoFramesOpen" :workspace="root" @close="videoFramesOpen = false" @frames="onVideoFrames" />
      <IdeFindInSession v-if="findOpen" ref="findRef" @close="findOpen = false" />
      <IdeHistoryBrowser v-if="historyOpen" @close="historyOpen = false" />
      <IdeBtwPanel v-if="btwOpen" @close="btwOpen = false" />
      <IdeBgTasksPanel v-if="bgTasksOpen" @close="bgTasksOpen = false" />
      <IdeCompactionCard />
      <div class="ide-chat__model-picker-anchor">
        <ChatInput
          ref="chatInputEl"
          :model-disabled="modelDisabled"
          :model-label="modelLabel"
          :reasoning-effort-disabled="true"
          persist-draft
          @model-click="onModelClick"
        />
        <!-- ZCode 输入框对齐批（2026-10-18）：输入区下方一排五控件+⚙设置，顺序=ZCode
             composer（模式/电脑操作/上下文容量/模型选择/思考强度/设置）。ChatInput 内置
             模型按钮 :deep 隐藏（单一入口防双触发器）；思考档同因弃 Hermes 配置。
             注：本行并位取代 9c0ae4b1「思考档 Teleport 进 ChatInput 底栏」与 bee7c5e4
             「⚙设置 Teleport 同位」——五控件+⚙ 同排，独立行是唯一不 patch 上游组件的
             落点（spec D-1/D-8）；⚙设置菜单本体（模式/模型/思考/工具调用）自 bee7c5e4
             原样收进行尾。 -->
        <div class="ide-chat__composerbar" data-testid="ide-composer-bar">
          <IdePermissionSwitcher />
          <button
            type="button"
            class="ide-chat__cb-btn"
            :class="{ 'is-on': computerUseOn }"
            data-testid="ide-computer-use"
            :title="tx.computerUseTip"
            @click="toggleComputerUse"
          ><span class="ide-chat__cb-dot" />{{ tx.computerUse }}</button>
          <IdeContextBar />
          <button
            type="button"
            class="ide-chat__cb-btn ide-chat__cb-model"
            :disabled="modelDisabled"
            data-testid="ide-composer-model-btn"
            :title="tx.modelSelect"
            @click="onModelClick"
          >
            <span class="ide-chat__cb-model-label">{{ modelLabel }}</span>
            <span class="ide-chat__cb-chevron">▾</span>
          </button>
          <!-- Ycode 思考档（2026-10-18 用户指令）：档位取 ZCode manifest（经引擎目录
               reasoningLevels 下发），不用 Hermes 的推理强度配置——ChatInput 内置
               控件已禁用并隐藏（reasoning-effort-disabled + :deep 隐藏）。 -->
          <div v-if="effortLevels.length > 0" class="ide-chat__effort" data-testid="ide-effort">
            <button
              type="button"
              class="ide-chat__effort-btn"
              data-testid="ide-effort-btn"
              :class="{ 'is-active': !!sessionEffort }"
              :title="tx.thinkLevel"
              @click="effortOpen = !effortOpen"
            >{{ effortLabelShort }}<span class="ide-chat__cb-chevron">▾</span></button>
            <div v-if="effortOpen" class="ide-chat__effort-menu" data-testid="ide-effort-menu">
              <button
                type="button"
                class="ide-chat__effort-option"
                :class="{ 'is-active': sessionEffort === '' }"
                @click="pickEffort('')"
              >{{ effortDefaultLabel }}</button>
              <button
                v-for="lv in effortLevels"
                :key="lv"
                type="button"
                class="ide-chat__effort-option"
                :class="{ 'is-active': sessionEffort === lv }"
                @click="pickEffort(lv)"
              >{{ effortLevelLabel(lv) }}</button>
            </div>
          </div>
          <!-- composer 设置菜单（zcode 对照：模式/模型就地可调；bee7c5e4）——收进
               composer 工具条行（原 Teleport 宿主/is-floating 回落随并位退役）。 -->
          <div class="ide-chat__csettings" data-testid="ide-composer-settings">
            <button
              type="button"
              class="ide-chat__effort-btn ide-chat__csettings-btn"
              data-testid="ide-composer-settings-btn"
              :title="labels.settings"
              @click="composerSettingsOpen = !composerSettingsOpen"
            >⚙ {{ labels.settings }}<span class="ide-chat__effort-caret">▾</span></button>
            <div v-if="composerSettingsOpen" class="ide-chat__csettings-menu" data-testid="ide-composer-settings-menu">
              <div class="ide-chat__csettings-section">
                <div class="ide-chat__csettings-title">{{ labels.mode }} · {{ permModeLabel }}</div>
                <div class="ide-chat__csettings-chips">
                  <button
                    v-for="m in PERM_MODES"
                    :key="m.key"
                    type="button"
                    class="ide-chat__csettings-chip"
                    :class="{ 'is-active': permMode === m.key }"
                    :data-testid="`ide-settings-mode-${m.key}`"
                    :title="m.hint"
                    @click="pickPermMode(m.key)"
                  >{{ m.label }}</button>
                </div>
              </div>
              <div class="ide-chat__csettings-section">
                <div class="ide-chat__csettings-title">{{ labels.model }} · {{ modelLabel || '—' }}</div>
                <button
                  type="button"
                  class="ide-chat__csettings-row"
                  data-testid="ide-settings-model-row"
                  @click="composerSettingsOpen = false; onModelClick()"
                >{{ labels.changeModel }} ›</button>
              </div>
              <div v-if="effortLevels.length > 0" class="ide-chat__csettings-section">
                <div class="ide-chat__csettings-title">{{ labels.think }}</div>
                <div class="ide-chat__csettings-chips">
                  <button type="button" class="ide-chat__csettings-chip" :class="{ 'is-active': sessionEffort === '' }" @click="pickEffort('')">{{ effortDefaultLabel }}</button>
                  <button
                    v-for="lv in effortLevels"
                    :key="lv"
                    type="button"
                    class="ide-chat__csettings-chip"
                    :class="{ 'is-active': sessionEffort === lv }"
                    @click="pickEffort(lv)"
                  >{{ effortLevelLabel(lv) }}</button>
                </div>
              </div>
              <div class="ide-chat__csettings-section">
                <button
                  type="button"
                  class="ide-chat__csettings-row"
                  data-testid="ide-settings-tooltrace"
                  @click="toggleToolTraceVisible()"
                >{{ toolTraceVisible ? '✓ ' : '' }}{{ labels.toolTrace }}</button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="modelPickerOpen" class="ide-chat__model-picker" data-testid="ide-input-model-picker">
          <button
            type="button"
            class="ide-chat__model-option is-auto"
            data-testid="ide-input-model-auto"
            :title="tx.autoTitle"
            @click="pickAuto"
          >{{ tx.autoRoute }}</button>
          <div
            v-for="group in modelGroupsView"
            :key="group.provider"
            class="ide-chat__model-group"
          >
            <div class="ide-chat__model-group-title">{{ group.label || group.provider }}</div>
            <button
              v-for="m in group.models"
              :key="m.id"
              type="button"
              class="ide-chat__model-option"
              :class="{ 'is-active': m.id === chatStore.activeSession?.model }"
              :data-testid="`ide-input-model-${group.provider}-${m.id}`"
              @click="pickModel(group.provider, m.id)"
            >{{ m.id }}</button>
          </div>
          <div class="ide-chat__model-manage">
            <button
              type="button"
              class="ide-chat__model-managebtn"
              data-testid="ide-input-model-manage"
              @click="manageOpen = true"
            >⚙ {{ tx.manageModels }}</button>
          </div>
        </div>
        <IdeEngineModelsDialog v-if="manageOpen" @close="manageOpen = false" @saved="onManageSaved" />
      </div>

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
  position: relative; /* B4 会话内查找条（绝对定位浮层）的锚 */
  background: var(--bg-primary);
}

.ide-chat__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-muted);
}

/* R2：recap 横幅（恢复会话回笼摘要） */
.ide-chat__recap {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--text-secondary);
}

.ide-chat__recap-kicker {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--primary-color);
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
  color: var(--text-muted);
  font-size: 11px;
}

.ide-chat__recap-dismiss {
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0 2px;

  &:hover { color: var(--text-primary); }
}

/* R2：子代理结果反注入提示条 */
.ide-chat__injection {
  flex-shrink: 0;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--ia-stale);
  background: rgba(240, 164, 76, 0.1);
  border-bottom: 1px solid var(--border-color);
}

/* R2：批准即学习记忆命中提示条 */
.ide-chat__approval-hint {
  flex-shrink: 0;
  padding: 4px 12px;
  font-size: 11px;
  color: var(--primary-color);
  background: rgba(97, 175, 239, 0.08);
  border-bottom: 1px solid var(--border-color);
}

.ide-chat__runline-done {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--success-color, var(--success-color));
}

.ide-chat__agent {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-muted);
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
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--accent-primary);
  }

  /* 浮窗开关激活态 */
  &.is-on {
    color: var(--accent-primary);
    border-color: color-mix(in srgb, var(--accent-primary) 55%, transparent);
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
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
  background: var(--bg-primary);
}

/* M1.6 模型失效警示条 */
.ide-chat__model-invalid {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--ia-stale) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ia-stale) 30%, transparent);
  color: var(--ia-stale);
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
  border: 1px solid color-mix(in srgb, var(--ia-stale) 50%, transparent);
  border-radius: 5px;
  background: transparent;
  color: var(--ia-stale);
  font-size: 12px;
  padding: 2px 10px;
  cursor: pointer;

  &:hover { background: color-mix(in srgb, var(--ia-stale) 15%, transparent); }
}

.ide-chat__model-invalid-dismiss {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;

  &:hover { color: var(--text-primary); }
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
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.ide-chat__debug-title {
  font-size: 12px;
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  padding: 4px 0;
  cursor: pointer;

  &:hover { border-color: var(--accent-primary); }
}

.ide-chat__model-picker-anchor {
  position: relative;
  // Ycode 思考档替换 Hermes 推理强度控件（2026-10-18）：ChatInput 内置档位读
  // Hermes model_meta/默认档，与 ZCode 不一致——IDE 内隐藏，改用本组件的
  // ide-chat__effort（档位=ZCode manifest）。设置菜单同因：上游菜单无模式/模型
  // （zcode 有，用户实报），隐藏原按钮，用 ide-chat__csettings。
  :deep(.reasoning-effort-button) { display: none; }
  // 上游 ChatInput 内置设置按钮隐藏（bee7c5e4：⚙迁 IDE 自有位）；内置模型按钮
  // 隐藏（本批：模型选择迁 composer 工具条行，单一入口防双触发器）。
  :deep(.input-settings-button) { display: none; }
  :deep(.input-model-button) { display: none; }
}

// ZCode composer 工具条（2026-10-18 对齐批）：输入区下方一排——模式/电脑操作/
// 上下文容量/模型选择/思考强度（顺序=ZCode）。窄列溢出自动换行不裁控件。
// 思考档随行内排布，取代 9c0ae4b1 的 Teleport 进底栏方案（五控件同排需要，spec D-8）。
.ide-chat__composerbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 6px 12px 10px;
}
.ide-chat__cb-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  max-width: 200px;

  &:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--text-primary); }
  &.is-on {
    color: var(--accent-primary);
    border-color: color-mix(in srgb, var(--accent-primary) 45%, transparent);
    background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
}
.ide-chat__cb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}
.ide-chat__cb-btn.is-on .ide-chat__cb-dot { background: var(--accent-primary); }
.ide-chat__cb-model {
  max-width: 260px;
}
.ide-chat__cb-model-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}
.ide-chat__cb-chevron {
  font-size: 9px;
  flex-shrink: 0;
}

// Ycode 思考档：随 composer 工具条行内排布（2026-10-18 由输入区右上浮层迁入，
// 原 top:-32px 绝对定位退役）；菜单向上开（工具条贴屏底，向下开必被裁）。
.ide-chat__effort {
  position: relative;
  display: inline-flex;
}
.ide-chat__effort-btn {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  font-family: inherit;
  &:hover { color: var(--text-primary); }
  &.is-active {
    color: var(--accent-primary);
    border-color: color-mix(in srgb, var(--accent-primary) 40%, transparent);
  }
}
.ide-chat__effort-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  min-width: 108px;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 30;
}
.ide-chat__effort-option {
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  text-align: left;
  padding: 4px 10px;
  cursor: pointer;
  font-family: inherit;
  &:hover { background: var(--bg-tertiary); color: var(--text-primary); }
  &.is-active { color: var(--accent-primary); font-weight: 600; }
}

// composer 设置菜单（zcode 对照：模式/模型就地可调）。按钮复用 effort-btn 形态，
// 菜单向上弹（与 effort-menu 同区），分区：模式 chips / 模型行 / 思考 chips / 工具调用。
.ide-chat__csettings {
  position: relative;
  display: inline-flex;
  align-items: center;
  z-index: 20;
}
.ide-chat__csettings-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  min-width: 200px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 30;
}
.ide-chat__csettings-section { display: flex; flex-direction: column; gap: 4px; }
.ide-chat__csettings-title {
  font-size: 11px;
  color: var(--text-muted);
  padding: 0 4px;
}
.ide-chat__csettings-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 2px; }
.ide-chat__csettings-chip {
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  &:hover { color: var(--text-primary); background: var(--bg-tertiary); }
  &.is-active { color: var(--accent-primary); border-color: color-mix(in srgb, var(--accent-primary) 40%, transparent); }
}
.ide-chat__csettings-row {
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  text-align: left;
  padding: 4px 8px;
  cursor: pointer;
  font-family: inherit;
  &:hover { background: var(--bg-tertiary); color: var(--text-primary); }
}
.ide-chat__effort-caret { font-size: 10px; opacity: 0.7; }

.ide-chat__model-picker {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 12px;
  max-height: 260px;
  overflow-y: auto;
  background: var(--card-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 6px 10px;
  z-index: 30;
  font-size: 12px;
  min-width: 220px;
}

.ide-chat__model-group-title {
  font-weight: 600;
  color: var(--text-muted);
  padding: 4px 0 2px;
}

.ide-chat__model-option {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.ide-chat__model-option:hover {
  background: var(--hover-color, rgba(0, 0, 0, 0.05));
}

.ide-chat__model-option.is-auto {
  color: var(--primary-color);
  font-weight: 600;
}

/* 管理模型入口（ZCode chat.toolbar.model.manageModels 对应物）：面板底部常驻。 */
.ide-chat__model-manage {
  border-top: 1px dashed var(--border-color);
  margin-top: 4px;
  padding-top: 4px;
}

.ide-chat__model-managebtn {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  padding: 4px 6px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;

  &:hover { background: var(--hover-color, rgba(0, 0, 0, 0.05)); color: var(--primary-color); }
}

.ide-chat__messages-anchor {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 工作模式（interface-mode effects：collapseToolDetails/wrapCode）：
   工具卡只留摘要、代码强制换行；不改上游组件接口（D-10）。 */
.ide-chat.is-ide-work-mode :deep(.tool-details),
.ide-chat.is-ide-work-mode :deep(.tool-details-expand) {
  display: none !important;
}
.ide-chat.is-ide-work-mode :deep(.tool-line.expandable) {
  cursor: default;
}
.ide-chat.is-ide-work-mode :deep(pre),
.ide-chat.is-ide-work-mode :deep(.tool-detail-code-block) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 工作任务空态：四类起步（点击即真实发送，D-9） */
.ide-work-empty {
  padding: 28px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.ide-work-empty__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.ide-work-empty__desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
  max-width: 520px;
}
.ide-work-empty__starters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 520px;
  margin-top: 6px;
}
.ide-work-empty__starter {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 10px 12px;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.ide-work-empty__starter:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
</style>
