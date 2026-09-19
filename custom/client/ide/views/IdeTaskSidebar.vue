<script setup lang="ts">
// IdeTaskSidebar — /ide 富侧栏（ZCode 3.12.3 实拍结构对齐，用户清单批扩展）：
//   顶部：新建任务（⌘N）/ 搜索（⌘K 命令面板）/ 自动化（JobsView 对应物）
//   视图：任务 | 文件（workspaceSidebar.showFileTree；文件视图嵌上游 FileTree）
//   任务视图三模式（organize）：分组（category）/ 项目（workspace）/ 时间线
//   任务菜单：置顶 / 移动到分组（含新建分组）/ 归档 / 分享导出（exportSession）/ 删除
//   归档区：展开加载已归档会话（恢复/打开）；底部 ⇄ 驾驶舱
// 状态：置顶复用 sessionBrowserPrefs（与 HistoryView 全局一致）；分组走
// /api/studio/session-categories（fetch/create/setSessionCategory）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessage, NDropdown, NTooltip, type DropdownOption } from 'naive-ui'
import { useChatStore, type Session } from '@/stores/hermes/chat'
import { useIdePins } from '../utils/pins'
import {
  unarchiveSession,
  batchDeleteSessions,
  fetchSessionCategories,
  createSessionCategory,
  setSessionCategory,
  renameSessionCategory,
  deleteSessionCategory,
  exportSession,
  type SessionCategory,
} from '@/api/studio/sessions'
import FileTree from '@/components/hermes/files/FileTree.vue'
import IdeGitPane from './IdeGitPane.vue'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import { fetchArchivedSessions, type ArchivedSessionItem } from '../api/archivedSessions'
import { formatRelativeTime, workspaceLabel } from '../utils/time'

const { t } = useI18n()
const router = useRouter()
const message = useMessage()
const chat = useChatStore()
const prefs = useIdePins()
// prefs.pinnedIds 非响应式（闭包数组），经触发器转响应式供 computed 依赖
const pinsVersion = ref(0)
prefs.onChange(() => { pinsVersion.value++ })
const pinnedIds = computed(() => { void pinsVersion.value; return prefs.pinnedIds })
const ide = useIdeStore()

// ---- 分组（category）底座 ----
const categories = ref<SessionCategory[]>([])
const newGroupDraft = ref<string | null>(null)
async function loadCategories(): Promise<void> {
  try {
    categories.value = await fetchSessionCategories()
  } catch { /* 分组加载失败不阻塞任务列表 */ }
}
async function createGroup(): Promise<void> {
  const name = (newGroupDraft.value || '').trim()
  newGroupDraft.value = null
  if (!name) return
  try {
    const created = await createSessionCategory(name)
    categories.value = [...categories.value, created]
    message.success(t('ide.task.groupCreated'))
  } catch {
    message.error(t('ide.task.groupCreateFailed'))
  }
}
const renameDraft = ref<{ id: number; name: string } | null>(null)
async function commitRename(): Promise<void> {
  const draft = renameDraft.value
  renameDraft.value = null
  if (!draft || !draft.name.trim() || draft.name.trim() === draft.name) {
    if (draft) await loadCategories() // 还原显示
    return
  }
  try {
    await renameSessionCategory(draft.id, draft.name.trim())
    await loadCategories()
  } catch {
    message.error(t('ide.task.groupRenameFailed'))
  }
}
async function removeGroup(categoryId: number): Promise<void> {
  try {
    await deleteSessionCategory(categoryId)
    for (const s of chat.sessions) if (s.categoryId === categoryId) s.categoryId = null
    await loadCategories()
  } catch {
    message.error(t('ide.task.groupDeleteFailed'))
  }
}

async function moveToGroup(sessionId: string, categoryId: number | null): Promise<void> {
  try {
    await setSessionCategory(sessionId, categoryId)
    const target = chat.sessions.find(s => s.id === sessionId)
    if (target) target.categoryId = categoryId
  } catch {
    message.error(t('ide.task.groupMoveFailed'))
  }
}

