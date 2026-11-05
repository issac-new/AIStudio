// 文件职责：IdeChatPane 的会话生命周期/模型与权限/浮窗与浮层状态机。
// 拆分纪律：纯移动，无行为变更；组件 import 留在 SFC，逻辑依赖在此。
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
import type { InlineDiffUndoContext } from '../components/IdeInlineDiff.vue'
import { ideRunsApi } from '../api/runs'
import { ideCuaApi } from '../api/cua'
import {
  engineDefaultModel, fetchEngineCatalog, rememberEngineDefault,
  type EngineCatalogGroup, type EngineDefault,
} from '../utils/engine-models'
import {
  readZcodeMode, writeZcodeMode, toLegacyMode, zcodeModeLabel,
  ZCODE_PERMISSION_MODES, ZCODE_PLAN, type ZcodeModeState,
} from '../utils/zcodeModes'
import {
  OPEN_SUBAGENT_STREAM_EVENT,
  type OpenSubagentStreamDetail,
} from '@/utils/hermes/subagent-stream'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import { useToolTraceVisibility } from '@/composables/useToolTraceVisibility'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { isSessionModelInvalid, firstAvailableModel } from '../utils/modelInvalid'
import { useCockpitStore } from '@/custom/shared/store/cockpit'
import { useModBand, type ModBandSpec } from '../composables/useModBand'
// ZCode 输入框对齐批（2026-10-18）：头部 IdeModelSwitcher 退役，模型选择/Auto 路由/
// 管理入口全部并入输入区模型面板；管理对话框在此挂载（保存后写穿重拉目录）。
import { autoRoute, type CostTier } from '../../../server/modelroute/model-routing'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'
import { useIdeSessionHooks } from '../composables/useIdeSessionHooks'
import { useIdeBoot } from '../composables/useIdeBoot'
import { useAuthedMediaRewrite } from '../utils/authedMedia'
import { resolveBootSession } from '../utils/sessionBoot'
import { matchMemory, recordSessionApproval, clearMemory, type ApprovalMemoryEntry } from '../utils/approvalLearning'
import { showToast } from '../utils/toast'
import { authFetch } from '../utils/auth-fetch'
import { buildNewTaskOptions, sessionTaskMode, explicitTaskMode, type IdeTaskMode } from '../utils/task-mode'

