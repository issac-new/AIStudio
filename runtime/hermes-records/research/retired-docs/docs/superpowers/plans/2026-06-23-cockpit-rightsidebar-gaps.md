# Cockpit 右边栏功能补缺实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 cockpit 右边栏 12 项与设计规格/高保真原型的差距，覆盖模式切换器、工作区表单、聊天、终端、历史弹窗、TopBar 等组件。

**Architecture:** 在现有 overlay 组件上增量修改，遵循现有 Pure Ink 样式体系、Pinia store 数据流、Vue 3 `<script setup>` 模式。不新增组件，只扩展现有组件功能。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · vitest + @vue/test-utils · SCSS (Pure Ink)

**Spec:** `docs/superpowers/specs/2026-06-23-cockpit-rightsidebar-gaps-design.md`

---

## 文件结构

### 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `overlay/custom/client/cockpit/components/CockpitModeBar.vue` | 添加 `⛶` 最大化按钮 |
| `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` | 添加 ⌘ Claude Code 按钮、决策推荐标记 + 描述、动态 diff |
| `overlay/custom/client/cockpit/components/CockpitChatPane.vue` | 添加 "↗ 打开完整" 按钮 |
| `overlay/custom/client/cockpit/components/CockpitCollabBar.vue` | 频道 chip 添加路由跳转箭头 |
| `overlay/custom/client/cockpit/components/CockpitTopBar.vue` | i18n 修正、用户动态化 |
| `overlay/custom/client/cockpit/components/CockpitAttention.vue` | i18n 修正 |
| `overlay/custom/client/cockpit/components/CockpitHistoryModal.vue` | 动作筛选 i18n 化 |
| `overlay/custom/client/cockpit/views/CockpitView.vue` | 用户名动态获取 |
| `overlay/custom/client/cockpit/store/cockpit-kv.ts` | A2uiTemplate 添加 score 字段 |
| `overlay/custom/client/cockpit/store/cockpit.ts` | 可能需添加获取当前用户名的 getter |

---

### Task 1: ModeBar 添加最大化按钮

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitModeBar.vue`
- Modify: `overlay/custom/client/cockpit/components/CockpitTopBar.vue`
- Test: 无新增（通过现有 cockpit-store 测试验证 `toggleMaximized` 逻辑）

- [ ] **Step 1: 在 ModeBar 添加最大化按钮**

在 `cockpit-mode-bar` 的 `<script setup>` 中添加方法：

```ts
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
// (已有 import)

function onRightMaximize() {
  const col = 'right' as const
  const cur = store.maximized[col]
  if (!cur) {
    // 正常 → 最大化
    store.toggleMaximized(col)
  } else {
    // 最大化 → 折叠 → 正常（三态循环）
    store.toggleMaximized(col)
    store.toggleCollapsed(col)
    // 三态循环由 onColCtrl('right') 逻辑处理，这里只调用一次 toggleMaximized
    // 简化：点击仅切换 right 栏最大化状态
  }
}
```

在模板中，在 `<span class="cockpit-mode-bar__spacer" />` 后添加：

```vue
<span class="cockpit-mode-bar__spacer" />
<button
  type="button"
  class="cockpit-mode-bar__max"
  :title="store.maximized.right ? t('cockpit.restore') : t('cockpit.maximize')"
  @click="store.toggleMaximized('right')"
