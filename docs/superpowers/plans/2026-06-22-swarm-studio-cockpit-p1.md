# AI协作中心 驾驶舱 P1 实施计划（三栏骨架 + Kanban + 注意力条 + 选中联动）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 hermes-studio 中新增 `/hermes/cockpit` 驾驶舱页面，实现 P1：三栏 flex 布局骨架 + 左栏 Kanban（筛选/折叠/优先级排序/分类）+ 注意力条（克制提醒）+ 全局统一选中态与基础联动。

**Architecture:** 新增 `CockpitView.vue` 作为路由组件，内部组合三个聚焦子组件（`CockpitKanban` / `CockpitAttention` / 右栏与中栏占位）。状态用 Pinia store `useCockpitStore` 管理「当前选中任务」，驱动三栏联动。所有样式严格使用 Pure Ink CSS 变量，不引入自定义色值。本阶段中栏与右栏用占位内容，后续 P2/P3 填充。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · naive-ui · vue-router · vitest + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`

---

## 文件结构

每个文件单一职责：

- **Create** `packages/client/src/stores/hermes/cockpit.ts` — Pinia store：选中任务、筛选条件、折叠状态、注意力项
- **Create** `packages/client/src/views/hermes/CockpitView.vue` — 驾驶舱路由组件，三栏布局骨架
- **Create** `packages/client/src/components/hermes/cockpit/CockpitAttention.vue` — 注意力条（克制提醒 + 点击直达）
- **Create** `packages/client/src/components/hermes/cockpit/CockpitKanban.vue` — 左栏 Kanban 统筹（筛选 + 分类 + 任务列表 + 折叠）
- **Create** `packages/client/src/components/hermes/cockpit/CockpitColumnRail.vue` — 通用折叠竖条组件（三列复用）
- **Create** `packages/client/src/styles/cockpit.scss` — 驾驶舱布局/选中态样式（用 Pure Ink 变量）
- **Modify** `packages/client/src/router/index.ts` — 新增 `/hermes/cockpit` 路由，登录默认跳转改为 cockpit
- **Modify** `packages/client/src/components/layout/AppSidebar.vue` — 侧栏顶部加入「驾驶舱」入口
- **Test** `packages/client/src/stores/hermes/__tests__/cockpit.test.ts` — store 逻辑测试
- **Test** `packages/client/src/components/hermes/cockpit/__tests__/CockpitAttention.test.ts`
- **Test** `packages/client/src/components/hermes/cockpit/__tests__/CockpitKanban.test.ts`

---

### Task 1: Cockpit Pinia Store（选中任务 + 筛选 + 折叠 + 注意力项）

**Files:**
- Create: `packages/client/src/stores/hermes/cockpit.ts`
- Test: `packages/client/src/stores/hermes/__tests__/cockpit.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/client/src/stores/hermes/__tests__/cockpit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCockpitStore, type CockpitTask } from '@/stores/hermes/cockpit'

const task = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: 't1',
  title: 'PR #142',
  category: 'human',
  priority: 'P0',
  status: 'review',
  assignee: '@张三',
  workspace: '~/ws/auth-svc',
  ...over,
})