// ---- 查看文件视图：文件树/Git 跟随所选任务的 workspace（用户裁定：
// 「文件/Git」在查看文件里、具体任务/项目目录下） ----
const filesWorkspace = ref<string | null>(ide.workspace)
const filesTab = ref<'tree' | 'git'>('tree')
function openTaskFiles(session: Session): void {
  if (session.workspace) filesWorkspace.value = session.workspace
  ide.setSidebarView('files')
}

// ---- 搜索/过滤（常驻，workspaceSidebar.searchTasks） ----
const query = ref('')
const activeQuery = computed(() => query.value.trim().toLowerCase())
function matches(s: { title?: string | null; workspace?: string | null }): boolean {
  if (!activeQuery.value) return true
  const q = activeQuery.value
  return (
    (s.title || '').toLowerCase().includes(q) ||
    workspaceLabel(t, s.workspace).toLowerCase().includes(q)
  )
}
const visibleSessions = computed(() => chat.sessions.filter(s => matches(s)))

// ---- 已置顶 ----
const pinnedSessions = computed(() =>
  visibleSessions.value.filter(s => pinnedIds.value.includes(s.id)),
)

// ---- 组织模式三分：分组(category) / 项目(workspace) / 时间线 ----
interface TaskGroup {
  key: string
  label: string
  categoryId?: number | null
  workspace?: string
  sessions: Session[]
}
const collapsedGroups = ref<Set<string>>(new Set())
function toggleGroup(key: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
}
const unpinnedSessions = computed(() =>
  visibleSessions.value.filter(s => !pinnedIds.value.includes(s.id)),
)
const taskGroups = computed<TaskGroup[]>(() => {
  const rest = unpinnedSessions.value
  if (ide.sidebar.organize === 'timeline') {
    return [{
      key: '__timeline__',
      label: t('ide.task.timeline'),
      sessions: rest.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    }]
  }
  if (ide.sidebar.organize === 'grouped') {
    const groups: TaskGroup[] = categories.value.map(c => ({
      key: `cat-${c.id}`,
      label: c.name,
      categoryId: c.id,
      sessions: rest.filter(s => s.categoryId === c.id)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    }))
    const ungrouped = rest.filter(s => !s.categoryId || !categories.value.some(c => c.id === s.categoryId))
    if (ungrouped.length) {
      groups.push({
        key: '__ungrouped__',
        label: t('ide.task.ungrouped'),
        categoryId: null,
        sessions: ungrouped.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
      })
    }
    return groups
  }
  // project：按 workspace 分组（M1.1 行为）
  const byWorkspace = new Map<string, Session[]>()
  for (const s of rest) {
    const key = (s.workspace || '').trim()
    const list = byWorkspace.get(key) || []
    list.push(s)
    byWorkspace.set(key, list)
  }
  return [...byWorkspace.entries()]
    .map(([key, sessions]) => ({
      key: `ws-${key || '__default__'}`,
      label: workspaceLabel(t, key),
      workspace: key,
      sessions: sessions.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    }))
    .sort((a, b) => (b.sessions[0]?.updatedAt || 0) - (a.sessions[0]?.updatedAt || 0))
})

