# AI协作中心 驾驶舱 P3 实施计划（右栏：A2UI 工作区 + 文件资源管理器）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实的右栏组件替换 P1 占位：①A2UI 工作区（处理表单，随选中的时序节点/任务变化，含 diff、决定、风险标签、意见、底部操作）+ ②文件资源管理器（以当前任务 workspace 为根的树形浏览，可展开/折叠/选中）。两者随 `useCockpitStore.selectedTask` 与 `selectedTimelineNode` 联动。

**Architecture:** 在 `useCockpitStore` 增加 A2UI 工作项与文件树 state（P3 用内存种子；真实 listFiles API 接入留后续）。新增两个组件：`CockpitWorkspace`（A2UI 处理表单 + 底部操作）与 `CockpitFileTree`（树形浏览器）。`CockpitView` 右栏占位替换为 `CockpitWorkspace`（内部分栏：左表单 / 右文件树）。所有样式继续 Pure Ink + 复用 P1/P2 的 `.is-selected`/`.cockpit-sel-bar` 统一选中态语言。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · vitest + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.5 右栏工作区、§5.6 A2UI 生命周期、§6 交互动线）
**前置：** P1 + P2 已合并到 `feat/cockpit-p1` 分支。

---

## 文件结构

- **Modify** `packages/client/src/stores/hermes/cockpit.ts` — 新增工作项（work item）+ 文件树 state + getters
- **Create** `packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue` — A2UI 处理表单 + 底部操作（左半）
- **Create** `packages/client/src/components/hermes/cockpit/CockpitFileTree.vue` — 文件资源管理器（右半）
- **Modify** `packages/client/src/views/hermes/CockpitView.vue` — 右栏占位 → 真实组件
- **Modify** `packages/client/src/i18n/locales/en.ts` + `zh.ts` — 工作区文案 i18n 键
- **Test** `tests/client/cockpit-store.test.ts` — 补工作项/文件树的 store 测试
- **Test** `tests/client/cockpit-workspace.test.ts`
- **Test** `tests/client/cockpit-file-tree.test.ts`

---

### Task 1: Store 扩展 — 工作项 + 文件树

**Files:**
- Modify: `packages/client/src/stores/hermes/cockpit.ts`
- Test: `tests/client/cockpit-store.test.ts`

- [ ] **Step 1: Add failing tests to `tests/client/cockpit-store.test.ts`**

在现有 describe 块内追加：

```ts
  it('workItemForSelectedTask returns the work item bound to the selected task', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [
      { id: 'w1', taskId: 't1', decision: 'conditional', riskTags: ['concurrency', 'test-gap'], opinion: '补用例再合并', modifiedFiles: ['refresh.ts'] },
    ]
    expect(s.workItemForSelectedTask?.decision).toBe('conditional')
  })

  it('workItemForSelectedTask returns null when task has no work item', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = []
    expect(s.workItemForSelectedTask).toBeNull()
  })

  it('filesForSelectedTask returns files for the selected task workspace', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1', workspace: '~/ws/auth-svc' })]
    s.selectTask('t1')
    s.fileTrees = {
      't1': [
        { id: 'f1', name: 'src', isDir: true, children: [{ id: 'f2', name: 'refresh.ts', isDir: false, modified: true }] },
        { id: 'f3', name: 'package.json', isDir: false, modified: false },
      ],
    }
    const files = s.filesForSelectedTask
    expect(files.map((f) => f.id)).toEqual(['f1', 'f3'])
    expect(files[0].children?.[0].modified).toBe(true)
  })

  it('filesForSelectedTask returns empty array when task has no tree', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.fileTrees = {}
    expect(s.filesForSelectedTask).toEqual([])
  })

  it('selectFile sets selectedFileId', () => {
    const s = useCockpitStore()
    s.selectFile('f2')
    expect(s.selectedFileId).toBe('f2')
  })

  it('updateDecision updates the work item for selected task', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'conditional', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.updateWorkItem({ decision: 'reject' })
    expect(s.workItemForSelectedTask?.decision).toBe('reject')
  })

  it('toggleRiskTag adds and removes a risk tag', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'conditional', riskTags: ['concurrency'], opinion: '', modifiedFiles: [] }]
    s.toggleRiskTag('test-gap')
    expect(s.workItemForSelectedTask?.riskTags).toContain('test-gap')
    s.toggleRiskTag('concurrency')
    expect(s.workItemForSelectedTask?.riskTags).not.toContain('concurrency')
  })
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the store**

In `packages/client/src/stores/hermes/cockpit.ts`, add new types after existing ones:

```ts
// ── P3: 工作项 & 文件树 ──
export type WorkDecision = 'conditional' | 'reject' | 'approve'

