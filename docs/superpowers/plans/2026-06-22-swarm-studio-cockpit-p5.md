# AI协作中心 驾驶舱 P5 实施计划（Claude Code 终端 + 历史回溯 + 归档只读）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三块新能力：①模式切换器加「⌘ 编程」tab，切到后右栏显示以当前任务 workspace 为根的 Claude Code 终端（sandbox 编程，P5 用本地 echo 模拟，真实进程接入留后续）；②注意力条加「🕘 历史」按钮，弹窗展示用户操作过的历史事件时序流（含筛选），点击事件筛选下方三栏为该事件相关内容；③点击已归档事件 → 全局灰色只读态（不可改，但可发起新协作）。

**Architecture:** 在 `useCockpitStore` 增加：编程模式、终端输出行、历史事件、筛选条件、归档态的 state。新增两个组件：`CockpitTerminalPane`（Claude Code 终端）、`CockpitHistoryModal`（历史回溯弹窗）。`CockpitModeBar` 加「⌘ 编程」tab。`CockpitAttention` 加「🕘 历史」按钮。`CockpitView` 加 overlay + modal，并在归档态下给右栏加只读标记。所有样式继续 Pure Ink（终端用深色，是唯一的深色区域，符合「编程终端」语义）。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · vitest + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.5 编程模式、§5.8 历史回溯、归档只读态）
**前置：** P1+P2+P3+P4 已合并到 `feat/cockpit-p1` 分支。

---

## 文件结构

- **Modify** `packages/client/src/stores/hermes/cockpit.ts` — 编程模式/终端行/历史/筛选/归档 state
- **Create** `packages/client/src/components/hermes/cockpit/CockpitTerminalPane.vue` — Claude Code 终端
- **Create** `packages/client/src/components/hermes/cockpit/CockpitHistoryModal.vue` — 历史回溯弹窗
- **Modify** `packages/client/src/components/hermes/cockpit/CockpitModeBar.vue` — 加「⌘ 编程」tab
- **Modify** `packages/client/src/components/hermes/cockpit/CockpitAttention.vue` — 加「🕘 历史」按钮 + emit
- **Modify** `packages/client/src/views/hermes/CockpitView.vue` — 终端模式切换、历史弹窗、归档态
- **Modify** `packages/client/src/i18n/locales/en.ts` + `zh.ts` — 编程/历史/归档 i18n 键
- **Test** `tests/client/cockpit-store.test.ts` — 补编程/历史/归档 store 测试
- **Test** `tests/client/cockpit-terminal-pane.test.ts`
- **Test** `tests/client/cockpit-history-modal.test.ts`

---

### Task 1: Store 扩展 — 编程模式/终端/历史/筛选/归档

**Files:**
- Modify: `packages/client/src/stores/hermes/cockpit.ts`
- Test: `tests/client/cockpit-store.test.ts`

- [ ] **Step 1: Add failing tests to `tests/client/cockpit-store.test.ts`**

在 describe 块内追加：