// ---- 归档区 ----
const showDeleteAllConfirm = ref(false)
const archivedOpen = ref(false)
const archivedLoading = ref(false)
const archivedLoaded = ref(false)
const archived = ref<ArchivedSessionItem[]>([])
async function toggleArchived(): Promise<void> {
  archivedOpen.value = !archivedOpen.value
  if (archivedOpen.value && !archivedLoaded.value) await loadArchived()
}
async function loadArchived(): Promise<void> {
  archivedLoading.value = true
  try {
    archived.value = await fetchArchivedSessions({ limit: 100 })
    archivedLoaded.value = true
  } catch {
    message.error(t('ide.task.archivedLoadFailed'))
  } finally {
    archivedLoading.value = false
  }
}
const deleteAllBusy = ref(false)
async function onDeleteAllArchived(): Promise<void> {
  if (deleteAllBusy.value || !archived.value.length) return
  deleteAllBusy.value = true
  try {
    const targets = archived.value.map(a => ({ id: a.id }))
    const res = await batchDeleteSessions(targets)
    message.success(t('ide.task.deleteAllArchivedResult', { deleted: res.deleted, skipped: archived.value.length - res.deleted - res.failed, failed: res.failed }))
    archived.value = []
    await chat.loadSessions(chat.sessionProfileFilter)
  } catch {
    message.error(t('ide.task.deleteAllArchivedError'))
  } finally {
    deleteAllBusy.value = false
  }
}

async function onUnarchive(id: string): Promise<void> {
  const ok = await unarchiveSession(id)
  if (!ok) {
    message.error(t('chat.unarchiveSessionFailed'))
    return
  }
  message.success(t('chat.sessionUnarchived'))
  archived.value = archived.value.filter(s => s.id !== id)
  await chat.loadSessions(chat.sessionProfileFilter)
}

// ---- 会话操作 ----
async function onOpen(id: string): Promise<void> {
  await chat.switchSession(id)
  ide.setChatTab('messages')
  if (!ide.layout.chatVisible) ide.layout.chatVisible = true
  const target = chat.sessions.find(s => s.id === id)
  if (target?.workspace) filesWorkspace.value = target.workspace
}

async function onNewTask(): Promise<void> {
  await chat.newChat({
    agent: ideAgentToChatAgent(ide.agentId) as never,
    codingAgentId: ide.agentId,
    codingAgentMode: 'global',
    source: 'coding_agent',
    workspace: ide.workspace,
  })
  ide.setChatTab('messages')
  if (!ide.layout.chatVisible) ide.layout.chatVisible = true
}

async function onDelete(id: string): Promise<void> {
  const ok = await chat.deleteSession(id)
  if (!ok) message.error(t('chat.deleteSessionFailed'))
}

async function onArchive(id: string): Promise<void> {
  const ok = await chat.archiveSession(id)
  if (!ok) {
    message.error(t('chat.archiveSessionFailed'))
    return
  }
  archivedLoaded.value = false
  if (archivedOpen.value) await loadArchived()
}

function onShareExport(id: string): void {
  exportSession(id, 'full', 'json').catch(() => message.error(t('ide.task.shareFailed')))
}

function sessionMenu(s: Session): DropdownOption[] {
  const moveChildren: DropdownOption[] = [
    ...categories.value.map(c => ({
      label: c.name,
      key: `move-cat-${c.id}`,
    })),
    { label: t('ide.task.ungrouped'), key: 'move-none' },
    { type: 'divider', key: 'move-div' },
    { label: t('ide.task.newGroup'), key: 'move-new-group' },
  ]
  return [
    { label: t(prefs.isPinned(s.id) ? 'chat.unpin' : 'chat.pin'), key: 'pin' },
    { label: t('ide.task.moveToGroup'), key: 'move', children: moveChildren },
    { label: t('ide.task.shareExport'), key: 'share' },
    { label: t('chat.archiveSession'), key: 'archive' },
    { label: t('chat.deleteSession'), key: 'delete' },
  ]
}
async function onSessionAction(key: string, s: Session): Promise<void> {
  if (key === 'pin') prefs.togglePinned(s.id)
  else if (key === 'share') onShareExport(s.id)
  else if (key === 'archive') await onArchive(s.id)
  else if (key === 'delete') await onDelete(s.id)
  else if (key === 'move-none') await moveToGroup(s.id, null)
  else if (key === 'move-new-group') newGroupDraft.value = ''
  else if (key.startsWith('move-cat-')) await moveToGroup(s.id, Number(key.slice('move-cat-'.length)))
}

function onSearchClick(): void {
  ide.openPalette()
}

