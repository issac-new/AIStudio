<script setup lang="ts">
// IdeTaskSidebar — /ide 富侧栏（ZCode 3.12.3 实拍结构对齐，用户清单批扩展）：
//   顶部：新建任务（⌘N）/ 搜索（⌘K 命令面板）/ 自动化（JobsView 对应物）
//   组织模式三 chip（organize）：分组（任务会话标签 category）/ 项目（本机
//   workspace 目录）/ 时间线（任务优先级 → 更新时间逆序）
//   任务菜单：置顶 / 移动到分组（含新建分组）/ 归档 / 分享导出（exportSession）/ 删除
//   归档区：展开加载已归档会话（恢复/打开）；底部 ⇄ 工作台 + 功能按钮组
//   （查看文件右移右侧辅助栏，09-20 裁定：文件视图基于任务会话与项目，
//   不与任务平行独立存在）。
// 状态：置顶复用 sessionBrowserPrefs（与 HistoryView 全局一致）；分组走
// /api/studio/session-categories（fetch/create/setSessionCategory）；时间线
// 优先级经 /api/hermes/kanban listTasks 的 session_id 桥接（口径同 cockpit
// bucketPriority：数字越大越高）。
import { useI18n } from 'vue-i18n'
import { NDropdown, NTooltip } from 'naive-ui'
import IdeWorkitemPanorama from '../components/IdeWorkitemPanorama.vue'
import IdeCliSessions from '../components/IdeCliSessions.vue'
import IdeCliSessionBill from '../components/IdeCliSessionBill.vue'
import { formatRelativeTime } from '../utils/time'
import { sessionTaskMode } from '../utils/task-mode'
import { useTaskSidebar } from './useTaskSidebar'

const { t } = useI18n()

const emit = defineEmits<{ open: [id: string] }>()
const {
  VIEW_TEXT,
  zh,
  chat,
  ide,
  modeText,
  taskModeBadge,
  categories,
  newGroupDraft,
  loadCategories,
  createGroup,
  renameDraft,
  commitRename,
  removeGroup,
  kanban,
  kanbanActiveEntries,
  kanbanText,
  kanbanOpen,
  kanbanTasks,
  openKanbanTask,
  openKanbanBoard,
  panoTaskId,
  togglePano,
  sessionTier,
  query,
  activeQuery,
  pinnedSessions,
  collapsedGroups,
  cliFiltered,
  cliCount,
  cliBillId,
  toggleCliBill,
  fmtCliTokens,
  resumeCli,
  copyCliId,
  cliDirShort,
  toggleGroup,
  viewCounts,
  taskGroups,
  effectiveOrganizeMode,
  showDeleteAllConfirm,
  archivedOpen,
  archivedLoading,
  archivedLoaded,
  archived,
  toggleArchived,
  deleteAllBusy,
  confirmDeleteAllArchived,
  onUnarchive,
  restoreAllBusy,
  onRestoreAllArchived,
  onOpen,
  onNewTask,
  sessionMenu,
  onSessionAction,
  onSearchClick,
  onAutomationsClick,
  cliUsageOf,
} = useTaskSidebar(emit)
</script>