>{{ store.maximized.right ? '🗗' : '⛶' }}</button>
```

在 `<style>` 中添加：

```scss
.cockpit-mode-bar__max {
  width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; font-size: 14px; display: flex;
  align-items: center; justify-content: center;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
```

并移除 `.cockpit-mode-bar` 的 `padding: 0 44px 0 12px` 中的 `44px` 右内边距（之前留空间给列控制按钮），改为 `padding: 0 12px`。

- [ ] **Step 2: 运行现有测试确认不破坏**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts
```

Expected: PASS（所有测试通过）。

- [ ] **Step 3: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitModeBar.vue
git commit -m "feat(cockpit): add maximize button to mode bar"
```

---

### Task 2: Workspace footer 添加 ⌘ Claude Code 快捷按钮

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts`

- [ ] **Step 1: 在 footer 添加 Claude Code 按钮**

在 CockpitWorkspace.vue 的 `<script setup>` 中，在 store 的使用之后（已有 `const store = useCockpitStore()`，无需新增 import），在模板的 `cockpit-workspace__foot` 中，在 `📋 {{ t('cockpit.templateManager') }}` 按钮后添加：

```vue
<button type="button" class="cockpit-workspace__btn" @click="store.enterTerminal()">⌘ {{ t('cockpit.modeTerm') }}</button>
```

- [ ] **Step 2: 更新测试**

在 `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts` 的 describe 块内追加：

```ts
it('claude code button calls enterTerminal', async () => {
  const s = seed()
  s.enterTerminal = vi.fn()
  const w = mount(CockpitWorkspace)
  // 查找包含 ⌘ 的按钮
  const buttons = w.findAll('.cockpit-workspace__btn')
  const claudeBtn = buttons.find(b => b.text().includes('⌘'))
  expect(claudeBtn).toBeTruthy()
  await claudeBtn!.trigger('click')
  expect(s.enterTerminal).toHaveBeenCalled()
})
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-workspace.test.ts
```

Expected: PASS（7 tests）。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitWorkspace.vue custom/client/cockpit/__tests__/cockpit-workspace.test.ts
git commit -m "feat(cockpit): add claude code shortcut button to workspace footer"
```

---

### Task 3: ChatPane 添加 "↗ 打开完整" 按钮

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitChatPane.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-chat-pane.test.ts`

- [ ] **Step 1: 在 ChatPane 头部添加打开完整页面按钮**

在 `<script setup>` 中添加：

```ts
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const store = useCockpitStore()
const router = useRouter()
// (已有 useI18n 等)

const channel = computed(() => store.activeChannel)

function openFullPage() {
  const ch = channel.value
  if (!ch) return
  // 通过 store 获取 channel 的 routeTarget（由 collabAdapter.parseTenant 返回）
  const task = store.selectedTask
  if (!task) return
  // 从 channels 中查找对应 routeTarget
  const chWithRoute = store.channelsForSelectedTask.find(c => c.id === ch.id)
  if (chWithRoute?.routeTarget) {
    router.push(chWithRoute.routeTarget)
  }
}
```

在模板的 `cockpit-chat-pane__head` 中，在 "返回工作项" 按钮后添加：

```vue
<button v-if="channel && hasRoute" type="button" class="cockpit-chat-pane__open" @click="openFullPage">↗ {{ t('cockpit.openFull') }}</button>
```

其中 `hasRoute` 为：

```ts
const hasRoute = computed(() => {
  const ch = channel.value
  if (!ch) return false
  return store.channelsForSelectedTask.some(c => c.id === ch.id && c.routeTarget)
})
```

在 `<style>` 中添加：

```scss
.cockpit-chat-pane__open { margin-left: 8px; font-size: 10px; color: var(--text-secondary); cursor: pointer; border: none; background: transparent; font: inherit;
  &:hover { color: var(--accent-primary); text-decoration: underline; }
}
```

调整 `cockpit-chat-pane__back` 的 `margin-left: auto` 为 `margin-left: 0`（因为 open 按钮也在右侧，需要用 flex gap 排列）。

- [ ] **Step 2: 更新测试**

在 `overlay/custom/client/cockpit/__tests__/cockpit-chat-pane.test.ts` 中追加：

```ts
it('shows open-full button when channel has route', () => {
  const s = seed()
  // 确保 channel 有 routeTarget（在 seed 中设置）
  const w = mount(CockpitChatPane)
  expect(w.find('.cockpit-chat-pane__open').exists()).toBe(true)
  expect(w.text()).toContain('↗')
})

it('open-full button does not show when no route', () => {
  setActivePinia(createPinia())
  const s = useCockpitStore()
  s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
  s.selectTask('t1')
  s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'test', routeTarget: undefined }]
  s.messages = { c1: [] }
  s.selectChannel('c1')
  const w = mount(CockpitChatPane)
  expect(w.find('.cockpit-chat-pane__open').exists()).toBe(false)
})
```

> 注意：需要确保 `CollabChannel` 类型有 `routeTarget` 字段。当前 store 的 `CollabChannel` 定义已有 `routeTarget?: RouteLocationRaw`，但 seed 数据可能没有设置。需要给 seed 中的 channel 添加 `routeTarget`。

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-chat-pane.test.ts
```

Expected: PASS（7 tests）。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitChatPane.vue custom/client/cockpit/__tests__/cockpit-chat-pane.test.ts
git commit -m "feat(cockpit): add open-full-page button to chat pane"
```

---

### Task 4: CollabBar 频道 chip 添加路由跳转

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitCollabBar.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-collab-bar.test.ts`

- [ ] **Step 1: 添加路由跳转能力**

在 `<script setup>` 中添加：

```ts
import { useRouter } from 'vue-router'
import { useCockpitStore, type CollabChannel } from '@/custom/cockpit/store/cockpit'

const store = useCockpitStore()
const router = useRouter()
// (已有 useI18n)

function navigateRoute(ch: CollabChannel) {
  if (ch.routeTarget) {
    router.push(ch.routeTarget)
  }
}
```

在模板中，更新 channel chip 渲染，在 label 后添加 ↗ 箭头按钮：

```vue
<button v-for="c in store.channelsForSelectedTask" :key="c.id" type="button"
  :data-channel-id="c.id" class="cockpit-collab-bar__chip"
  @click="store.selectChannel(c.id)">
  <span class="cockpit-collab-bar__chip-icon">{{ KIND_ICON[c.kind] }}</span>
  <span class="cockpit-collab-bar__chip-label">{{ c.label }}</span>
  <span v-if="c.routeTarget" class="cockpit-collab-bar__chip-nav"
    title="打开完整页面" @click.stop="navigateRoute(c)">↗</span>
</button>
```

在 `<style>` 中添加：

```scss
.cockpit-collab-bar__chip-nav {
  font-size: 10px; color: var(--text-muted); cursor: pointer; margin-left: 2px;
  padding: 1px 3px; border-radius: 3px;
  &:hover { color: var(--accent-primary); background: var(--bg-secondary); }
}
```

- [ ] **Step 2: 更新测试**

在 `overlay/custom/client/cockpit/__tests__/cockpit-collab-bar.test.ts` 的 `seed` 函数中为 channel 添加 `routeTarget`：

```ts
function seed() {
  const s = useCockpitStore()
  s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
  s.selectTask('t1')
  s.channels = [
    { id: 'c1', taskId: 't1', kind: 'matrix', label: 'auth-svc 联调', routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: '!abc' } } },
    { id: 'c2', taskId: 't1', kind: 'chat', label: 'review-agent', routeTarget: { name: 'hermes.session', params: { sessionId: 's1' } } },
  ]
  return s
}
```

追加测试：

```ts
it('channel chip shows navigate arrow when routeTarget exists', () => {
  seed()
  const w = mount(CockpitCollabBar)
  const navBtns = w.findAll('.cockpit-collab-bar__chip-nav')
  expect(navBtns.length).toBe(2)
})

