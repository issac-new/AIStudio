# 注意力条点击筛选 Kanban 总览 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击上方注意力条中的代办事项时，直接筛选 kanban 总览中的任务明细展示，显示被点击任务及其父子关联任务，去除无关任务。

**Architecture:** 在 cockpit store 中新增 `_attentionTaskIds` 状态作为独立筛选机制，与现有手动筛选（优先级/状态/租户/看板/日期/搜索）AND 叠加。`focusOnTaskFromAttention` 加载 detail 后提取 parents+children 构建关联集合。注意力条点击切换式交互（同任务再点清除筛选）。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest

---

### Task 0: 创建 Feature 分支

**Files:** (none, git only)

- [ ] **Step 1: 创建 feature 分支**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git checkout -b feat/attention-kanban-filter
```

- [ ] **Step 2: 确认分支已创建**

```bash
git branch --show-current
# 输出: feat/attention-kanban-filter
```

---

### Task 1: Store — 新增 `_attentionTaskIds` + `attentionActive`

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`

- [ ] **Step 1: 在 store 的 ref 段（与 `searchQuery` 等并列）新增 `_attentionTaskIds` 和 `attentionActive`**

在 `searchQuery` ref 之后（约第 80 行）插入：

```ts
// ── 注意力筛选（点击注意力条后筛选 kanban 总览）──
const _attentionTaskIds = ref<string[]>([])
const attentionActive = computed(() => _attentionTaskIds.value.length > 0)
```

- [ ] **Step 2: 在 `filteredTasks` computed 末尾新增注意力筛选检查**

在 searchOk 判断之后、return 之前（约第 187 行）插入：

```ts
// 注意力筛选：若 _attentionTaskIds 非空，只显示集合内的任务
if (_attentionTaskIds.value.length > 0 && !_attentionTaskIds.value.includes(t.id)) {
  return false
}
```

- [ ] **Step 3: 新增 `clearAttentionFilter()` 方法**

在 `clearSearch` 方法之后（约第 513 行）插入：

```ts
function clearAttentionFilter() {
  _attentionTaskIds.value = []
}
```

- [ ] **Step 4: 修改 `focusOnTaskFromAttention` 为异步方法，加载关联任务并设置筛选**

替换原 `focusOnTaskFromAttention` 函数（第 682-687 行）：

```ts
async function focusOnTaskFromAttention(taskId: string, title?: string, desc?: string) {
  // 同一任务再次点击 → 切换（清除筛选）
  if (_attentionTaskIds.value.length === 1 && _attentionTaskIds.value[0] === taskId) {
    _attentionTaskIds.value = []
    return
  }
  // 保持原有行为
  await selectTask(taskId)
  setWorkspaceMode('work')
  _attentionFocusTitle.value = title ?? null
  _attentionFocusDesc.value = desc ?? null
  // 计算关联任务 ID：本身 + parents + children
  const related = new Set<string>([taskId])
  const detail = _detailCache.value[taskId]
  if (detail) {
    for (const p of detail.parents ?? []) related.add(p)
    for (const c of detail.children ?? []) related.add(c)
  }
  _attentionTaskIds.value = [...related]
}
```

- [ ] **Step 5: 在 return 对象中添加新导出**

在 return 对象的 `filters, searchQuery, _sessionSearching, ...` 行附近（约第 744 行）添加 `_attentionTaskIds`, `attentionActive`, `clearAttentionFilter`：

```ts
_attentionTaskIds, attentionActive, clearAttentionFilter,
```

（建议放在 `_attentionFocusTitle` 附近）

---

### Task 2: Store 测试 — 注意力筛选

