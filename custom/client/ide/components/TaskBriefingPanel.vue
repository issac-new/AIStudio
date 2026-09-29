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
} from './briefing-types'

const props = defineProps<{
  task: BriefingTask
  raci?: BriefingRaci
  git?: BriefingGit
  workflow?: BriefingWorkflow
  collab?: BriefingCollabMessage[]
  recap?: BriefingRecap
  /** P3.2 上下文文件列表（需求/概设/排期等关键文档） */
  contextFiles?: BriefingContextFile[]
}>()

const emit = defineEmits<{
  'aux-send': [text: string]
  /** P3.3 一键打开（IDE 编辑器/预览） */
  'open-file': [path: string]
}>()

const { t } = useI18n()

const raciView = computed<BriefingRaci>(() => props.raci ?? { responsible: [], approver: [], consulted: [], informed: [] })
const gitView = computed<BriefingGit>(() => props.git ?? { branch: null, worktreePath: null, commits: [] })
const wfView = computed<BriefingWorkflow>(() => props.workflow ?? { stage: props.task.status, parentIds: [], childIds: [], blocked: false, retryCount: 0 })
const collabView = computed<BriefingCollabMessage[]>(() => props.collab ?? [])
const recapView = computed<BriefingRecap>(() => props.recap ?? { summary: '', decisions: [], blockers: [], todos: [] })

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
  color: var(--text-primary, #1f2329);
}

.briefing-briefdiff { font-size: 10px; color: var(--text-muted, #9aa0aa); margin: 0; padding: 0 2px; }

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
  border: 1px solid var(--border-color, #e5e6eb);
  border-radius: 6px;
  background: var(--bg-secondary, #fff);
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
    color: var(--text-secondary, #646a73);
    min-width: 56px;
  }

  .v {
    word-break: break-all;

    &.danger {
      color: #d93026;
      font-weight: 600;
    }
  }
}

.muted {
  color: var(--text-muted, #8f959e);
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
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 5px;
  background: transparent;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  &:hover { background: var(--bg-secondary, #f1f2f4); }
}
.ctx-file__kind {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  color: #fff;
  background: #6b7280;
  &--req { background: #2563eb; }
  &--design { background: #059669; }
  &--schedule { background: #d97706; }
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
    border: 1px solid var(--border-color, #e5e6eb);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
    background: var(--bg-primary, #fff);
    color: inherit;
  }

  .aux-send {
    border: none;
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
    background: var(--brand, #3370ff);
    color: var(--text-on-accent);
    font-size: 12px;
  }
}
</style>