```ts
  it('terminalLines starts with seed intro lines', () => {
    const s = useCockpitStore()
    expect(s.terminalLines.length).toBeGreaterThan(0)
    expect(s.terminalMode).toBe(false)
  })

  it('enterTerminal switches workspace mode to term', () => {
    const s = useCockpitStore()
    s.enterTerminal()
    expect(s.terminalMode).toBe(true)
    expect(s.workspaceMode).toBe('term')
  })

  it('exitTerminal switches back to work mode', () => {
    const s = useCockpitStore()
    s.enterTerminal()
    s.exitTerminal()
    expect(s.terminalMode).toBe(false)
    expect(s.workspaceMode).toBe('work')
  })

  it('sendTerminalCommand appends a prompt line and a response line', () => {
    const s = useCockpitStore()
    const before = s.terminalLines.length
    s.sendTerminalCommand('ls')
    expect(s.terminalLines.length).toBe(before + 2)
    expect(s.terminalLines.at(-2)?.kind).toBe('prompt')
    expect(s.terminalLines.at(-2)?.text).toBe('ls')
  })

  it('history filters by action when filter set', () => {
    const s = useCockpitStore()
    s.history = [
      { id: 'h1', when: '今天 14:36', taskId: '1', action: '审批', title: '审批 PR', archived: false },
      { id: 'h2', when: '今天 13:20', taskId: '4', action: '决策', title: '决定延后', archived: false },
    ]
    s.historyFilters = { actions: ['审批'], archived: 'all' }
    expect(s.filteredHistory.map((h) => h.id)).toEqual(['h1'])
  })

  it('history filters archived-only', () => {
    const s = useCockpitStore()
    s.history = [
      { id: 'h1', when: '今天', taskId: '1', action: '审批', title: 'x', archived: false },
      { id: 'h2', when: '昨天', taskId: '2', action: '审批', title: 'y', archived: true },
    ]
    s.historyFilters = { actions: [], archived: 'only' }
    expect(s.filteredHistory.map((h) => h.id)).toEqual(['h2'])
  })

  it('recallHistoryItem sets archived mode when item archived', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.history = [{ id: 'h1', when: '昨天', taskId: 't1', action: '审批', title: 'y', archived: true }]
    s.recallHistoryItem('h1')
    expect(s.archivedMode).toBe(true)
    expect(s.selectedTaskId).toBe('t1')
  })

  it('recallHistoryItem clears archived mode when item not archived', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.history = [{ id: 'h1', when: '今天', taskId: 't1', action: '审批', title: 'x', archived: false }]
    s.recallHistoryItem('h1')
    expect(s.archivedMode).toBe(false)
  })
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the store**

In `packages/client/src/stores/hermes/cockpit.ts`, add types:

```ts
// ── P5: 终端 & 历史 & 归档 ──
export type WorkspaceMode = 'work' | 'chat' | 'term'  // 扩展 P4 的 WorkspaceMode

export type TerminalLineKind = 'prompt' | 'info' | 'ok' | 'warn' | 'dim'
export interface TerminalLine {
  kind: TerminalLineKind
  text: string
}

export interface HistoryItem {
  id: string
  when: string
  taskId: string
  action: string
  title: string
  archived: boolean
}

export interface HistoryFilters {
  actions: string[]
  archived: 'all' | 'only' | 'exclude'
}
```

> ⚠️ P4 已定义 `export type WorkspaceMode = 'work' | 'chat'`。这里要**改为** `'work' | 'chat' | 'term'`（扩展，不新增类型）。找到 P4 的 `WorkspaceMode` 定义行替换。

Inside the `defineStore` setup body (after P4 section, before return):

```ts
  // ── P5 state ──
  const terminalMode = ref(false)
  const terminalLines = ref<TerminalLine[]>([
    { kind: 'dim', text: 'Claude Code · sandbox 模式 · 根目录由当前任务 Workspace 决定' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'info', text: '任务上下文已加载，沙箱就绪，读写限定在根目录内' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'warn', text: '! 输入指令开始编程，如「打开 refresh.ts 看并发问题」' },
  ])
  const history = ref<HistoryItem[]>([])
  const historyOpen = ref(false)
  const historyFilters = ref<HistoryFilters>({ actions: [], archived: 'all' })
  const archivedMode = ref(false)

  // ── P5 getters ──
  const filteredHistory = computed(() =>
    history.value.filter((h) => {
      const f = historyFilters.value
      const actionOk = f.actions.length === 0 || f.actions.includes(h.action)
      const archOk =
        f.archived === 'all' ? true : f.archived === 'only' ? h.archived : !h.archived
      return actionOk && archOk
    }),
  )

  // ── P5 methods ──
  function enterTerminal() {
    terminalMode.value = true
    workspaceMode.value = 'term'
  }
  function exitTerminal() {
    terminalMode.value = false
    workspaceMode.value = 'work'
  }
  function sendTerminalCommand(cmd: string) {
    const c = cmd.trim()
    if (!c) return
    terminalLines.value.push({ kind: 'prompt', text: c })
    terminalLines.value.push({
      kind: 'info',
      text: `ℹ sandbox 内执行：${c}`,
    })
  }
  function openHistory() {
    historyOpen.value = true
  }
  function closeHistory() {
    historyOpen.value = false
  }
  function toggleHistoryAction(action: string) {
    const arr = historyFilters.value.actions
    const i = arr.indexOf(action)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(action)
  }
  function setHistoryArchivedFilter(v: 'all' | 'only' | 'exclude') {
    historyFilters.value.archived = v
  }
  function recallHistoryItem(id: string) {
    const item = history.value.find((h) => h.id === id)
    if (!item) return
    archivedMode.value = item.archived
    selectTask(item.taskId)
    setWorkspaceMode('work')
    historyOpen.value = false
  }
  function clearArchivedMode() {
    archivedMode.value = false
  }