describe('useCockpitStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('selects a task by id and exposes its workspace', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' }), task({ id: 't2', workspace: '~/ws/fe' })]
    s.selectTask('t2')
    expect(s.selectedTaskId).toBe('t2')
    expect(s.selectedTask?.workspace).toBe('~/ws/fe')
  })

  it('sorts tasks by priority desc (P0 before P1)', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 'b', priority: 'P1' }), task({ id: 'a', priority: 'P0' })]
    expect(s.sortedTasks.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('filters by priority, status, category', () => {
    const s = useCockpitStore()
    s.tasks = [
      task({ id: '1', priority: 'P0', status: 'review', category: 'human' }),
      task({ id: '2', priority: 'P1', status: 'blocked', category: 'cluster' }),
    ]
    s.filters = { priorities: ['P0'], statuses: [], categories: [] }
    expect(s.filteredTasks.map((t) => t.id)).toEqual(['1'])
  })

  it('empty filter array means "all" (not "none")', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: '1', priority: 'P0' }), task({ id: '2', priority: 'P2' })]
    s.filters = { priorities: [], statuses: [], categories: [] }
    expect(s.filteredTasks).toHaveLength(2)
  })

  it('toggles a column collapsed state', () => {
    const s = useCockpitStore()
    expect(s.collapsed.left).toBe(false)
    s.toggleCollapsed('left')
    expect(s.collapsed.left).toBe(true)
  })

  it('attention items derive a count', () => {
    const s = useCockpitStore()
    s.attention = [{ id: 'a1', severity: 'high', title: 'x', taskId: 't1' }]
    expect(s.attentionCount).toBe(1)
  })

  it('selectTask clears when id not found', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('nope')
    expect(s.selectedTaskId).toBeNull()
    expect(s.selectedTask).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/client/src/stores/hermes/__tests__/cockpit.test.ts`
Expected: FAIL — module `@/stores/hermes/cockpit` not found.

- [ ] **Step 3: Write minimal implementation**

`packages/client/src/stores/hermes/cockpit.ts`:

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type CockpitCategory = 'human' | 'cluster' | 'direct'
export type CockpitPriority = 'P0' | 'P1' | 'P2' | 'P3'
export type CockpitStatus =
  | 'triage' | 'todo' | 'running' | 'blocked' | 'review' | 'done' | 'archived'

export interface CockpitTask {
  id: string
  title: string
  category: CockpitCategory
  priority: CockpitPriority
  status: CockpitStatus
  assignee: string
  workspace: string
}

export type AttentionSeverity = 'high' | 'medium' | 'low'

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  title: string
  taskId: string
}

export interface CockpitFilters {
  priorities: CockpitPriority[]
  statuses: CockpitStatus[]
  categories: CockpitCategory[]
}

export type ColumnKey = 'left' | 'mid' | 'right'

const PRIORITY_ORDER: Record<CockpitPriority, number> = {
  P0: 0, P1: 1, P2: 2, P3: 3,
}

export const useCockpitStore = defineStore('cockpit', () => {
  const tasks = ref<CockpitTask[]>([])
  const selectedTaskId = ref<string | null>(null)
  const filters = ref<CockpitFilters>({ priorities: [], statuses: [], categories: [] })
  const collapsed = ref<Record<ColumnKey, boolean>>({ left: false, mid: false, right: false })
  const attention = ref<AttentionItem[]>([])

  const selectedTask = computed(
    () => tasks.value.find((t) => t.id === selectedTaskId.value) ?? null,
  )

  const sortedTasks = computed(() =>
    [...tasks.value].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    ),
  )

  const filteredTasks = computed(() =>
    sortedTasks.value.filter((t) => {
      const f = filters.value
      const ok = <T,>(arr: T[], v: T) => arr.length === 0 || arr.includes(v)
      return (
        ok(f.priorities, t.priority) && ok(f.statuses, t.status) && ok(f.categories, t.category)
      )
    }),
  )

  const tasksByCategory = computed(() => ({
    human: filteredTasks.value.filter((t) => t.category === 'human'),
    cluster: filteredTasks.value.filter((t) => t.category === 'cluster'),
    direct: filteredTasks.value.filter((t) => t.category === 'direct'),
  }))

  const attentionCount = computed(() => attention.value.length)

  function selectTask(id: string | null) {
    selectedTaskId.value = tasks.value.some((t) => t.id === id) ? id : null
  }
  function toggleCollapsed(col: ColumnKey) {
    collapsed.value[col] = !collapsed.value[col]
  }
  function toggleFilter<K extends keyof CockpitFilters>(
    key: K,
    value: CockpitFilters[K][number],
  ) {
    const arr = filters.value[key] as CockpitFilters[K][number][]
    const i = arr.indexOf(value)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(value)
  }

  return {
    tasks, selectedTaskId, filters, collapsed, attention,
    selectedTask, sortedTasks, filteredTasks, tasksByCategory, attentionCount,
    selectTask, toggleCollapsed, toggleFilter,
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/client/src/stores/hermes/__tests__/cockpit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/hermes/cockpit.ts packages/client/src/stores/hermes/__tests__/cockpit.test.ts
git commit -m "feat(cockpit): add cockpit pinia store with selection, filters, collapse"
```

---

### Task 2: 全局选中态与三栏布局样式

**Files:**
- Create: `packages/client/src/styles/cockpit.scss`

- [ ] **Step 1: Write the layout + selection styles**

`packages/client/src/styles/cockpit.scss`:

```scss
// 驾驶舱样式 · Pure Ink（仅用 CSS 变量，无自定义色值）
// 统一选中态语言：左侧 3px 色条 + 浅底
// 间距：8 倍数 4/8/12/16/24/32；圆角 6/8/12

.cockpit {
  height: calc(100 * var(--vh, 1vh));
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

.cockpit__body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

// ── 三列通用 ──
.cockpit-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
  transition: flex-basis 0.2s ease;

  &--left { flex: 0 0 220px; border-right: 1px solid var(--border-color); background: var(--bg-sidebar); }
  &--mid { flex: 0 0 340px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
  &--right { flex: 1 1 0; min-width: 360px; background: var(--bg-sidebar); }

  &.is-collapsed { flex: 0 0 32px; }
  &.is-collapsed .cockpit-col__inner { display: none; }
}

.cockpit-col__inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

// 折叠竖条（贴边）
.cockpit-rail {
  display: none;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 10px;
  cursor: pointer;
  width: 100%;
  & .cockpit-rail__label {
    writing-mode: vertical-rl;
    letter-spacing: 2px;
    font-size: 11px;
    color: var(--text-muted);
  }
  &:hover .cockpit-rail__label { color: var(--text-primary); }
}
.is-collapsed .cockpit-rail { display: flex; }

// 折叠按钮（列内侧边缘）
.cockpit-collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 14px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 9px;
  color: var(--text-muted);
  border-radius: 3px;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}

// ── 统一选中态（左色条 + 浅底）──
.cockpit-sel-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-primary);
  display: none;
}
.is-selected .cockpit-sel-bar { display: block; }
.is-selected { background: var(--bg-secondary); }
```

- [ ] **Step 2: Verify it compiles (no test — pure styles)**

Run: `npx vue-tsc --noEmit -p packages/client/tsconfig.json 2>&1 | head -20`
Expected: No errors referencing cockpit.scss.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/styles/cockpit.scss
git commit -m "feat(cockpit): add layout and unified selection styles"
```

---

### Task 3: CockpitColumnRail 折叠竖条组件

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitColumnRail.vue`

- [ ] **Step 1: Write the component**

`packages/client/src/components/hermes/cockpit/CockpitColumnRail.vue`:

```vue
<script setup lang="ts">
defineProps<{ label: string }>()
defineEmits<{ (e: 'expand'): void }>()
</script>

<template>
  <div class="cockpit-rail" role="button" tabindex="0"
       @click="$emit('expand')" @keydown.enter="$emit('expand')">
    <span class="cockpit-rail__label">{{ label }}</span>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitColumnRail.vue
git commit -m "feat(cockpit): add collapsible column rail component"
```

---

### Task 4: CockpitAttention 注意力条组件（克制提醒 + 点击直达）

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitAttention.vue`
- Test: `packages/client/src/components/hermes/cockpit/__tests__/CockpitAttention.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/client/src/components/hermes/cockpit/__tests__/CockpitAttention.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitAttention from '@/components/hermes/cockpit/CockpitAttention.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

describe('CockpitAttention', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders count badge from store', () => {
    const s = useCockpitStore()
    s.attention = [
      { id: 'a1', severity: 'high', title: 'PR 风险', taskId: 't1' },
      { id: 'a2', severity: 'medium', title: '集群提问', taskId: 't2' },
    ]
    const w = mount(CockpitAttention)
    expect(w.text()).toContain('2')
    expect(w.text()).toContain('需要你')
  })

  it('clicking an item selects its task in the store', async () => {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.attention = [{ id: 'a1', severity: 'high', title: 'PR 风险', taskId: 't1' }]
    const w = mount(CockpitAttention)
    await w.find('.cockpit-attention__item').trigger('click')
    expect(s.selectedTaskId).toBe('t1')
  })

  it('applies severity class to the left bar', () => {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.attention = [{ id: 'a1', severity: 'high', title: 'x', taskId: 't1' }]
    const w = mount(CockpitAttention)
    expect(w.find('.cockpit-attention__item').classes()).toContain('is-high')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/client/src/components/hermes/cockpit/__tests__/CockpitAttention.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

`packages/client/src/components/hermes/cockpit/CockpitAttention.vue`:

```vue
<script setup lang="ts">
import { useCockpitStore } from '@/stores/hermes/cockpit'

const store = useCockpitStore()

function handleClick(taskId: string) {
  store.selectTask(taskId)
}
</script>

<template>
  <div class="cockpit-attention">
    <div class="cockpit-attention__label">
      <span class="cockpit-attention__count">{{ store.attentionCount }}</span>
      <span class="cockpit-attention__label-text">需要你</span>
    </div>
    <div class="cockpit-attention__items">
      <button
        v-for="item in store.attention"
        :key="item.id"
        type="button"
        class="cockpit-attention__item"
        :class="['is-' + item.severity]"
        @click="handleClick(item.taskId)"
      >
        <span class="cockpit-attention__sev-bar" />
        <span class="cockpit-attention__text">{{ item.title }}</span>
        <span class="cockpit-attention__arrow">→</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-attention {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
.cockpit-attention__label {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-right: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.cockpit-attention__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--accent-primary);
  color: var(--text-on-accent);
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
}
.cockpit-attention__items {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.cockpit-attention__item {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  transition: background 0.12s, border-color 0.12s;
  &:hover { background: var(--bg-card-hover); border-color: var(--border-color); }
  &.is-high { font-weight: 600; }
}
.cockpit-attention__sev-bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--text-muted);
  flex-shrink: 0;
}
.is-high .cockpit-attention__sev-bar { background: var(--error); }
.is-medium .cockpit-attention__sev-bar { background: var(--warning); }
.cockpit-attention__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.cockpit-attention__arrow { font-size: 10px; color: var(--text-muted); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/client/src/components/hermes/cockpit/__tests__/CockpitAttention.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitAttention.vue packages/client/src/components/hermes/cockpit/__tests__/CockpitAttention.test.ts
git commit -m "feat(cockpit): add restraint attention bar with click-to-select"
```

---

### Task 5: CockpitKanban 左栏组件（筛选 + 分类 + 优先级排序 + 折叠）

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitKanban.vue`
- Test: `packages/client/src/components/hermes/cockpit/__tests__/CockpitKanban.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/client/src/components/hermes/cockpit/__tests__/CockpitKanban.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitKanban from '@/components/hermes/cockpit/CockpitKanban.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

describe('CockpitKanban', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [
      { id: '1', title: 'PR #142', category: 'human', priority: 'P0', status: 'review', assignee: '@张三', workspace: '~/ws/a' },
      { id: '2', title: '联调', category: 'human', priority: 'P1', status: 'blocked', assignee: '@李四', workspace: '~/ws/b' },
      { id: '3', title: '发版', category: 'cluster', priority: 'P1', status: 'running', assignee: 'arch', workspace: '~/ws/c' },
    ]
    return s
  }

  it('groups tasks by category under category headers', () => {
    seed()
    const w = mount(CockpitKanban)
    const cats = w.findAll('.cockpit-kanban__cat')
    expect(cats.length).toBe(3)
  })

  it('renders P0 task with is-p0 class and bold', () => {
    seed()
    const w = mount(CockpitKanban)
    const t = w.find('[data-task-id="1"]')
    expect(t.classes()).toContain('is-p0')
  })

  it('clicking a task selects it in the store', async () => {
    seed()
    const w = mount(CockpitKanban)
    await w.find('[data-task-id="2"]').trigger('click')
    const s = useCockpitStore()
    expect(s.selectedTaskId).toBe('2')
  })

  it('clicking a priority filter chip toggles the filter', async () => {
    const s = seed()
    const w = mount(CockpitKanban)
    await w.find('[data-filter="P0"]').trigger('click')
    expect(s.filters.priorities).toContain('P0')
    await w.find('[data-filter="P0"]').trigger('click')
    expect(s.filters.priorities).not.toContain('P0')
  })

  it('filtering by P1 hides the P0 task', async () => {
    const s = seed()
    const w = mount(CockpitKanban)
    await w.find('[data-filter="P1"]').trigger('click')
    expect(w.find('[data-task-id="1"]').exists()).toBe(false)
    expect(w.find('[data-task-id="2"]').exists()).toBe(true)
  })

  it('emit collapse when collapse button clicked', async () => {
    seed()
    const w = mount(CockpitKanban)
    await w.find('.cockpit-collapse-btn').trigger('click')
    expect(w.emitted('collapse')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/client/src/components/hermes/cockpit/__tests__/CockpitKanban.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

`packages/client/src/components/hermes/cockpit/CockpitKanban.vue`:

```vue
<script setup lang="ts">
import { useCockpitStore, type CockpitCategory, type CockpitPriority, type CockpitStatus } from '@/stores/hermes/cockpit'

const store = useCockpitStore()
defineEmits<{ (e: 'collapse'): void }>()

const categories: { key: CockpitCategory; label: string; mark: string }[] = [
  { key: 'human', label: '人类协作', mark: 'mk-solid-bold' },
  { key: 'cluster', label: 'Agent 集群', mark: 'mk-solid-thin' },
  { key: 'direct', label: '人机 1:1', mark: 'mk-dotted' },
]
const priorities: CockpitPriority[] = ['P0', 'P1', 'P2', 'P3']
const statuses: { key: CockpitStatus; label: string }[] = [
  { key: 'review', label: '待审' },
  { key: 'blocked', label: '阻塞' },
  { key: 'running', label: '进行中' },
  { key: 'todo', label: '待办' },
  { key: 'done', label: '完成' },
]
const cats = ['human', 'cluster', 'direct'] as const
</script>

<template>
  <div class="cockpit-kanban">
    <div class="cockpit-collapse-btn" @click="$emit('collapse')">◀</div>
    <div class="cockpit-kanban__head">
      <span class="cockpit-kanban__title">Kanban 统筹</span>
      <span class="cockpit-kanban__sort">↓ 优先级</span>
    </div>

    <!-- 筛选器 -->
    <div class="cockpit-kanban__filters">
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">优先</span>
        <button v-for="p in priorities" :key="p" type="button" :data-filter="p"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.priorities.includes(p) }"
          @click="store.toggleFilter('priorities', p)">{{ p }}</button>
      </div>
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">状态</span>
        <button v-for="st in statuses" :key="st.key" type="button" :data-filter="st.key"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.statuses.includes(st.key) }"
          @click="store.toggleFilter('statuses', st.key)">{{ st.label }}</button>
      </div>
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">类别</span>
        <button v-for="c in categories" :key="c.key" type="button" :data-filter="c.key"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.categories.includes(c.key) }"
          @click="store.toggleFilter('categories', c.key)">{{ c.label }}</button>
      </div>
    </div>

    <!-- 任务列表 -->
    <div class="cockpit-kanban__list">
      <div v-for="c in categories" :key="c.key" class="cockpit-kanban__cat">
        <div class="cockpit-kanban__cat-head">
          <span class="cockpit-kanban__cat-mark" :class="c.mark" />
          {{ c.label }}
          <span class="cockpit-kanban__cat-count">{{ store.tasksByCategory[c.key].length }}</span>
        </div>
        <div v-for="t in store.tasksByCategory[c.key]" :key="t.id"
          :data-task-id="t.id"
          class="cockpit-kanban__task"
          :class="['is-' + t.priority.toLowerCase(), { 'is-selected': store.selectedTaskId === t.id }]"
          @click="store.selectTask(t.id)">
          <span class="cockpit-sel-bar" />
          <span class="cockpit-kanban__pri">{{ t.priority }}</span>
          <div class="cockpit-kanban__tt">{{ t.title }}</div>
          <div class="cockpit-kanban__meta">
            <span class="cockpit-kanban__stg" :class="{ 'is-blocked': t.status === 'blocked', 'is-review': t.status === 'review' }">
              {{ t.status }}
            </span>
            <span class="cockpit-kanban__who">{{ t.assignee }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-kanban { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cockpit-kanban__head {
  padding: 12px 16px 8px; border-bottom: 1px solid var(--border-light);
  display: flex; justify-content: space-between; align-items: baseline;
}
.cockpit-kanban__title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.cockpit-kanban__sort { font-size: 10px; color: var(--text-muted); }
.cockpit-kanban__filters { padding: 8px 12px; border-bottom: 1px solid var(--border-light); display: flex; flex-direction: column; gap: 5px; }
.cockpit-kanban__frow { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.cockpit-kanban__flabel { font-size: 9px; color: var(--text-muted); width: 30px; flex-shrink: 0; font-weight: 600; text-transform: uppercase; }
.cockpit-kanban__tag {
  font-size: 10px; padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-kanban__list { flex: 1; overflow-y: auto; padding: 8px; }
.cockpit-kanban__cat { margin-bottom: 8px; }
.cockpit-kanban__cat-head {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px;
}
.cockpit-kanban__cat-mark { width: 10px; height: 2px; background: var(--text-secondary); }
.mk-solid-bold { background: var(--accent-primary); }
.mk-solid-thin { background: var(--text-muted); height: 2px; }
.mk-dotted { background: transparent; border-bottom: 2px dotted var(--text-muted); }
.cockpit-kanban__cat-count { font-size: 9px; color: var(--text-muted); margin-left: auto; background: var(--bg-secondary); border-radius: 8px; padding: 0 6px; font-weight: 400; text-transform: none; }

.cockpit-kanban__task {
  position: relative; padding: 8px 10px 8px 14px; border-radius: 6px; cursor: pointer; margin-bottom: 3px;
  &:hover { background: var(--bg-card-hover); }
}
.cockpit-kanban__pri { position: absolute; top: 8px; right: 10px; font-size: 9px; font-weight: 700; color: var(--text-muted); font-family: monospace; }
.is-p0 .cockpit-kanban__pri { color: var(--text-primary); }
.is-p0 .cockpit-kanban__tt { font-weight: 700; color: var(--text-primary); }
.is-p1 .cockpit-kanban__tt { font-weight: 600; }
.cockpit-kanban__tt { font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 4px; padding-right: 24px; }
.cockpit-kanban__meta { display: flex; align-items: center; gap: 6px; }
.cockpit-kanban__stg { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary); }
.cockpit-kanban__stg.is-blocked { color: var(--error); background: rgba(var(--error-rgb), 0.08); }
.cockpit-kanban__stg.is-review { font-weight: 600; color: var(--text-primary); }
.cockpit-kanban__who { font-size: 10px; color: var(--text-muted); margin-left: auto; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/client/src/components/hermes/cockpit/__tests__/CockpitKanban.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitKanban.vue packages/client/src/components/hermes/cockpit/__tests__/CockpitKanban.test.ts
git commit -m "feat(cockpit): add kanban pane with filters, categories, priority sort"
```

---

### Task 6: CockpitView 三栏布局骨架组件

**Files:**
- Create: `packages/client/src/views/hermes/CockpitView.vue`

- [ ] **Step 1: Write the view**

`packages/client/src/views/hermes/CockpitView.vue`:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'
import CockpitAttention from '@/components/hermes/cockpit/CockpitAttention.vue'
import CockpitKanban from '@/components/hermes/cockpit/CockpitKanban.vue'
import CockpitColumnRail from '@/components/hermes/cockpit/CockpitColumnRail.vue'

const store = useCockpitStore()

// 种子数据（P1 占位；后续接入 kanban API）
onMounted(() => {
  store.tasks = [
    { id: '1', title: 'PR #142 · 重构 auth', category: 'human', priority: 'P0', status: 'review', assignee: '@张三', workspace: '~/ws/auth-svc' },
    { id: '2', title: '前端联调 auth', category: 'human', priority: 'P1', status: 'blocked', assignee: '@李四', workspace: '~/ws/web-fe' },
    { id: '3', title: 'API 文档补全', category: 'human', priority: 'P1', status: 'running', assignee: '@王五', workspace: '~/ws/api-docs' },
    { id: '4', title: '发版方案评估', category: 'cluster', priority: 'P1', status: 'running', assignee: 'arch/qa', workspace: '~/ws/platform' },
    { id: '5', title: '部署架构选型', category: 'cluster', priority: 'P2', status: 'triage', assignee: 'arch', workspace: '~/ws/platform' },
    { id: '6', title: 'cli-helper · 迁移脚本', category: 'direct', priority: 'P1', status: 'todo', assignee: '你↔cli', workspace: '~/ws/db-mig' },
  ]
  store.attention = [
    { id: 'a1', severity: 'high', title: 'PR #142 · review 标风险', taskId: '1' },
    { id: 'a2', severity: 'medium', title: '集群提问：阻塞发版？', taskId: '4' },
    { id: 'a3', severity: 'low', title: '前端联调 · 等接口', taskId: '2' },
  ]
  store.selectTask('1')
})
</script>

<template>
  <div class="cockpit">
    <CockpitAttention />

    <div class="cockpit__body">
      <!-- 左栏 Kanban -->
      <section class="cockpit-col cockpit-col--left" :class="{ 'is-collapsed': store.collapsed.left }">
        <CockpitColumnRail label="KANBAN" @expand="store.toggleCollapsed('left')" />
        <div class="cockpit-col__inner">
          <CockpitKanban @collapse="store.toggleCollapsed('left')" />
        </div>
      </section>

      <!-- 中栏 占位（P2 填充） -->
      <section class="cockpit-col cockpit-col--mid" :class="{ 'is-collapsed': store.collapsed.mid }">
        <CockpitColumnRail label="协作 · 时序" @expand="store.toggleCollapsed('mid')" />
        <span class="cockpit-collapse-btn" @click="store.toggleCollapsed('mid')">◀</span>
        <div class="cockpit-col__inner cockpit-placeholder">
          <p>中栏 · 协作图 + 时序流（P2 实现）</p>
          <p v-if="store.selectedTask">当前任务：{{ store.selectedTask.title }}</p>
          <p v-else>未选中任务</p>
        </div>
      </section>

      <!-- 右栏 占位（P3 填充） -->
      <section class="cockpit-col cockpit-col--right" :class="{ 'is-collapsed': store.collapsed.right }">
        <CockpitColumnRail label="工作区" @expand="store.toggleCollapsed('right')" />
        <span class="cockpit-collapse-btn" @click="store.toggleCollapsed('right')">▶</span>
        <div class="cockpit-col__inner cockpit-placeholder">
          <p>右栏 · A2UI 工作区（P3 实现）</p>
          <p v-if="store.selectedTask">Workspace：{{ store.selectedTask.workspace }}</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: var(--text-muted); font-size: 12px;
}
</style>
```

- [ ] **Step 2: Verify type-check**

Run: `npx vue-tsc --noEmit -p packages/client/tsconfig.json 2>&1 | grep -i cockpit | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/views/hermes/CockpitView.vue
git commit -m "feat(cockpit): add cockpit view with 3-column layout skeleton"
```

---

### Task 7: 注册路由 + 登录默认跳转改为驾驶舱

**Files:**
- Modify: `packages/client/src/router/index.ts`

- [ ] **Step 1: Add the route and change default redirect**

In `packages/client/src/router/index.ts`, add the cockpit route before `hermes.chat` (line ~14), and change the two `next({ path: '/hermes/chat' })` / `next({ name: 'hermes.chat' })` defaults to cockpit.

Add route after the `'/'` login route:

```ts
    {
      path: '/hermes/cockpit',
      name: 'hermes.cockpit',
      component: () => import('@/views/hermes/CockpitView.vue'),
    },
```

Change the login-skip redirect (around line 161) from:
```ts
      next({ path: '/hermes/chat' })
```
to:
```ts
      next({ path: '/hermes/cockpit' })
```

Change the superadmin guard fallback (around line 175) from:
```ts
    next({ name: 'hermes.chat' })
```
to:
```ts
    next({ name: 'hermes.cockpit' })
```

- [ ] **Step 2: Verify type-check & build**

Run: `npx vue-tsc --noEmit -p packages/client/tsconfig.json 2>&1 | tail -5`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/router/index.ts
git commit -m "feat(cockpit): register /hermes/cockpit route as default landing"
```

---

### Task 8: AppSidebar 加入驾驶舱入口

**Files:**
- Modify: `packages/client/src/components/layout/AppSidebar.vue`

- [ ] **Step 1: Add cockpit nav entry at the top of the sidebar**

Open `packages/client/src/components/layout/AppSidebar.vue`. At the top of the first nav group (before the existing "Agent" group items), add a cockpit entry that routes to `hermes.cockpit`. Follow the existing nav-item pattern (same component/classes as other items).

Add this nav item as the first item:

```vue
<AppSidebarItem :to="{ name: 'hermes.cockpit' }" icon="grid" label="驾驶舱" />
```

(Use the same `AppSidebarItem` / icon naming convention as existing items in the file — if the component uses a different prop name like `:icon-name`, match it.)

- [ ] **Step 2: Verify it renders without error**

Run: `npx vue-tsc --noEmit -p packages/client/tsconfig.json 2>&1 | tail -5`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/layout/AppSidebar.vue
git commit -m "feat(cockpit): add cockpit entry to app sidebar"
```

---

### Task 9: 导入 cockpit 样式 + 全量回归

**Files:**
- Modify: `packages/client/src/main.ts` (or the global styles entry point)

- [ ] **Step 1: Import the cockpit styles globally**

Find the global style entry (e.g., `packages/client/src/main.ts` or `styles/index.scss`). Add:

```ts
import '@/styles/cockpit.scss'
```

(Place it alongside other global style imports. If styles are aggregated in a scss file, add `@use './cockpit.scss';` there instead.)

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS (including the 16 new cockpit tests).

- [ ] **Step 3: Run type-check**

Run: `npx vue-tsc --noEmit -p packages/client/tsconfig.json`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev:client`
Open: `http://localhost:8649/#/hermes/cockpit`
Verify:
- Three columns render (Kanban left, placeholders mid/right)
- Attention bar shows "3 需要你" with 3 items
- Clicking an attention item selects the matching Kanban task (left bar appears)
- Clicking a Kanban task selects it (placeholder shows its title/workspace)
- Filter chips toggle and filter the task list
- Clicking a column's collapse button collapses it to a rail; clicking the rail expands it

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/main.ts
git commit -m "feat(cockpit): wire up global styles and complete P1 skeleton"
```

---

## Self-Review 记录

**Spec 覆盖检查（P1 范围）**：
- ✅ §3 整体布局（三列 flex）→ Task 2 + Task 6
- ✅ §4.1 配色 Pure Ink → 所有组件用 CSS 变量
- ✅ §4.2 非颜色维度区分（类别线条/优先级字重/状态标签）→ Task 5
- ✅ §4.3 统一选中态 → Task 2 (.cockpit-sel-bar) + Task 5
- ✅ §5.1 顶栏（P1 仅路由，完整顶栏留后续）→ 部分覆盖（路由注册）
- ✅ §5.2 注意力条克制提醒 + 点击直达 → Task 4
- ✅ §5.3 左栏 Kanban（筛选/分类/优先级/折叠）→ Task 5
- ✅ §5.7 三列折叠机制 → Task 2 + Task 6 + store.toggleCollapsed
- ✅ §6 交互动线（选中联动）→ store.selectTask 驱动
- ⏭ §5.4 协作图/时序、§5.5 右栏、§5.6 A2UI、§5.8 历史 → 明确标注为 P2-P5，不在本计划

**占位符扫描**：无 TBD/TODO；每个代码步骤都含完整代码。
**类型一致性**：`CockpitTask`/`AttentionItem`/`CockpitFilters`/`ColumnKey` 在 store 定义，组件与测试一致引用；`selectTask`/`toggleCollapsed`/`toggleFilter` 签名跨任务一致。

**P1 边界清晰**：产出可独立运行、可测试的驾驶舱骨架，中栏/右栏用占位，不阻塞后续阶段。