export function useIdeChatPane() {
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
    // 轮结果/回放是代码变更面，工作模式降噪（zcode office 语义：隐藏审查类呈现）
    { id: 'run-result', priority: 50, visible: !Boolean(ide.isWorkMode) },
    { id: 'replay', priority: 55, visible: !Boolean(ide.isWorkMode) },
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

  // ── 电脑操作（ZCode composer CUA 入口对应物）──
  // Cua 完整回路（2026-10-18）：开关写服务端会话闸门（/api/ide/cua/session/:id，
  // fail-closed 默认，patch 664 在 spawn 前注入 ZCODE_CUA_DISABLE），并保留一条
  // 会话声明消息引导 agent；本地 localStorage 只作 UI 即时态，服务端值优先。
  const CU_KEY = 'ide-computer-use:'
  function cuStorageKey(): string { return CU_KEY + (chatStore.activeSessionId ?? 'default') }
  const computerUseOn = ref(localStorage.getItem(CU_KEY + 'default') === 'on')
  const cuaUnavailable = ref(false)
  watch(() => chatStore.activeSessionId, async (sid, prev) => {
    if (sid === prev) return
    computerUseOn.value = localStorage.getItem(cuStorageKey()) === 'on'
    if (sid) {
      try {
        const state = await ideCuaApi.session(sid)
        computerUseOn.value = state.enabled
      } catch { /* 服务端不可达保持本地态 */ }
    }
  })
  async function toggleComputerUse(): Promise<void> {
    const target = !computerUseOn.value
    const sid = chatStore.activeSessionId
    try {
      if (sid) {
        const state = await ideCuaApi.setSession(sid, target)
        computerUseOn.value = state.enabled
        localStorage.setItem(cuStorageKey(), state.enabled ? 'on' : 'off')
      } else {
        computerUseOn.value = target
        localStorage.setItem(cuStorageKey(), target ? 'on' : 'off')
      }
    } catch {
      // 写失败不装成功：按钮回弹（fail-closed 语义由服务端兜底）
      computerUseOn.value = !target
      return
    }
    await chatStore.sendMessage(
      `[computer-use-policy] enabled=${computerUseOn.value} —— ${computerUseOn.value ? '已开启电脑操作：agent 可经 computer-use 技能驱动鼠标/键盘/截图（受会话权限档约束）。' : '已关闭电脑操作：CUA 运行时不可用（fail-closed）。'}`,
    )
  }
  onMounted(() => {
    void ideCuaApi.status()
      .then((s) => { cuaUnavailable.value = !s.available })
      .catch(() => { cuaUnavailable.value = false })
  })


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

  // 2026-11-04 走查修复：composer 弹层（思考/⚙/模型清单）点外关闭＋互斥。文档级
  // pointerdown（先于 click）：点击落在锚根之外（含对方触发钮）即收起——「点 A
  // 触发钮」对 B 是点外，pointerdown 先关 B、click 再开 A，互斥无竞态（IdeDevTools 先例）。
  const COMPOSER_MENU_ROOTS = ['.ide-chat__effort', '.ide-chat__csettings', '.ide-chat__model-anchor'] as const
  function onComposerMenuPointerDown(e: PointerEvent): void {
    if (!effortOpen.value && !composerSettingsOpen.value && !modelPickerOpen.value) return
    const target = e.target as Node | null
    if (!target) return
    // 逐菜单判属主：点在谁的锚根内谁保留，其余收起（活体实锤：整组早退会让
    // 「点 A 触发钮」保住已开的 B——两菜单同时开着叠层）。
    const within = COMPOSER_MENU_ROOTS.map(sel => document.querySelector(sel)?.contains(target) ?? false)
    if (!within[0]) effortOpen.value = false
    if (!within[1]) composerSettingsOpen.value = false
    if (!within[2]) modelPickerOpen.value = false
  }
  onMounted(() => document.addEventListener('pointerdown', onComposerMenuPointerDown))
  onUnmounted(() => document.removeEventListener('pointerdown', onComposerMenuPointerDown))
  // 模式=ZCode 四档形态（2026-10-18 锚定校正轮）：Plan 勾选 + build/guarded/yolo 三单选
  // （目录/描述/色语义锚 upstream/zcode v3.16.1 ZCODE_AGENT_MODE_OPTIONS + 
  // V4ComposerModeControls）；存储与派生经 utils/zcodeModes（派生七档写旧键，
  // 服务端 session-mode REST 零改动）。
  const PERM_MODE_EVENT = 'ide-perm-mode-changed'
  const zcodeModeState = ref<ZcodeModeState>(readZcodeMode(chatStore.activeSessionId))
  function syncPermMode(): void { zcodeModeState.value = readZcodeMode(chatStore.activeSessionId) }
  function commitZcodeMode(next: ZcodeModeState): void {
    zcodeModeState.value = next
    writeZcodeMode(chatStore.activeSessionId, next)
    window.dispatchEvent(new CustomEvent(PERM_MODE_EVENT, { detail: { key: toLegacyMode(next), sessionId: chatStore.activeSessionId } }))
  }
  const permModeLabel = computed(() => zcodeModeLabel(zcodeModeState.value))
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

  return {
    ide, chatStore, mediaRoot, filesStore, toolPanelStore, tx, modeText, workStarters, showWorkEmpty, startWork, band, modBandSpecs, ready, modelInvalidDismissed, showModelInvalid, goReselectModel, fallbackModelTarget, onFallbackModel, approvalMemoryHint, debugOpen, debugInfo, debugCopied, running, runElapsed, lastCompletedSummary, copyDebugInfo, pendingSubagentId, showOverlay, closeOverlay, newSession, canOpenTrace, openRunTrace, sessionTitle, modelGroupsView, modelDisabled, modelPickerOpen, recoveryOpen, videoFramesOpen, chatInputEl, onVideoFrames, findOpen, findRef, openFind, btwOpen, bgTasksOpen, historyOpen, sideSessionOpen, latestDiff, latestDiffUndoCtx, modelLabel, reselectLabel, onModelClick, pickModel, pickAuto, manageOpen, onManageSaved, computerUseOn, toggleComputerUse, effortOpen, effortLevelLabel, effortDefaultLabel, effortLevels, sessionEffort, effortLabelShort, pickEffort, composerSettingsOpen, zcodeModeState, commitZcodeMode, permModeLabel, labels, t, locale,
    // IdeChatPane 模板直引的成员：会话钩子（recap/反注入）、工具轨迹开关、工作区根
    recap, dismissRecap, flaggedSubagents, toolTraceVisible, toggleToolTraceVisible, root,
  }
}