export interface WorkItem {
  id: string
  taskId: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
}

export interface FileNode {
  id: string
  name: string
  isDir: boolean
  modified?: boolean
  children?: FileNode[]
}
```

Inside the `defineStore` setup body, add (after P2 section, before return):

```ts
  // ── P3 state ──
  const workItems = ref<WorkItem[]>([])
  const fileTrees = ref<Record<string, FileNode[]>>({})
  const selectedFileId = ref<string | null>(null)

  // ── P3 getters ──
  const workItemForSelectedTask = computed(
    () => workItems.value.find((w) => w.taskId === selectedTaskId.value) ?? null,
  )
  const filesForSelectedTask = computed(() =>
    selectedTaskId.value ? (fileTrees.value[selectedTaskId.value] ?? []) : [],
  )

  // ── P3 methods ──
  function selectFile(id: string | null) {
    selectedFileId.value = id
  }
  function updateWorkItem(patch: Partial<Omit<WorkItem, 'id' | 'taskId'>>) {
    const wi = workItemForSelectedTask.value
    if (!wi) return
    Object.assign(wi, patch)
  }
  function toggleRiskTag(tag: string) {
    const wi = workItemForSelectedTask.value
    if (!wi) return
    const i = wi.riskTags.indexOf(tag)
    if (i >= 0) wi.riskTags.splice(i, 1)
    else wi.riskTags.push(tag)
  }