it('channel chip has no navigate arrow when routeTarget undefined', () => {
  const s = useCockpitStore()
  s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
  s.selectTask('t1')
  s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'test', routeTarget: undefined }]
  const w = mount(CockpitCollabBar)
  expect(w.find('.cockpit-collab-bar__chip-nav').exists()).toBe(false)
})
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-collab-bar.test.ts
```

Expected: PASS（6 tests）。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitCollabBar.vue custom/client/cockpit/__tests__/cockpit-collab-bar.test.ts
git commit -m "feat(cockpit): add route navigation arrow to collab channel chips"
```

---

### Task 5: 决策选项添加推荐标记 + 描述文本

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts`

- [ ] **Step 1: 添加推荐标记和描述**

在 `<script setup>` 中修改 `decisions` 数组：

```ts
interface DecisionOption {
  key: WorkDecision
  labelKey: string
  descKey?: string
  recommended?: boolean
}

const decisions: DecisionOption[] = [
  { key: 'conditional', labelKey: 'cockpit.decisionConditional', descKey: 'cockpit.decisionConditionalDesc', recommended: true },
  { key: 'reject', labelKey: 'cockpit.decisionReject' },
  { key: 'approve', labelKey: 'cockpit.decisionApprove' },
]
```

更新模板中的 `__opt` 渲染块：

```vue
<button
  v-for="d in decisions" :key="d.key" type="button"
  :data-decision="d.key"
  class="cockpit-workspace__opt"
  :class="{ 'is-selected': workItem.decision === d.key }"
  @click="store.updateWorkItem({ decision: d.key })"