function onAutomationsClick(): void {
  router.push({ name: 'hermes.jobs' })
}

onMounted(async () => {
  if (!chat.sessionsLoaded) await chat.loadSessions(chat.sessionProfileFilter)
  await loadCategories()
})
</script>

<template>
  <aside class="ide-taskbar" :aria-label="t('ide.task.sectionLabel')">
    <div class="ide-taskbar__actions">
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-new" @click="onNewTask">
        <span class="ide-taskbar__action-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
          {{ t('ide.task.new') }}
        </span>
        <kbd class="ide-taskbar__kbd">⌘N</kbd>
      </button>
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-search" @click="onSearchClick">
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

    <div class="ide-taskbar__viewtabs" role="tablist">
      <button
        v-for="v in (['tasks', 'files'] as const)"
        :key="v"
        type="button"
        role="tab"
        class="ide-taskbar__viewtab"
        :class="{ 'is-active': ide.sidebar.view === v }"
        :aria-selected="ide.sidebar.view === v"
        :data-testid="`ide-task-view-${v}`"
        @click="ide.setSidebarView(v)"
      >{{ t(`ide.task.view_${v}`) }}</button>
    </div>

    <!-- 文件视图：workspaceSidebar.showFileTree 对应物，嵌上游 FileTree -->
    <div v-if="ide.sidebar.view === 'files'" class="ide-taskbar__files">
      <div class="ide-taskbar__filetabs" role="tablist">
        <button type="button" role="tab" class="ide-taskbar__filetab" :class="{ 'is-active': filesTab === 'tree' }" :aria-selected="filesTab === 'tree'" data-testid="ide-files-tab-tree" @click="filesTab = 'tree'">{{ t('ide.task.view_files') }}</button>
        <button type="button" role="tab" class="ide-taskbar__filetab" :class="{ 'is-active': filesTab === 'git' }" :aria-selected="filesTab === 'git'" data-testid="ide-files-tab-git" @click="filesTab = 'git'">Git</button>
      </div>
      <p class="ide-taskbar__filescope" :title="filesWorkspace ?? ''">{{ filesWorkspace ? workspaceLabel(t, filesWorkspace) : t('ide.task.defaultGroup') }}</p>
      <FileTree v-show="filesTab === 'tree'" :profile="null" :workspace-key="filesWorkspace" />
      <IdeGitPane v-if="filesTab === 'git'" class="ide-taskbar__gitpane" />
    </div>

    <!-- 任务视图 -->
    <template v-else>
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

      <div class="ide-taskbar__organize" role="group" :aria-label="t('ide.task.organize')">
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
                <span class="ide-taskbar__item-title">{{ s.title || t('ide.task.untitled') }}</span>
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
          <ul v-show="!collapsedGroups.has(g.key)" class="ide-taskbar__list">
            <li
              v-for="s in g.sessions"
              :key="s.id"
              class="ide-taskbar__item"
              :class="{ 'is-active': s.id === chat.activeSessionId }"
              :data-testid="`ide-task-item-${s.id}`"
            >
              <button type="button" class="ide-taskbar__item-main" @click="onOpen(s.id)">
                <span class="ide-taskbar__item-title">{{ s.title || t('ide.task.untitled') }}</span>
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

        <section class="ide-taskbar__section" data-testid="ide-task-archived">
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="toggleArchived">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': !archivedOpen }">▾</span>
            <span class="ide-taskbar__section-title">{{ t('ide.task.archived') }}</span>
            <span v-if="archived.length" class="ide-taskbar__archived-count">{{ t('ide.task.archivedTaskCount', { count: archived.length }) }}</span>
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
              <button type="button" class="ide-taskbar__group-btn ide-taskbar__group-btn--danger" :disabled="deleteAllBusy" data-testid="ide-task-delete-all-ok" @click="onDeleteAllArchived(); showDeleteAllConfirm = false">{{ t('ide.task.deleteAllArchivedMenu') }}</button>
              <button type="button" class="ide-taskbar__group-btn" @click="showDeleteAllConfirm = false">{{ t('common.cancel') }}</button>
            </div>
          </div>
          <div v-if="archivedOpen" class="ide-taskbar__archived-body">
            <p v-if="archivedLoading" class="ide-taskbar__hint">{{ t('ide.task.archivedLoading') }}</p>
            <p v-else-if="archivedLoaded && !archived.length" class="ide-taskbar__hint">{{ t('ide.task.archivedEmpty') }}</p>
            <ul v-else class="ide-taskbar__list">
              <li v-for="s in archived" :key="s.id" class="ide-taskbar__item" :data-testid="`ide-task-archived-${s.id}`">
                <button type="button" class="ide-taskbar__item-main" @click="onUnarchive(s.id)">
                  <span class="ide-taskbar__item-title">{{ s.title || t('ide.task.untitled') }}</span>
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
    </template>

    <footer class="ide-taskbar__foot">
      <div class="ide-taskbar__account-row">
        <span class="ide-taskbar__avatar" aria-hidden="true">S</span>
        <span class="ide-taskbar__account">SwarmStudio</span>
        <button
          type="button"
          class="ide-taskbar__foot-btn"
          data-testid="ide-nav-cockpit"
          :title="t('ide.links.cockpitHome')"
          :aria-label="t('ide.links.cockpitHome')"
          @click="router.push({ name: 'ia2.collab' })"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
      </div>
      <div class="ide-taskbar__features" role="toolbar" :aria-label="t('ide.sidePane.togglePanel')">
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-review" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'review' }" :title="t('ide.sidePane.tab_review')" @click="ide.toggleSidePane('review')">⎇</button>
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-browser" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'browser' }" :title="t('ide.sidePane.tab_browser')" @click="ide.toggleSidePane('browser')">◍</button>
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-wiki" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'wiki' }" :title="t('ide.sidePane.tab_wiki')" @click="ide.toggleSidePane('wiki')">W</button>
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-assistant" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'assistant' }" :title="t('ide.sidePane.tab_assistant')" @click="ide.toggleSidePane('assistant')">✦</button>
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-storage" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'storage' }" :title="t('ide.storage.panelTitle')" @click="ide.toggleSidePane('storage')">▤</button>
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-memory" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'memory' }" :title="t('ide.memory.panelTitle')" @click="ide.toggleSidePane('memory')">◈</button>
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-terminal" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'terminal' }" :title="t('ide.terminalTitle')" @click="ide.toggleSidePane('terminal')">⌨</button>
        <button type="button" class="ide-taskbar__feat" data-testid="ide-feat-board" :class="{ 'is-active': ide.sidePane.open && ide.sidePane.tab === 'board' }" :title="t('ide.whiteboard.title')" @click="ide.toggleSidePane('board')">✎</button>
      </div>
    </footer>
  </aside>
