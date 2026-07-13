# AI协作中心 驾驶舱 P2 实施计划（中栏：协作图 + 时序事件流）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实的中栏组件替换 P1 占位：①协作图（应用级关联拓扑，可拖拽、多层级切换）+ ②时序事件流（纵向时间线、折叠历史、突出当前节点、点击节点切右栏）。两者随 P1 的 `useCockpitStore.selectedTask` 联动。

**Architecture:** 在 `useCockpitStore` 增加事件与拓扑的派生 state（P2 阶段先用内存种子数据，P5 接入 Kanban event API）。新增三个组件：`CockpitCollabMap`（协作图）、`CockpitTimeline`（时序流）、`CockpitGraphNode`（拓扑节点，复用于多层级）。`CockpitView` 的中栏占位替换为这两个组件。所有样式继续 Pure Ink，复用 P1 已定义的 `.cockpit-sel-bar` / `.is-selected` 选中态语言。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · naive-ui（仅必要时）· vitest + @vue/test-utils · SVG（拓扑连线，无重型图库）

**Spec:** `docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.4 协作图 + 时序流、§6 交互动线）
**前置：** P1 已合并到 `feat/cockpit-p1` 分支。

---

## 文件结构

- **Modify** `packages/client/src/stores/hermes/cockpit.ts` — 新增事件/拓扑/层级的 state + getters + 选中时序节点
- **Create** `packages/client/src/components/hermes/cockpit/CockpitGraphNode.vue` — 拓扑节点（可拖拽、统一选中态）
- **Create** `packages/client/src/components/hermes/cockpit/CockpitCollabMap.vue` — 协作图（层级 tab + SVG 画布 + 节点连线）
- **Create** `packages/client/src/components/hermes/cockpit/CockpitTimeline.vue` — 时序事件流（折叠历史 + 当前突出 + 节点点击）
- **Modify** `packages/client/src/views/hermes/CockpitView.vue` — 中栏占位 → 真实组件
- **Modify** `packages/client/src/styles/cockpit.scss` — 中栏画布/时序样式
- **Modify** `packages/client/src/i18n/locales/en.ts` + `zh.ts` — 中栏文案 i18n 键
- **Test** `tests/client/cockpit-store.test.ts` — 补事件/拓扑/层级的 store 测试
- **Test** `tests/client/cockpit-collab-map.test.ts`
- **Test** `tests/client/cockpit-timeline.test.ts`

---

### Task 1: Store 扩展 — 时序事件 + 拓扑 + 层级

**Files:**
- Modify: `packages/client/src/stores/hermes/cockpit.ts`
- Test: `tests/client/cockpit-store.test.ts`

- [ ] **Step 1: Add failing tests to `tests/client/cockpit-store.test.ts`**

在现有 describe 块内追加这些 case：

```ts
  it('selects a timeline node by id', () => {
    const s = useCockpitStore()
    s.events = [
      { id: 'e1', taskId: 't1', actor: 'review-agent', kind: 'A2A', what: '委派', when: '14:36', pending: true, ts: 1739 },
      { id: 'e2', taskId: 't1', actor: 'qa-agent', kind: 'A2H', what: '写用例', when: '14:40', pending: false, ts: 1740 },
    ]
    s.selectTimelineNode('e2')
    expect(s.selectedTimelineNodeId).toBe('e2')
    expect(s.selectedTimelineNode?.what).toBe('写用例')
  })

  it('eventsForSelectedTask filters by selected task id', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.events = [
      { id: 'e1', taskId: 't1', actor: 'a', kind: 'A2H', what: 'x', when: '14:00', pending: false, ts: 1 },
      { id: 'e2', taskId: 't2', actor: 'b', kind: 'A2A', what: 'y', when: '14:01', pending: false, ts: 2 },
    ]
    expect(s.eventsForSelectedTask.map((e) => e.id)).toEqual(['e1'])
  })

  it('topologyForTask returns app-level nodes by default', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1', workspace: '~/ws/auth-svc' })]
    s.selectTask('t1')
    s.appTopology = [
      { id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true },
      { id: 'n2', taskId: 't1', label: 'auth.spec', kind: 'file', focus: false },
    ]
    const topo = s.topologyForSelectedTask
    expect(topo.level).toBe('app')
    expect(topo.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
  })

  it('switching topology level changes returned nodes', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.appTopology = [{ id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true }]
    s.reqTopology = [{ id: 'r1', taskId: 't1', label: '认证重构', kind: 'req', focus: true }]
    s.projTopology = [{ id: 'p1', taskId: 't1', label: 'auth-platform', kind: 'project', focus: true }]
    s.topologyLevel = 'req'
    expect(s.topologyForSelectedTask.nodes[0].id).toBe('r1')
    s.topologyLevel = 'project'
    expect(s.topologyForSelectedTask.nodes[0].id).toBe('p1')
  })

  it('selecting a graph node sets selectedGraphNodeIds for that task', () => {
    const s = useCockpitStore()
    s.appTopology = [{ id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true }]
    s.toggleGraphNode('t1', 'n1')
    expect(s.selectedGraphNodeIds['t1']).toContain('n1')
    s.toggleGraphNode('t1', 'n1')
    expect(s.selectedGraphNodeIds['t1']).not.toContain('n1')
  })

  it('collapses older timeline events into a fold when more than threshold', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    const now = 100
    s.events = Array.from({ length: 6 }, (_, i) => ({
      id: 'e' + i, taskId: 't1', actor: 'a', kind: 'A2H', what: 'x' + i, when: '1' + i, pending: false, ts: i,
    }))
    // threshold 4 → 2 folded (oldest), 4 visible
    const recent = s.recentEventsForSelectedTask(4)
    expect(recent.visible.map((e) => e.id)).toEqual(['e2', 'e3', 'e4', 'e5'])
    expect(recent.folded.length).toBe(2)
    expect(recent.folded.map((e) => e.id)).toEqual(['e0', 'e1'])
  })
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: FAIL — new properties/methods don't exist.