```

Add to the returned object:

```ts
    terminalMode, terminalLines, history, historyOpen, historyFilters, archivedMode,
    filteredHistory,
    enterTerminal, exitTerminal, sendTerminalCommand,
    openHistory, closeHistory, toggleHistoryAction, setHistoryArchivedFilter,
    recallHistoryItem, clearArchivedMode,
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: PASS (36 tests — 28 + 8 new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/hermes/cockpit.ts tests/client/cockpit-store.test.ts
git commit -m "feat(cockpit): extend store with terminal, history, archive mode"
```

---

### Task 2: i18n keys for 编程/历史/归档

**Files:**
- Modify: `packages/client/src/i18n/locales/en.ts`
- Modify: `packages/client/src/i18n/locales/zh.ts`

- [ ] **Step 1: Add keys**

In `en.ts`, inside the `cockpit:` block, append:

```ts
    modeTerm: 'Code',
    history: 'History',
    historyTitle: 'My history',
    historySearch: 'Search events, tasks, agents…',
    historyTime: 'Time',
    historyAction: 'Action',
    historyStatus: 'Status',
    historyAll: 'All',
    historyArchivedOnly: 'Archived only',
    historyActiveOnly: 'Active only',
    historyRecall: 'Recall',
    historyArchived: 'Archived',
    readOnly: 'Read-only',
    archivedHint: 'Archived · read-only · start a new collaboration',
    newCollabFromArchive: 'New collaboration',
    termSandbox: 'sandbox',
    termExit: 'Exit terminal',
    termPlaceholder: 'Type a command… (Enter to run)',
    termRoot: 'Root',
```

In `zh.ts`, inside the `cockpit` block, append:

```ts
    modeTerm: '编程',
    history: '历史',
    historyTitle: '我的历史',
    historySearch: '搜索事件、任务、Agent…',
    historyTime: '时间',
    historyAction: '动作',
    historyStatus: '状态',
    historyAll: '全部',
    historyArchivedOnly: '仅归档',
    historyActiveOnly: '仅进行中',
    historyRecall: '回溯',
    historyArchived: '已归档',
    readOnly: '只读',
    archivedHint: '已归档 · 只读 · 可发起新协作',
    newCollabFromArchive: '发起新协作',
    termSandbox: '沙箱',
    termExit: '退出终端',
    termPlaceholder: '输入指令…（Enter 执行）',
    termRoot: '根目录',
```

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -ci "error TS"`
Expected: 0 (or only the pre-existing LoginView/auth error).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts
git commit -m "feat(cockpit): add i18n keys for terminal, history, archive"
```

---

### Task 3: CockpitTerminalPane Claude Code 终端

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitTerminalPane.vue`
- Test: `tests/client/cockpit-terminal-pane.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-terminal-pane.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitTerminalPane from '@/components/hermes/cockpit/CockpitTerminalPane.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitTerminalPane', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws/auth-svc' }]
    s.selectTask('t1')
    return s
  }

  it('renders terminal header with workspace root path', () => {
    seed()
    const w = mount(CockpitTerminalPane)
    expect(w.text()).toContain('~/ws/auth-svc')
  })

  it('renders seed terminal lines', () => {
    seed()
    const w = mount(CockpitTerminalPane)
    expect(w.findAll('.cockpit-terminal-pane__line').length).toBeGreaterThan(0)
  })

  it('typing and pressing enter runs a command', async () => {
    const s = seed()
    const w = mount(CockpitTerminalPane)
    const before = s.terminalLines.length
    const input = w.find('.cockpit-terminal-pane__input')
    await input.setValue('ls')
    await input.trigger('keydown', { key: 'Enter' })
    expect(s.terminalLines.length).toBe(before + 2)
  })

  it('exit button calls store.exitTerminal', async () => {
    const s = seed()
    s.enterTerminal()
    const w = mount(CockpitTerminalPane)
    await w.find('[data-action="exit"]').trigger('click')
    expect(s.terminalMode).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-terminal-pane.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitTerminalPane.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore, type TerminalLineKind } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const draft = ref('')

const root = computed(() => store.selectedTask?.workspace ?? '~')
const lines = computed(() => store.terminalLines)

const KIND_PREFIX: Record<TerminalLineKind, string> = {
  prompt: '❯',
  info: 'ℹ',
  ok: '✓',
  warn: '!',
  dim: '',
}

function onEnter() {
  if (!draft.value.trim()) return
  store.sendTerminalCommand(draft.value)
  draft.value = ''
}
</script>

<template>
  <div class="cockpit-terminal-pane">
    <div class="cockpit-terminal-pane__head">
      <span class="cockpit-terminal-pane__title">⌘ Claude Code</span>
      <code class="cockpit-terminal-pane__root">{{ root }}</code>
      <span class="cockpit-terminal-pane__sandbox">{{ t('cockpit.termSandbox') }}</span>
      <button type="button" data-action="exit" class="cockpit-terminal-pane__exit" @click="store.exitTerminal()">✕ {{ t('cockpit.termExit') }}</button>
    </div>
    <div class="cockpit-terminal-pane__body">
      <div v-for="(ln, i) in lines" :key="i" class="cockpit-terminal-pane__line" :class="'is-' + ln.kind">
        <span v-if="KIND_PREFIX[ln.kind]" class="cockpit-terminal-pane__prefix">{{ KIND_PREFIX[ln.kind] }}</span>
        <span class="cockpit-terminal-pane__text">{{ ln.text }}</span>
      </div>
    </div>
    <div class="cockpit-terminal-pane__comp">
      <span class="cockpit-terminal-pane__prompt">❯</span>
      <input v-model="draft" class="cockpit-terminal-pane__input" :placeholder="t('cockpit.termPlaceholder')" @keydown.enter="onEnter">
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-terminal-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; background: #1a1a1a; color: #d4d4d4; font-family: ui-monospace, 'SF Mono', monospace; }
.cockpit-terminal-pane__head { flex-shrink: 0; padding: 8px 14px; background: #0d0d0d; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #ccc; }
.cockpit-terminal-pane__title { color: #e0e0e0; font-weight: 600; }
.cockpit-terminal-pane__root { font-size: 10px; color: #888; background: #1a1a1a; padding: 2px 7px; border-radius: 3px; border: 1px solid #333; }
.cockpit-terminal-pane__sandbox { font-size: 9px; color: #999; border: 1px solid #444; border-radius: 3px; padding: 1px 6px; }
.cockpit-terminal-pane__exit { margin-left: auto; cursor: pointer; color: #888; font-size: 11px; border: none; background: transparent; font: inherit;
  &:hover { color: #fff; }
}
.cockpit-terminal-pane__body { flex: 1; overflow-y: auto; padding: 12px 14px; font-size: 12px; line-height: 1.7; }
.cockpit-terminal-pane__line { white-space: pre-wrap; word-break: break-word; display: flex; gap: 6px; }
.cockpit-terminal-pane__prefix { flex-shrink: 0; }
.cockpit-terminal-pane__line.is-prompt .cockpit-terminal-pane__prefix { color: #e8a838; }
.cockpit-terminal-pane__line.is-prompt .cockpit-terminal-pane__text { color: #fff; }
.cockpit-terminal-pane__line.is-info .cockpit-terminal-pane__prefix { color: #6ba3d6; }
.cockpit-terminal-pane__line.is-ok .cockpit-terminal-pane__prefix { color: #66bb6a; }
.cockpit-terminal-pane__line.is-warn .cockpit-terminal-pane__prefix { color: #e8a838; }
.cockpit-terminal-pane__line.is-dim { color: #666; }
.cockpit-terminal-pane__comp { flex-shrink: 0; padding: 8px 14px; border-top: 1px solid #333; background: #0d0d0d; display: flex; align-items: center; gap: 8px; }
.cockpit-terminal-pane__prompt { color: #e8a838; font-size: 12px; }
.cockpit-terminal-pane__input { flex: 1; font-family: inherit; font-size: 12px; border: none; background: transparent; color: #d4d4d4; outline: none; }
</style>
```

> 注：终端区是驾驶舱里唯一允许深色 + 少量 ANSI 风格色的区域（#1a1a1a 背景 + 黄/蓝/绿前缀），这是「编程终端」的语义需要，符合 spec §5.5。其余区域仍 Pure Ink。

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-terminal-pane.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitTerminalPane.vue tests/client/cockpit-terminal-pane.test.ts
git commit -m "feat(cockpit): add Claude Code terminal pane with sandbox styling"
```

---

### Task 4: CockpitHistoryModal 历史回溯弹窗

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitHistoryModal.vue`
- Test: `tests/client/cockpit-history-modal.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-history-modal.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitHistoryModal from '@/components/hermes/cockpit/CockpitHistoryModal.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitHistoryModal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.history = [
      { id: 'h1', when: '今天 14:36', taskId: 't1', action: '审批', title: '审批 PR #142', archived: false },
      { id: 'h2', when: '昨天 18:40', taskId: 't1', action: '审批', title: '审批 v2.2', archived: true },
    ]
    return s
  }

  it('renders filtered history items', () => {
    seed()
    const w = mount(CockpitHistoryModal)
    expect(w.text()).toContain('审批 PR #142')
    expect(w.findAll('[data-history-id]').length).toBe(2)
  })

  it('clicking an active item recalls it (closes modal, selects task, not archived)', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-history-id="h1"]').trigger('click')
    expect(s.historyOpen).toBe(false)
    expect(s.selectedTaskId).toBe('t1')
    expect(s.archivedMode).toBe(false)
  })

  it('clicking an archived item sets archived mode', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-history-id="h2"]').trigger('click')
    expect(s.archivedMode).toBe(true)
  })

  it('action filter chip toggles', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-action-filter="审批"]').trigger('click')
    expect(s.historyFilters.actions).toContain('审批')
  })

  it('close button closes the modal', async () => {
    const s = seed()
    s.openHistory()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-action="close"]').trigger('click')
    expect(s.historyOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-history-modal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitHistoryModal.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const ACTIONS = ['审批', '决策', '补充', '评估', '委派']
const ARCHIVE_OPTS: { key: 'all' | 'only' | 'exclude'; labelKey: string }[] = [
  { key: 'all', labelKey: 'cockpit.historyAll' },
  { key: 'only', labelKey: 'cockpit.historyArchivedOnly' },
  { key: 'exclude', labelKey: 'cockpit.historyActiveOnly' },
]

const items = computed(() => store.filteredHistory)
</script>

<template>
  <div class="cockpit-history-modal">
    <div class="cockpit-history-modal__head">
      <span class="cockpit-history-modal__title">🕘 {{ t('cockpit.historyTitle') }}</span>
      <button type="button" data-action="close" class="cockpit-history-modal__close" @click="store.closeHistory()">✕</button>
    </div>
    <div class="cockpit-history-modal__filters">
      <div class="cockpit-history-modal__frow">
        <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyAction') }}</span>
        <button v-for="a in ACTIONS" :key="a" type="button" :data-action-filter="a"
          class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.actions.includes(a) }"
          @click="store.toggleHistoryAction(a)">{{ a }}</button>
      </div>
      <div class="cockpit-history-modal__frow">
        <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyStatus') }}</span>
        <button v-for="o in ARCHIVE_OPTS" :key="o.key" type="button"
          class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.archived === o.key }"
          @click="store.setHistoryArchivedFilter(o.key)">{{ t(o.labelKey) }}</button>
      </div>
    </div>
    <div class="cockpit-history-modal__list">
      <button v-for="h in items" :key="h.id" type="button" :data-history-id="h.id"
        class="cockpit-history-modal__item" :class="{ 'is-archived': h.archived }"
        @click="store.recallHistoryItem(h.id)">
        <span class="cockpit-history-modal__when">{{ h.when }}</span>
        <span class="cockpit-history-modal__dot" />
        <span class="cockpit-history-modal__text">{{ h.title }}</span>
        <span class="cockpit-history-modal__action">{{ h.action }}</span>
        <span v-if="h.archived" class="cockpit-history-modal__archtag">{{ t('cockpit.historyArchived') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-history-modal { display: flex; flex-direction: column; width: 540px; max-width: 92vw; max-height: 78vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.cockpit-history-modal__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
.cockpit-history-modal__title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cockpit-history-modal__close { cursor: pointer; color: var(--text-muted); font-size: 16px; width: 24px; height: 24px; border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 4px; font: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-history-modal__filters { padding: 12px 18px; border-bottom: 1px solid var(--border-light); display: flex; flex-direction: column; gap: 8px; }
.cockpit-history-modal__frow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cockpit-history-modal__flabel { font-size: 10px; color: var(--text-muted); width: 44px; flex-shrink: 0; font-weight: 600; }
.cockpit-history-modal__chip { font-size: 10px; padding: 2px 9px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-history-modal__list { flex: 1; overflow-y: auto; padding: 4px 0; }
.cockpit-history-modal__item { display: flex; align-items: center; gap: 11px; padding: 10px 18px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font: inherit; border-bottom: 1px solid var(--border-light); color: var(--text-primary);
  &:hover { background: var(--bg-secondary); }
  &.is-archived { opacity: 0.55; }
  &.is-archived .cockpit-history-modal__text { color: var(--text-muted); }
}
.cockpit-history-modal__when { flex-shrink: 0; width: 70px; font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.cockpit-history-modal__dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.is-archived .cockpit-history-modal__dot { background: var(--border-color); }
.cockpit-history-modal__text { flex: 1; font-size: 12px; font-weight: 500; }
.cockpit-history-modal__action { font-size: 9px; padding: 0 5px; border: 1px solid var(--border-light); border-radius: 3px; background: var(--bg-card); color: var(--text-muted); }
.cockpit-history-modal__archtag { font-size: 9px; color: var(--text-muted); background: var(--bg-secondary); border-radius: 3px; padding: 0 5px; border: 1px solid var(--border-light); }
</style>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-history-modal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitHistoryModal.vue tests/client/cockpit-history-modal.test.ts
git commit -m "feat(cockpit): add history modal with filters and archive recall"
```

---

### Task 5: ModeBar 加「⌘ 编程」tab，Attention 加「🕘 历史」按钮

**Files:**
- Modify: `packages/client/src/components/hermes/cockpit/CockpitModeBar.vue`
- Modify: `packages/client/src/components/hermes/cockpit/CockpitAttention.vue`

- [ ] **Step 1: ModeBar — add 编程 tab**

In `CockpitModeBar.vue` template, after the chat button (before `<span class="cockpit-mode-bar__spacer" />`), add:
```vue
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': store.workspaceMode === 'term' }"
      @click="store.enterTerminal()"
    >⌘ {{ t('cockpit.modeTerm') }}</button>
```

- [ ] **Step 2: Attention — add 历史 button + emit**

In `CockpitAttention.vue` `<script setup>`, add emit:
```ts
defineEmits<{ (e: 'history'): void }>()
```

In template, after the `__items` div (before closing the root `.cockpit-attention` div), add:
```vue
    <button type="button" class="cockpit-attention__history" @click="$emit('history')">🕘 {{ t('cockpit.history') }}</button>
```

Add the style in its `<style>` block:
```scss
.cockpit-attention__history { flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 0 14px; border: none; border-left: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 11px; font-weight: 600;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}
```

And add `useI18n` import + `const { t } = useI18n()` if not present (P1's CockpitAttention doesn't use i18n yet — add it).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitModeBar.vue packages/client/src/components/hermes/cockpit/CockpitAttention.vue
git commit -m "feat(cockpit): add code-mode tab and history button"
```

---

### Task 6: CockpitView — 终端模式切换 + 历史弹窗 + 归档态 + 种子

**Files:**
- Modify: `packages/client/src/views/hermes/CockpitView.vue`

- [ ] **Step 1: Imports + overlay + modal + terminal pane + archive badge**

In `<script setup>`, add imports:
```ts
import CockpitTerminalPane from '@/components/hermes/cockpit/CockpitTerminalPane.vue'
import CockpitHistoryModal from '@/components/hermes/cockpit/CockpitHistoryModal.vue'
```

In `onMounted`, after P4 seed, append P5 seed:
```ts
  // P5 种子：历史事件（后续接入 Kanban event API）
  store.history = [
    { id: 'h1', when: '今天 14:36', taskId: '1', action: '审批', title: '审批 PR #142（有条件通过）', archived: false },
    { id: 'h2', when: '今天 13:20', taskId: '4', action: '决策', title: '决定延后发版', archived: false },
    { id: 'h3', when: '今天 11:05', taskId: '6', action: '补充', title: '确认迁移脚本参数', archived: false },
    { id: 'h4', when: '昨天 18:40', taskId: '1', action: '审批', title: '审批 v2.2 发版', archived: true },
    { id: 'h5', when: '3 天前', taskId: '1', action: '评估', title: '评估旧版 auth 重构', archived: true },
  ]
```

In template, update the right `<section>` inner to switch among all 3 modes:
```vue
        <div class="cockpit-col__inner">
          <CockpitModeBar v-if="store.workspaceMode !== 'term'" />
          <CockpitCollabBar v-if="store.workspaceMode !== 'term'" />
          <span v-if="store.archivedMode" class="cockpit-readonly-badge">{{ t('cockpit.readOnly') }}</span>
          <CockpitWorkspace v-if="store.workspaceMode === 'work'" :class="{ 'is-readonly': store.archivedMode }" @submit="() => {}" @later="() => {}" />
          <CockpitChatPane v-else-if="store.workspaceMode === 'chat'" />
          <CockpitTerminalPane v-else />
        </div>
```

> Note: when in term mode, hide ModeBar+CollabBar (terminal has its own exit button). When archived, show a readonly badge.

Also need `useI18n` in CockpitView for the badge text. Add:
```ts
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
```

Add the readonly badge style + archived style in `<style>`:
```scss
.cockpit-readonly-badge { position: absolute; top: 8px; right: 14px; font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 9px; z-index: 5; }
```

Also wire the attention history emit: update `<CockpitAttention />` to `<CockpitAttention @history="store.openHistory()" />`.

- [ ] **Step 2: Add overlay + modal at end of template (inside root `.cockpit` div, after `.cockpit__body`)**

```vue
    <div v-if="store.historyOpen" class="cockpit-overlay" @click="store.closeHistory()" />
    <CockpitHistoryModal v-if="store.historyOpen" class="cockpit-modal-anchor" />
```

Add overlay style to the global `cockpit.scss` (or scoped in CockpitView):
```scss
.cockpit-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 40; }
.cockpit-modal-anchor { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 41; }
```

> Put these in `cockpit.scss` (global), not scoped — so they apply regardless of component boundary.

- [ ] **Step 3: Run all cockpit tests**

Run: `npx vitest run tests/client/cockpit- tests/client/sidebar-search.test.ts`
Expected: all PASS.

- [ ] **Step 4: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -iE "cockpit" | head`
Expected: no cockpit errors (the pre-existing LoginView/auth error is unrelated).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/views/hermes/CockpitView.vue packages/client/src/styles/cockpit.scss
git commit -m "feat(cockpit): wire terminal mode, history modal, archive read-only"
```

---

### Task 7: 全量回归

- [ ] **Step 1: Run all cockpit + sidebar tests**

Run: `npx vitest run tests/client/cockpit- tests/client/sidebar-search.test.ts`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: only the pre-existing LoginView/auth error (if any), no cockpit errors.

- [ ] **Step 3: Manual smoke** (optional)

Run: `npm run dev:client`, open `/#/hermes/cockpit`. Verify:
- ModeBar now has 3 tabs: ⚡工作项 / 💬协作 [2] / ⌘编程. Click ⌘编程 → terminal pane (dark, root path from task workspace, type `ls` + Enter → echo lines). Click ✕退出终端 → back to work.
- Attention bar right: 🕘 历史 button → modal opens with 5 seeded items (3 active, 2 archived greyed). Filter by 审批 + 仅归档 → shows archived 审批 items. Click an active item → modal closes, task selected, normal editable. Click an archived item → modal closes, archived mode (readonly badge, form dimmed).

