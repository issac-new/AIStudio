<!-- overlay/custom/client/ide/components/IdeContextArchivePane.vue -->
<!-- 上下文档案面板（C1-C4，DSH dsh-smart-compact「无损换窗」Web 化落地）。
     语义：压缩换窗不是丢失——旧窗原文 verbatim 归档（零摘要模型调用），
     本面板回答"被压缩掉的历史去哪了、怎么找回"：
       窗列表（window#/机械交接锚点三行/消息数/首窗语义徽标）
       × 窗内容查看（折叠消息列表，原文逐字段召回）
       × 跨窗搜索（substring 命中即 snippet）
       × 跨窗工作笔记（增删改 + STALE 新鲜度徽标；未写过笔记时诚实降级提示）。
     数据：/api/context-archive/*（懒推进 advance）与 /api/ctx-notes/*。
     会话源：默认跟随 chatStore.activeSessionId，可切换到任意有归档的会话。
     i18n：漂移期本地字典（trajectory 先例），不动 473 locale 基线。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import {
  listArchivedSessions, listWindows, getWindow, searchWindows,
  listNotes, addNote, updateNote, deleteNote,
  type ArchivedSession, type WindowSummary, type WindowDetail, type SearchHit, type CtxNoteView,
} from '../api/context-archive'

const chatStore = useChatStore()

// ── 本地字典（zh/en，漂移期不进 473 locale 面；键位语义对齐该区域命名） ──
const CTX_TEXT = {
  zh: {
    title: '上下文档案',
    tabHint: '旧窗原文 verbatim 归档，随时召回',
    noSession: '无活动会话',
    sessions: '有归档会话',
    currentSession: '当前会话',
    windows: '归档窗口',
    noWindows: '该会话尚无归档窗（未发生过压缩，或边界未推进）',
    firstWindowNote: '首窗：从会话头整体归档（历史压缩边界已被覆盖，无法按次切分）',
    anchor: '交接锚点',
    messages: '条消息',
    viewWindow: '查看窗内容',
    collapse: '收起',
    searchHint: '跨窗搜索（大小写不敏感）',
    search: '搜索',
    noHits: '无命中',
    windowOf: '窗',
    notes: '跨窗工作笔记',
    notesHint: '压缩换窗后保留；绿色=新鲜，黄色=落后于最近归档（STALE）',
    noNotesHonest: '未写过笔记，可从上下文档案召回',
    notePlaceholder: '写一条跨窗笔记（换窗后仍保留）…',
    add: '添加',
    save: '保存',
    edit: '编辑',
    del: '删除',
    cancel: '取消',
    stale: 'STALE',
    role: '角色',
    tool: '工具',
    unavailable: '会话库不可用，归档暂停',
    loadFail: '加载失败',
  },
  en: {
    title: 'Context Archive',
    tabHint: 'Old-window originals archived verbatim, recall anytime',
    noSession: 'No active session',
    sessions: 'Archived sessions',
    currentSession: 'Current session',
    windows: 'Archived windows',
    noWindows: 'No archived windows for this session (never compacted, or boundary not advanced)',
    firstWindowNote: 'First window: archived from session head (historical boundaries were overwritten, cannot split per-rollover)',
    anchor: 'Handoff anchor',
    messages: 'messages',
    viewWindow: 'View window',
    collapse: 'Collapse',
    searchHint: 'Search across windows (case-insensitive)',
    search: 'Search',
    noHits: 'No hits',
    windowOf: 'Window',
    notes: 'Cross-window notes',
    notesHint: 'Survive compaction rollovers; green=fresh, yellow=older than latest archive (STALE)',
    noNotesHonest: 'No notes yet — recall from the context archive',
    notePlaceholder: 'Write a cross-window note (survives rollovers)…',
    add: 'Add',
    save: 'Save',
    edit: 'Edit',
    del: 'Delete',
    cancel: 'Cancel',
    stale: 'STALE',
    role: 'Role',
    tool: 'Tool',
    unavailable: 'Session db unavailable, archiving paused',
    loadFail: 'Load failed',
  },
} as const

const { locale } = useI18n()
const tx = computed<Record<keyof (typeof CTX_TEXT)['zh'], string>>(() => {
  const loc = String((locale as unknown as { value?: string })?.value ?? 'zh')
  return loc.startsWith('zh') ? CTX_TEXT.zh : CTX_TEXT.en
})

// ── 会话面：默认跟随活动会话，可切任意有归档会话 ──
const activeSessionId = computed(() => chatStore.activeSessionId)
const selectedSession = ref<string>('')
const sessions = ref<ArchivedSession[]>([])
const available = ref(true)
const loading = ref(false)
const error = ref<string | null>(null)

const effectiveSession = computed(() => selectedSession.value || activeSessionId.value || '')

async function reload(session?: string): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const body = await listArchivedSessions()
    available.value = body.available
    sessions.value = body.sessions
    if (session) selectedSession.value = session
    await Promise.all([loadWindows(), loadNotes()])
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function pickSession(sid: string): void {
  void reload(sid)
}

// 活动会话变化时跟随（用户手动选过会话则不覆盖）；首载立即拉取
watch(activeSessionId, () => { if (!selectedSession.value) void reload() }, { immediate: true })

// ── 窗列表面 ──
const windows = ref<WindowSummary[]>([])
async function loadWindows(): Promise<void> {
  const sid = effectiveSession.value
  if (!sid) { windows.value = []; return }
  try {
    windows.value = (await listWindows(sid)).windows
  } catch {
    windows.value = []
  }
}

// ── 窗内容查看（折叠消息列表） ──
const openWindow = ref<WindowDetail | null>(null)
const expanded = ref<Set<number>>(new Set())
async function toggleWindow(n: number): Promise<void> {
  if (openWindow.value?.window === n) { openWindow.value = null; return }
  try {
    openWindow.value = await getWindow(effectiveSession.value, n)
    expanded.value = new Set()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
function toggleMsg(id: number): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
function msgText(content: string, len: number): string {
  return content.length > len ? `${content.slice(0, len)}…` : content
}

// ── 跨窗搜索 ──
const query = ref('')
const hits = ref<SearchHit[] | null>(null)
async function runSearch(): Promise<void> {
  const q = query.value.trim()
  if (!q) { hits.value = null; return }
  try {
    hits.value = await searchWindows(effectiveSession.value, q)
  } catch {
    hits.value = []
  }
}

// ── 工作笔记面（C3：CRUD + STALE 徽标 + 诚实降级） ──
const notes = ref<CtxNoteView[]>([])
const hasNotes = ref(false)
const noteDraft = ref('')
const editingId = ref<string | null>(null)
const editingDraft = ref('')

async function loadNotes(): Promise<void> {
  const sid = effectiveSession.value
  if (!sid) { notes.value = []; hasNotes.value = false; return }
  try {
    const body = await listNotes(sid)
    notes.value = body.notes
    hasNotes.value = body.hasNotes
  } catch {
    notes.value = []
    hasNotes.value = false
  }
}

async function submitNote(): Promise<void> {
  const text = noteDraft.value.trim()
  if (!text || !effectiveSession.value) return
  try {
    await addNote(effectiveSession.value, text)
    noteDraft.value = ''
    await loadNotes()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function startEdit(n: CtxNoteView): void {
  editingId.value = n.id
  editingDraft.value = n.text
}

async function saveEdit(): Promise<void> {
  const text = editingDraft.value.trim()
  if (!editingId.value || !text) return
  try {
    await updateNote(effectiveSession.value, editingId.value, text)
    editingId.value = null
    await loadNotes()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function removeNote(id: string): Promise<void> {
  try {
    await deleteNote(effectiveSession.value, id)
    await loadNotes()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

watch(effectiveSession, () => { openWindow.value = null; hits.value = null })
</script>

<template>
  <div class="ctxar" data-testid="ide-contextarchive-pane">
    <!-- 头：标题 + 可用性 -->
    <div class="ctxar__head">
      <span class="ctxar__title">{{ tx.title }}</span>
      <span class="ctxar__spacer" />
      <span v-if="!available" class="ctxar__warn" :title="tx.unavailable">⚠</span>
      <button type="button" class="ctxar__refresh" data-testid="ctxar-refresh" :title="tx.tabHint" @click="reload()">⟳</button>
    </div>

    <!-- 会话选择：活动会话 + 有归档会话 -->
    <div class="ctxar__session">
      <span class="ctxar__label">{{ tx.currentSession }}: {{ activeSessionId ? activeSessionId.slice(0, 12) : tx.noSession }}</span>
      <select
        class="ctxar__select"
        data-testid="ctxar-session-select"
        :value="selectedSession || activeSessionId || ''"
        @change="pickSession(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="activeSessionId" :value="activeSessionId">{{ activeSessionId.slice(0, 16) }}（{{ tx.currentSession }}）</option>
        <option v-for="s in sessions" :key="s.session" :value="s.session">
          {{ s.session.slice(0, 16) }} · {{ s.windowCount }}w
        </option>
      </select>
    </div>

    <div v-if="loading" class="ctxar__state">…</div>
    <div v-else-if="error" class="ctxar__state ctxar__state--err" data-testid="ctxar-error">{{ tx.loadFail }}: {{ error }}</div>

    <!-- 窗列表 -->
    <div class="ctxar__section">
      <div class="ctxar__section-title">{{ tx.windows }}（{{ windows.length }}）</div>
      <div v-if="!effectiveSession" class="ctxar__state">{{ tx.noSession }}</div>
      <div v-else-if="!windows.length" class="ctxar__state" data-testid="ctxar-no-windows">{{ tx.noWindows }}</div>
      <div
        v-for="w in windows" :key="w.window"
        class="ctxar__win"
        :class="{ 'is-open': openWindow?.window === w.window }"
        :data-testid="`ctxar-window-${w.window}`"
        @click="toggleWindow(w.window)"
      >
        <div class="ctxar__win-head">
          <span class="ctxar__win-num">#{{ w.window }}</span>
          <span class="ctxar__win-range">{{ w.fromMessageId }}..{{ w.toMessageId }}</span>
          <span class="ctxar__win-count">{{ w.messageCount }} {{ tx.messages }}</span>
          <span v-if="w.firstObservation" class="ctxar__badge" :title="tx.firstWindowNote">v1</span>
        </div>
      </div>
      <!-- 首窗语义如实声明（不止徽标 hover，显式行） -->
      <div v-if="windows.some((w) => w.firstObservation)" class="ctxar__note-hint">{{ tx.firstWindowNote }}</div>
    </div>

    <!-- 窗内容（锚点三行 + 折叠消息列表） -->
    <div v-if="openWindow" class="ctxar__detail" data-testid="ctxar-window-detail">
      <div class="ctxar__detail-head">
        <span>{{ tx.windowOf }} #{{ openWindow.window }} · {{ openWindow.boundary.messageCount }} {{ tx.messages }}</span>
        <button type="button" class="ctxar__linkbtn" @click="openWindow = null">{{ tx.collapse }}</button>
      </div>
      <div class="ctxar__anchor">
        <div class="ctxar__anchor-title">{{ tx.anchor }}</div>
        <div v-for="(line, i) in openWindow.anchor" :key="i" class="ctxar__anchor-line">{{ line }}</div>
      </div>
      <div
        v-for="m in openWindow.messages" :key="m.id"
        class="ctxar__msg"
        :data-testid="`ctxar-msg-${m.id}`"
        @click="toggleMsg(m.id)"
      >
        <span class="ctxar__msg-role" :data-role="m.role">{{ m.role }}</span>
        <span v-if="m.tool_name" class="ctxar__msg-tool">{{ m.tool_name }}</span>
        <span class="ctxar__msg-body">{{ expanded.has(m.id) ? m.content : msgText(m.display_content || m.content, 120) }}</span>
      </div>
    </div>

    <!-- 跨窗搜索 -->
    <div class="ctxar__section">
      <div class="ctxar__section-title">{{ tx.searchHint }}</div>
      <div class="ctxar__searchrow">
        <input
          v-model="query" type="text" class="ctxar__search"
          data-testid="ctxar-search-input"
          @keydown.enter.prevent="runSearch"
        >
        <button type="button" class="ctxar__linkbtn" data-testid="ctxar-search-btn" @click="runSearch">{{ tx.search }}</button>
      </div>
      <div v-if="hits && !hits.length" class="ctxar__state" data-testid="ctxar-no-hits">{{ tx.noHits }}</div>
      <div
        v-for="(h, i) in hits" :key="i"
        class="ctxar__hit"
        :data-testid="`ctxar-hit-${i}`"
        title="点击跳到所在窗"
        @click="toggleWindow(h.window)"
      >
        <span class="ctxar__hit-win">#{{ h.window }}</span>
        <span class="ctxar__hit-role">{{ h.role }}</span>
        <span class="ctxar__hit-snip">{{ h.snippet }}</span>
      </div>
    </div>

    <!-- 工作笔记（C3） -->
    <div class="ctxar__section">
      <div class="ctxar__section-title">{{ tx.notes }}</div>
      <div class="ctxar__note-hint">{{ tx.notesHint }}</div>
      <!-- 诚实降级：从未写过笔记 -->
      <div v-if="!hasNotes" class="ctxar__state" data-testid="ctxar-notes-honest">{{ tx.noNotesHonest }}</div>
      <div v-for="n in notes" :key="n.id" class="ctxar__note" :data-testid="`ctxar-note-${n.id}`">
        <template v-if="editingId === n.id">
          <textarea v-model="editingDraft" class="ctxar__note-edit" rows="2" data-testid="ctxar-note-edit-input" />
          <span class="ctxar__note-ops">
            <button type="button" class="ctxar__linkbtn" data-testid="ctxar-note-save" @click="saveEdit">{{ tx.save }}</button>
            <button type="button" class="ctxar__linkbtn" @click="editingId = null">{{ tx.cancel }}</button>
          </span>
        </template>
        <template v-else>
          <span class="ctxar__note-text">{{ n.text }}</span>
          <span v-if="n.stale" class="ctxar__badge is-stale" :title="tx.notesHint">{{ tx.stale }}</span>
          <span class="ctxar__note-ops">
            <button type="button" class="ctxar__linkbtn" @click="startEdit(n)">{{ tx.edit }}</button>
            <button type="button" class="ctxar__linkbtn" @click="removeNote(n.id)">{{ tx.del }}</button>
          </span>
        </template>
      </div>
      <div class="ctxar__searchrow">
        <input
          v-model="noteDraft" type="text" class="ctxar__search"
          :placeholder="tx.notePlaceholder" data-testid="ctxar-note-input"
          @keydown.enter.prevent="submitNote"
        >
        <button type="button" class="ctxar__linkbtn" data-testid="ctxar-note-add" :disabled="!noteDraft.trim()" @click="submitNote">{{ tx.add }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ctxar {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary, #b0b5be);
}
.ctxar__head { display: flex; align-items: center; gap: 6px; }
.ctxar__title { font-weight: 600; color: var(--text-primary, #e6e6e6); }
.ctxar__spacer { flex: 1; }
.ctxar__warn { color: var(--warning-color, #f0a020); }
.ctxar__refresh {
  border: none; background: none; cursor: pointer; color: inherit; font-size: 13px;
  &:hover { color: var(--accent-primary, #4cc9f0); }
}
.ctxar__session { display: flex; align-items: center; gap: 6px; }
.ctxar__label { flex-shrink: 0; color: var(--text-muted, #9aa0aa); }
.ctxar__select {
  flex: 1; min-width: 0;
  border: 1px solid var(--border-color, #3a3f4b); border-radius: 4px;
  background: var(--bg-primary, #14161a); color: inherit; font-size: 11px; padding: 2px 4px;
}
.ctxar__state { color: var(--text-muted, #9aa0aa); font-size: 11px; padding: 2px 0; }
.ctxar__state--err { color: var(--error-color, #d03050); }
.ctxar__section { display: flex; flex-direction: column; gap: 4px; }
.ctxar__section-title { color: var(--text-muted, #9aa0aa); font-size: 11px; }
.ctxar__win {
  border: 1px solid var(--border-color, #3a3f4b); border-radius: 5px;
  padding: 4px 8px; cursor: pointer;
  &:hover { border-color: var(--accent-primary, #4cc9f0); }
  &.is-open { border-color: var(--accent-primary, #4cc9f0); background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 8%, transparent); }
}
.ctxar__win-head { display: flex; align-items: center; gap: 8px; }
.ctxar__win-num { color: var(--accent-primary, #4cc9f0); font-weight: 600; }
.ctxar__win-range { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted, #9aa0aa); }
.ctxar__win-count { font-size: 11px; }
.ctxar__badge {
  font-size: 10px; border-radius: 3px; padding: 0 4px;
  background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 18%, transparent);
  color: var(--accent-primary, #4cc9f0);
  &.is-stale {
    background: color-mix(in srgb, var(--warning-color, #f0a020) 18%, transparent);
    color: var(--warning-color, #f0a020);
    font-weight: 600;
  }
}
.ctxar__note-hint { color: var(--text-muted, #9aa0aa); font-size: 10px; line-height: 1.4; }
.ctxar__detail {
  border: 1px solid var(--border-color, #3a3f4b); border-radius: 5px; padding: 6px 8px;
  display: flex; flex-direction: column; gap: 4px;
}
.ctxar__detail-head { display: flex; align-items: center; justify-content: space-between; }
.ctxar__anchor {
  background: var(--bg-primary, #14161a); border-radius: 4px; padding: 4px 8px;
  display: flex; flex-direction: column; gap: 2px;
}
.ctxar__anchor-title { color: var(--text-muted, #9aa0aa); font-size: 10px; }
.ctxar__anchor-line { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-primary, #e6e6e6); }
.ctxar__msg {
  display: flex; gap: 6px; align-items: baseline; cursor: pointer;
  padding: 2px 0; border-bottom: 1px dashed var(--border-color, #26292f);
  &:hover { background: var(--bg-tertiary, rgba(255, 255, 255, 0.03)); }
}
.ctxar__msg-role {
  flex-shrink: 0; font-size: 10px; width: 52px; text-transform: uppercase;
  color: var(--accent-primary, #4cc9f0);
  &[data-role='user'] { color: var(--primary-color, #18a058); }
}
.ctxar__msg-tool { flex-shrink: 0; font-size: 10px; color: var(--warning-color, #f0a020); }
.ctxar__msg-body { word-break: break-all; white-space: pre-wrap; }
.ctxar__searchrow { display: flex; gap: 4px; }
.ctxar__search {
  flex: 1; min-width: 0;
  border: 1px solid var(--border-color, #3a3f4b); border-radius: 4px;
  background: var(--bg-primary, #14161a); color: inherit; font-size: 11px; padding: 3px 6px;
  &::placeholder { color: var(--text-muted, #9aa0aa); }
}
.ctxar__linkbtn {
  border: 1px solid var(--border-color, #3a3f4b); background: none; border-radius: 4px;
  color: inherit; font-size: 11px; padding: 2px 8px; cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.4; cursor: default; }
}
.ctxar__hit {
  display: flex; gap: 6px; align-items: baseline; cursor: pointer;
  font-size: 11px; padding: 2px 4px; border-radius: 4px;
  &:hover { background: var(--bg-tertiary, rgba(255, 255, 255, 0.04)); }
}
.ctxar__hit-win { color: var(--accent-primary, #4cc9f0); flex-shrink: 0; }
.ctxar__hit-role { color: var(--text-muted, #9aa0aa); flex-shrink: 0; font-size: 10px; }
.ctxar__hit-snip { word-break: break-all; font-family: ui-monospace, monospace; }
.ctxar__note {
  display: flex; gap: 6px; align-items: baseline;
  border: 1px solid var(--border-color, #26292f); border-radius: 5px; padding: 4px 8px;
  flex-wrap: wrap;
}
.ctxar__note-text { flex: 1; min-width: 0; word-break: break-all; white-space: pre-wrap; }
.ctxar__note-ops { display: inline-flex; gap: 4px; flex-shrink: 0; }
.ctxar__note-edit { flex: 1; min-width: 0; resize: vertical; }
</style>
