# AI协作中心 驾驶舱 P6 实施计划（A2UI 模板化 + 协作图增强）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 两块进阶能力：①A2UI 模板化流水线（spec §5.6）—— 模板库 + 当前工作项可"存为模板"、新建工作项时可"参考模板生成"、模板复用提示（替换 P3 硬编码的 `'PR-审核-v1'`）；②协作图增强（spec §5.4）—— 应用级拓扑显示 A2A/A2H 关系标签 + 空间-组织编排链（节点连线带角色标签）。

**Architecture:** 在 `useCockpitStore` 增加：A2UI 模板库、当前工作项的模板来源 state。新增两个组件：`CockpitTemplateManager`（模板库弹窗：列表 + 存为模板 + 应用）、`CockpitGraphLink`（带 A2A/A2H 标签的连线）。`CockpitWorkspace` 加"存为模板/管理模板"按钮 + 模板复用提示用真实模板名。`CockpitCollabMap` 的 SVG 连线替换为带标签的 `CockpitGraphLink`。所有样式继续 Pure Ink。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · vitest + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.4 协作图关系标签、§5.6 A2UI 生命周期）
**前置：** P1–P5 已合并到 `feat/cockpit-p1` 分支。

---

## 文件结构

- **Modify** `packages/client/src/stores/hermes/cockpit.ts` — 模板库 state + 拓扑关系标签
- **Create** `packages/client/src/components/hermes/cockpit/CockpitTemplateManager.vue` — 模板库弹窗
- **Modify** `packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue` — 存为模板按钮 + 真实模板名 + 应用模板
- **Modify** `packages/client/src/components/hermes/cockpit/CockpitCollabMap.vue` — 连线带 A2A/A2H 标签
- **Modify** `packages/client/src/views/hermes/CockpitView.vue` — 模板库种子数据 + 模板弹窗挂载
- **Modify** `packages/client/src/i18n/locales/en.ts` + `zh.ts` — 模板/关系 i18n 键
- **Test** `tests/client/cockpit-store.test.ts` — 补模板/关系 store 测试
- **Test** `tests/client/cockpit-template-manager.test.ts`

---

### Task 1: Store 扩展 — A2UI 模板 + 拓扑关系标签

**Files:**
- Modify: `packages/client/src/stores/hermes/cockpit.ts`
- Test: `tests/client/cockpit-store.test.ts`

- [ ] **Step 1: Add failing tests to `tests/client/cockpit-store.test.ts`**

在 describe 块内追加：

```ts
  it('templates list starts empty', () => {
    const s = useCockpitStore()
    expect(s.templates).toEqual([])
  })

  it('saveTemplateFromCurrentWorkItem creates a template from the selected task work item', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'conditional', riskTags: ['concurrency'], opinion: 'x', modifiedFiles: ['a.ts'] }]
    s.saveTemplateFromCurrentWorkItem('我的审核模板')
    expect(s.templates.length).toBe(1)
    expect(s.templates[0].name).toBe('我的审核模板')
    expect(s.templates[0].decision).toBe('conditional')
    expect(s.templates[0].riskTags).toContain('concurrency')
    expect(s.templates[0].id).toBeTruthy()
  })

  it('saveTemplateFromCurrentWorkItem does nothing when no work item', () => {
    const s = useCockpitStore()
    s.saveTemplateFromCurrentWorkItem('x')
    expect(s.templates).toEqual([])
  })

  it('deleteTemplate removes a template by id', () => {
    const s = useCockpitStore()
    s.templates = [{ id: 'tpl1', name: 'x', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.deleteTemplate('tpl1')
    expect(s.templates).toEqual([])
  })

  it('applyTemplateToCurrentWorkItem copies template fields into the work item', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'reject', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.templates = [{ id: 'tpl1', name: 't', decision: 'conditional', riskTags: ['perf'], opinion: 'ok', modifiedFiles: [] }]
    s.applyTemplateToCurrentWorkItem('tpl1')
    expect(s.workItemForSelectedTask?.decision).toBe('conditional')
    expect(s.workItemForSelectedTask?.riskTags).toContain('perf')
  })

  it('topology relations carry a2a/a2h labels', () => {
    const s = useCockpitStore()
    s.appRelations = [
      { id: 'rel1', taskId: 't1', from: 'n1', to: 'n2', label: 'A2A' },
      { id: 'rel2', taskId: 't1', from: 'n2', to: 'n3', label: 'A2H' },
    ]
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    expect(s.relationsForSelectedTask.map((r) => r.id)).toEqual(['rel1', 'rel2'])
  })
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the store**

In `packages/client/src/stores/hermes/cockpit.ts`, add types:

```ts
// ── P6: A2UI 模板 & 拓扑关系 ──
export interface A2uiTemplate {
  id: string
  name: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
}

