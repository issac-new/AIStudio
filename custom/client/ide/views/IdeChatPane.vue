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
import { ideCuaApi } from '../api/cua'
import IdeContextBar from '../components/IdeContextBar.vue'
import IdeCompactionCard from '../components/IdeCompactionCard.vue'
import {
  engineDefaultModel, fetchEngineCatalog, rememberEngineDefault,
  type EngineCatalogGroup, type EngineDefault,
} from '../utils/engine-models'
import {
  readZcodeMode, writeZcodeMode, toLegacyMode, zcodeModeLabel,
  ZCODE_PERMISSION_MODES, ZCODE_PLAN, type ZcodeModeState,
} from '../utils/zcodeModes'
import WorkspaceDiffPreview from '@/components/hermes/files/WorkspaceDiffPreview.vue'
import FilePreview from '@/components/hermes/files/FilePreview.vue'
import {
  OPEN_SUBAGENT_STREAM_EVENT,
  type OpenSubagentStreamDetail,
} from '@/utils/hermes/subagent-stream'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import { isSessionModelInvalid, firstAvailableModel } from '../utils/modelInvalid'
import { useCockpitStore } from '@/custom/shared/store/cockpit'
import IdePlanFloat from '../components/IdePlanFloat.vue'
import IdeCuaFloat from '../components/IdeCuaFloat.vue'
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
import IdeActivityInbox from './IdeActivityInbox.vue'
import IdeWorktreeBadge from './IdeWorktreeBadge.vue'
import IdeGoalBudgetFloat from './IdeGoalBudgetFloat.vue'
import { useIdeBoot } from '../composables/useIdeBoot'
import { useAuthedMediaRewrite } from '../utils/authedMedia'
import { resolveBootSession } from '../utils/sessionBoot'
import { matchMemory, recordSessionApproval, clearMemory, type ApprovalMemoryEntry } from '../utils/approvalLearning'
import { showToast } from '../utils/toast'
import { authFetch } from '../utils/auth-fetch'
import { buildNewTaskOptions, sessionTaskMode, explicitTaskMode, type IdeTaskMode } from '../utils/task-mode'
import { useIdeChatPane } from './useIdeChatPane'