---

## Self-Review 记录

**Spec 覆盖（P5 范围）**：
- ✅ §5.5 编程（Claude Code）模式 → Tasks 1+3+5+6
- ✅ §5.8 历史回溯弹窗（筛选 + 点击筛选三栏）→ Tasks 1+4+6
- ✅ 归档只读态（灰色调 + 不可改 + 可发起新协作）→ Tasks 1+6（badge + is-readonly；"发起新协作"按钮在归档态显示留 P6 polish，P5 先做只读标记）
- ⏭ 真实终端进程接入（sandbox 进程隔离）→ 后续
- ⏭ 真实历史接入 Kanban event API → 后续

**占位符扫描**：Task 1 需要把 P4 的 `WorkspaceMode` 改成 3 值（扩展非新增）。Task 6 归档态的"发起新协作"按钮 P5 只显示只读 badge，完整按钮留 P6。
**类型一致性**：`TerminalLine`/`TerminalLineKind`/`HistoryItem`/`HistoryFilters` 在 store 定义，组件测试一致；`enterTerminal`/`exitTerminal`/`sendTerminalCommand`/`openHistory`/`closeHistory`/`toggleHistoryAction`/`setHistoryArchivedFilter`/`recallHistoryItem`/`clearArchivedMode` 签名一致。