<template>
  <aside class="ide-taskbar" :aria-label="t('ide.task.sectionLabel')">
    <!-- 编程/工作双模式：决定「新建任务」创建哪种内核（编程=编码引擎+工作区；
         工作=通用助手，不绑仓库）。呈现层差异见 ide.interfaceMode。 -->
    <div class="ide-taskbar__modes" role="group" :aria-label="modeText.desc">
      <button
        type="button"
        class="ide-taskbar__mode-btn"
        :class="{ 'is-active': (ide.taskMode ?? 'coding') === 'coding' }"
        :title="modeText.newCodingHint"
        data-testid="ide-task-mode-coding"
        @click="ide.setTaskMode('coding')"
      >{{ modeText.newCoding }}</button>
      <button
        type="button"
        class="ide-taskbar__mode-btn"
        :class="{ 'is-active': ide.taskMode === 'work' }"
        :title="modeText.newWorkHint"
        data-testid="ide-task-mode-work"
        @click="ide.setTaskMode('work')"
      >{{ modeText.newWork }}</button>
    </div>
    <div class="ide-taskbar__actions">
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-new" @click="onNewTask">
        <span class="ide-taskbar__action-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
          {{ t('ide.task.new') }}
        </span>
        <kbd class="ide-taskbar__kbd">⌘N</kbd>
      </button>
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-search" @mousedown.prevent @click="onSearchClick">
        <span class="ide-taskbar__action-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          {{ t('ide.task.search') }}
        </span>
        <kbd class="ide-taskbar__kbd">⌘K</kbd>
      </button>
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-automations" @click="onAutomationsClick">
        <span class="ide-taskbar__action-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M8 14h8" /></svg>
          {{ t('ide.task.automations') }}
        </span>
      </button>
    </div>

    <!-- 任务视图（查看文件已右移 IdeSidePane files 页签，09-20 裁定） -->
    <div class="ide-taskbar__body">
      <div v-if="newGroupDraft !== null" class="ide-taskbar__newgroup">
        <input
          v-model="newGroupDraft"
          class="ide-taskbar__newgroup-input"
          type="text"
          :placeholder="t('ide.task.newGroupName')"
          :aria-label="t('ide.task.newGroupName')"
          data-testid="ide-task-newgroup-input"
          @keydown.enter.prevent="createGroup"
          @keydown.esc.prevent="newGroupDraft = null"
        >
        <button type="button" class="ide-taskbar__newgroup-ok" :aria-label="t('common.ok')" @click="createGroup">✓</button>
      </div>

      <div class="ide-taskbar__filter">
        <input
          v-model="query"
          class="ide-taskbar__filter-input"
          type="text"
          :placeholder="t('ide.task.searchPlaceholder')"
          :aria-label="t('ide.task.search')"
          data-testid="ide-task-filter"
        >
      </div>

      <div class="ide-taskbar__views" role="group" :aria-label="t('ide.task.views')">
        <!-- 2026-10-19 视图语义修正：文案走本地 VIEW_TEXT（done 桶口径=超 24h
             无活动而非完成，词表「已完成」名不副实）；title 写明口径。 -->
        <button
          v-for="vk in (['active', 'done', 'workspace'] as const)"
          :key="vk"
          type="button"
          class="ide-taskbar__view"
          :class="{ 'is-active': ide.sidebar.sessionView === vk }"
          :data-testid="`ide-task-view-${vk}`"
          :title="VIEW_TEXT[vk].hint"
          @click="ide.setSessionView(vk)"
        >{{ zh ? VIEW_TEXT[vk].zh : VIEW_TEXT[vk].en }} <span class="ide-taskbar__view-count">{{ viewCounts[vk] }}</span></button>
      </div>

      <div v-if="ide.sidebar.sessionView !== 'workspace'" class="ide-taskbar__organize" role="group" :aria-label="t('ide.task.organize')">
        <button
          type="button"
          class="ide-taskbar__chip"
          :class="{ 'is-active': ide.sidebar.organize === 'grouped' }"
          data-testid="ide-task-organize-grouped"
          @click="ide.setOrganize('grouped')"
        ># {{ t('ide.task.organize_grouped') }}</button>
        <button
          type="button"
          class="ide-taskbar__chip"
          :class="{ 'is-active': ide.sidebar.organize === 'project' }"
          data-testid="ide-task-organize-project"
          @click="ide.setOrganize('project')"
        >📁 {{ t('ide.task.organize_project') }}</button>
        <button
          type="button"
          class="ide-taskbar__chip"
          :class="{ 'is-active': ide.sidebar.organize === 'timeline' }"
          data-testid="ide-task-organize-timeline"
          @click="ide.setOrganize('timeline')"
        >{{ t('ide.task.organize_timeline') }}</button>
      </div>

      <div class="ide-taskbar__scroll">
        <section v-if="kanbanTasks.length" class="ide-taskbar__section" data-testid="ide-task-kanban">
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="kanbanOpen = !kanbanOpen">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': !kanbanOpen }">▾</span>
            <span class="ide-taskbar__section-title">{{ kanbanText.section }}</span>
            <span class="ide-taskbar__section-count">{{ kanbanActiveEntries.length }}</span>
          </header>
          <template v-if="kanbanOpen">
            <ul class="ide-taskbar__list">
              <li
                v-for="entry in kanbanTasks"
                :key="entry.task.id"
                class="ide-taskbar__item"
                :data-testid="`ide-task-kanban-item-${entry.task.id}`"
              >
                <button
                  type="button"
                  class="ide-taskbar__item-main"
                  :title="`${entry.task.title} · ${entry.board}`"
                  @click="openKanbanTask(entry.task.id)"
                >
                  <span class="ide-taskbar__kanban-row">
                    <span class="ide-taskbar__kanban-title">{{ entry.task.title }}</span>
                    <span class="ide-taskbar__kanban-meta">{{ entry.board }} · {{ entry.task.status }}</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="ide-taskbar__kanban-pano"
                  :data-testid="`ide-task-kanban-pano-${entry.task.id}`"
                  title="全景串联（全链路产物汇聚）"
                  @click.stop="togglePano(entry.task.id)"
                >⌗</button>
                <IdeWorkitemPanorama v-if="panoTaskId === entry.task.id" :task-id="entry.task.id" @close="togglePano(entry.task.id)" />
              </li>
            </ul>
            <button type="button" class="ide-taskbar__kanban-more" data-testid="ide-task-kanban-open-board" @click="openKanbanBoard">
              {{ kanbanText.open }} →
            </button>
          </template>
        </section>

        <section v-if="pinnedSessions.length" class="ide-taskbar__section" data-testid="ide-task-pinned">
          <header class="ide-taskbar__section-head">{{ t('ide.task.pinned') }}</header>
          <ul class="ide-taskbar__list">
            <li
              v-for="s in pinnedSessions"
              :key="s.id"
              class="ide-taskbar__item"
              :class="{ 'is-active': s.id === chat.activeSessionId }"
              :data-testid="`ide-task-item-${s.id}`"
            >
              <button type="button" class="ide-taskbar__item-main" @click="onOpen(s.id)">
                <span
                  class="ide-taskbar__mode-badge"
                  :class="`is-${sessionTaskMode(s)}`"
                  :data-testid="`ide-task-mode-badge-${s.id}`"
                  :title="sessionTaskMode(s) === 'work' ? modeText.newWork : modeText.newCoding"
                >{{ taskModeBadge(s) }}</span>
                <span class="ide-taskbar__item-title">{{ s.title || t('ide.chatUntitled') }}</span>
                <span class="ide-taskbar__item-time">{{ formatRelativeTime(t, s.updatedAt || s.createdAt) }}</span>
              </button>
              <NDropdown trigger="click" :options="sessionMenu(s)" @select="(k: string) => onSessionAction(k, s)">
                <button type="button" class="ide-taskbar__item-more" :aria-label="t('ide.task.more')" @click.stop>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                </button>
              </NDropdown>
            </li>
          </ul>
        </section>

        <section
          v-for="g in taskGroups"
          :key="g.key"
          class="ide-taskbar__section"
          :data-testid="`ide-task-group-${g.label}`"
        >
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="toggleGroup(g.key)">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': collapsedGroups.has(g.key) }">▾</span>
            <template v-if="renameDraft !== null && renameDraft.id === g.categoryId">
              <input
                v-model="renameDraft.name"
                class="ide-taskbar__rename-input"
                :data-testid="`ide-task-rename-${g.categoryId}`"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="renameDraft = null; loadCategories()"
              >
            </template>
            <template v-else>
              <span class="ide-taskbar__section-title">{{ g.label }}</span>
              <span v-if="g.categoryId != null" class="ide-taskbar__group-actions" @click.stop>
                <button type="button" class="ide-taskbar__group-btn" :title="t('ide.task.renameGroup')" :aria-label="t('ide.task.renameGroup')" @click="renameDraft = { id: g.categoryId!, name: g.label }">✎</button>
                <button type="button" class="ide-taskbar__group-btn ide-taskbar__group-btn--danger" :title="t('ide.task.deleteGroup')" :aria-label="t('ide.task.deleteGroup')" @click="removeGroup(g.categoryId!)">✕</button>
              </span>
              <span class="ide-taskbar__section-count">{{ g.sessions.length }}</span>
            </template>
          </header>
          <!-- 2026-10-19：无自建分类时未分组桶给创建引导（否则像分类失效） -->
          <p
            v-if="g.key === '__ungrouped__' && categories.length === 0 && g.sessions.length"
            class="ide-taskbar__group-hint"
            data-testid="ide-task-ungrouped-hint"
          >{{ zh ? '还没有自建分组：任务菜单「移动到分组 → 新建分组」可创建' : 'No custom groups yet: create one via task menu “Move to group”' }}</p>
          <ul v-show="!collapsedGroups.has(g.key)" class="ide-taskbar__list">
            <li
              v-for="s in g.sessions"
              :key="s.id"
              class="ide-taskbar__item"
              :class="{ 'is-active': s.id === chat.activeSessionId }"
              :data-testid="`ide-task-item-${s.id}`"
            >
              <button type="button" class="ide-taskbar__item-main" @click="onOpen(s.id)">
                <span
                  v-if="ide.sidebar.organize === 'timeline' && sessionTier(s)"
                  class="ide-taskbar__prio"
                  :class="`ide-taskbar__prio--${(sessionTier(s) || '').toLowerCase()}`"
                  :data-testid="`ide-task-prio-${sessionTier(s)}`"
                >{{ sessionTier(s) }}</span>
                <span
                  class="ide-taskbar__mode-badge"
                  :class="`is-${sessionTaskMode(s)}`"
                  :data-testid="`ide-task-mode-badge-${s.id}`"
                  :title="sessionTaskMode(s) === 'work' ? modeText.newWork : modeText.newCoding"
                >{{ taskModeBadge(s) }}</span>
                <span class="ide-taskbar__item-title">{{ s.title || t('ide.chatUntitled') }}</span>
                <span class="ide-taskbar__item-time">{{ formatRelativeTime(t, s.updatedAt || s.createdAt) }}</span>
              </button>
              <NDropdown trigger="click" :options="sessionMenu(s)" @select="(k: string) => onSessionAction(k, s)">
                <button type="button" class="ide-taskbar__item-more" :aria-label="t('ide.task.more')" @click.stop>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                </button>
              </NDropdown>
            </li>
            <!-- zcode CLI 会话混排（项目/时间线组织取 zcode directory/时间）：
                 行=徽标+标题+工作区+终端继续；与 IDE 会话同组同维度。 -->
            <li
              v-for="c in g.cli ?? []"
              :key="`cli-${c.id}`"
              class="ide-taskbar__item ide-taskbar__item--cli"
              :class="{ 'ide-taskbar__item--bill-open': cliBillId === c.id }"
              :data-testid="`ide-task-cli-${c.id}`"
            >
              <div class="ide-taskbar__clirow">
                <button type="button" class="ide-taskbar__item-main" :title="`${c.title} · ${c.directory}`" @click="resumeCli(c)">
                  <span class="ide-taskbar__mode-badge is-cli" title="zcode CLI 会话（终端）">zcode</span>
                  <span class="ide-taskbar__item-title">{{ c.title }}</span>
                  <span class="ide-taskbar__item-time">{{ c.directory ? cliDirShort(c.directory) : '' }}</span>
                  <span
                    v-if="cliUsageOf(c.id)"
                    class="ide-taskbar__cli-usage"
                    :title="`轮 ${cliUsageOf(c.id)!.turns}（错 ${cliUsageOf(c.id)!.turnErrors}）· 模型调用 ${cliUsageOf(c.id)!.modelCalls} · 工具 ${cliUsageOf(c.id)!.toolCalls} · 计费 ${fmtCliTokens(cliUsageOf(c.id)!.billedTokens)} token`"
                  >· {{ cliUsageOf(c.id)!.turns }} 轮 · {{ fmtCliTokens(cliUsageOf(c.id)!.billedTokens) }} tok</span>
                </button>
                <button
                  v-if="cliUsageOf(c.id)"
                  type="button"
                  class="ide-taskbar__group-btn"
                  :class="{ 'is-on': cliBillId === c.id }"
                  :data-testid="`ide-cli-bill-${c.id}`"
                  title="展开逐轮用量、上下文趋势/构成与工具时间线（本机 zcode 用量库）"
                  @click.stop="toggleCliBill(c)"
                >账</button>
                <button type="button" class="ide-taskbar__group-btn" :title="`复制会话 ID：${c.id}`" @click="copyCliId(c)">⧉</button>
              </div>
              <IdeCliSessionBill v-if="cliBillId === c.id" :session-id="c.id" />
            </li>
          </ul>
        </section>

        <!-- 分组模式下 zcode 无自建分组存储 → CLI 保持独立段；项目/时间线模式已混排进组 -->
        <section v-if="effectiveOrganizeMode === 'grouped'" class="ide-taskbar__section" data-testid="ide-task-zcode-cli">
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="toggleGroup('zcode-cli')">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': collapsedGroups.has('zcode-cli') }">▾</span>
            <span class="ide-taskbar__section-title">zcode CLI 会话</span>
            <span v-if="cliCount" class="ide-taskbar__section-count">{{ cliCount }}</span>
          </header>
          <div v-show="!collapsedGroups.has('zcode-cli')" class="ide-taskbar__cli-body">
            <IdeCliSessions :boxed="false" :view="ide.sidebar.sessionView" :query="activeQuery" :sessions="cliFiltered" />
          </div>
        </section>

        <section class="ide-taskbar__section" data-testid="ide-task-archived">
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="toggleArchived">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': !archivedOpen }">▾</span>
            <span class="ide-taskbar__section-title">{{ t('ide.task.archived') }}</span>
            <span v-if="archived.length" class="ide-taskbar__archived-count">{{ t('ide.task.archivedTaskCount', { count: archived.length }) }}</span>
            <button
              v-if="archived.length"
              type="button"
              class="ide-taskbar__group-btn"
              :disabled="restoreAllBusy"
              data-testid="ide-task-restore-all-archived"
              :title="t('ide.task.restoreAllArchived', '全部恢复')"
              @click.stop="onRestoreAllArchived"
            >⇪</button>
            <button
              v-if="archived.length"
              type="button"
              class="ide-taskbar__group-btn ide-taskbar__group-btn--danger"
              :disabled="deleteAllBusy"
              data-testid="ide-task-delete-all-archived"
              :title="t('ide.task.deleteAllArchivedMenu')"
              @click.stop="showDeleteAllConfirm = true"
            >🗑</button>
          </header>
          <div v-if="showDeleteAllConfirm" class="ide-taskbar__confirm" data-testid="ide-task-delete-all-confirm">
            <p>{{ t('ide.task.deleteAllArchivedTitle', { count: archived.length }) }}</p>
            <div class="ide-taskbar__confirm-actions">
              <button type="button" class="ide-taskbar__group-btn ide-taskbar__group-btn--danger" :disabled="deleteAllBusy" data-testid="ide-task-delete-all-ok" @click="confirmDeleteAllArchived">{{ t('ide.task.deleteAllArchivedMenu') }}</button>
              <button type="button" class="ide-taskbar__group-btn" @click="showDeleteAllConfirm = false">{{ t('common.cancel') }}</button>
            </div>
          </div>
          <div v-if="archivedOpen" class="ide-taskbar__archived-body">
            <p v-if="archivedLoading" class="ide-taskbar__hint">{{ t('ide.task.archivedLoading') }}</p>
            <p v-else-if="archivedLoaded && !archived.length" class="ide-taskbar__hint">{{ t('ide.task.archivedEmpty') }}</p>
            <ul v-else class="ide-taskbar__list">
              <li v-for="s in archived" :key="s.id" class="ide-taskbar__item" :data-testid="`ide-task-archived-${s.id}`">
                <button type="button" class="ide-taskbar__item-main" @click="onUnarchive(s.id)">
                  <span class="ide-taskbar__item-title">{{ s.title || t('ide.chatUntitled') }}</span>
                  <span class="ide-taskbar__item-time">{{ formatRelativeTime(t, s.last_active) }}</span>
                </button>
                <NTooltip trigger="hover">
                  <template #trigger>
                    <button type="button" class="ide-taskbar__item-more" :aria-label="t('chat.unarchiveSession')" @click.stop="onUnarchive(s.id)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h13M13 4l4 4-4 4M21 12v6a2 2 0 0 1-2 2H7" /></svg>
                    </button>
                  </template>
                  {{ t('chat.unarchiveSession') }}
                </NTooltip>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

  </aside>