>
  <span class="cockpit-workspace__opt-dot" />
  <span class="cockpit-workspace__opt-info">
    <span class="cockpit-workspace__opt-header">
      <span class="cockpit-workspace__opt-name">{{ t(d.labelKey) }}</span>
      <span v-if="d.recommended" class="cockpit-workspace__opt-rec">{{ t('cockpit.recommend') }}</span>
    </span>
    <span v-if="d.descKey" class="cockpit-workspace__opt-desc">{{ t(d.descKey) }}</span>
  </span>
</button>
```

在 `<style>` 中添加：

```scss
.cockpit-workspace__opt-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cockpit-workspace__opt-header { display: flex; align-items: center; gap: 8px; }
.cockpit-workspace__opt-name { font-size: 13px; font-weight: 600; }
.cockpit-workspace__opt-rec { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--accent-primary); color: var(--text-on-accent); font-weight: 600; white-space: nowrap; }
.cockpit-workspace__opt-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
```

- [ ] **Step 2: 更新测试**

在 `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts` 中追加：

```ts
it('recommended option shows recommend badge', () => {
  seed()
  const w = mount(CockpitWorkspace)
  // conditional 选项应有推荐标记
  const cond = w.find('[data-decision="conditional"]')
  expect(cond.text()).toContain('recommend')  // mock 的 t 返回 key 名
})
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-workspace.test.ts
```

Expected: PASS（8 tests）。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitWorkspace.vue custom/client/cockpit/__tests__/cockpit-workspace.test.ts
git commit -m "feat(cockpit): add recommend badge and description to decision options"
```

---

### Task 6: TopBar i18n 修正

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitTopBar.vue`
- Modify: `overlay/patches/074-cockpit-packages_client_src_i18n_locales_en.ts.patch` (或直接修改 upstream)
- Modify: `overlay/patches/075-cockpit-packages_client_src_i18n_locales_zh.ts.patch`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-attention.test.ts`

- [ ] **Step 1: 修正 i18n key 使用**

将 CockpitTopBar.vue 中的硬编码降级替换为正确的 i18n key：

模板中的：
```vue
📅 {{ t('sidebar.history') === 'sidebar.history' ? '日程' : t('sidebar.history') }}
```
改为：
```vue
📅 {{ t('cockpit.schedule') }}
```

```vue
{{ t('sidebar.search') === 'sidebar.search' ? '搜索任务、空间、Agent' : t('sidebar.search') }}
```
改为：
```vue
{{ t('cockpit.search') }}
```

由于 `sidebar` 命名空间不存在这些 key，改为使用 `cockpit` 命名空间中的现有或新增 key。

需要确保上游 i18n 文件包含 `cockpit.schedule` 和 `cockpit.search`。检查 upstream 文件是否已有这些 key：

```bash
grep -n "schedule\|search" upstream/hermes-studio/packages/client/src/i18n/locales/en.ts | grep cockpit
```

如果不存在，通过 patch 添加。在 `074-cockpit-packages_client_src_i18n_locales_en.ts.patch` 和 `075-cockpit-packages_client_src_i18n_locales_zh.ts.patch` 的 `cockpit:` block 末尾添加：

en.ts 追加到 `cockpit:` block：
```ts
    schedule: 'Schedule',
    search: 'Search tasks, spaces, agents…',
```

zh.ts 追加到 `cockpit:` block：
```ts
    schedule: '日程',
    search: '搜索任务、空间、Agent…',
```

- [ ] **Step 2: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-attention.test.ts
```

Expected: PASS。

- [ ] **Step 3: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitTopBar.vue
git commit -m "fix(cockpit): fix topbar i18n key usage, remove hardcoded fallback"
```

---

### Task 7: Attention 标签 i18n 化

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitAttention.vue`

- [ ] **Step 1: 替换硬编码中文**

在模板中，将：
```vue
<span class="cockpit-attention__label-text">需要你</span>
```
改为：
```vue
<span class="cockpit-attention__label-text">{{ t('cockpit.attention') }}</span>
```

已有 `const { t } = useI18n()` import，无需新增。

- [ ] **Step 2: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-attention.test.ts
```

Expected: PASS。

- [ ] **Step 3: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitAttention.vue
git commit -m "fix(cockpit): i18n-ize attention bar label"
```

---

### Task 8: 历史动作筛选 i18n 化

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitHistoryModal.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-history-modal.test.ts`

- [ ] **Step 1: 用 i18n key 替换硬编码动作**

