<!-- overlay/custom/client/ide/components/TaskBriefingPanel.vue -->
<!-- IDE 任务简报面板（aipaydev 方案步骤 20 / 缺口 5）：六区块侧栏面板。
     纯展示组件：数据由父层（IdeShell / 任务跳转入口）注入，自身不发请求。
     区块：任务概览 / 需求上下文 / Git 活动 / Kanban 状态 / 协作动态 / 辅助会话。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffBrief } from '../../../server/brief/brief-cache'
import type {
  BriefingTask,
  BriefingRaci,
  BriefingGit,
  BriefingWorkflow,
  BriefingCollabMessage,
  BriefingRecap,
  BriefingContextFile,
  BriefingEngineProgress,
  BriefingSessionBlock,
  BriefingWorkspaceInfo,
} from './briefing-types'
import { workspaceStateKey } from './briefing-types'

const props = defineProps<{
  task: BriefingTask
  raci?: BriefingRaci
  git?: BriefingGit
  workflow?: BriefingWorkflow
  collab?: BriefingCollabMessage[]
  recap?: BriefingRecap
  /** P3.2 上下文文件列表（需求/概设/排期等关键文档） */
  contextFiles?: BriefingContextFile[]
  /** 研发进度（引擎侧阶段时间线，进度可感知链·件 2c；IdeShell 注入） */
  engineProgress?: BriefingEngineProgress | null
  /** 任务会话块（关联轮）：该任务会话最新摘要+近期消息；缺席整块不渲染 */
  session?: BriefingSessionBlock | null
  /** 任务 workspace 关联态（关联轮，patch 658 端点）；缺席整块不渲染 */
  workspaceInfo?: BriefingWorkspaceInfo | null
}>()

const emit = defineEmits<{
  'aux-send': [text: string]
  /** P3.3 一键打开（IDE 编辑器/预览） */
  'open-file': [path: string]
  /** 任务上下文一键进当前会话（关联轮） */
  'send-context': []
}>()

const { t } = useI18n()

const raciView = computed<BriefingRaci>(() => props.raci ?? { responsible: [], approver: [], consulted: [], informed: [] })
const gitView = computed<BriefingGit>(() => props.git ?? { branch: null, worktreePath: null, commits: [] })
const wfView = computed<BriefingWorkflow>(() => props.workflow ?? { stage: props.task.status, parentIds: [], childIds: [], blocked: false, retryCount: 0 })
const collabView = computed<BriefingCollabMessage[]>(() => props.collab ?? [])
const recapView = computed<BriefingRecap>(() => props.recap ?? { summary: '', decisions: [], blockers: [], todos: [] })

// 任务工作区关联态（关联轮）：状态→键映射在 briefing-types.workspaceStateKey
// （纯函数守门测试同源），文案由语言包解析（patch 659 词条）。

// ── 简报前缀稳定度量（吸收第一批 D2，multica runtime brief 缓存语义的度量面）──
// 当前简报内容 vs 上次打开（localStorage per task）→ diffBrief 稳定前缀/变更段；
// 「本版变化 N 字」回答简报重开后什么变了。生效面（派单组装走增量+provider
// prompt cache）挂 provider 增量帧协议（与 prefix-reuse 层 3 同依赖，记档）。
const briefText = computed(() => JSON.stringify({ raci: raciView.value, git: gitView.value, wf: wfView.value, collab: collabView.value }))
const briefPrevKey = computed(() => `ide_brief_prev_${props.task.id}`)
const briefDiff = computed(() => {
  const prev = (() => { try { return JSON.parse(localStorage.getItem(briefPrevKey.value) ?? 'null')?.text ?? null } catch { return null } })()
  return diffBrief(prev, briefText.value)
})
function settleBrief(): void {
  localStorage.setItem(briefPrevKey.value, JSON.stringify({ text: briefText.value, at: Date.now() }))
}
watch(briefText, settleBrief, { immediate: true })

/** 六区块折叠态（默认全部展开，用户可逐区收起） */
const collapsed = ref<Record<string, boolean>>({})
function toggle(id: string): void {
  collapsed.value[id] = !collapsed.value[id]
}