</template>

<style scoped lang="scss">
.ide-taskbar {
  /* 跟随 IdeShell 侧栏拖拽宽度：曾固定 270px——aside 拖动改变不了可见面板，
   * 左分割条「拖了不动」根因（2026-09-22）。列 flex 交叉轴默认拉伸，此处显式 100%。 */
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  min-height: 0;
}

/* 编程/工作任务双按钮：决定新建任务的内核（不是界面模式开关） */
.ide-taskbar__modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 8px 8px 0;
}
.ide-taskbar__mode-btn {
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.ide-taskbar__mode-btn:hover { color: var(--text-primary); border-color: var(--primary-color); }
.ide-taskbar__mode-btn.is-active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  font-weight: 600;
}

.ide-taskbar__actions {
  padding: 8px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ide-taskbar__action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover { background: var(--bg-tertiary); }
}

.ide-taskbar__action-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
}

.ide-taskbar__kbd {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: inherit;
}

.ide-taskbar__newgroup {
  display: flex;
  gap: 4px;
  padding: 4px 8px 2px;
}

.ide-taskbar__newgroup-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--accent-primary);
  border-radius: 5px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.ide-taskbar__newgroup-ok {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--accent-primary);
  cursor: pointer;

  &:hover { background: color-mix(in srgb, var(--accent-primary) 20%, transparent); }
}