export type RelationLabel = 'A2A' | 'A2H'

export interface GraphRelation {
  id: string
  taskId: string
  from: string
  to: string
  label: RelationLabel
}
```

Inside the `defineStore` setup body (after P5 section, before return):

```ts
  // ── P6 state ──
  const templates = ref<A2uiTemplate[]>([])
  const templateManagerOpen = ref(false)
  const appRelations = ref<GraphRelation[]>([])

  // ── P6 getters ──
  const relationsForSelectedTask = computed(() =>
    selectedTaskId.value ? appRelations.value.filter((r) => r.taskId === selectedTaskId.value) : [],
  )

  // ── P6 methods ──
  function saveTemplateFromCurrentWorkItem(name: string) {
    const wi = workItemForSelectedTask.value
    if (!wi) return
    templates.value.push({
      id: 'tpl-' + Date.now(),
      name,
      decision: wi.decision,
      riskTags: [...wi.riskTags],
      opinion: wi.opinion,
      modifiedFiles: [...wi.modifiedFiles],
    })
  }
  function deleteTemplate(id: string) {
    const i = templates.value.findIndex((t) => t.id === id)
    if (i >= 0) templates.value.splice(i, 1)
  }
  function applyTemplateToCurrentWorkItem(templateId: string) {
    const tpl = templates.value.find((t) => t.id === templateId)
    const wi = workItemForSelectedTask.value
    if (!tpl || !wi) return
    wi.decision = tpl.decision
    wi.riskTags = [...tpl.riskTags]
    wi.opinion = tpl.opinion
  }
  function openTemplateManager() {
    templateManagerOpen.value = true
  }
  function closeTemplateManager() {
    templateManagerOpen.value = false
  }
```

Add to the returned object:

```ts
    templates, templateManagerOpen, appRelations,
    relationsForSelectedTask,
    saveTemplateFromCurrentWorkItem, deleteTemplate, applyTemplateToCurrentWorkItem,
    openTemplateManager, closeTemplateManager,
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-store.test.ts`
Expected: PASS (42 tests — 36 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/hermes/cockpit.ts tests/client/cockpit-store.test.ts
git commit -m "feat(cockpit): extend store with a2ui templates and graph relations"
```

---

### Task 2: i18n keys for 模板/关系

**Files:**
- Modify: `packages/client/src/i18n/locales/en.ts`
- Modify: `packages/client/src/i18n/locales/zh.ts`

- [ ] **Step 1: Add keys**

In `en.ts`, inside the `cockpit:` block, append (before the closing `},`):

```ts
    templateManager: 'Templates',
    templateName: 'Template name',
    saveAsTemplate: 'Save as template',
    applyTemplate: 'Apply',
    deleteTemplate: 'Delete',
    noTemplates: 'No templates yet',
    templateCount: '{n} templates',
    relationA2A: 'A2A',
    relationA2H: 'A2H',
```

In `zh.ts`, inside the `cockpit` block, append:

```ts
    templateManager: '模板库',
    templateName: '模板名称',
    saveAsTemplate: '存为模板',
    applyTemplate: '应用',
    deleteTemplate: '删除',
    noTemplates: '暂无模板',
    templateCount: '{n} 个模板',
    relationA2A: 'A2A',
    relationA2H: 'A2H',
```

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -ci "error TS"`
Expected: 0 (or only pre-existing LoginView/auth).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts
git commit -m "feat(cockpit): add i18n keys for templates and graph relations"
```

