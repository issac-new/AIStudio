<!-- overlay/custom/client/ide/components/TaskBriefingPanel.vue -->
<!-- IDE 任务简报面板（aipaydev 方案步骤 20 / 缺口 5）：六区块侧栏面板。
     纯展示组件：数据由父层（IdeShell / 任务跳转入口）注入，自身不发请求。
     区块：任务概览 / 需求上下文 / Git 活动 / Kanban 状态 / 协作动态 / 辅助会话。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  BriefingTask,
  BriefingRaci,
  BriefingGit,
  BriefingWorkflow,
  BriefingCollabMessage,
  BriefingRecap,
} from './briefing-types'

const props = defineProps<{
  task: BriefingTask
  raci?: BriefingRaci
  git?: BriefingGit
  workflow?: BriefingWorkflow
  collab?: BriefingCollabMessage[]
  recap?: BriefingRecap
}>()

const emit = defineEmits<{ 'aux-send': [text: string] }>()

const { t } = useI18n()

const raciView = computed<BriefingRaci>(() => props.raci ?? { responsible: [], approver: [], consulted: [], informed: [] })
const gitView = computed<BriefingGit>(() => props.git ?? { branch: null, worktreePath: null, commits: [] })
const wfView = computed<BriefingWorkflow>(() => props.workflow ?? { stage: props.task.status, parentIds: [], childIds: [], blocked: false, retryCount: 0 })
const collabView = computed<BriefingCollabMessage[]>(() => props.collab ?? [])
const recapView = computed<BriefingRecap>(() => props.recap ?? { summary: '', decisions: [], blockers: [], todos: [] })

/** 六区块折叠态（默认全部展开，用户可逐区收起） */
const collapsed = ref<Record<string, boolean>>({})
function toggle(id: string): void {
  collapsed.value[id] = !collapsed.value[id]
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
    color: #fff;
    font-size: 12px;
  }
}
</style>