.ide-taskbar__filter { padding: 4px 8px 4px; }

.ide-taskbar__filter-input {
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;

  &::placeholder { color: var(--text-muted); }
  &:focus { border-color: var(--accent-primary); }
}

/* 三段视图 chip 行（进行中/已完成/工作空间） */
.ide-taskbar__views {
  display: flex;
  gap: 4px;
  padding: 6px 10px 0;
}

.ide-taskbar__view {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border-color);
  background: none;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;

  &:hover { border-color: var(--primary-color); }

  &.is-active {
    background: rgba(97, 175, 239, 0.12);
    border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
    color: var(--primary-color);
    font-weight: 600;
  }
}

.ide-taskbar__view-count {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.ide-taskbar__organize {
  display: flex;
  gap: 2px;
  padding: 0 8px 4px;
}

.ide-taskbar__chip {
  flex: 1;
  height: 24px;
  border: none;
  border-radius: 12px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;

  &:hover { color: var(--text-primary); }
  &.is-active {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--accent-primary) 22%, var(--bg-tertiary));
  }
}

.ide-taskbar__scroll { flex: 1 1 0; height: 0; overflow-y: auto; min-height: 0; padding: 0 4px 8px; }
.ide-taskbar__body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }

.ide-taskbar__section { margin-top: 6px; }