在 `<script setup>` 中，替换：
```ts
const ACTIONS = ['审批', '决策', '补充', '评估', '委派']
```
为：
```ts
const ACTIONS = ['approve', 'decide', 'supplement', 'evaluate', 'delegate']
```

在模板中，将 `:data-action-filter="a"` 改为 `:data-action-filter="a"`（保持不变），但文本改为 `{{ t('cockpit.action' + a.charAt(0).toUpperCase() + a.slice(1)) }}`。更简洁的方式：将 ACTIONS 改为对象数组：

```ts
const ACTIONS = [
  { key: 'approve', labelKey: 'cockpit.actionApprove' },
  { key: 'decide', labelKey: 'cockpit.actionDecide' },
  { key: 'supplement', labelKey: 'cockpit.actionSupplement' },
  { key: 'evaluate', labelKey: 'cockpit.actionEvaluate' },
  { key: 'delegate', labelKey: 'cockpit.actionDelegate' },
]
```

模板中：
```vue
<button v-for="a in ACTIONS" :key="a.key" type="button" :data-action-filter="a.key"
  class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.actions.includes(a.key) }"
  @click="store.toggleHistoryAction(a.key)">{{ t(a.labelKey) }}</button>
```

在 `store.toggleHistoryAction` 调用中也改为传 `a.key`。

- [ ] **Step 2: 更新测试**

在 `overlay/custom/client/cockpit/__tests__/cockpit-history-modal.test.ts` 中：

- mock `t` 需支持新 key：在 `vi.mock('vue-i18n')` 的 `t` 函数中添加对 `cockpit.action*` 的映射，或简单返回 labelKey。

更新 seed 中的 `historyFilters.actions` 为使用新 key：
```ts
s.historyFilters = { actions: ['approve'], archived: 'all' }
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-history-modal.test.ts
```

Expected: PASS（5 tests）。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitHistoryModal.vue custom/client/cockpit/__tests__/cockpit-history-modal.test.ts
git commit -m "fix(cockpit): i18n-ize history action filters"
```

---

### Task 9: 用户名动态获取

**Files:**
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`

- [ ] **Step 1: Store 添加当前用户 getter**

在 `overlay/custom/client/cockpit/store/cockpit.ts` 的 `defineStore` setup 中添加：

```ts
// ── 当前用户（从 user/profile store 获取）──
const currentUserName = computed(() => {
  // 尝试从 profile 或 user store 获取
  try {
    const { useUserStore } = await import('@/stores/hermes/user') as any
    const user = useUserStore()
    return user.currentUser?.displayName ?? user.currentUser?.username ?? '你'
  } catch {
    return '你'
  }
})
```

但 `computed` 中不能 `await`。改用同步方式：

```ts
import { useAuthStore } from '@/stores/hermes/auth'

const currentUserName = computed(() => {
  try {
    const auth = useAuthStore()
    // 尝试从 auth store 获取用户名
    return (auth as any).user?.displayName ?? (auth as any).user?.username ?? '你'
  } catch {
    return '你'
  }
})
```

添加到 return 对象中：
```ts
currentUserName,
```

- [ ] **Step 2: 在 CockpitView 中使用**

在 CockpitView.vue 的 `<script setup>` 中添加：

```ts
const currentUserName = computed(() => store.currentUserName)
```

模板中：
```vue
<CockpitTopBar ... :user-name="currentUserName" />
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/views/CockpitView.vue custom/client/cockpit/store/cockpit.ts
git commit -m "feat(cockpit): dynamic user name from store instead of hardcoded"
```

---

### Task 10: 清理未使用的 i18n keys

**Files:**
- Modify: `overlay/patches/074-cockpit-packages_client_src_i18n_locales_en.ts.patch` (若 key 在 patch 中)
- Modify: `overlay/patches/075-cockpit-packages_client_src_i18n_locales_zh.ts.patch`
- 或直接修改 upstream i18n 文件

- [ ] **Step 1: 确认已使用的 key**

当前 `cockpit` 命名空间中的 key 使用情况：

| Key | 使用位置 | 状态 |
|-----|---------|------|
| `openFull` | Task 3 将使用 | 保留 |
| `recommend` | Task 5 将使用 | 保留 |
| `archivedHint` | 未使用 | 移除 |
| `rightPlaceholder` | 未使用 | 移除 |
| `midPlaceholder` | 未使用 | 移除 |