- [ ] **Step 3: Extend the store**

In `packages/client/src/stores/hermes/cockpit.ts`, add types, state, getters, methods. Place new types after existing ones:

```ts
// ── P2: 时序事件 & 拓扑 ──
export interface CockpitEvent {
  id: string
  taskId: string
  actor: string
  kind: 'A2H' | 'A2A'
  what: string
  when: string
  pending: boolean
  ts: number
}

export type TopologyLevel = 'project' | 'req' | 'app'
export type GraphNodeKind = 'project' | 'req' | 'file' | 'test'

export interface GraphNode {
  id: string
  taskId: string
  label: string
  kind: GraphNodeKind
  focus: boolean
  /** 连线目标节点 id 列表（无向，由调用方去重） */
  links?: string[]
}
```

Inside the `defineStore` setup body, add (after existing refs/computed):

```ts
  // ── P2 state ──
  const events = ref<CockpitEvent[]>([])
  const selectedTimelineNodeId = ref<string | null>(null)
  const topologyLevel = ref<TopologyLevel>('app')
  const appTopology = ref<GraphNode[]>([])
  const reqTopology = ref<GraphNode[]>([])
  const projTopology = ref<GraphNode[]>([])
  /** 按 taskId 记录用户选中的图节点（多选） */
  const selectedGraphNodeIds = ref<Record<string, string[]>>({})

  // ── P2 getters ──
  const selectedTimelineNode = computed(
    () => events.value.find((e) => e.id === selectedTimelineNodeId.value) ?? null,
  )

  const eventsForSelectedTask = computed(() =>
    selectedTaskId.value
      ? events.value
          .filter((e) => e.taskId === selectedTaskId.value)
          .sort((a, b) => a.ts - b.ts)
      : [],
  )

  const topologyForSelectedTask = computed(() => {
    const level = topologyLevel.value
    const pool =
      level === 'project' ? projTopology.value : level === 'req' ? reqTopology.value : appTopology.value
    const nodes = selectedTaskId.value
      ? pool.filter((n) => n.taskId === selectedTaskId.value)
      : []
    return { level, nodes }
  })

  function recentEventsForSelectedTask(threshold: number) {
    const all = eventsForSelectedTask.value
    if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
    return { visible: all.slice(all.length - threshold), folded: all.slice(0, all.length - threshold) }
  }

  // ── P2 methods ──
  function selectTimelineNode(id: string | null) {
    selectedTimelineNodeId.value = events.value.some((e) => e.id === id) ? id : null
  }
  function toggleGraphNode(taskId: string, nodeId: string) {
    const cur = selectedGraphNodeIds.value[taskId] ?? []
    const i = cur.indexOf(nodeId)
    if (i >= 0) cur.splice(i, 1)
    else cur.push(nodeId)
    selectedGraphNodeIds.value = { ...selectedGraphNodeIds.value, [taskId]: cur }
  }
  function setTopologyLevel(level: TopologyLevel) {
    topologyLevel.value = level
  }
```