.ide-taskbar__section-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: none;
  letter-spacing: 0.02em;

  &--toggle { cursor: pointer; user-select: none; &:hover { color: var(--text-primary); } }
}

.ide-taskbar__section-caret {
  font-size: 9px;
  transition: transform 0.12s ease;
  &.is-collapsed { transform: rotate(-90deg); }
}

.ide-taskbar__kanban-row { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
/* 全景串联展开钮（P4）：行尾常驻小钮；展开面板 flex-basis 100% 换行占满 */
.ide-taskbar__kanban-pano { flex: 0 0 auto; border: none; background: none; cursor: pointer; opacity: 0.55; font-size: 12px; padding: 2px 4px; }
.ide-taskbar__kanban-pano:hover { opacity: 1; }
.ide-taskbar__item :deep(.ide-pano) { flex-basis: 100%; }
.ide-taskbar__kanban-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-taskbar__kanban-meta { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-taskbar__kanban-more { display: block; width: 100%; border: 0; background: transparent; color: var(--accent-primary); font-size: 11px; text-align: left; padding: 3px 8px 5px; cursor: pointer; }

.ide-taskbar__rename-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 11px;
  outline: none;
}

.ide-taskbar__group-actions {
  display: inline-flex;
  gap: 2px;
  margin-left: auto;
}

.ide-taskbar__group-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;

  &:hover { color: var(--text-primary); background: var(--bg-tertiary); }
  &--danger:hover { color: var(--error-color); }
}