```

Add to the returned object:

```ts
    workItems, fileTrees, selectedFileId,
    workItemForSelectedTask, filesForSelectedTask,
    selectFile, updateWorkItem, toggleRiskTag,
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: PASS (22 tests — 15 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/hermes/cockpit.ts tests/client/cockpit-store.test.ts
git commit -m "feat(cockpit): extend store with work item and file tree"
```

---

### Task 2: i18n keys for 右栏

**Files:**
- Modify: `packages/client/src/i18n/locales/en.ts`
- Modify: `packages/client/src/i18n/locales/zh.ts`

- [ ] **Step 1: Add keys to the `cockpit` namespace**

In `en.ts`, inside the `cockpit: { ... }` block, append:

```ts
    workspace: 'Workspace',
    taskFiles: 'Task Files',
    currentTaskWorkspace: 'Current task workspace',
    filterFiles: 'Filter files…',
    pendingTodo: 'Pending · needs your decision',
    basedOnTemplate: 'Based on template {tpl}, {n} differences',
    yourDecision: 'Your decision',
    riskTags: 'Risk tags',
    reviewOpinion: 'Review opinion',
    decisionApprove: 'Approve',
    decisionConditional: 'Conditional approve',
    decisionReject: 'Reject',
    recommend: 'Recommend',
    agentPrefilled: 'Agent pre-filled',
    handleLater: 'Later',
    submit: 'Submit',
    noWorkItem: 'No work item for this task',
```

In `zh.ts`, inside the `cockpit` block (replace the single `workspace: 'Workspace'` line that P2 added — it'll be consolidated here):

```ts
    workspace: '工作区',
    taskFiles: '任务文件',
    currentTaskWorkspace: '当前任务的 Workspace',
    filterFiles: '筛选文件…',
    pendingTodo: '待办 · 需你决定是否阻塞',
    basedOnTemplate: '基于模板 {tpl}，{n} 处不同',
    yourDecision: '你的决定',
    riskTags: '风险标签',
    reviewOpinion: '评审意见',
    decisionApprove: '直接通过',
    decisionConditional: '有条件通过',
    decisionReject: '驳回',
    recommend: '推荐',
    agentPrefilled: 'Agent 预填',
    handleLater: '稍后处理',
    submit: '提交决定',
    noWorkItem: '此任务无工作项',
```

> 注意：P2 在 zh.ts 的 `cockpit` 块里加了一行 `workspace: 'Workspace',`，这里要替换成 `'工作区'`。en.ts 的 P2 行 `workspace: 'Workspace',` 保持不变（值相同）。

- [ ] **Step 2: Verify type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -iE 'cockpit|locales' | head`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts
git commit -m "feat(cockpit): add i18n keys for workspace (form, file tree)"
```

---

### Task 3: CockpitFileTree 文件资源管理器

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitFileTree.vue`
- Test: `tests/client/cockpit-file-tree.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-file-tree.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitFileTree from '@/components/hermes/cockpit/CockpitFileTree.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CockpitFileTree', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws/auth-svc' }]
    s.selectTask('t1')
    s.fileTrees = {
      t1: [
        { id: 'f1', name: 'src', isDir: true, children: [{ id: 'f2', name: 'refresh.ts', isDir: false, modified: true }] },
        { id: 'f3', name: 'package.json', isDir: false, modified: false },
      ],
    }
    return s
  }

  it('renders top-level files and directories', () => {
    seed()
    const w = mount(CockpitFileTree)
    expect(w.text()).toContain('src')
    expect(w.text()).toContain('package.json')
  })

  it('directory is collapsed by default (children hidden)', () => {
    seed()
    const w = mount(CockpitFileTree)
    expect(w.find('[data-file-id="f2"]').exists()).toBe(false)
  })

  it('clicking a directory expands it', async () => {
    seed()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="f1"]').trigger('click')
    expect(w.find('[data-file-id="f2"]').exists()).toBe(true)
  })

  it('clicking a file selects it in the store', async () => {
    seed()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="f1"]').trigger('click')
    await w.find('[data-file-id="f2"]').trigger('click')
    const s = useCockpitStore()
    expect(s.selectedFileId).toBe('f2')
  })

  it('modified file has is-modified class', async () => {
    seed()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="f1"]').trigger('click')
    expect(w.find('[data-file-id="f2"]').classes()).toContain('is-modified')
  })

  it('shows current workspace path from selected task', () => {
    seed()
    const w = mount(CockpitFileTree)
    expect(w.text()).toContain('~/ws/auth-svc')
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-file-tree.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitFileTree.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const expanded = ref<Record<string, boolean>>({})
const filter = ref('')

function toggle(id: string) {
  expanded.value[id] = !expanded.value[id]
}
function isExpanded(id: string) {
  return expanded.value[id] ?? false
}
function onClick(node: { id: string; isDir: boolean }) {
  if (node.isDir) toggle(node.id)
  else store.selectFile(node.id)
}

const rootFiles = computed(() => store.filesForSelectedTask)
const workspace = computed(() => store.selectedTask?.workspace ?? '')
const hasTask = computed(() => !!store.selectedTask)
</script>

<template>
  <div class="cockpit-file-tree">
    <div class="cockpit-file-tree__head">
      <span class="cockpit-file-tree__title">{{ t('cockpit.taskFiles') }}</span>
      <span class="cockpit-file-tree__sub">{{ t('cockpit.currentTaskWorkspace') }}</span>
      <code v-if="hasTask" class="cockpit-file-tree__root">{{ workspace }}</code>
      <input v-model="filter" class="cockpit-file-tree__filter" :placeholder="t('cockpit.filterFiles')">
    </div>
    <div class="cockpit-file-tree__list">
      <template v-if="hasTask">
        <CockpitFileNode
          v-for="node in rootFiles"
          :key="node.id"
          :node="node"
          :depth="0"
          :filter="filter"
        />
      </template>
      <div v-else class="cockpit-file-tree__empty">{{ t('cockpit.noTaskSelected') }}</div>
    </div>
  </div>
</template>
```

> ⚠️ The above uses a recursive child `<CockpitFileNode>`. To keep it one file (simpler), inline the recursion via a self-referencing component using its own name. Vue SFC supports recursion when the component has a `name`. Add `<script lang="ts"> export default { name: 'CockpitFileTree' }</script>` is messy in `<script setup>`. Instead, use the `defineOptions` macro (Vue 3.3+) or split into 2 files. **Use the 2-file approach for clarity** — rename the above to `CockpitFileTree.vue` (the container) and create a separate `CockpitFileNode.vue` for the recursive row. Revised plan below.

**Revised: split into 2 files.**

Create `packages/client/src/components/hermes/cockpit/CockpitFileNode.vue` (recursive row):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore, type FileNode } from '@/stores/hermes/cockpit'