function kindLabel(kind?: string): string {
  if (kind === 'req') return t('ide.briefing.ctxKindReq', '需求')
  if (kind === 'design') return t('ide.briefing.ctxKindDesign', '概设')
  if (kind === 'schedule') return t('ide.briefing.ctxKindSchedule', '排期')
  return t('ide.briefing.ctxKindDoc', '文档')
}

const auxDraft = ref('')
function sendAux(): void {
  const text = auxDraft.value.trim()
  if (!text) return
  emit('aux-send', text)
  auxDraft.value = ''
}
</script>

<template>
  <aside class="briefing" data-testid="task-briefing-panel">
    <header class="briefing-header">
      <span class="briefing-icon">📋</span>
      <span class="briefing-title">{{ t('ide.briefing.title', '任务简报') }}</span>
      <!-- 工作台联动：IDE 简报 ↔ 看板卡（board?task= 深链打开卡抽屉）——聊天消息里的
           card=t_xxx 芯片已直达看板，此处补 IDE→看板回跳，三区互相可达。 -->
      <nav class="briefing-cplinks" data-testid="briefing-cplinks">
        <a :href="boardHref" :title="`打开任务卡 ${task.id}`">看板卡 ↗</a>
      </nav>
    </header>

    <!-- 区块 1：任务概览 -->
    <section class="briefing-section" data-testid="briefing-header-block">
      <button class="section-toggle" type="button" @click="toggle('header')">
        <span>{{ t('ide.briefing.headerBlock', '任务概览') }}</span>
        <span class="chev">{{ collapsed.header ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.header" class="section-body">
        <div class="kv"><span class="k">{{ t('ide.briefing.taskId', 'ID') }}</span><span class="v">{{ task.id }}</span></div>
        <div class="kv"><span class="k">{{ t('ide.briefing.taskTitle', '标题') }}</span><span class="v">{{ task.title }}</span></div>
        <div class="kv"><span class="k">{{ t('ide.briefing.taskStatus', '状态') }}</span><span class="v">{{ task.status }}</span></div>
        <div class="kv"><span class="k">{{ t('ide.briefing.taskPriority', '优先级') }}</span><span class="v">P{{ task.priority ?? '-' }}</span></div>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.raciLabel', 'RACI') }}</span>
          <span class="v">
            R: {{ raciView.responsible.join(', ') || '—' }} ·
            A: {{ raciView.approver.join(', ') || '—' }} ·
            C: {{ raciView.consulted.join(', ') || '—' }} ·
            I: {{ raciView.informed.join(', ') || '—' }}
          </span>
        </div>
      </div>
    </section>

    <!-- 区块 1c：任务工作区（关联轮）——任务 workspace 即 IDE 根目录；解析失败/
         无工作区整块不渲染（诚实缺席）。未物化（未派发/已回收）如实标注不切换。 -->
    <section v-if="workspaceInfo" class="briefing-section" data-testid="briefing-workspace-block">
      <button class="section-toggle" type="button" @click="toggle('workspace')">
        <span>{{ t('ide.briefing.workspaceBlock', '任务工作区') }}</span>
        <span class="chev">{{ collapsed.workspace ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.workspace" class="section-body">
        <div class="kv">
          <span class="k">{{ t('ide.briefing.workspaceRoot', '根目录') }}</span>
          <span class="v" :title="workspaceInfo.path ?? ''">{{ workspaceInfo.path || '—' }}</span>
        </div>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.workspaceKind', '类型') }}</span>
          <span class="v">{{ workspaceInfo.kind || '—' }}<template v-if="workspaceInfo.branch"> · {{ workspaceInfo.branch }}</template></span>
        </div>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.workspaceState', '关联状态') }}</span>
          <span class="v" :class="{ danger: !workspaceInfo.materialized }" data-testid="briefing-workspace-state">{{ t(workspaceStateKey(workspaceInfo)) }}</span>
        </div>
      </div>
    </section>

    <!-- 区块 1b：研发进度（引擎站点时间线，进度可感知链）——会话面暂缺/无站点
         时整块不渲染（诚实缺席，不占版面不编造） -->
    <section
      v-if="engineProgress && (engineProgress.phases.length > 0 || (engineProgress.milestones?.length ?? 0) > 0)"
      class="briefing-section" data-testid="briefing-engine-progress"
    >
      <button class="section-toggle" type="button" @click="toggle('engine')">
        <span>{{ t('ide.briefing.engineBlock', '研发进度') }}</span>
        <span class="chev">{{ collapsed.engine ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.engine" class="section-body">
        <ol v-if="engineProgress.phases.length > 0" class="phase-line" data-testid="briefing-phase-line">
          <li v-for="(p, i) in engineProgress.phases" :key="i" class="phase-step" :class="`phase-step--${p.status}`">
            <span class="phase-glyph">{{ p.status === 'done' ? '✓' : p.status === 'running' ? '▶' : p.status === 'failed' ? '✕' : '○' }}</span>
            <span class="phase-name">{{ p.name }}</span>
          </li>
        </ol>
        <!-- 技能侧里程碑（无引擎站点面时的进度呈现：每节点离场一条） -->
        <ol v-if="(engineProgress.milestones?.length ?? 0) > 0" class="phase-line" data-testid="briefing-milestone-line">
          <li v-for="(m, i) in engineProgress.milestones" :key="`m-${i}`" class="phase-step" :class="m.status === 'fail' ? 'phase-step--failed' : 'phase-step--done'">
            <span class="phase-glyph">{{ m.status === 'fail' ? '✕' : '✓' }}</span>
            <span class="phase-name">{{ m.milestone }}<template v-if="m.note"> — {{ m.note }}</template></span>
          </li>
        </ol>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.engineState', '引擎状态') }}</span>
          <span class="v">{{ engineProgress.sessionPhase || '—' }}<template v-if="engineProgress.goalStatus"> · {{ engineProgress.goalStatus }}</template></span>
        </div>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.engineDispatch', '派发') }}</span>
          <span class="v">{{ engineProgress.dispatchOkCount }}/{{ engineProgress.dispatchCount }}</span>
        </div>
      </div>
    </section>

    <!-- 区块 2：需求上下文 -->
    <section class="briefing-section" data-testid="briefing-context-block">
      <button class="section-toggle" type="button" @click="toggle('context')">
        <span>{{ t('ide.briefing.contextBlock', '需求上下文') }}</span>
        <span class="chev">{{ collapsed.context ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.context" class="section-body">
        <p v-if="task.body" class="body-excerpt">{{ task.body.slice(0, 200) }}</p>
        <p v-else class="muted">{{ t('ide.briefing.noContext', '暂无需求上下文') }}</p>
        <!-- P3.2/P3.3 上下文文件列表 + 一键打开 -->
        <ul v-if="contextFiles && contextFiles.length" class="ctx-file-list" data-testid="briefing-context-files">
          <li v-for="f in contextFiles" :key="f.path">
            <button type="button" class="ctx-file" :data-testid="`briefing-open-file`" :title="f.path" @click="emit('open-file', f.path)">
              <span class="ctx-file__kind" :class="`ctx-file__kind--${f.kind || 'doc'}`">{{ kindLabel(f.kind) }}</span>
              <span class="ctx-file__name">{{ f.title || f.path.split('/').pop() }}</span>
            </button>
          </li>
        </ul>
      </div>
    </section>

    <!-- 区块 2b：任务会话（关联轮）——该任务会话的上下文信息：最新摘要+近期
         消息节选；会话面缺席（冷窗）整块不渲染。一键把任务上下文发给当前会话
         （显式动作，不自动注入不写文件进 workspace——worktree 树脏会阻断回收）。 -->
    <section v-if="session && (session.summary || session.messages.length)" class="briefing-section" data-testid="briefing-session-block">
      <button class="section-toggle" type="button" @click="toggle('session')">
        <span>{{ t('ide.briefing.sessionBlock', '任务会话') }}</span>
        <span class="chev">{{ collapsed.session ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.session" class="section-body">
        <p v-if="session.summary" class="body-excerpt" data-testid="briefing-session-summary">{{ session.summary }}</p>
        <ul class="collab-list" data-testid="briefing-session-messages">
          <li v-for="(m, i) in session.messages" :key="i" class="collab-item">
            <span class="sender">{{ m.role }}</span>
            <span class="excerpt">{{ m.content }}</span>
          </li>
        </ul>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.sessionMeta', '会话') }}</span>
          <span class="v">{{ session.sessionId || '—' }}<template v-if="session.source"> · {{ session.source }}</template></span>
        </div>
        <button type="button" class="ctx-send" data-testid="briefing-send-context" @click="emit('send-context')">
          {{ t('ide.briefing.sendContext', '把任务上下文发给当前会话') }}
        </button>
      </div>
    </section>

    <!-- 区块 3：Git 活动 -->
    <section class="briefing-section" data-testid="briefing-git-block">
      <button class="section-toggle" type="button" @click="toggle('git')">
        <span>{{ t('ide.briefing.gitBlock', 'Git 活动') }}</span>
        <span class="chev">{{ collapsed.git ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.git" class="section-body">
        <div class="kv"><span class="k">{{ t('ide.briefing.branch', '分支') }}</span><span class="v">{{ gitView.branch || '—' }}</span></div>
        <div class="kv"><span class="k">{{ t('ide.briefing.worktree', 'Worktree') }}</span><span class="v">{{ gitView.worktreePath || '—' }}</span></div>
        <ul class="commit-list">
          <li v-for="c in gitView.commits" :key="c.hash" class="commit-item">
            <code>{{ c.hash.slice(0, 7) }}</code> {{ c.subject }}
          </li>
        </ul>
        <p v-if="gitView.commits.length === 0" class="muted">{{ t('ide.briefing.noCommits', '暂无提交') }}</p>
      </div>
    </section>

    <!-- 区块 4：Kanban 状态 -->
    <section class="briefing-section" data-testid="briefing-workflow-block">
      <button class="section-toggle" type="button" @click="toggle('workflow')">
        <span>{{ t('ide.briefing.workflowBlock', 'Kanban 状态') }}</span>
        <span class="chev">{{ collapsed.workflow ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.workflow" class="section-body">
        <div class="kv"><span class="k">{{ t('ide.briefing.stage', '当前阶段') }}</span><span class="v">{{ wfView.stage }}</span></div>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.deps', '父子依赖') }}</span>
          <span class="v">
            ↑{{ wfView.parentIds.length || 0 }} / ↓{{ wfView.childIds.length || 0 }}
          </span>
        </div>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.blocked', '阻塞') }}</span>
          <span class="v" :class="{ danger: wfView.blocked }">{{ wfView.blocked ? t('ide.briefing.blockedYes', '是') : t('ide.briefing.blockedNo', '否') }}</span>
        </div>
        <div class="kv">
          <span class="k">{{ t('ide.briefing.retryCount', '打回次数') }}</span>
          <!-- 分母=熔断上限 5（server retry-guard RETRY_MAX）；3 是 Leader 介入阈值，不是到顶 -->
          <span class="v" :class="{ danger: wfView.retryCount >= 3 }">{{ wfView.retryCount }}/5</span>
        </div>
      </div>
    </section>

    <!-- 区块 5：协作动态 -->
    <section class="briefing-section" data-testid="briefing-collab-block">
      <button class="section-toggle" type="button" @click="toggle('collab')">
        <span>{{ t('ide.briefing.collabBlock', '协作动态') }}</span>
        <span class="chev">{{ collapsed.collab ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.collab" class="section-body">
        <ul class="collab-list">
          <li v-for="(m, i) in collabView" :key="i" class="collab-item">
            <span class="sender">{{ m.sender }}</span>
            <span class="excerpt">{{ m.excerpt }}</span>
          </li>
        </ul>
        <p v-if="collabView.length === 0" class="muted">{{ t('ide.briefing.noCollab', '暂无协作消息') }}</p>
      </div>
    </section>

    <!-- 区块 6：辅助会话（事件回顾模式） -->
    <section class="briefing-section" data-testid="briefing-aux-block">
      <button class="section-toggle" type="button" @click="toggle('aux')">
        <span>{{ t('ide.briefing.auxBlock', '辅助会话') }}</span>
        <span class="chev">{{ collapsed.aux ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!collapsed.aux" class="section-body">
        <p class="recap-line">📌 {{ t('ide.briefing.recapSummary', '一句话概要') }}：{{ recapView.summary || '—' }}</p>
        <p class="recap-line">📌 {{ t('ide.briefing.recapDecisions', '关键决策') }}：{{ recapView.decisions.join('；') || '—' }}</p>
        <p class="recap-line">📌 {{ t('ide.briefing.recapBlockers', '当前阻塞') }}：{{ recapView.blockers.join('；') || '—' }}</p>
        <p class="recap-line">📌 {{ t('ide.briefing.recapTodos', '你的待办') }}：{{ recapView.todos.join('；') || '—' }}</p>
        <div class="aux-input-row">
          <input
            v-model="auxDraft"
            class="aux-input"
            :placeholder="t('ide.briefing.auxPlaceholder', '自由对话…')"
            data-testid="briefing-aux-input"
            @keydown.enter="sendAux"
          >
          <button class="aux-send" type="button" data-testid="briefing-aux-send" @click="sendAux">
            {{ t('ide.briefing.auxSend', '发送') }}
          </button>
        </div>
      </div>
    </section>
    <!-- 简报前缀稳定度量（D2）：本版较上版变化（diffBrief 稳定前缀/变更段） -->
    <p v-if="briefDiff.prefixChars > 0" class="briefing-briefdiff" data-testid="briefing-briefdiff">
      简报较上版：稳定前缀 {{ briefDiff.prefixChars }} 字 · 变化 {{ briefDiff.delta.length }} 字
    </p>
  </aside>
</template>

<style scoped lang="scss">
.briefing {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--text-primary);
}

.briefing-briefdiff { font-size: 10px; color: var(--text-muted); margin: 0; padding: 0 2px; }

.briefing-cplinks { margin-left: auto; font-size: 11.5px; }
.briefing-cplinks a { color: var(--accent-primary); text-decoration: none; border-bottom: 1px dotted currentColor; padding: 0 4px; }
.briefing-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;

  .briefing-title {
    font-size: 13px;
  }
}

.briefing-section {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.section-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: inherit;

  .chev {
    opacity: 0.6;
  }
}

.section-body {
  padding: 4px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kv {
  display: flex;
  gap: 8px;

  .k {
    flex-shrink: 0;
    color: var(--text-secondary);
    min-width: 56px;
  }

  .v {
    word-break: break-all;

    &.danger {
      color: var(--error);
      font-weight: 600;
    }
  }
}

.muted {
  color: var(--text-muted);
}

/* P3.2 上下文文件列表（§四） */
.ctx-file-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ctx-file {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  &:hover { background: var(--bg-secondary); }
}
.ctx-file__kind {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--text-on-accent);
  background: var(--text-muted);
  &--req { background: var(--accent-primary); }
  &--design { background: var(--success); }
  &--schedule { background: var(--ia-stale); }
}
.ctx-file__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body-excerpt {
  margin: 0;
  white-space: pre-wrap;
}

.commit-list,
.collab-list {
  margin: 0;
  padding: 0 0 0 4px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.commit-item code {
  font-size: 11px;
  opacity: 0.75;
}

.collab-item .sender {
  font-weight: 600;
  margin-right: 6px;
}

.recap-line {
  margin: 0;
}

.aux-input-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;

  .aux-input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
    background: var(--bg-primary);
    color: inherit;
  }

  .aux-send {
    border: none;
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
    background: var(--accent-primary);
    color: var(--text-on-accent);
    font-size: 12px;
  }

  /* 任务上下文一键进会话（关联轮）：宽幅动作钮，与辅助会话发送钮同语言 */
  .ctx-send {
    width: 100%;
    margin-top: 6px;
    border: 1px solid var(--accent-primary);
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    background: var(--bg-primary);
    color: var(--accent-primary);
    font-size: 12px;
    &:hover { background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-primary)); }
  }
}
.phase-line {
  list-style: none; margin: 4px 0; padding: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.phase-step {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--text-secondary);
}
.phase-step--done { color: var(--success); }
.phase-step--running { color: var(--accent-info); font-weight: 600; }
.phase-step--failed { color: var(--error); }
.phase-glyph { width: 14px; text-align: center; }

</style>