**Files:**
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`

- [ ] **Step 1: 在现有测试文件末尾新增 `describe('cockpit store 注意力筛选')` 测试块**

追加：

```ts
describe('cockpit store 注意力筛选', () => {
  it('focusOnTaskFromAttention sets _attentionTaskIds with task itself', async () => {
    mockKanbanTasks.push(kt({ id: 't1', status: 'blocked' }))
    const s = useCockpitStore()
    await s.bootstrap()
    // 先清除默认的 dateRange 筛选，让所有任务可见
    s.clearDateRangeFilter()
    expect(s.attentionActive).toBe(false)
    await s.focusOnTaskFromAttention('t1', '阻塞任务')
    expect(s.attentionActive).toBe(true)
    expect(s._attentionTaskIds).toContain('t1')
  })

  it('focusOnTaskFromAttention filters filteredTasks to related tasks only', async () => {
    mockKanbanTasks.push(
      kt({ id: 't1', title: '阻塞任务', status: 'blocked' }),
      kt({ id: 't2', title: '其他任务', status: 'todo' }),
    )
    const s = useCockpitStore()
    await s.bootstrap()
    s.clearDateRangeFilter()
    expect(s.filteredTasks.map(t => t.id).sort()).toEqual(['t1', 't2'])
    await s.focusOnTaskFromAttention('t1')
    const ids = s.filteredTasks.map(t => t.id)
    expect(ids).toContain('t1')
    // 非关联任务（t2 没有 parents/children 关联）不应出现
    expect(ids).not.toContain('t2')
    expect(s.filteredTasks.length).toBeGreaterThanOrEqual(1)
  })

  it('re-clicking the same attention item toggles filter off', async () => {
    mockKanbanTasks.push(kt({ id: 't1', status: 'blocked' }))
    const s = useCockpitStore()
    await s.bootstrap()
    await s.focusOnTaskFromAttention('t1')
    expect(s.attentionActive).toBe(true)
    // 再次点击同一任务
    await s.focusOnTaskFromAttention('t1')
    expect(s.attentionActive).toBe(false)
    expect(s._attentionTaskIds).toEqual([])
  })

  it('clearAttentionFilter resets attention filter', async () => {
    mockKanbanTasks.push(kt({ id: 't1', status: 'blocked' }))
    const s = useCockpitStore()
    await s.bootstrap()
    await s.focusOnTaskFromAttention('t1')
    expect(s.attentionActive).toBe(true)
    s.clearAttentionFilter()
    expect(s.attentionActive).toBe(false)
  })

  it('attention filter ANDs with existing filters', async () => {
    mockKanbanTasks.push(
      kt({ id: 't1', title: 'P0阻塞', status: 'blocked', priority: 3 }),
      kt({ id: 't2', title: 'P1阻塞', status: 'blocked', priority: 1 }),
    )
    const s = useCockpitStore()
    await s.bootstrap()
    s.clearDateRangeFilter()
    await s.focusOnTaskFromAttention('t1')
    // 注意力筛选后只有 t1（t2 无关联）
    expect(s.filteredTasks.map(t => t.id)).toEqual(['t1'])
    // 加上优先级筛选 P0
    s.toggleFilter('priorities', 'P0')
    expect(s.filteredTasks.map(t => t.id)).toEqual(['t1'])
    // 切换优先级为 P1 → 交集为空
    s.toggleFilter('priorities', 'P0')
    s.toggleFilter('priorities', 'P1')
    expect(s.filteredTasks.map(t => t.id)).toEqual([])
  })
})
```

- [ ] **Step 2: 运行 store 测试确认通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts --reporter=verbose 2>&1 | tail -50
```

Expected: 全部 PASS，新增的注意力筛选测试通过。

---

### Task 3: CockpitAttention 组件 — 切换式交互 + 高亮样式

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitAttention.vue`

- [ ] **Step 1: 修改 `handleClick` 为切换式逻辑**

```vue
<!-- 替换第 9-11 行 -->
function handleClick(item: { taskId: string; title: string }) {
  // 如果已经是该任务的注意力筛选态，再次点击切换清除
  if (store._attentionTaskIds.length > 0 && store._attentionTaskIds[0] === item.taskId) {
    store.clearAttentionFilter()
  } else {
    store.focusOnTaskFromAttention(item.taskId, item.title)
  }
}
```

- [ ] **Step 2: 在 `.cockpit-attention__item` 上添加 `is-attention-active` 类**

在模板的 `:class` 中添加（第 26 行）：

```vue
class="cockpit-attention__item"
:class="['is-' + item.severity, { 'is-attention-active': store._attentionTaskIds.includes(item.id) }]"
```

- [ ] **Step 3: 添加高亮样式（scoped styles 末尾）**

```scss
.cockpit-attention__item.is-attention-active {
  background: var(--accent-primary);
  color: var(--text-on-accent);
  border-color: var(--accent-primary);
  .cockpit-attention__arrow { color: var(--text-on-accent); }
}
```

---

### Task 4: CockpitAttention 测试 — 切换交互

**Files:**
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-attention.test.ts`

- [ ] **Step 1: 在 `describe('CockpitAttention')` 末尾新增测试**

在最后一个 it 之后、describe 闭合之前追加：

```ts
it('clicking the same attention item twice toggles filter state', async () => {
  mockKanbanTasks.push(kt({ id: 'b1', title: '阻塞', status: 'blocked' }))
  const s = useCockpitStore()
  const w = mount(CockpitAttention)
  const btn = w.find('.cockpit-attention__item')
  // 第一次点击：激活注意力筛选
  await btn.trigger('click')
  expect(s.attentionActive).toBe(true)
  expect(s._attentionTaskIds).toContain('b1')
  // 第二次点击同一项：清除
  await btn.trigger('click')
  expect(s.attentionActive).toBe(false)
})

it('clicking attention item adds is-attention-active class to the button', async () => {
  mockKanbanTasks.push(kt({ id: 'b1', title: '阻塞', status: 'blocked' }))
  const s = useCockpitStore()
  const w = mount(CockpitAttention)
  const btn = w.find('.cockpit-attention__item')
  expect(btn.classes()).not.toContain('is-attention-active')
  await btn.trigger('click')
  expect(btn.classes()).toContain('is-attention-active')
  // 再次点击清除
  await btn.trigger('click')
  expect(btn.classes()).not.toContain('is-attention-active')
})
```