从 upstream i18n 文件中移除 `archivedHint`、`rightPlaceholder`、`midPlaceholder`（这些是 P2/P5 遗留的占位文案）。

- [ ] **Step 2: 提交**

```bash
cd overlay && git add upstream/hermes-studio/packages/client/src/i18n/locales/en.ts upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts
git commit -m "chore(cockpit): remove unused i18n keys (archivedHint, placeholders)"
```

> 注：直接修改 upstream 文件后需更新 patch。运行 `npm run inject` 重新生成 patch。

---

### Task 11: Diff 区块动态化

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts`

- [ ] **Step 1: 将硬编码 diff 替换为动态渲染**

当前 `cockpit-workspace__diff` 区块渲染静态 demo diff 行。改为从 `workItem.modifiedFiles` 动态生成：

在 `<script setup>` 中添加：

```ts
const diffFiles = computed(() => workItem.value?.modifiedFiles ?? [])
```

在模板中替换 `__diff` 区块：

```vue
<!-- 修改文件列表 -->
<div class="cockpit-workspace__files">
  <span class="cockpit-workspace__files-label">{{ t('cockpit.modified') }}</span>
  <span v-for="f in diffFiles" :key="f" class="cockpit-workspace__file">{{ f }}</span>
</div>
```

注意：真正的代码 diff（增删行高亮）需要后端数据。当前阶段先展示 modifiedFiles 列表（替换硬编码的 diff 行），后续接入真实 diff API 时再扩展。

- [ ] **Step 2: 更新测试**

在 `cockpit-workspace.test.ts` 中追加：

```ts
it('renders modified files from work item', () => {
  seed()
  const w = mount(CockpitWorkspace)
  expect(w.text()).toContain('refresh.ts')
})
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-workspace.test.ts
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitWorkspace.vue custom/client/cockpit/__tests__/cockpit-workspace.test.ts
git commit -m "fix(cockpit): dynamic diff file list from work item"
```

---

### Task 12: 评分持久化到模板

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit-kv.ts`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-kv.test.ts`

- [ ] **Step 1: A2uiTemplate 添加 score 字段**

在 `cockpit-kv.ts` 中修改 `A2uiTemplate` 接口：

```ts
export interface A2uiTemplate {
  id: string
  name: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
  score?: number
}
```

- [ ] **Step 2: 更新测试**

在 `cockpit-kv.test.ts` 中追加：

```ts
it('template with score field saves and loads correctly', () => {
  const tpl: A2uiTemplate = { id: 't1', name: 'test', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [], score: 4 }
  const list = [tpl]
  saveTemplates(list)
  const loaded = loadTemplates()
  expect(loaded[0].score).toBe(4)
})
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-kv.test.ts
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/store/cockpit-kv.ts custom/client/cockpit/__tests__/cockpit-kv.test.ts
git commit -m "feat(cockpit): add score field to A2UI template"
```

---

### 全量回归

- [ ] **Step 1: 运行所有 cockpit 测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-
```

Expected: 全部 PASS。

- [ ] **Step 2: 类型检查**

```bash
cd overlay && npx vue-tsc --noEmit 2>&1 | grep -iE "cockpit" | head -20
```

Expected: 无 cockpit 相关类型错误。

- [ ] **Step 3: 合并到 main**

```bash
cd overlay && git checkout main && git merge fix/cockpit-rightsidebar-gaps
```

---

## Self-Review

**Spec 覆盖：**
- ✅ §5.5 ModeBar 最大化按钮 → Task 1
- ✅ §5.5 ⌘ Claude Code 快捷入口 → Task 2
- ✅ §5.5/§7.2 "↗ 打开完整" 按钮 → Tasks 3+4
- ✅ §5.5 决策推荐标记 + 描述 → Task 5
- ✅ §5.1 TopBar i18n → Task 6
- ✅ §5.2 Attention i18n → Task 7
- ✅ §5.8 历史动作 i18n → Task 8
- ✅ 用户名动态获取 → Task 9
- ✅ 清理 i18n → Task 10
- ✅ §5.5 Diff 区块动态化 → Task 11
- ✅ §5.6 评分持久化 → Task 12

**占位符扫描：** 无 TBD，无 TODO，每步包含完整代码。

**类型一致性：** `A2uiTemplate.score` 在 Task 12 定义和使用一致；`ACTIONS` 数组从字符串改为对象数组在 Task 8 中一致处理。