</template>

<style scoped lang="scss">
.ide-taskbar {
  width: 270px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #1b1e24);
  border-right: 1px solid var(--border-color, #26292f);
  min-height: 0;
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
  color: var(--text-primary, #e6e6e6);
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover { background: var(--bg-tertiary, #242830); }
}

.ide-taskbar__action-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
}

.ide-taskbar__kbd {
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  background: var(--bg-tertiary, #242830);
  border: 1px solid var(--border-color, #26292f);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: inherit;
}

.ide-taskbar__viewtabs {
  display: flex;
  gap: 2px;
  margin: 2px 8px 4px;
  padding: 2px;
  border-radius: 7px;
  background: var(--bg-primary, #14161a);
}

.ide-taskbar__viewtab {
  flex: 1;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 12px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); }
  &.is-active {
    background: var(--bg-tertiary, #242830);
    color: var(--text-primary, #e6e6e6);
  }
}

.ide-taskbar__filetabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px 0;
}

.ide-taskbar__filetab {
  flex: 1;
  height: 24px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 12px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); }
  &.is-active {
    background: var(--bg-tertiary, #242830);
    color: var(--text-primary, #e6e6e6);
  }
}

.ide-taskbar__filescope {
  margin: 0;
  padding: 3px 12px;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-taskbar__gitpane { flex: 1; min-height: 0; }

.ide-taskbar__files {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 8px;
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
  border: 1px solid var(--accent-primary, #4cc9f0);
  border-radius: 5px;
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  outline: none;
}

.ide-taskbar__newgroup-ok {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: var(--bg-tertiary, #242830);
  color: var(--accent-primary, #4cc9f0);
  cursor: pointer;

  &:hover { background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 20%, transparent); }
}

.ide-taskbar__filter { padding: 4px 8px 4px; }

.ide-taskbar__filter-input {
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-color, #26292f);
  border-radius: 6px;
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  outline: none;

  &::placeholder { color: var(--text-muted, #9aa0aa); }
  &:focus { border-color: var(--accent-primary, #4cc9f0); }
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
  background: var(--bg-tertiary, #242830);
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;

  &:hover { color: var(--text-primary, #e6e6e6); }
  &.is-active {
    color: var(--text-primary, #e6e6e6);
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 22%, var(--bg-tertiary, #242830));
  }
}

.ide-taskbar__scroll { flex: 1; overflow-y: auto; min-height: 0; padding: 0 4px 8px; }

.ide-taskbar__section { margin-top: 6px; }

.ide-taskbar__section-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  text-transform: none;
  letter-spacing: 0.02em;

  &--toggle { cursor: pointer; user-select: none; &:hover { color: var(--text-primary, #e6e6e6); } }
}

.ide-taskbar__section-caret {
  font-size: 9px;
  transition: transform 0.12s ease;
  &.is-collapsed { transform: rotate(-90deg); }
}

.ide-taskbar__rename-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--accent-primary, #4cc9f0);
  border-radius: 4px;
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
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
  color: var(--text-muted, #9aa0aa);
  font-size: 10px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #242830); }
  &--danger:hover { color: #e06c75; }
}

.ide-taskbar__section-count { margin-left: auto; opacity: 0.7; }

.ide-taskbar__list { list-style: none; margin: 0; padding: 0; }

.ide-taskbar__item {
  display: flex;
  align-items: center;
  border-radius: 6px;
  margin: 1px 0;

  &:hover { background: var(--bg-tertiary, #242830); .ide-taskbar__item-more { opacity: 1; } }
  &.is-active {
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
    .ide-taskbar__item-title { color: var(--accent-primary, #4cc9f0); }
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
  color: var(--text-primary, #e6e6e6);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.ide-taskbar__item-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ide-taskbar__item-time { flex-shrink: 0; font-size: 11px; color: var(--text-muted, #9aa0aa); }

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
  color: var(--text-muted, #9aa0aa);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s ease;

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-primary, #14161a); }
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
  background: var(--bg-secondary, #1b1e24);

  p { margin: 0 0 6px; font-size: 12px; color: var(--text-primary, #e6e6e6); }
}

.ide-taskbar__confirm-actions { display: flex; gap: 6px; }

.ide-taskbar__archived-body { padding-bottom: 4px; }

.ide-taskbar__hint { margin: 4px 12px; font-size: 12px; color: var(--text-muted, #9aa0aa); }

.ide-taskbar__foot {
  padding: 6px 10px 8px;
  border-top: 1px solid var(--border-color, #26292f);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ide-taskbar__account-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ide-taskbar__features {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ide-taskbar__feat {
  width: 30px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 13px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #242830); }
  &.is-active {
    color: var(--accent-primary, #4cc9f0);
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 14%, transparent);
  }
}

.ide-taskbar__avatar {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent-primary, #4cc9f0);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.ide-taskbar__account {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-taskbar__foot-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #242830); }
  svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; }
}
</style>