const props = defineProps<{
  node: FileNode
  depth: number
  filter: string
}>()

const store = useCockpitStore()
const expanded = defineModel<boolean>('expanded', { default: false })

const isSelected = computed(() => store.selectedFileId === props.node.id)
const matches = computed(() => props.filter === '' || props.node.name.toLowerCase().includes(props.filter.toLowerCase()))

function onClick() {
  if (props.node.isDir) expanded.value = !expanded.value
  else store.selectFile(props.node.id)
}
</script>

<template>
  <div v-if="matches">
    <button
      type="button"
      :data-file-id="node.id"
      class="cockpit-file-node"
      :class="{ 'is-selected': isSelected, 'is-dir': node.isDir, 'is-modified': node.modified }"
      :style="{ paddingLeft: 8 + depth * 16 + 'px' }"
      @click="onClick"
    >
      <span class="cockpit-sel-bar" />
      <span class="cockpit-file-node__icon">{{ node.isDir ? (expanded ? '▾' : '▸') : '·' }}</span>
      <span class="cockpit-file-node__name">{{ node.name }}</span>
      <span v-if="node.modified" class="cockpit-file-node__mod">M</span>
    </button>
    <template v-if="node.isDir && expanded && node.children">
      <CockpitFileNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :filter="filter"
        v-model:expanded="childExpanded"
      />
    </template>
  </div>
</template>
```

Hmm, the recursive child's `expanded` model needs per-node tracking. Using `defineModel` per-instance is fine since each node component instance owns its own `expanded` state. But the parent doesn't pass a bound value for children — need to let children self-manage. **Simpler: make `expanded` internal state in the node, not a model.**

Final `CockpitFileNode.vue` (self-managed expansion):

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore, type FileNode } from '@/stores/hermes/cockpit'

const props = defineProps<{
  node: FileNode
  depth: number
  filter: string
}>()

const store = useCockpitStore()
const expanded = ref(false)

const isSelected = computed(() => store.selectedFileId === props.node.id)
const matches = computed(() =>
  props.filter === '' || props.node.name.toLowerCase().includes(props.filter.toLowerCase()),
)

function onClick() {
  if (props.node.isDir) expanded.value = !expanded.value
  else store.selectFile(props.node.id)
}
</script>

<template>
  <div v-if="matches">
    <button
      type="button"
      :data-file-id="node.id"
      class="cockpit-file-node"
      :class="{ 'is-selected': isSelected, 'is-modified': node.modified }"
      :style="{ paddingLeft: 8 + depth * 16 + 'px' }"
      @click="onClick"
    >
      <span class="cockpit-sel-bar" />
      <span class="cockpit-file-node__icon">{{ node.isDir ? (expanded ? '▾' : '▸') : '·' }}</span>
      <span class="cockpit-file-node__name">{{ node.name }}</span>
      <span v-if="node.modified" class="cockpit-file-node__mod">M</span>
    </button>
    <CockpitFileNode
      v-for="child in node.children"
      v-if="node.isDir && expanded && node.children"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
      :filter="filter"
    />
  </div>
</template>
```

> Vue's compiler resolves self-reference by filename for SFCs with `<script setup>`, so `<CockpitFileNode>` inside its own template works.

Update `CockpitFileTree.vue` to use `<CockpitFileNode>`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'
import CockpitFileNode from './CockpitFileNode.vue'

const store = useCockpitStore()
const { t } = useI18n()
const filter = ref('')