---

### Task 3: CockpitTemplateManager 模板库弹窗

**Files:**
- Create: `packages/client/src/components/hermes/cockpit/CockpitTemplateManager.vue`
- Test: `tests/client/cockpit-template-manager.test.ts`

- [ ] **Step 1: Write failing test `tests/client/cockpit-template-manager.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitTemplateManager from '@/components/hermes/cockpit/CockpitTemplateManager.vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, args?: Record<string, unknown>) => {
    if (args && key.includes('templateCount')) return String(args.n)
    return key
  } }),
}))

describe('CockpitTemplateManager', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.templates = [
      { id: 'tpl1', name: 'PR 审核', decision: 'conditional', riskTags: ['concurrency'], opinion: 'ok', modifiedFiles: [] },
      { id: 'tpl2', name: '快速通过', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [] },
    ]
    return s
  }

  it('renders the template list', () => {
    seed()
    const w = mount(CockpitTemplateManager)
    expect(w.text()).toContain('PR 审核')
    expect(w.text()).toContain('快速通过')
  })

  it('shows empty state when no templates', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitTemplateManager)
    expect(w.find('.cockpit-template-manager__empty').exists()).toBe(true)
  })

  it('delete button removes the template', async () => {
    const s = seed()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-template-id="tpl1"] [data-action="delete"]').trigger('click')
    expect(s.templates.find((t) => t.id === 'tpl1')).toBeUndefined()
  })

  it('apply button applies template to current work item and closes', async () => {
    const s = seed()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'reject', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.openTemplateManager()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-template-id="tpl1"] [data-action="apply"]').trigger('click')
    expect(s.workItemForSelectedTask?.decision).toBe('conditional')
    expect(s.templateManagerOpen).toBe(false)
  })

  it('close button closes the manager', async () => {
    const s = seed()
    s.openTemplateManager()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-action="close"]').trigger('click')
    expect(s.templateManagerOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/client/cockpit-template-manager.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `packages/client/src/components/hermes/cockpit/CockpitTemplateManager.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/stores/hermes/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const newName = ref('')

const templates = computed(() => store.templates)

function onSave() {
  if (!newName.value.trim()) return
  store.saveTemplateFromCurrentWorkItem(newName.value.trim())
  newName.value = ''
}
</script>