Add these to the returned object:
```ts
    events, selectedTimelineNodeId, topologyLevel, appTopology, reqTopology, projTopology, selectedGraphNodeIds,
    selectedTimelineNode, eventsForSelectedTask, topologyForSelectedTask, recentEventsForSelectedTask,
    selectTimelineNode, toggleGraphNode, setTopologyLevel,
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: PASS (15 tests — 9 original + 6 new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/hermes/cockpit.ts tests/client/cockpit-store.test.ts
git commit -m "feat(cockpit): extend store with events, topology, timeline selection"
```

---

### Task 2: i18n keys for 中栏

**Files:**
- Modify: `packages/client/src/i18n/locales/en.ts`
- Modify: `packages/client/src/i18n/locales/zh.ts`

- [ ] **Step 1: Add a cockpit namespace to both locales**

In `en.ts`, inside the existing default export object (find a logical spot, e.g. after the `sidebar` block or at the top level alongside `sidebar`), add a `cockpit` namespace:

```ts
  cockpit: {
    attention: 'Needs you',
    kanban: 'Kanban Hub',
    sortByPriority: 'By priority',
    priority: 'Priority',
    status: 'Status',
    category: 'Category',
    collaborationMap: 'Collaboration Map',
    timeline: 'Timeline',
    levelProject: 'Project',
    levelRequirement: 'Requirement',
    levelApp: 'Application',
    olderHistory: '{n} older events',
    foldExpand: 'Show',
    current: 'Current',
    pending: 'Pending',
    done: 'Done',
    midPlaceholder: 'Mid: collaboration map + timeline (P2)',
    rightPlaceholder: 'Right: A2UI workspace (P3)',
    noTaskSelected: 'No task selected',
    currentTask: 'Current task',
    workspace: 'Workspace',
  },
```

In `zh.ts`, mirror with Chinese:

```ts
  cockpit: {
    attention: '需要你',
    kanban: 'Kanban 统筹',
    sortByPriority: '按优先级',
    priority: '优先',
    status: '状态',
    category: '类别',
    collaborationMap: '协作图',
    timeline: '时序事件流',
    levelProject: '项目级',
    levelRequirement: '需求级',
    levelApp: '应用级',
    olderHistory: '{n} 条较早历史',
    foldExpand: '展开',
    current: '当前',
    pending: '待办',
    done: '已办',
    midPlaceholder: '中栏 · 协作图 + 时序流（P2 实现）',
    rightPlaceholder: '右栏 · A2UI 工作区（P3 实现）',
    noTaskSelected: '未选中任务',
    currentTask: '当前任务',
    workspace: 'Workspace',
  },
```

> 已确认项目 locales 全用纯字符串（grep 无函数型 message），用占位符方案：`olderHistory: '{n} older events'`，组件里 `t('cockpit.olderHistory', { n })`。Timeline 测试用 `n` 通过。

- [ ] **Step 2: Verify no type error**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -iE 'cockpit|i18n|locales' | head`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts
git commit -m "feat(cockpit): add i18n keys for mid-pane (map, timeline)"
```

---

### Task 3: CockpitGraphNode 组件（可拖拽 + 统一选中态）

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitGraphNode.vue`
- Test: `tests/client/cockpit-graph-node.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-graph-node.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitGraphNode from '@/components/hermes/cockpit/CockpitGraphNode.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

