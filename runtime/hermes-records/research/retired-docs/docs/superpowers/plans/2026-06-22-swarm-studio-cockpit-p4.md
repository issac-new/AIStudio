# AI协作中心 驾驶舱 P4 实施计划（协作入口 + 嵌入式聊天 + 模式切换）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在右栏顶部加一个**模式切换器**（⚡工作项 / 💬协作）和一个**协作入口条**（当前事项已关联的频道 chip + 新增协作弹窗）。切到「协作」模式后右栏显示嵌入式聊天视图，支持 Matrix 聊天室 / Agent 单聊 / 群聊三类频道，可输入消息（P4 先用本地 mock 消息流，真实 socket 接入留后续）。

**Architecture:** 在 `useCockpitStore` 增加：协作频道列表、当前模式、当前频道、聊天消息的 state。新增三个组件：`CockpitModeBar`（模式 tab + 最大化按钮）、`CockpitCollabBar`（协作入口条 + 新增协作弹窗）、`CockpitChatPane`（嵌入式聊天视图）。`CockpitView` 右栏从「直接放 Workspace」改为「按模式切换 Workspace / ChatPane」。`CockpitWorkspace` 顶部加 `CockpitModeBar` + `CockpitCollabBar`。所有样式继续 Pure Ink。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · vitest + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.5 模式切换器 + 协作入口条 + 嵌入式聊天）
**前置：** P1+P2+P3 已合并到 `feat/cockpit-p1` 分支。

---

## 文件结构

- **Modify** `packages/client/src/stores/hermes/cockpit.ts` — 协作频道/模式/聊天消息 state
- **Create** `packages/client/src/components/hermes/cockpit/CockpitModeBar.vue` — 模式 tab + 最大化
- **Create** `packages/client/src/components/hermes/cockpit/CockpitCollabBar.vue` — 协作入口条 + 新增协作弹窗
- **Create** `packages/client/src/components/hermes/cockpit/CockpitChatPane.vue` — 嵌入式聊天视图
- **Modify** `packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue` — 顶部加 ModeBar + CollabBar
- **Modify** `packages/client/src/views/hermes/CockpitView.vue` — 右栏按模式切换 Workspace / ChatPane + 种子数据
- **Modify** `packages/client/src/i18n/locales/en.ts` + `zh.ts` — 协作/模式 i18n 键
- **Test** `tests/client/cockpit-store.test.ts` — 补协作/模式 store 测试
- **Test** `tests/client/cockpit-chat-pane.test.ts`
- **Test** `tests/client/cockpit-collab-bar.test.ts`

---

### Task 1: Store 扩展 — 协作频道 + 模式 + 聊天消息

**Files:**
- Modify: `packages/client/src/stores/hermes/cockpit.ts`
- Test: `tests/client/cockpit-store.test.ts`

- [ ] **Step 1: Add failing tests to `tests/client/cockpit-store.test.ts`**

在 describe 块内追加：

```ts
  it('switches workspace mode between work and chat', () => {
    const s = useCockpitStore()
    expect(s.workspaceMode).toBe('work')
    s.setWorkspaceMode('chat')
    expect(s.workspaceMode).toBe('chat')
  })

  it('channelsForSelectedTask returns channels bound to the task', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.channels = [
      { id: 'c1', taskId: 't1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '李四', '你'] },
      { id: 'c2', taskId: 't2', kind: 'group', label: '其它', members: [] },
    ]
    expect(s.channelsForSelectedTask.map((c) => c.id)).toEqual(['c1'])
  })

  it('selectChannel sets active channel id and switches mode to chat', () => {
    const s = useCockpitStore()
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'x', members: [] }]
    s.selectChannel('c1')
    expect(s.activeChannelId).toBe('c1')
    expect(s.workspaceMode).toBe('chat')
  })

  it('messagesForActiveChannel returns messages for the active channel', () => {
    const s = useCockpitStore()
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'x', members: [] }]
    s.selectChannel('c1')
    s.messages = {
      c1: [
        { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'hello', ts: 1 },
        { id: 'm2', channelId: 'c1', author: '你', isMe: true, text: 'hi', ts: 2 },
      ],
    }
    expect(s.messagesForActiveChannel.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('sendMessage appends a message to the active channel', () => {
    const s = useCockpitStore()
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'x', members: [] }]
    s.selectChannel('c1')
    s.sendMessage('ping')
    expect(s.messagesForActiveChannel.at(-1)?.text).toBe('ping')
    expect(s.messagesForActiveChannel.at(-1)?.isMe).toBe(true)
  })

  it('toggleMaximized toggles the right column maximized state', () => {
    const s = useCockpitStore()
    expect(s.maximized).toBe(false)
    s.toggleMaximized()
    expect(s.maximized).toBe(true)
  })
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the store**

In `packages/client/src/stores/hermes/cockpit.ts`, add types:

```ts
// ── P4: 协作频道 & 聊天 ──
export type ChannelKind = 'matrix' | 'chat' | 'group'
export type WorkspaceMode = 'work' | 'chat'