const {
  ide,
  chatStore,
  mediaRoot,
  filesStore,
  toolPanelStore,
  tx,
  modeText,
  workStarters,
  showWorkEmpty,
  startWork,
  band,
  modBandSpecs,
  ready,
  modelInvalidDismissed,
  showModelInvalid,
  goReselectModel,
  fallbackModelTarget,
  onFallbackModel,
  approvalMemoryHint,
  debugOpen,
  debugInfo,
  debugCopied,
  running,
  runElapsed,
  lastCompletedSummary,
  copyDebugInfo,
  pendingSubagentId,
  showOverlay,
  closeOverlay,
  newSession,
  canOpenTrace,
  openRunTrace,
  sessionTitle,
  modelGroupsView,
  modelDisabled,
  modelPickerOpen,
  recoveryOpen,
  videoFramesOpen,
  chatInputEl,
  onVideoFrames,
  findOpen,
  findRef,
  openFind,
  btwOpen,
  bgTasksOpen,
  historyOpen,
  sideSessionOpen,
  latestDiff,
  latestDiffUndoCtx,
  modelLabel,
  reselectLabel,
  onModelClick,
  pickModel,
  pickAuto,
  manageOpen,
  onManageSaved,
  computerUseOn,
  toggleComputerUse,
  effortOpen,
  effortLevelLabel,
  effortDefaultLabel,
  effortLevels,
  sessionEffort,
  effortLabelShort,
  pickEffort,
  composerSettingsOpen,
  zcodeModeState,
  commitZcodeMode,
  permModeLabel,
  labels,
  t,
  locale,
  // 模板直引的会话钩子/工具轨迹/工作区根：由 useIdeChatPane 统一调用并透出
  //（拆分前组件里缺失这些绑定，模板引用在运行时为 undefined）
  recap,
  dismissRecap,
  flaggedSubagents,
  toolTraceVisible,
  toggleToolTraceVisible,
  root,
} = useIdeChatPane()
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
          :class="{ 'is-on': ide.floats.cua }"
          data-testid="ide-chat-float-cua"
          :title="tx.cuaFloatTitle"
          :aria-label="tx.cuaFloatTitle"
          @click="ide.toggleFloat('cua')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" />
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
      <IdeInlineDiff v-if="!ide.isWorkMode" :diff-text="latestDiff" :undo-context="latestDiffUndoCtx" />
      <IdeAgentsView />
      <IdeResumeAdvisor />
      <IdeSecurityBoostBar />
      <IdeImportHistory />
      <IdeKnowledgeBar />
      <IdeQueuePanel />
      <IdeRecapCard />
      <IdeTaskGroupsPanel />
      <IdeReviewPanel v-if="!ide.isWorkMode" />
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
          <!-- 电脑操作（Cua 完整回路）：会话级闸门（/api/ide/cua/session/:id，
               fail-closed 默认，patch 664 spawn env 注入）；引擎级全局启停见
               /api/ide/computer-use（并行接通轮端点，本按钮不占用）。 -->
          <button
            type="button"
            class="ide-chat__cb-btn"
            :class="{ 'is-on': computerUseOn }"
            data-testid="ide-computer-use"
            :title="tx.computerUseTip"
            @click="toggleComputerUse"
          ><span class="ide-chat__cb-dot" />{{ tx.computerUse }}</button>
          <IdeContextBar />
          <!-- 2026-11-04 走查修复（模型清单割裂）：清单原挂在大锚（整个输入区）
               顶部 bottom:100%+right:12px，按钮却在输入区底部左侧——清单飘到
               右上角离按钮 ~470px（「位置不连续，割裂感太重」）。改挂按钮旁
               （思考/⚙ 同家族锚定）：锚根 position:relative，清单 left:0 从按钮
               左缘向上弹；is-open 抬 110 压输入区 z-80。 -->
          <div class="ide-chat__model-anchor" :class="{ 'is-open': modelPickerOpen }">
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
          </div>
          <!-- Ycode 思考档（2026-10-18 用户指令）：档位取 ZCode manifest（经引擎目录
               reasoningLevels 下发），不用 Hermes 的推理强度配置——ChatInput 内置
               控件已禁用并隐藏（reasoning-effort-disabled + :deep 隐藏）。 -->
          <div v-if="effortLevels.length > 0" class="ide-chat__effort" :class="{ 'is-open': effortOpen }" data-testid="ide-effort">
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
          <div class="ide-chat__csettings" :class="{ 'is-open': composerSettingsOpen }" data-testid="ide-composer-settings">
            <button
              type="button"
              class="ide-chat__effort-btn ide-chat__csettings-btn"
              data-testid="ide-composer-settings-btn"
              :title="labels.settings"
              @click="composerSettingsOpen = !composerSettingsOpen"
            >⚙ {{ labels.settings }}<span class="ide-chat__effort-caret">▾</span></button>
            <div v-if="composerSettingsOpen" class="ide-chat__csettings-menu" data-testid="ide-composer-settings-menu">
              <div class="ide-chat__csettings-section">
                <div class="ide-chat__csettings-title">{{ labels.mode }} · {{ permModeLabel }}{{ zcodeModeState.planEnabled ? ' + 计划' : '' }}</div>
                <!-- Plan 独立勾选 + 权限三档单选（zcode V4ComposerModeControls 同构） -->
                <div class="ide-chat__csettings-chips">
                  <button
                    type="button"
                    class="ide-chat__csettings-chip"
                    :class="{ 'is-active': zcodeModeState.planEnabled }"
                    data-testid="ide-settings-mode-plan"
                    :title="ZCODE_PLAN.description"
                    @click="commitZcodeMode({ ...zcodeModeState, planEnabled: !zcodeModeState.planEnabled })"
                  >💡 计划</button>
                  <button
                    v-for="m in ZCODE_PERMISSION_MODES"
                    :key="m.key"
                    type="button"
                    class="ide-chat__csettings-chip"
                    :class="[{ 'is-active': m.key === zcodeModeState.mode }, `is-${m.key}`]"
                    :data-testid="`ide-settings-mode-${m.key}`"
                    :title="m.description"
                    @click="commitZcodeMode({ ...zcodeModeState, mode: m.key })"
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
      <IdeCuaFloat v-if="ide.floats.cua" />
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
// 电脑操作错误态（引擎不可达/插件缺失）：红点提示，点击无动作（title 给详情）。
.ide-chat__cb-btn.is-error { color: var(--ia-stale); border-color: color-mix(in srgb, var(--ia-stale) 45%, transparent); }
.ide-chat__cb-btn.is-error .ide-chat__cb-dot { background: var(--ia-stale); }
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

/* 2026-11-04 走查修复：弹层开启时锚根抬到输入区（ChatInput z-80）之上——
 * 菜单向上弹进输入区地盘，z-20/30 会被输入区整片盖住（可见残缺+点击落空）。
 * 110 口径同状态栏面板（压过 z-80 输入区与 z-100 分割条加宽命中域）。 */
.ide-chat__effort.is-open,
.ide-chat__csettings.is-open {
  z-index: 110;
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

/* 模型清单锚根（2026-11-04 走查修复：割裂感）——挂按钮旁，清单从按钮左缘
 * 向上弹（原挂大锚顶部 right:12px，飘到右上角离按钮 ~470px）。is-open 抬
 * 110 与思考/⚙/⛨ 同口径（压输入区 z-80）。 */
.ide-chat__model-anchor {
  position: relative;
  display: inline-flex;

  &.is-open { z-index: 110; }
}

.ide-chat__model-picker {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
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