describe('CockpitGraphNode', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const props = {
    node: { id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file' as const, focus: true, links: [] },
    taskId: 't1',
    left: 100,
    top: 20,
  }

  it('renders label', () => {
    const w = mount(CockpitGraphNode, { props })
    expect(w.text()).toContain('refresh.ts')
  })

  it('is-selected class when node in selectedGraphNodeIds', () => {
    const s = useCockpitStore()
    s.selectedGraphNodeIds = { t1: ['n1'] }
    const w = mount(CockpitGraphNode, { props })
    expect(w.find('.cockpit-graph-node').classes()).toContain('is-selected')
  })

  it('clicking toggles selection in store', async () => {
    const s = useCockpitStore()
    const w = mount(CockpitGraphNode, { props })
    await w.find('.cockpit-graph-node').trigger('click')
    expect(s.selectedGraphNodeIds['t1']).toContain('n1')
  })

  it('shows focus indicator when focus=true', () => {
    const w = mount(CockpitGraphNode, { props })
    expect(w.find('.cockpit-graph-node').classes()).toContain('is-focus')
  })

  it('emits drag with new position on pointermove', async () => {
    const w = mount(CockpitGraphNode, { props })
    const el = w.find('.cockpit-graph-node').element as HTMLElement
    Object.defineProperty(el, 'offsetLeft', { value: 100, configurable: true })
    Object.defineProperty(el, 'offsetTop', { value: 20, configurable: true })
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 20, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 30 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await w.vm.$nextTick()
    const drag = w.emitted('drag')
    expect(drag).toBeTruthy()
    expect(drag!.at(-1)![0]).toEqual({ left: 130, top: 30 })
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-graph-node.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitGraphNode.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore, type GraphNode } from '@/stores/hermes/cockpit'

const props = defineProps<{
  node: GraphNode
  taskId: string
  left: number
  top: number
}>()
const emit = defineEmits<{ (e: 'drag', pos: { left: number; top: number }): void }>()

const store = useCockpitStore()

const isSelected = computed(() =>
  (store.selectedGraphNodeIds[props.taskId] ?? []).includes(props.node.id),
)

function onClick() {
  store.toggleGraphNode(props.taskId, props.node.id)
}

function onMousedown(e: MouseEvent) {
  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  const startX = e.clientX
  const startY = e.clientY
  const startLeft = el.offsetLeft
  const startTop = el.offsetTop
  function move(ev: MouseEvent) {
    emit('drag', { left: startLeft + (ev.clientX - startX), top: startTop + (ev.clientY - startY) })
  }
  function up() {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}
</script>

<template>
  <button
    type="button"
    class="cockpit-graph-node"
    :class="{ 'is-selected': isSelected, 'is-focus': node.focus }"
    :style="{ left: left + 'px', top: top + 'px' }"
    @click="onClick"
    @mousedown="onMousedown"
  >
    <span class="cockpit-sel-bar" />
    <span class="cockpit-graph-node__label">{{ node.label }}</span>
    <span v-if="node.focus" class="cockpit-graph-node__focus">焦点</span>
  </button>
</template>

<style scoped lang="scss">
.cockpit-graph-node {
  position: absolute;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 5px 9px;
  font-size: 11px;
  font-family: inherit;
  color: var(--text-primary);
  cursor: grab;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  user-select: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  &:hover { border-color: var(--text-muted); }
  &.is-selected { border-color: var(--accent-primary); }
  &.is-focus { border-color: var(--accent-primary); }
}
.cockpit-graph-node__label { font-weight: 600; }
.cockpit-graph-node__focus { font-size: 9px; color: var(--text-muted); }
</style>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-graph-node.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitGraphNode.vue tests/client/cockpit-graph-node.test.ts
git commit -m "feat(cockpit): add draggable graph node with unified selection"
```

---

### Task 4: CockpitCollabMap 协作图（层级 tab + SVG 画布 + 节点连线）

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitCollabMap.vue`
- Test: `tests/client/cockpit-collab-map.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-collab-map.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitCollabMap from '@/components/hermes/cockpit/CockpitCollabMap.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

describe('CockpitCollabMap', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws' }]
    s.selectTask('t1')
    s.appTopology = [
      { id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true, links: ['n2'] },
      { id: 'n2', taskId: 't1', label: 'auth.spec', kind: 'test', focus: false, links: [] },
    ]
    s.reqTopology = [{ id: 'r1', taskId: 't1', label: '认证重构', kind: 'req', focus: true }]
    s.projTopology = [{ id: 'p1', taskId: 't1', label: 'auth-platform', kind: 'project', focus: true }]
    return s
  }

  it('renders nodes for current level (app default)', () => {
    seed()
    const w = mount(CockpitCollabMap)
    expect(w.text()).toContain('refresh.ts')
    expect(w.text()).toContain('auth.spec')
  })

  it('switching to req level shows req nodes', async () => {
    seed()
    const w = mount(CockpitCollabMap)
    await w.find('[data-level="req"]').trigger('click')
    expect(w.text()).toContain('认证重构')
  })

  it('renders SVG line between linked nodes', () => {
    seed()
    const w = mount(CockpitCollabMap)
    expect(w.findAll('line').length).toBeGreaterThan(0)
  })

  it('renders empty state when no task selected', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitCollabMap)
    expect(w.find('.cockpit-map__empty').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-collab-map.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitCollabMap.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore, type TopologyLevel } from '@/stores/hermes/cockpit'
import CockpitGraphNode from './CockpitGraphNode.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const levels: { key: TopologyLevel; labelKey: string }[] = [
  { key: 'project', labelKey: 'cockpit.levelProject' },
  { key: 'req', labelKey: 'cockpit.levelRequirement' },
  { key: 'app', labelKey: 'cockpit.levelApp' },
]

/** 节点布局位置（按 index 简单排布；真实场景可接入图布局算法） */
const LAYOUT = [
  { left: 14, top: 20 },
  { left: 124, top: 20 },
  { left: 234, top: 20 },
  { left: 124, top: 74 },
  { left: 14, top: 74 },
  { left: 234, top: 74 },
]

const { nodes, level } = computed(() => store.topologyForSelectedTask).value
const positions = ref<Record<string, { left: number; top: number }>>({})

function posFor(id: string, index: number) {
  return positions.value[id] ?? LAYOUT[index % LAYOUT.length]
}
function onDrag(id: string, p: { left: number; top: number }) {
  positions.value = { ...positions.value, [id]: p }
}

const links = computed(() => {
  const out: { from: string; to: string }[] = []
  for (const n of nodes.value) {
    for (const to of n.links ?? []) {
      out.push({ from: n.id, to })
    }
  }
  return out
})

const hasTask = computed(() => !!store.selectedTask)
</script>

<template>
  <div class="cockpit-map">
    <div class="cockpit-map__head">
      <span class="cockpit-map__title">{{ t('cockpit.collaborationMap') }}</span>
      <div class="cockpit-map__levels">
        <button
          v-for="lv in levels"
          :key="lv.key"
          type="button"
          :data-level="lv.key"
          class="cockpit-map__level"
          :class="{ 'is-on': store.topologyLevel === lv.key }"
          @click="store.setTopologyLevel(lv.key)"
        >{{ t(lv.labelKey) }}</button>
      </div>
    </div>
    <div v-if="hasTask" class="cockpit-map__canvas">
      <svg class="cockpit-map__svg" viewBox="0 0 320 120" preserveAspectRatio="none">
        <line
          v-for="(l, i) in links"
          :key="i"
          :x1="posFor(l.from, 0).left + 32"
          :y1="posFor(l.from, 0).top + 12"
          :x2="posFor(l.to, 1).left + 32"
          :y2="posFor(l.to, 1).top + 12"
          stroke="var(--text-muted)"
          stroke-width="1.5"
        />
      </svg>
      <CockpitGraphNode
        v-for="(n, i) in nodes"
        :key="n.id"
        :node="n"
        :task-id="store.selectedTaskId!"
        :left="posFor(n.id, i).left"
        :top="posFor(n.id, i).top"
        @drag="(p) => onDrag(n.id, p)"
      />
    </div>
    <div v-else class="cockpit-map__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-map { display: flex; flex-direction: column; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.cockpit-map__head { display: flex; align-items: center; gap: 8px; padding: 8px 16px 4px; }
.cockpit-map__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-map__levels { display: flex; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); padding: 2px; margin-left: auto; }
.cockpit-map__level {
  font-size: 10px; padding: 3px 9px; border-radius: 4px; cursor: pointer; color: var(--text-muted);
  border: none; background: transparent; font-family: inherit;
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); }
}
.cockpit-map__canvas {
  position: relative; height: 120px;
  background: var(--bg-secondary);
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 14px 14px;
  overflow: hidden;
}
.cockpit-map__svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cockpit-map__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
```

> 注：上面 `<script setup>` 顶部用 `const { nodes, level } = computed(...).value` 是为了拿到非响应式引用用于模板的 v-for —— 实际应直接在模板里用 `store.topologyForSelectedTask.nodes`。改为：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore, type TopologyLevel } from '@/stores/hermes/cockpit'
import CockpitGraphNode from './CockpitGraphNode.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const levels: { key: TopologyLevel; labelKey: string }[] = [
  { key: 'project', labelKey: 'cockpit.levelProject' },
  { key: 'req', labelKey: 'cockpit.levelRequirement' },
  { key: 'app', labelKey: 'cockpit.levelApp' },
]

const LAYOUT = [
  { left: 14, top: 20 }, { left: 124, top: 20 }, { left: 234, top: 20 },
  { left: 124, top: 74 }, { left: 14, top: 74 }, { left: 234, top: 74 },
]
const positions = ref<Record<string, { left: number; top: number }>>({})
function posFor(id: string, index: number) {
  return positions.value[id] ?? LAYOUT[index % LAYOUT.length]
}
function onDrag(id: string, p: { left: number; top: number }) {
  positions.value = { ...positions.value, [id]: p }
}

const nodes = computed(() => store.topologyForSelectedTask.nodes)
const links = computed(() => {
  const out: { from: string; to: string }[] = []
  for (const n of nodes.value) for (const to of n.links ?? []) out.push({ from: n.id, to })
  return out
})
const hasTask = computed(() => !!store.selectedTask)
</script>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-collab-map.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitCollabMap.vue tests/client/cockpit-collab-map.test.ts
git commit -m "feat(cockpit): add collaboration map with level tabs and svg topology"
```

---

### Task 5: CockpitTimeline 时序事件流

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitTimeline.vue`
- Test: `tests/client/cockpit-timeline.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-timeline.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitTimeline from '@/components/hermes/cockpit/CockpitTimeline.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

describe('CockpitTimeline', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed(count = 4) {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.events = Array.from({ length: count }, (_, i) => ({
      id: 'e' + i, taskId: 't1', actor: i % 2 ? 'review-agent' : '张三',
      kind: (i % 2 ? 'A2A' : 'A2H') as 'A2A' | 'A2H',
      what: '事件 ' + i, when: '14:0' + i, pending: i === count - 1, ts: i,
    }))
    return s
  }

  it('renders visible events (no fold when <= threshold)', () => {
    seed(4)
    const w = mount(CockpitTimeline)
    expect(w.findAll('[data-event-id]').length).toBe(4)
    expect(w.find('.cockpit-timeline__fold').exists()).toBe(false)
  })

  it('folds older events when count > threshold', () => {
    seed(6)
    const w = mount(CockpitTimeline)
    expect(w.find('.cockpit-timeline__fold').exists()).toBe(true)
    expect(w.findAll('[data-event-id]').length).toBe(4)
  })

  it('expanding fold shows all events', async () => {
    seed(6)
    const w = mount(CockpitTimeline)
    await w.find('.cockpit-timeline__fold').trigger('click')
    expect(w.findAll('[data-event-id]').length).toBe(6)
  })

  it('clicking an event selects timeline node in store', async () => {
    seed(4)
    const w = mount(CockpitTimeline)
    await w.find('[data-event-id="e3"]').trigger('click')
    const s = useCockpitStore()
    expect(s.selectedTimelineNodeId).toBe('e3')
  })

  it('pending event has is-pending class', () => {
    seed(4)
    const w = mount(CockpitTimeline)
    expect(w.find('[data-event-id="e3"]').classes()).toContain('is-pending')
  })

  it('shows empty state when no task selected', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitTimeline)
    expect(w.find('.cockpit-timeline__empty').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-timeline.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitTimeline.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const THRESHOLD = 4
const expanded = ref(false)

const recent = computed(() => store.recentEventsForSelectedTask(THRESHOLD))
const visibleEvents = computed(() => (expanded.value ? [...recent.value.folded, ...recent.value.visible] : recent.value.visible))
const hasTask = computed(() => !!store.selectedTask)
</script>

<template>
  <div class="cockpit-timeline">
    <div class="cockpit-timeline__head">
      <span class="cockpit-timeline__title">{{ t('cockpit.timeline') }}</span>
    </div>
    <div v-if="hasTask" class="cockpit-timeline__body">
      <button
        v-if="!expanded && recent.folded.length > 0"
        type="button"
        class="cockpit-timeline__fold"
        @click="expanded = true"
      >▸ {{ t('cockpit.olderHistory', { n: recent.folded.length }) }}</button>
      <div class="cockpit-timeline__line">
        <button
          v-for="ev in visibleEvents"
          :key="ev.id"
          type="button"
          :data-event-id="ev.id"
          class="cockpit-timeline__event"
          :class="{
            'is-selected': store.selectedTimelineNodeId === ev.id,
            'is-pending': ev.pending,
          }"
          @click="store.selectTimelineNode(ev.id)"
        >
          <span class="cockpit-timeline__event-head">
            <span class="cockpit-timeline__actor">{{ ev.actor }}</span>
            <span class="cockpit-timeline__kind">{{ ev.kind }}</span>
            <span class="cockpit-timeline__when">{{ ev.when }}</span>
          </span>
          <span class="cockpit-timeline__what">{{ ev.what }}</span>
          <span class="cockpit-timeline__state">{{ ev.pending ? t('cockpit.pending') : t('cockpit.done') }}</span>
        </button>
      </div>
    </div>
    <div v-else class="cockpit-timeline__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-timeline { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cockpit-timeline__head { padding: 8px 16px; }
.cockpit-timeline__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-timeline__body { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
.cockpit-timeline__fold {
  display: block; width: 100%; text-align: left; padding: 5px 9px; margin: 4px 0 6px 18px;
  border: 1px dashed var(--border-color); border-radius: 6px; background: var(--bg-card);
  font-size: 10px; color: var(--text-muted); cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-secondary); }
}
.cockpit-timeline__line { position: relative; padding-left: 20px; }
.cockpit-timeline__line::before {
  content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px; width: 1px; background: var(--border-color);
}
.cockpit-timeline__event {
  position: relative; display: flex; flex-direction: column; gap: 1px;
  width: 100%; text-align: left; padding: 6px 9px; margin-bottom: 10px;
  border: 1px solid transparent; border-radius: 6px; background: none;
  cursor: pointer; font-family: inherit; color: var(--text-primary);
  &::before {
    content: ''; position: absolute; left: -19px; top: 9px; width: 9px; height: 9px;
    border-radius: 50%; background: var(--bg-primary); border: 2px solid var(--text-muted);
  }
  &:hover { background: var(--bg-card-hover); }
  &.is-selected { background: var(--bg-secondary); &::before { background: var(--accent-primary); border-color: var(--accent-primary); } }
  &.is-pending::before { background: var(--warning); border-color: var(--warning); }
}
.cockpit-timeline__event-head { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--text-secondary); }
.cockpit-timeline__actor { font-weight: 500; }
.cockpit-timeline__kind { font-size: 8px; padding: 0 5px; border-radius: 2px; background: var(--bg-secondary); }
.cockpit-timeline__when { margin-left: auto; font-size: 9px; color: var(--text-muted); }
.cockpit-timeline__what { font-size: 12px; color: var(--text-primary); }
.cockpit-timeline__state { font-size: 9px; color: var(--text-muted); }
.cockpit-timeline__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-timeline.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitTimeline.vue tests/client/cockpit-timeline.test.ts
git commit -m "feat(cockpit): add timeline with fold-history and current-node selection"
```

---

### Task 6: CockpitView 中栏接入真实组件 + 种子数据

**Files:**
- Modify: `packages/client/src/views/hermes/CockpitView.vue`

- [ ] **Step 1: Replace mid-pane placeholder with the two real components**

Edit `packages/client/src/views/hermes/CockpitView.vue`:

In `<script setup>`, add imports:
```ts
import CockpitCollabMap from '@/components/hermes/cockpit/CockpitCollabMap.vue'
import CockpitTimeline from '@/components/hermes/cockpit/CockpitTimeline.vue'
```

In `onMounted`, after the existing seed, append P2 seed data (events + topology):
```ts
  store.events = [
    { id: 'e1', taskId: '1', actor: '张三', kind: 'A2H', what: '提交 PR #142', when: '14:32', pending: false, ts: 1732 },
    { id: 'e2', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '自评：结构良好', when: '14:35', pending: false, ts: 1735 },
    { id: 'e3', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '2 处边界未覆盖 → 委派 qa', when: '14:36', pending: true, ts: 1736 },
    { id: 'e4', taskId: '1', actor: 'qa-agent', kind: 'A2H', what: '用例写完 → 待审', when: '现在', pending: true, ts: 1740 },
  ]
  store.appTopology = [
    { id: 'n1', taskId: '1', label: 'refresh.ts', kind: 'file', focus: true, links: ['n2'] },
    { id: 'n2', taskId: '1', label: 'auth.spec', kind: 'test', focus: false, links: [] },
  ]
  store.reqTopology = [{ id: 'r1', taskId: '1', label: '认证重构', kind: 'req', focus: true }]
  store.projTopology = [{ id: 'p1', taskId: '1', label: 'auth-platform', kind: 'project', focus: true }]
```

In template, replace the entire mid `<section>` inner (the `.cockpit-col__inner cockpit-placeholder` block) with:
```vue
        <div class="cockpit-col__inner">
          <CockpitCollabMap />
          <CockpitTimeline />
        </div>
```

(Keep the `<CockpitColumnRail>` and `<button class="cockpit-collapse-btn">` siblings; only the inner content changes. Remove the now-unused `cockpit-placeholder` style block at the bottom of the file if no longer used by right pane — but right pane still uses it, so keep it.)

- [ ] **Step 2: Run full cockpit test suite**

Run: `npx vitest run tests/client/cockpit-`
Expected: all PASS (29 tests: store 15 + graph-node 5 + map 4 + timeline 6 — wait, store is now 15; recount and ensure all green).

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -iE 'cockpit|error TS' | head`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/views/hermes/CockpitView.vue
git commit -m "feat(cockpit): wire collab map and timeline into mid pane with seed data"
```

---

### Task 7: 全量回归 + 冒烟

- [ ] **Step 1: Run all cockpit + sidebar tests**

Run: `npx vitest run tests/client/cockpit- tests/client/sidebar-search.test.ts`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: exit 0, no errors.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev:client`
Open: `http://localhost:8649/#/hermes/cockpit`
Verify:
- Mid pane shows collaboration map (default app level) with `refresh.ts` (focus) and `auth.spec` nodes, linked by a line
- Switching to 项目级 / 需求级 shows those nodes
- Dragging a node moves it; line follows
- Below map: timeline shows 4 events for task '1'; the pending ones (e3/e4) have warning-colored dots
- Clicking a timeline event highlights it (is-selected)
- Selecting a different task in left Kanban updates both map nodes and timeline events (since other seed tasks have no events/topology, they show empty gracefully — verify no crash)
- Sidebar-search test still green (P2 didn't touch AppSidebar)

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git status --short
# commit any remaining fixups with appropriate message
```

---

## Self-Review 记录

**Spec 覆盖（P2 范围）**：
- ✅ §5.4 协作图（图谱画布、多层级切换、节点拖拽、选中联动）→ Tasks 3+4
- ✅ §5.4 时序事件流（折叠历史、当前突出、节点点击、待办/已办）→ Task 5
- ✅ §6 交互动线（Kanban→store→中栏更新）→ Task 6 接入
- ✅ §4 Pure Ink + 统一选中态 → 全部用 CSS 变量 + `.is-selected`/`.cockpit-sel-bar`
- ⏭ §5.4 空间-组织三层联动标注、A2A/A2H 关系连线 → P2 仅做了 app 级 file 节点连线，组织编排链与三层联动留 P6（与多层级拓扑增强一起做）

**占位符扫描**：无 TBD；Task 4 给了两版 `<script setup>`（第二版是修正版），执行者用第二版。
**类型一致性**：`CockpitEvent`/`GraphNode`/`TopologyLevel`/`GraphNodeKind` 在 store 定义，组件与测试一致引用；`selectTimelineNode`/`toggleGraphNode`/`setTopologyLevel`/`recentEventsForSelectedTask` 跨任务签名一致。
**i18n 风险**：Task 2 标注了函数型 message 的不确定性，执行者需先 grep 项目既有用法决定占位符 vs 函数。