- [ ] **Step 2: 运行 attention 测试确认通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npx vitest run custom/client/cockpit/__tests__/cockpit-attention.test.ts --reporter=verbose 2>&1 | tail -40
```

Expected: 全部 PASS。

---

### Task 5: CockpitKanban 组件 — 注意力筛选提示条 + 任务高亮

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitKanban.vue`

- [ ] **Step 1: 在 `.cockpit-kanban__list` 上方新增注意力筛选提示条**

在 `<div class="cockpit-kanban__list">` 之前（第 99 行之前）插入：

```vue
    <!-- 注意力筛选提示 -->
    <div v-if="store.attentionActive" class="cockpit-attention-filter">
      <span class="cockpit-attention-filter__icon">🎯</span>
      <span class="cockpit-attention-filter__text">
        注意力筛选：{{ store._attentionTaskIds.length }} 个关联任务
      </span>
      <button type="button" class="cockpit-attention-filter__clear" @click="store.clearAttentionFilter()">
        × 清除筛选
      </button>
    </div>
```

- [ ] **Step 2: 在任务列表的 `.cockpit-kanban__task` 上添加注意力高亮类**

在第 104 行的 `:class` 中添加：

```vue
:class="[
  'is-' + t.priority.toLowerCase(),
  {
    'is-selected': store.selectedTaskId === t.id,
    'is-attention-highlight': store.attentionActive && store._attentionTaskIds.includes(t.id),
  }
]"
```

- [ ] **Step 3: 在 scoped styles 末尾添加样式**

```scss
/* ── 注意力筛选提示条 ── */
.cockpit-attention-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin: 0 8px 4px;
  background: rgba(var(--accent-primary-rgb, 88, 144, 255), 0.08);
  border: 1px solid var(--accent-primary);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-primary);
}
.cockpit-attention-filter__icon { font-size: 12px; }
.cockpit-attention-filter__text { flex: 1; }
.cockpit-attention-filter__clear {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}

/* ── 注意力筛选高亮任务 ── */
.cockpit-kanban__task.is-attention-highlight {
  background: rgba(var(--accent-primary-rgb, 88, 144, 255), 0.06);
}
```

---

### Task 6: CockpitKanban 测试 — 注意力筛选提示

**Files:**
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-kanban.test.ts`

- [ ] **Step 1: 在 `describe('CockpitKanban')` 末尾新增测试**

在最后一个 it 之后、describe 闭合之前追加：

```ts
it('shows attention filter bar when store.attentionActive is true', async () => {
  const s = seed()
  const w = mount(CockpitKanban)
  // 初始无注意力筛选
  expect(w.find('.cockpit-attention-filter').exists()).toBe(false)
  await s.focusOnTaskFromAttention('1')
  // 等待下次 tick 让 Vue 重新渲染
  await w.vm.$nextTick()
  expect(w.find('.cockpit-attention-filter').exists()).toBe(true)
  expect(w.find('.cockpit-attention-filter__text').text()).toContain('注意力筛选')
})

it('clear button in attention filter clears the filter', async () => {
  const s = seed()
  const w = mount(CockpitKanban)
  await s.focusOnTaskFromAttention('1')
  await w.vm.$nextTick()
  expect(w.find('.cockpit-attention-filter').exists()).toBe(true)
  await w.find('.cockpit-attention-filter__clear').trigger('click')
  expect(s.attentionActive).toBe(false)
  await w.vm.$nextTick()
  expect(w.find('.cockpit-attention-filter').exists()).toBe(false)
})
```

- [ ] **Step 2: 运行 kanban 测试确认通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npx vitest run custom/client/cockpit/__tests__/cockpit-kanban.test.ts --reporter=verbose 2>&1 | tail -40
```

Expected: 全部 PASS。

---

### Task 7: 全局验证 + 提交

**Files:** (none, all changes should be done)

- [ ] **Step 1: 全部测试运行确认通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npx vitest run custom/client/cockpit/ --reporter=verbose 2>&1 | tail -80
```

Expected: All tests pass (cockpit-store, cockpit-attention, cockpit-kanban, and any others).

- [ ] **Step 2: Git commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/store/cockpit.ts custom/client/cockpit/components/CockpitAttention.vue custom/client/cockpit/components/CockpitKanban.vue custom/client/cockpit/__tests__/cockpit-store.test.ts custom/client/cockpit/__tests__/cockpit-attention.test.ts custom/client/cockpit/__tests__/cockpit-kanban.test.ts
git commit -m "feat: 点击注意力条筛选 kanban 总览

- store: 新增 _attentionTaskIds 状态与 filteredTasks 注意力筛选
- store: focusOnTaskFromAttention 异步加载关联任务并设置筛选
- store: focusOnTaskFromAttention 同任务再次点击切换清除
- CocktailAttention: 切换式交互 + is-attention-active 高亮样式
- CockpitKanban: 注意力筛选提示条 + 清除按钮 + 任务高亮
- 新增/更新相关测试覆盖"
```

- [ ] **Step 3: 合入 main 分支**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge feat/attention-kanban-filter
git branch -d feat/attention-kanban-filter
```