.ide-taskbar__section-count { margin-left: auto; opacity: 0.7; }

.ide-taskbar__list { list-style: none; margin: 0; padding: 0; }

.ide-taskbar__item {
  display: flex;
  align-items: center;
  border-radius: 6px;
  margin: 1px 0;

  &:hover { background: var(--bg-tertiary); .ide-taskbar__item-more { opacity: 1; } }
  &.is-active {
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    .ide-taskbar__item-title { color: var(--accent-primary); }
  }
}

.ide-taskbar__item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.ide-taskbar__item-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 任务模式徽标：编程=蓝、工作=绿（与状态栏 chip 同色系） */
.ide-taskbar__mode-badge {
  flex-shrink: 0;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 16px;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}
.ide-taskbar__mode-badge.is-coding { color: var(--primary-color); border-color: color-mix(in srgb, var(--primary-color) 45%, transparent); }
.ide-taskbar__mode-badge.is-work { color: var(--success-color); border-color: color-mix(in srgb, var(--success-color) 45%, transparent); }

.ide-taskbar__item-time { flex-shrink: 0; font-size: 11px; color: var(--text-muted); }

/* 时间线优先级徽标（P0-P3，口径同 cockpit bucketPriority） */
.ide-taskbar__prio {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  background: color-mix(in srgb, var(--text-muted) 18%, transparent);
  color: var(--text-muted);

  &--p0 { background: rgba(224, 108, 117, 0.18); color: var(--error-color); }
  &--p1 { background: rgba(240, 164, 76, 0.18); color: var(--ia-stale); }
  &--p2 { background: rgba(76, 201, 240, 0.16); color: var(--accent-info); }
}