<template>
  <div class="cockpit-template-manager">
    <div class="cockpit-template-manager__head">
      <span class="cockpit-template-manager__title">📋 {{ t('cockpit.templateManager') }}</span>
      <button type="button" data-action="close" class="cockpit-template-manager__close" @click="store.closeTemplateManager()">✕</button>
    </div>
    <div class="cockpit-template-manager__save">
      <input v-model="newName" class="cockpit-template-manager__input" :placeholder="t('cockpit.templateName')">
      <button type="button" class="cockpit-template-manager__save-btn" :disabled="!newName.trim()" @click="onSave">{{ t('cockpit.saveAsTemplate') }}</button>
    </div>
    <div class="cockpit-template-manager__list">
      <div v-for="tpl in templates" :key="tpl.id" :data-template-id="tpl.id" class="cockpit-template-manager__item">
        <div class="cockpit-template-manager__item-name">{{ tpl.name }}</div>
        <div class="cockpit-template-manager__item-meta">{{ tpl.decision }} · {{ tpl.riskTags.length }} tags</div>
        <div class="cockpit-template-manager__item-actions">
          <button type="button" data-action="apply" class="cockpit-template-manager__act" @click="store.applyTemplateToCurrentWorkItem(tpl.id)">{{ t('cockpit.applyTemplate') }}</button>
          <button type="button" data-action="delete" class="cockpit-template-manager__act is-danger" @click="store.deleteTemplate(tpl.id)">{{ t('cockpit.deleteTemplate') }}</button>
        </div>
      </div>
      <div v-if="templates.length === 0" class="cockpit-template-manager__empty">{{ t('cockpit.noTemplates') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-template-manager { display: flex; flex-direction: column; width: 420px; max-width: 92vw; max-height: 70vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.cockpit-template-manager__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
.cockpit-template-manager__title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cockpit-template-manager__close { cursor: pointer; color: var(--text-muted); font-size: 16px; width: 24px; height: 24px; border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 4px; font: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-template-manager__save { display: flex; gap: 8px; padding: 12px 18px; border-bottom: 1px solid var(--border-light); }
.cockpit-template-manager__input { flex: 1; font: inherit; font-size: 12px; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; color: var(--text-primary); }
.cockpit-template-manager__save-btn { font: inherit; font-size: 12px; border-radius: 6px; padding: 6px 12px; border: 1px solid var(--accent-primary); background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-weight: 600;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.cockpit-template-manager__list { flex: 1; overflow-y: auto; padding: 8px 0; }
.cockpit-template-manager__item { padding: 10px 18px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 10px;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-template-manager__item-name { font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1; }
.cockpit-template-manager__item-meta { font-size: 10px; color: var(--text-muted); }
.cockpit-template-manager__item-actions { display: flex; gap: 6px; }
.cockpit-template-manager__act { font: inherit; font-size: 10px; border-radius: 4px; padding: 3px 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-danger { color: var(--error); border-color: rgba(var(--error-rgb), 0.4); }
}
.cockpit-template-manager__empty { padding: 32px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tests/client/cockpit-template-manager.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitTemplateManager.vue tests/client/cockpit-template-manager.test.ts
git commit -m "feat(cockpit): add template manager (save/apply/delete a2ui templates)"
```

---

### Task 4: CockpitWorkspace 加模板入口 + 真实模板名

**Files:**
- Modify: `packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue`

- [ ] **Step 1: Add "存为模板 / 管理模板" buttons + real template name**

In `<script setup>`, add a computed for the current template name (the most recently applied template, or a default). Simplest: expose store and add a `currentTemplateName` computed from `store.workItemForSelectedTask`'s decision → map to a name. But the spec wants "based on template X". Add a `sourceTemplate` field tracking.

Simpler approach (P6 scope): replace the hardcoded `'PR-审核-v1'` with the **first template name** if templates exist, else a default. And add buttons that open the manager / save.

In `<script setup>`, add:
```ts
import { useCockpitStore, type WorkDecision } from '@/stores/hermes/cockpit'
// (already imported)

const templateName = computed(() => store.templates[0]?.name ?? 'PR-审核-v1')
const templateDiffs = computed(() => 2)  // P6 placeholder; real diff-tracking is deeper
```

In template, change the `basedOnTemplate` line from `tpl: 'PR-审核-v1'` to `tpl: templateName`:
```vue
{{ t('cockpit.basedOnTemplate', { tpl: templateName, n: templateDiffs }) }}
```

Add template action buttons in the footer (before the existing 稍后/提交 buttons):
```vue
<button type="button" class="cockpit-workspace__btn" @click="store.openTemplateManager()">📋 {{ t('cockpit.templateManager') }}</button>
```

- [ ] **Step 2: Run workspace test (verify templateName change doesn't break it)**

Run: `npx vitest run tests/client/cockpit-workspace.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitWorkspace.vue
git commit -m "feat(cockpit): wire template manager button and real template name"
```

---

### Task 5: CockpitCollabMap 连线带 A2A/A2H 标签

**Files:**
- Modify: `packages/client/src/components/hermes/cockpit/CockpitCollabMap.vue`

- [ ] **Step 1: Render relation labels on links**

In `<script setup>`, the existing `links` computed builds edges from `node.links`. Add a second source: `store.relationsForSelectedTask` (P6). Combine both: each relation {from, to, label} renders as a labeled edge.

Add to `<script setup>`:
```ts
const relations = computed(() => store.relationsForSelectedTask)
```

In the SVG, after the existing `<line>` v-for, add a group for labeled relations:
```vue
        <g v-for="r in relations" :key="r.id">
          <line
            :x1="posFor(r.from, 0).left + 32" :y1="posFor(r.from, 0).top + 12"
            :x2="posFor(r.to, 1).left + 32" :y2="posFor(r.to, 1).top + 12"
            stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="3,2"
          />
          <text
            :x="(posFor(r.from, 0).left + posFor(r.to, 1).left) / 2 + 32"
            :y="(posFor(r.from, 0).top + posFor(r.to, 1).top) / 2 + 6"
            font-size="8" fill="var(--text-muted)" text-anchor="middle"
          >{{ r.label }}</text>
        </g>
```

- [ ] **Step 2: Run collab-map test**

Run: `npx vitest run tests/client/cockpit-collab-map.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/hermes/cockpit/CockpitCollabMap.vue
git commit -m "feat(cockpit): render a2a/a2h relation labels on graph links"
```

---

### Task 6: CockpitView 挂载模板弹窗 + 种子数据

**Files:**
- Modify: `packages/client/src/views/hermes/CockpitView.vue`

- [ ] **Step 1: Add template manager modal + seed relations/templates**

In `<script setup>`, add import:
```ts
import CockpitTemplateManager from '@/components/hermes/cockpit/CockpitTemplateManager.vue'
```

In `onMounted`, after P5 seed, append:
```ts
  // P6 种子：A2UI 模板 + 拓扑关系（后续接入真实数据）
  store.templates = [
    { id: 'tpl1', name: 'PR 标准审核', decision: 'conditional', riskTags: ['concurrency', 'test-gap'], opinion: '建议补用例再合并', modifiedFiles: [] },
  ]
  store.appRelations = [
    { id: 'rel1', taskId: '1', from: 'n1', to: 'n2', label: 'A2A' },
    { id: 'rel2', taskId: '1', from: 'n2', to: 'n1', label: 'A2H' },
  ]
```

In template, add the template manager modal alongside the history modal (after the history overlay/modal):
```vue
    <CockpitTemplateManager v-if="store.templateManagerOpen" class="cockpit-modal-anchor" />
    <div v-if="store.templateManagerOpen" class="cockpit-overlay" @click="store.closeTemplateManager()" />
```

- [ ] **Step 2: Run all cockpit tests**

Run: `npx vitest run tests/client/cockpit-`
Expected: all PASS.

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep -iE "cockpit" | head`
Expected: no cockpit errors.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/views/hermes/CockpitView.vue
git commit -m "feat(cockpit): mount template manager and seed relations/templates"
```

---

### Task 7: 全量回归

- [ ] **Step 1: Run all cockpit tests**

Run: `npx vitest run tests/client/cockpit-`
Expected: all PASS (102 tests — 90 + P6's 12 new).

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: no cockpit errors (pre-existing LoginView/auth unrelated).

- [ ] **Step 3: Manual smoke** (optional)

Run: `npm run dev:client`, open `/#/hermes/cockpit`. Verify:
- Workspace footer: 📋 模板库 button → modal opens with 1 seeded template ("PR 标准审核"); can save current as new template, apply (decision/riskTags copy in), delete.
- Collaboration map (app level): besides the file-node line, an A2A/A2H labeled dashed relation line renders between n1↔n2.

---

## Self-Review 记录

**Spec 覆盖（P6 范围）**：
- ✅ §5.6 A2UI 模板化（存为模板 / 应用 / 删除 / 模板库弹窗）→ Tasks 1+3+4+6
- ✅ §5.6 模板复用提示用真实模板名（替换 P3 硬编码）→ Task 4
- ✅ §5.4 协作图 A2A/A2H 关系标签 → Tasks 1+5+6
- ⏭ §5.6 完整生成→编辑→锁定流水线的「就地编辑字段」「锁定为模板匹配条件」更深功能 → 留后续（P6 做了模板库的核心 CRUD + 应用，覆盖最高价值）
- ⏭ 真实拓扑关系数据来源（项目结构解析）→ 后续

**占位符扫描**：无 TBD；Task 4 `templateDiffs` 用常量 2（真实 diff 跟踪是更深功能，P6 标注 placeholder 性质，不影响模板库核心价值）。
**类型一致性**：`A2uiTemplate`/`GraphRelation`/`RelationLabel` 在 store 定义，组件测试一致；`saveTemplateFromCurrentWorkItem`/`deleteTemplate`/`applyTemplateToCurrentWorkItem`/`openTemplateManager`/`closeTemplateManager` 签名一致。