const rootFiles = computed(() => store.filesForSelectedTask)
const workspace = computed(() => store.selectedTask?.workspace ?? '')
const hasTask = computed(() => !!store.selectedTask)
</script>

<template>
  <div class="cockpit-file-tree">
    <div class="cockpit-file-tree__head">
      <span class="cockpit-file-tree__title">{{ t('cockpit.taskFiles') }}</span>
      <span class="cockpit-file-tree__sub">{{ t('cockpit.currentTaskWorkspace') }}</span>
      <code v-if="hasTask" class="cockpit-file-tree__root">{{ workspace }}</code>
      <input v-model="filter" class="cockpit-file-tree__filter" :placeholder="t('cockpit.filterFiles')">
    </div>
    <div class="cockpit-file-tree__list">
      <template v-if="hasTask">
        <CockpitFileNode
          v-for="node in rootFiles"
          :key="node.id"
          :node="node"
          :depth="0"
          :filter="filter"
        />
      </template>
      <div v-else class="cockpit-file-tree__empty">{{ t('cockpit.noTaskSelected') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-file-tree { display: flex; flex-direction: column; flex: 0 0 240px; border-left: 1px solid var(--border-color); background: var(--bg-sidebar); min-height: 0; }
.cockpit-file-tree__head { flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--border-light); background: var(--bg-card); display: flex; flex-direction: column; gap: 4px; }
.cockpit-file-tree__title { font-size: 11px; font-weight: 700; color: var(--text-primary); }
.cockpit-file-tree__sub { font-size: 9px; color: var(--text-muted); }
.cockpit-file-tree__root { font-family: ui-monospace, monospace; font-size: 9px; color: var(--text-secondary); background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; word-break: break-all; }
.cockpit-file-tree__filter { font-family: inherit; font-size: 10px; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); }
.cockpit-file-tree__list { flex: 1; overflow-y: auto; padding: 6px 0; }
.cockpit-file-tree__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>

<style scoped lang="scss">
.cockpit-file-node {
  position: relative; display: flex; align-items: center; gap: 5px;
  width: 100%; text-align: left; padding: 3px 8px;
  border: none; background: none; font: inherit; color: var(--text-secondary);
  cursor: pointer; white-space: nowrap;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
  &.is-selected { background: var(--bg-secondary); color: var(--text-primary); }
  &.is-modified .cockpit-file-node__name { font-weight: 600; color: var(--text-primary); }
}
.cockpit-file-node__icon { font-size: 10px; width: 13px; text-align: center; color: var(--text-muted); }
.cockpit-file-node__name { font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.cockpit-file-node__mod { font-size: 8px; padding: 0 4px; border-radius: 2px; margin-left: auto; background: var(--bg-secondary); color: var(--text-muted); font-family: ui-monospace, monospace; }
</style>
```

> ⚠️ Two `<style scoped>` blocks: the first is in `CockpitFileTree.vue` (container), the second belongs in `CockpitFileNode.vue` (the row). Don't put both in one file. **Move the `.cockpit-file-node` styles into `CockpitFileNode.vue`.**

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-file-tree.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitFileTree.vue packages/client/src/components/hermes/cockpit/CockpitFileNode.vue tests/client/cockpit-file-tree.test.ts
git commit -m "feat(cockpit): add file explorer with recursive tree, filter, modified marks"
```

---

### Task 4: CockpitWorkspace A2UI 处理表单

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue`
- Test: `tests/client/cockpit-workspace.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-workspace.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitWorkspace from '@/components/hermes/cockpit/CockpitWorkspace.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, args?: Record<string, unknown>) => {
    if (args && key.includes('basedOnTemplate')) return args.tpl + '/' + args.n
    return key
  } }),
}))