.ide-taskbar__item-more {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s ease;

  &:hover { color: var(--text-primary); background: var(--bg-primary); }
  svg { width: 14px; height: 14px; fill: currentColor; stroke: none; }
}

.ide-taskbar__archived-count {
  margin-left: auto;
  opacity: 0.7;
}

.ide-taskbar__confirm {
  margin: 4px 8px;
  padding: 8px 10px;
  border: 1px solid rgba(224, 108, 117, 0.5);
  border-radius: 7px;
  background: var(--bg-secondary);

  p { margin: 0 0 6px; font-size: 12px; color: var(--text-primary); }
}

.ide-taskbar__confirm-actions { display: flex; gap: 6px; }

.ide-taskbar__archived-body { padding-bottom: 4px; max-height: 320px; overflow-y: auto; }
.ide-taskbar__group-hint { margin: 2px 4px 6px; font-size: 10.5px; color: var(--text-muted); }
.ide-taskbar__item--cli .ide-taskbar__mode-badge.is-cli {
  color: var(--accent-info, #3b82f6); border: 1px solid var(--accent-info, #3b82f6); border-radius: 6px;
  font-size: 9px; padding: 0 4px; flex-shrink: 0;
}
/* 账单展开时行变列容器（行内容包 .ide-taskbar__clirow，账单体占满宽） */
.ide-taskbar__item--cli { display: flex; }
.ide-taskbar__item--bill-open { flex-direction: column; align-items: stretch; }
.ide-taskbar__clirow { display: flex; align-items: center; min-width: 0; }
.ide-taskbar__cli-usage {
  font-size: 9.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums;
  flex-shrink: 0; margin-left: 2px;
}
.ide-taskbar__group-btn.is-on { color: var(--accent-info, #3b82f6); border-color: var(--accent-info, #3b82f6); }
/* zcode CLI 分组体：内滚上限——侧栏无滚动容器（overflow visible），12 行全展
   会画穿侧栏底、被状态栏背景遮住（2026-10-19 左下角遮罩走查实锚：
   cliSec.bottom=1204 vs sidebar.bottom=871）。上限 ≈7 行，其余组内滚动。 */
.ide-taskbar__cli-body {
  padding: 0 4px 6px;
  max-height: 208px;
  overflow-y: auto;
}

.ide-taskbar__hint { margin: 4px 12px; font-size: 12px; color: var(--text-muted); }







</style>