export interface CollabChannel {
  id: string
  taskId: string
  kind: ChannelKind
  label: string
  members: string[]
}

export interface ChatMessage {
  id: string
  channelId: string
  author: string
  isMe: boolean
  text: string
  ts: number
}
```

Inside the `defineStore` setup body (after P3 section, before return):

```ts
  // ── P4 state ──
  const workspaceMode = ref<WorkspaceMode>('work')
  const channels = ref<CollabChannel[]>([])
  const activeChannelId = ref<string | null>(null)
  const messages = ref<Record<string, ChatMessage[]>>({})
  const maximized = ref(false)

  // ── P4 getters ──
  const channelsForSelectedTask = computed(() =>
    selectedTaskId.value ? channels.value.filter((c) => c.taskId === selectedTaskId.value) : [],
  )
  const activeChannel = computed(
    () => channels.value.find((c) => c.id === activeChannelId.value) ?? null,
  )
  const messagesForActiveChannel = computed(() =>
    activeChannelId.value ? (messages.value[activeChannelId.value] ?? []) : [],
  )

  // ── P4 methods ──
  function setWorkspaceMode(mode: WorkspaceMode) {
    workspaceMode.value = mode
  }
  function selectChannel(id: string | null) {
    activeChannelId.value = id
    if (id) workspaceMode.value = 'chat'
  }
  function sendMessage(text: string) {
    const cid = activeChannelId.value
    if (!cid || !text.trim()) return
    const list = messages.value[cid] ?? []
    list.push({
      id: 'm' + Date.now(),
      channelId: cid,
      author: '你',
      isMe: true,
      text: text.trim(),
      ts: Date.now(),
    })
    messages.value = { ...messages.value, [cid]: list }
  }
  function toggleMaximized() {
    maximized.value = !maximized.value
  }