describe('CockpitWorkspace', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR #142', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws' }]
    s.selectTask('t1')
    s.workItems = [{
      id: 'w1', taskId: 't1', decision: 'conditional',
      riskTags: ['concurrency', 'test-gap'], opinion: '补用例再合并', modifiedFiles: ['refresh.ts'],
    }]
    return s
  }

  it('renders the work item opinion and decision', () => {
    seed()
    const w = mount(CockpitWorkspace)
    expect(w.text()).toContain('补用例再合并')
  })

  it('renders decision options with the current one selected', () => {
    seed()
    const w = mount(CockpitWorkspace)
    const cond = w.find('[data-decision="conditional"]')
    expect(cond.classes()).toContain('is-selected')
  })

  it('clicking a decision option updates the store', async () => {
    const s = seed()
    const w = mount(CockpitWorkspace)
    await w.find('[data-decision="approve"]').trigger('click')
    expect(s.workItemForSelectedTask?.decision).toBe('approve')
  })

  it('clicking a risk tag chip toggles it', async () => {
    const s = seed()
    const w = mount(CockpitWorkspace)
    await w.find('[data-tag="performance"]').trigger('click')
    expect(s.workItemForSelectedTask?.riskTags).toContain('performance')
  })

  it('shows empty state when no work item', () => {
    setActivePinia(createPinia())
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'x', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws' }]
    s.selectTask('t1')
    const w = mount(CockpitWorkspace)
    expect(w.find('.cockpit-workspace__empty').exists()).toBe(true)
  })

  it('submit button emits submit event', async () => {
    seed()
    const w = mount(CockpitWorkspace)
    await w.find('[data-action="submit"]').trigger('click')
    expect(w.emitted('submit')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-workspace.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore, type WorkDecision } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'
import CockpitFileTree from './CockpitFileTree.vue'

const store = useCockpitStore()
const { t } = useI18n()
defineEmits<{ (e: 'submit'): void; (e: 'later'): void }>()

const decisions: { key: WorkDecision; labelKey: string; descKey: string }[] = [
  { key: 'conditional', labelKey: 'cockpit.decisionConditional', descKey: 'cockpit.decisionConditional' },
  { key: 'reject', labelKey: 'cockpit.decisionReject', descKey: 'cockpit.decisionReject' },
  { key: 'approve', labelKey: 'cockpit.decisionApprove', descKey: 'cockpit.decisionApprove' },
]

const ALL_TAGS = ['concurrency', 'test-gap', 'performance', 'compatibility']

const workItem = computed(() => store.workItemForSelectedTask)
const hasTask = computed(() => !!store.selectedTask)
</script>

<template>
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__form">
      <div v-if="hasTask && workItem" class="cockpit-workspace__body">
        <!-- 待办 banner -->
        <div class="cockpit-workspace__banner">
          <span class="cockpit-workspace__banner-dot" />
          <div>
            <div class="cockpit-workspace__banner-title">{{ t('cockpit.pendingTodo') }}</div>
            <div class="cockpit-workspace__banner-sub">{{ workItem.opinion }}</div>
          </div>
        </div>

        <!-- 模板提示 -->
        <div class="cockpit-workspace__ref">
          {{ t('cockpit.basedOnTemplate', { tpl: 'PR-审核-v1', n: 2 }) }}
        </div>

        <!-- 修改文件 diff 摘要 -->
        <div class="cockpit-workspace__files">
          <span class="cockpit-workspace__files-label">Modified</span>
          <span v-for="f in workItem.modifiedFiles" :key="f" class="cockpit-workspace__file">{{ f }}</span>
        </div>

        <!-- 决定 -->
        <div class="cockpit-workspace__field">
          <label class="cockpit-workspace__label">{{ t('cockpit.yourDecision') }} *</label>
          <button
            v-for="d in decisions"
            :key="d.key"
            type="button"
            :data-decision="d.key"
            class="cockpit-workspace__opt"
            :class="{ 'is-selected': workItem.decision === d.key }"
            @click="store.updateWorkItem({ decision: d.key })"
          >
            <span class="cockpit-workspace__opt-dot" />
            <span class="cockpit-workspace__opt-name">{{ t(d.labelKey) }}</span>
          </button>
        </div>

        <!-- 风险标签 -->
        <div class="cockpit-workspace__field">
          <label class="cockpit-workspace__label">{{ t('cockpit.riskTags') }} <span class="cockpit-workspace__sub">{{ t('cockpit.agentPrefilled') }}</span></label>
          <div class="cockpit-workspace__chips">
            <button
              v-for="tag in ALL_TAGS"
              :key="tag"
              type="button"
              :data-tag="tag"
              class="cockpit-workspace__chip"
              :class="{ 'is-on': workItem.riskTags.includes(tag) }"
              @click="store.toggleRiskTag(tag)"
            >{{ tag }}</button>
          </div>
        </div>

        <!-- 评审意见 -->
        <div class="cockpit-workspace__field">
          <label class="cockpit-workspace__label">{{ t('cockpit.reviewOpinion') }}</label>
          <textarea
            class="cockpit-workspace__textarea"
            :value="workItem.opinion"
            @input="store.updateWorkItem({ opinion: ($event.target as HTMLTextAreaElement).value })"
          />
        </div>
      </div>
      <div v-else class="cockpit-workspace__empty">{{ t('cockpit.noWorkItem') }}</div>

      <!-- 底部操作 -->
      <div class="cockpit-workspace__foot">
        <button type="button" class="cockpit-workspace__btn" @click="$emit('later')">{{ t('cockpit.handleLater') }}</button>
        <button type="button" data-action="submit" class="cockpit-workspace__btn is-pri" @click="$emit('submit')">{{ t('cockpit.submit') }}</button>
      </div>
    </div>

    <!-- 文件资源管理器 -->
    <CockpitFileTree />
  </div>
</template>

<style scoped lang="scss">
.cockpit-workspace { display: flex; flex: 1; min-height: 0; }
.cockpit-workspace__form { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cockpit-workspace__body { flex: 1; overflow-y: auto; padding: 16px; }
.cockpit-workspace__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
.cockpit-workspace__banner { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; background: rgba(var(--warning-rgb), 0.08); border: 1px solid rgba(var(--warning-rgb), 0.3); margin-bottom: 16px; }
.cockpit-workspace__banner-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warning); margin-top: 4px; flex-shrink: 0; }
.cockpit-workspace__banner-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-workspace__banner-sub { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.cockpit-workspace__ref { background: var(--bg-secondary); border-radius: 6px; padding: 8px 11px; font-size: 11px; color: var(--text-secondary); margin-bottom: 14px; }
.cockpit-workspace__files { display: flex; align-items: center; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.cockpit-workspace__files-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
.cockpit-workspace__file { font-family: ui-monospace, monospace; font-size: 10px; background: var(--bg-secondary); padding: 2px 7px; border-radius: 3px; color: var(--text-secondary); }
.cockpit-workspace__field { margin-bottom: 16px; }
.cockpit-workspace__label { display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.cockpit-workspace__sub { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-left: 6px; }
.cockpit-workspace__opt { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: var(--bg-card); font: inherit; color: var(--text-primary); width: 100%; text-align: left;
  &:hover { border-color: var(--text-muted); }
  &.is-selected { border-color: var(--accent-primary); background: var(--bg-secondary); }
}
.cockpit-workspace__opt-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--text-muted); flex-shrink: 0; margin-top: 1px; }
.is-selected .cockpit-workspace__opt-dot { border-color: var(--accent-primary); background: radial-gradient(var(--accent-primary) 45%, transparent 50%); }
.cockpit-workspace__opt-name { font-size: 13px; font-weight: 600; }
.cockpit-workspace__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cockpit-workspace__chip { font-size: 12px; padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-workspace__textarea { width: 100%; font-family: inherit; font-size: 13px; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; background: var(--bg-card); color: var(--text-primary); min-height: 64px; resize: vertical; }
.cockpit-workspace__foot { flex-shrink: 0; padding: 12px 16px; border-top: 1px solid var(--border-color); background: var(--bg-card); display: flex; gap: 8px; }
.cockpit-workspace__btn { font-family: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}
</style>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-workspace.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue tests/client/cockpit-workspace.test.ts
git commit -m "feat(cockpit): add A2UI workspace form (decision, risk tags, opinion)"
```

---

### Task 5: CockpitView 右栏接入 + 种子数据

**Files:**
- Modify: `packages/client/src/views/hermes/CockpitView.vue`

- [ ] **Step 1: Replace right-pane placeholder with CockpitWorkspace**

In `<script setup>`, add import:
```ts
import CockpitWorkspace from '@/components/hermes/cockpit/CockpitWorkspace.vue'
```

In `onMounted`, after P2 seed, append P3 seed:
```ts
  store.workItems = [
    {
      id: 'w1', taskId: '1', decision: 'conditional',
      riskTags: ['concurrency', 'test-gap'], opinion: '建议合并前补充 token 并发刷新用例，其余结构 OK。',
      modifiedFiles: ['refresh.ts', 'token.ts', 'auth.spec.ts'],
    },
  ]
  store.fileTrees = {
    '1': [
      {
        id: 'f1', name: 'src', isDir: true,
        children: [
          { id: 'f2', name: 'refresh.ts', isDir: false, modified: true },
          { id: 'f3', name: 'token.ts', isDir: false, modified: true },
          { id: 'f4', name: 'index.ts', isDir: false, modified: false },
        ],
      },
      { id: 'f5', name: 'tests', isDir: true, children: [{ id: 'f6', name: 'auth.spec.ts', isDir: false, modified: true }] },
      { id: 'f7', name: 'package.json', isDir: false, modified: false },
    ],
  }
```

In template, replace the entire right `<section>` inner (the `.cockpit-col__inner cockpit-placeholder` block) with:
```vue
        <div class="cockpit-col__inner">
          <CockpitWorkspace @submit="() => {}" @later="() => {}" />
        </div>
```

(Keep the `<CockpitColumnRail>` and `<button class="cockpit-collapse-btn">` siblings.)

- [ ] **Step 2: Run all cockpit tests**

Run: `npx vitest run tests/client/cockpit-`
Expected: all PASS.

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -ci "error TS"`
Expected: 0.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/views/hermes/CockpitView.vue
git commit -m "feat(cockpit): wire workspace into right pane with seed data"
```

---

### Task 6: 全量回归

- [ ] **Step 1: Run all cockpit + sidebar tests**

Run: `npx vitest run tests/client/cockpit- tests/client/sidebar-search.test.ts`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: exit 0.

- [ ] **Step 3: Manual smoke** (optional, if dev server available)

Run: `npm run dev:client`, open `http://localhost:8649/#/hermes/cockpit`. Verify:
- Right pane shows workspace form: 待办 banner, 模板提示, modified files, 决定 (3 options, "conditional" selected), 风险标签 chips (concurrency + test-gap active), 评审意见 textarea, footer (稍后/提交)
- Right side of form: file tree with workspace path `~/ws/auth-svc`, src/ + tests/ dirs (clickable to expand), package.json; modified files (refresh.ts etc.) marked `M`
- Switching tasks in left Kanban updates workspace (tasks without work items show empty state) and file tree root path

---

## Self-Review 记录

**Spec 覆盖（P3 范围）**：
- ✅ §5.5 右栏工作区（A2UI 处理表单 + 文件资源管理器水平分栏）→ Tasks 3+4
- ✅ §5.5 文件资源管理器（以任务 workspace 为根、树形、可展开/折叠/选中、修改标记 M）→ Task 3
- ✅ §5.5 A2UI 表单（待办 banner、模板提示、决定、风险标签、意见、底部操作）→ Task 4
- ✅ §6 交互动线（Kanban→store→右栏工作项/文件树联动）→ Task 5
- ✅ §4 Pure Ink + 统一选中态 → 全部 CSS 变量 + `.is-selected`
- ⏭ §5.6 A2UI 模板化（编辑/锁定/复用流水线）→ P6
- ⏭ §5.5 模式切换器（工作项/协作/编程）、协作入口、聊天嵌入 → P4

**占位符扫描**：Task 3 给了多版 CockpitFileNode（含思考过程），执行者用「self-managed expansion」最终版 + 独立 `CockpitFileNode.vue` 文件；`.cockpit-file-node` 样式放 Node 文件而非 Tree 文件。Task 2 zh.ts 需替换 P2 的单行 `workspace`。
**类型一致性**：`WorkItem`/`FileNode`/`WorkDecision` 在 store 定义，组件测试一致；`updateWorkItem`/`toggleRiskTag`/`selectFile` 签名一致。