```

Add to the returned object:

```ts
    workspaceMode, channels, activeChannelId, messages, maximized,
    channelsForSelectedTask, activeChannel, messagesForActiveChannel,
    setWorkspaceMode, selectChannel, sendMessage, toggleMaximized,
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: PASS (28 tests — 22 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/hermes/cockpit.ts tests/client/cockpit-store.test.ts
git commit -m "feat(cockpit): extend store with channels, workspace mode, chat messages"
```

---

### Task 2: i18n keys for 协作/模式

**Files:**
- Modify: `packages/client/src/i18n/locales/en.ts`
- Modify: `packages/client/src/i18n/locales/zh.ts`

- [ ] **Step 1: Add keys to the `cockpit` namespace**

In `en.ts`, inside the `cockpit: { ... }` block, append:

```ts
    modeWork: 'Work',
    modeChat: 'Chat',
    maximize: 'Maximize',
    restore: 'Restore',
    collabWith: 'Collaborating on:',
    addCollab: 'Add collaboration',
    newMatrix: 'Matrix room',
    newMatrixDesc: 'Invite human collaborators',
    newChat: 'Agent 1:1',
    newChatDesc: 'Human-agent 1:1',
    newGroup: 'Group chat',
    newGroupDesc: 'Agent cluster group',
    addCollabTitle: 'Add collaboration · for current task',
    saySomething: 'Message… @ to mention',
    send: 'Send',
    openFull: 'Open full',
    backToWork: 'Back to work',
    members: 'members',
```

In `zh.ts`, inside the `cockpit` block, append:

```ts
    modeWork: '工作项',
    modeChat: '协作',
    maximize: '最大化',
    restore: '还原',
    collabWith: '协作中：',
    addCollab: '新增协作',
    newMatrix: 'Matrix 聊天室',
    newMatrixDesc: '邀请人类协作伙伴',
    newChat: 'Agent 单聊',
    newChatDesc: '人机 1:1 协作',
    newGroup: '群聊',
    newGroupDesc: 'Agent 集群群聊',
    addCollabTitle: '新增协作 · 为当前事项',
    saySomething: '@提及人或 Agent…',
    send: '发送',
    openFull: '打开完整',
    backToWork: '返回工作项',
    members: '人',
```

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -ci "error TS"`
Expected: 0.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts
git commit -m "feat(cockpit): add i18n keys for collaboration and modes"
```

---

### Task 3: CockpitModeBar 模式切换器

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitModeBar.vue`

- [ ] **Step 1: Create the component**

`packages/client/src/components/hermes/cockpit/CockpitModeBar.vue`:

```vue
<script setup lang="ts">
import { useCockpitStore } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n'
</script>

<template>
  <div class="cockpit-mode-bar">
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': store.workspaceMode === 'work' }"
      @click="store.setWorkspaceMode('work')"
    >⚡ {{ t('cockpit.modeWork') }}</button>
    <button
      type="button"
      class="cockpit-mode-bar__mode"
      :class="{ 'is-on': store.workspaceMode === 'chat' }"
      @click="store.setWorkspaceMode('chat')"
    >💬 {{ t('cockpit.modeChat') }} <span v-if="store.channelsForSelectedTask.length" class="cockpit-mode-bar__count">{{ store.channelsForSelectedTask.length }}</span></button>
    <span class="cockpit-mode-bar__spacer" />
    <button
      type="button"
      class="cockpit-mode-bar__max"
      :title="store.maximized ? t('cockpit.restore') : t('cockpit.maximize')"
      @click="store.toggleMaximized()"
    >{{ store.maximized ? '🗗' : '⛶' }}</button>
  </div>
</template>

<style scoped lang="scss">
.cockpit-mode-bar { display: flex; align-items: center; gap: 0; padding: 0 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); }
.cockpit-mode-bar__mode {
  padding: 9px 12px; font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; border: none; border-bottom: 2px solid transparent; background: transparent;
  font-family: inherit; margin-bottom: -1px; display: flex; align-items: center; gap: 6px;
  &:hover { color: var(--text-primary); }
  &.is-on { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
}
.cockpit-mode-bar__count { font-size: 9px; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px; padding: 0 5px; }
.is-on .cockpit-mode-bar__count { background: var(--accent-primary); color: var(--text-on-accent); }
.cockpit-mode-bar__spacer { flex: 1; }
.cockpit-mode-bar__max {
  width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; font-size: 14px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
</style>
```

> ⚠️ Typo on line 6: `useI18n'` — should be `useI18n()`. Fix when implementing: `const { t } = useI18n()`.

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitModeBar.vue
git commit -m "feat(cockpit): add workspace mode bar (work/chat + maximize)"
```

---

### Task 4: CockpitCollabBar 协作入口条 + 新增协作弹窗

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitCollabBar.vue`
- Test: `tests/client/cockpit-collab-bar.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-collab-bar.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitCollabBar from '@/components/hermes/cockpit/CockpitCollabBar.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitCollabBar', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.channels = [
      { id: 'c1', taskId: 't1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '你'] },
      { id: 'c2', taskId: 't1', kind: 'chat', label: 'review-agent', members: ['review-agent'] },
    ]
    return s
  }

  it('renders channel chips for the selected task', () => {
    seed()
    const w = mount(CockpitCollabBar)
    expect(w.text()).toContain('auth-svc 联调')
    expect(w.text()).toContain('review-agent')
  })

  it('clicking a channel selects it in store', async () => {
    const s = seed()
    const w = mount(CockpitCollabBar)
    await w.find('[data-channel-id="c2"]').trigger('click')
    expect(s.activeChannelId).toBe('c2')
  })

  it('clicking add button opens the new-collab menu', async () => {
    seed()
    const w = mount(CockpitCollabBar)
    expect(w.find('.cockpit-collab-bar__menu').exists()).toBe(false)
    await w.find('[data-action="add"]').trigger('click')
    expect(w.find('.cockpit-collab-bar__menu').exists()).toBe(true)
  })

  it('menu has three new-collab options', async () => {
    seed()
    const w = mount(CockpitCollabBar)
    await w.find('[data-action="add"]').trigger('click')
    expect(w.findAll('[data-new-kind]').length).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-collab-bar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitCollabBar.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useCockpitStore, type ChannelKind } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const menuOpen = ref(false)

const KIND_ICON: Record<ChannelKind, string> = { matrix: '👥', chat: '💬', group: '🗣' }

const newOptions: { kind: ChannelKind; labelKey: string; descKey: string }[] = [
  { kind: 'matrix', labelKey: 'cockpit.newMatrix', descKey: 'cockpit.newMatrixDesc' },
  { kind: 'chat', labelKey: 'cockpit.newChat', descKey: 'cockpit.newChatDesc' },
  { kind: 'group', labelKey: 'cockpit.newGroup', descKey: 'cockpit.newGroupDesc' },
]

function pickNew(kind: ChannelKind) {
  menuOpen.value = false
  // P4 占位：创建频道；真实接入需后端。这里只关闭菜单。
  console.log('new collab', kind)
}
</script>

<template>
  <div class="cockpit-collab-bar">
    <span class="cockpit-collab-bar__label">{{ t('cockpit.collabWith') }}</span>
    <button
      v-for="c in store.channelsForSelectedTask"
      :key="c.id"
      type="button"
      :data-channel-id="c.id"
      class="cockpit-collab-bar__chip"
      @click="store.selectChannel(c.id)"
    >
      <span class="cockpit-collab-bar__chip-icon">{{ KIND_ICON[c.kind] }}</span>
      <span class="cockpit-collab-bar__chip-label">{{ c.label }}</span>
      <span v-if="c.members.length" class="cockpit-collab-bar__chip-count">{{ c.members.length }}{{ t('cockpit.members') }}</span>
    </button>
    <button type="button" data-action="add" class="cockpit-collab-bar__add" @click="menuOpen = !menuOpen">+ {{ t('cockpit.addCollab') }}</button>

    <div v-if="menuOpen" class="cockpit-collab-bar__menu">
      <div class="cockpit-collab-bar__menu-head">{{ t('cockpit.addCollabTitle') }}</div>
      <button
        v-for="opt in newOptions"
        :key="opt.kind"
        type="button"
        :data-new-kind="opt.kind"
        class="cockpit-collab-bar__menu-opt"
        @click="pickNew(opt.kind)"
      >
        <span class="cockpit-collab-bar__menu-icon">{{ KIND_ICON[opt.kind] }}</span>
        <span>
          <div class="cockpit-collab-bar__menu-name">{{ t(opt.labelKey) }}</div>
          <div class="cockpit-collab-bar__menu-desc">{{ t(opt.descKey) }}</div>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-collab-bar { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-bottom: 1px solid var(--border-light); background: var(--bg-card); position: relative; flex-wrap: wrap; }
.cockpit-collab-bar__label { font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.cockpit-collab-bar__chip { display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 3px 10px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); color: var(--text-primary); }
}
.cockpit-collab-bar__chip-icon { font-size: 11px; }
.cockpit-collab-bar__chip-count { font-size: 9px; color: var(--text-muted); }
.cockpit-collab-bar__add { margin-left: auto; display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 10px; border: 1px solid var(--accent-primary); border-radius: 6px; background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-weight: 600; font: inherit;
  &:hover { background: var(--accent-hover); }
}
.cockpit-collab-bar__menu { position: absolute; top: 36px; right: 12px; width: 230px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.12); z-index: 30; overflow: hidden; }
.cockpit-collab-bar__menu-head { padding: 9px 12px; border-bottom: 1px solid var(--border-light); font-size: 11px; font-weight: 700; color: var(--text-primary); }
.cockpit-collab-bar__menu-opt { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font: inherit; border-bottom: 1px solid var(--border-light);
  &:last-child { border-bottom: none; }
  &:hover { background: var(--bg-secondary); }
}
.cockpit-collab-bar__menu-icon { font-size: 14px; margin-top: 1px; color: var(--text-secondary); }
.cockpit-collab-bar__menu-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-collab-bar__menu-desc { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
</style>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-collab-bar.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitCollabBar.vue tests/client/cockpit-collab-bar.test.ts
git commit -m "feat(cockpit): add collaboration bar with channel chips and add-collab menu"
```

---

### Task 5: CockpitChatPane 嵌入式聊天视图

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitChatPane.vue`
- Test: `tests/client/cockpit-chat-pane.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-chat-pane.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitChatPane from '@/components/hermes/cockpit/CockpitChatPane.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitChatPane', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '你'] }]
    s.messages = {
      c1: [
        { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'hello', ts: 1 },
        { id: 'm2', channelId: 'c1', author: '你', isMe: true, text: 'hi', ts: 2 },
      ],
    }
    s.selectChannel('c1')
    return s
  }

  it('renders channel header with label and members', () => {
    seed()
    const w = mount(CockpitChatPane)
    expect(w.text()).toContain('auth-svc 联调')
    expect(w.text()).toContain('张三')
  })

  it('renders messages with author names', () => {
    seed()
    const w = mount(CockpitChatPane)
    expect(w.text()).toContain('hello')
    expect(w.text()).toContain('hi')
  })

  it('my message has is-me class', () => {
    seed()
    const w = mount(CockpitChatPane)
    expect(w.find('[data-message-id="m2"]').classes()).toContain('is-me')
  })

  it('typing and sending appends a message', async () => {
    const s = seed()
    const w = mount(CockpitChatPane)
    const input = w.find('.cockpit-chat-pane__input')
    await input.setValue('new message')
    await w.find('[data-action="send"]').trigger('click')
    expect(s.messagesForActiveChannel.at(-1)?.text).toBe('new message')
  })

  it('shows empty state when no active channel', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitChatPane)
    expect(w.find('.cockpit-chat-pane__empty').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-chat-pane.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitChatPane.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const draft = ref('')

const channel = computed(() => store.activeChannel)
const messages = computed(() => store.messagesForActiveChannel)

function onSend() {
  if (!draft.value.trim()) return
  store.sendMessage(draft.value)
  draft.value = ''
}
</script>

<template>
  <div class="cockpit-chat-pane">
    <template v-if="channel">
      <div class="cockpit-chat-pane__head">
        <div>
          <div class="cockpit-chat-pane__title">{{ channel.label }}</div>
          <div class="cockpit-chat-pane__sub">{{ channel.members.join(' · ') }}</div>
        </div>
        <button type="button" class="cockpit-chat-pane__back" @click="store.setWorkspaceMode('work')">{{ t('cockpit.backToWork') }}</button>
      </div>
      <div class="cockpit-chat-pane__msgs">
        <div
          v-for="m in messages"
          :key="m.id"
          :data-message-id="m.id"
          class="cockpit-chat-pane__msg"
          :class="{ 'is-me': m.isMe }"
        >
          <div class="cockpit-chat-pane__msg-author">{{ m.author }}</div>
          <div class="cockpit-chat-pane__msg-text">{{ m.text }}</div>
        </div>
      </div>
      <div class="cockpit-chat-pane__comp">
        <input v-model="draft" class="cockpit-chat-pane__input" :placeholder="t('cockpit.saySomething')" @keydown.enter="onSend">
        <button type="button" data-action="send" class="cockpit-chat-pane__send" @click="onSend">{{ t('cockpit.send') }}</button>
      </div>
    </template>
    <div v-else class="cockpit-chat-pane__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-chat-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--bg-card); }
.cockpit-chat-pane__head { flex-shrink: 0; padding: 10px 16px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 8px; }
.cockpit-chat-pane__title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.cockpit-chat-pane__sub { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.cockpit-chat-pane__back { margin-left: auto; font-size: 10px; color: var(--accent-primary); cursor: pointer; border: none; background: transparent; font: inherit;
  &:hover { text-decoration: underline; }
}
.cockpit-chat-pane__msgs { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.cockpit-chat-pane__msg { display: flex; flex-direction: column; gap: 2px; max-width: 80%;
  &.is-me { align-self: flex-end; align-items: flex-end; }
}
.cockpit-chat-pane__msg-author { font-size: 10px; color: var(--text-muted); }
.cockpit-chat-pane__msg-text { font-size: 12px; color: var(--text-primary); background: var(--bg-secondary); border-radius: 0 6px 6px 6px; padding: 8px 12px; line-height: 1.6; }
.is-me .cockpit-chat-pane__msg-text { background: var(--accent-primary); color: var(--text-on-accent); border-radius: 6px 0 6px 6px; }
.cockpit-chat-pane__comp { flex-shrink: 0; padding: 10px 16px; border-top: 1px solid var(--border-color); display: flex; gap: 8px; align-items: center; }
.cockpit-chat-pane__input { flex: 1; font: inherit; font-size: 12px; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 11px; color: var(--text-primary); }
.cockpit-chat-pane__send { font: inherit; font-size: 12px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--accent-primary); background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-weight: 600; }
.cockpit-chat-pane__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
</style>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-chat-pane.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitChatPane.vue tests/client/cockpit-chat-pane.test.ts
git commit -m "feat(cockpit): add embedded chat pane with message list and composer"
```

---

### Task 6: 装配 — Workspace 顶部加 ModeBar+CollabBar，CockpitView 按模式切换

**Files:**
- Modify: `packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue`
- Modify: `packages/client/src/views/hermes/CockpitView.vue`

- [ ] **Step 1: Add ModeBar + CollabBar at top of CockpitWorkspace**

In `CockpitWorkspace.vue` `<script setup>`, add imports:
```ts
import CockpitModeBar from './CockpitModeBar.vue'
import CockpitCollabBar from './CockpitCollabBar.vue'
```

In the template, wrap the existing `.cockpit-workspace__form` and `<CockpitFileTree>` so the ModeBar + CollabBar appear at the very top of the workspace (above the form). Change the root template from:
```vue
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__form">
```
to:
```vue
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__chrome">
      <CockpitModeBar />
      <CockpitCollabBar />
    </div>
    <div class="cockpit-workspace__form">
```

Add the chrome style in the `<style>` block:
```scss
.cockpit-workspace__chrome { flex-shrink: 0; }
```

And change `.cockpit-workspace` to be `flex-direction: column` (so chrome stacks above form/tree row):
```scss
.cockpit-workspace { display: flex; flex-direction: column; flex: 1; min-height: 0; }
```
Then wrap the form + file tree row in a `<div class="cockpit-workspace__row">` with style `display: flex; flex: 1; min-height: 0;`. Final template structure:
```vue
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__chrome">
      <CockpitModeBar />
      <CockpitCollabBar />
    </div>
    <div class="cockpit-workspace__row">
      <div class="cockpit-workspace__form">
        <!-- existing body + foot -->
      </div>
      <CockpitFileTree />
    </div>
  </div>
```
Styles:
```scss
.cockpit-workspace { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cockpit-workspace__chrome { flex-shrink: 0; }
.cockpit-workspace__row { display: flex; flex: 1; min-height: 0; }
.cockpit-workspace__form { flex: 1; min-width: 0; display: flex; flex-direction: column; }
```
(remove the old `.cockpit-workspace { display: flex; flex: 1; min-height: 0; }` to avoid conflict.)

- [ ] **Step 2: CockpitView right pane switches by mode**

In `CockpitView.vue` `<script setup>`, add import:
```ts
import CockpitChatPane from '@/components/hermes/cockpit/CockpitChatPane.vue'
```

Replace the right `<section>` inner from:
```vue
        <div class="cockpit-col__inner">
          <CockpitWorkspace @submit="() => {}" @later="() => {}" />
        </div>
```
to:
```vue
        <div class="cockpit-col__inner">
          <CockpitWorkspace v-if="store.workspaceMode === 'work'" @submit="() => {}" @later="() => {}" />
          <CockpitChatPane v-else />
        </div>
```

Wait — the ModeBar lives *inside* Workspace, so in chat mode the user can't switch back from within the pane (the ChatPane has a "back to work" button that calls setWorkspaceMode('work'), which is fine). But the ModeBar (work/chat tabs) won't show in chat mode because Workspace is unmounted. **Better: lift ModeBar + CollabBar OUT of Workspace into CockpitView's right pane**, so they're always visible regardless of mode. Revise:

In `CockpitView.vue` right `<section>` inner:
```vue
        <div class="cockpit-col__inner">
          <CockpitModeBar />
          <CockpitCollabBar />
          <CockpitWorkspace v-if="store.workspaceMode === 'work'" @submit="() => {}" @later="() => {}" />
          <CockpitChatPane v-else />
        </div>
```
And add imports for `CockpitModeBar` and `CockpitCollabBar` to CockpitView. **Do NOT add them to Workspace** (revert Step 1's Workspace changes — keep Workspace as it was in P3).

- [ ] **Step 3: Add P4 seed data to CockpitView onMounted**

After P3 seed, append:
```ts
  // P4 种子：协作频道 + 消息（后续接入 socket）
  store.channels = [
    { id: 'c1', taskId: '1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '李四', '你'] },
    { id: 'c2', taskId: '1', kind: 'chat', label: 'review-agent', members: ['review-agent'] },
  ]
  store.messages = {
    c1: [
      { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'PR #142 我提交了，看看并发刷新。', ts: 1 },
      { id: 'm2', channelId: 'c1', author: 'review-agent', isMe: false, text: '结构 OK，但并发刷新 2 处边界没覆盖，已委派 qa。', ts: 2 },
      { id: 'm3', channelId: 'c1', author: '你', isMe: true, text: '收到，先别合并。李四后端能配合吗？', ts: 3 },
      { id: 'm4', channelId: 'c1', author: '李四', isMe: false, text: '可以，我加个幂等锁。', ts: 4 },
    ],
    c2: [
      { id: 'm5', channelId: 'c2', author: 'review-agent', isMe: false, text: '已委派 qa 补用例，需要你决策是否阻塞。', ts: 5 },
    ],
  }
```

- [ ] **Step 4: Run all cockpit tests**

Run: `npx vitest run tests/client/cockpit-`
Expected: all PASS.

- [ ] **Step 5: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -ci "error TS"`
Expected: 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/views/hermes/CockpitView.vue packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue
git commit -m "feat(cockpit): lift mode bar + collab bar into right pane, switch by mode"
```

---

### Task 7: 全量回归

- [ ] **Step 1: Run all cockpit + sidebar tests**

Run: `npx vitest run tests/client/cockpit- tests/client/sidebar-search.test.ts`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: exit 0.

- [ ] **Step 3: Manual smoke** (optional)

Run: `npm run dev:client`, open `/#/hermes/cockpit`. Verify:
- Right pane top: ModeBar (⚡工作项 active, 💬协作 [2]) + CollabBar (协作中: auth-svc联调·review-agent + 新增协作)
- Click 💬协作 tab → ChatPane shows (but no active channel → empty state). Click a channel chip → ChatPane loads that channel's messages. Click 返回工作项 → back to work mode.
- 新增协作 button opens menu with 3 options.
- ⛶ maximize button toggles (visual only in P4; full mid-column collapse wiring is a CSS detail).

---

## Self-Review 记录

**Spec 覆盖（P4 范围）**：
- ✅ §5.5 模式切换器（⚡工作项 / 💬协作 + 最大化按钮）→ Task 3 + Task 6
- ✅ §5.5 协作入口条（已关联频道 chip + 新增协作弹窗三种类型）→ Task 4
- ✅ §5.5 嵌入式聊天视图（头部+消息流+输入框，区分自己/他人）→ Task 5
- ✅ §6 交互动线（选频道 → 切 chat 模式 → 显示消息）→ store.selectChannel
- ⏭ §5.5 编程（Claude Code）模式 → P5
- ⏭ 真实 socket/API 接入（matrix/group-chat/chat session）→ 后续

**占位符扫描**：Task 3 有 `useI18n'` 笔误，Task 6 有「先加到 Workspace 再改 lift 到 View」的反复 —— 执行者直接采用最终方案（lift 到 CockpitView），不要改 Workspace。Task 4 `pickNew` 只 console.log，符合 P4 占位（真实创建留后续）。
**类型一致性**：`ChannelKind`/`WorkspaceMode`/`CollabChannel`/`ChatMessage` 在 store 定义，组件测试一致；`setWorkspaceMode`/`selectChannel`/`sendMessage`/`toggleMaximized` 签名一致。
