# Cockpit 工作项页面 — Swarm kanban 要素迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Swarm kanban 任务详情抽屉（`KanbanTaskDrawer.vue`）中所有可编辑可配置要素逐一迁移到 AI 协作中心「工作项」页面（`CockpitWorkspace.vue`），使工作项页面获得与 kanban 详情页对等的任务操作能力。

**Architecture:** 字段编辑类（标题、评论）接进 cockpit 现有 `pending*` 草稿批量提交通道；动作命令类（specify/decompose/状态流转/reclaim/reassign/diagnostics/home-channel）保持即时执行，直接调用 `useKanbanStore()` 同名方法或 `kanbanApi`。确认弹窗自建轻量组件，不引入 Naive UI。诊断区直接复用 `KanbanDiagnosticsSection` 子组件。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + 原生 button（cockpit 风格）/ Naive UI（kanban 子组件复用）+ vitest + overlay patch 机制（`inject.mjs`）。

**Spec:** `docs/superpowers/specs/2026-06-24-cockpit-workitem-kanban-migration-design.md`

**关键事实（实现时核对，均已确认）：**
- kanban store（upstream `packages/client/src/stores/hermes/kanban.ts`）已导出：`specifyTask(taskId, author?)`、`decomposeTask(taskId, author?)`、`reclaimTask(taskId, reason?)`、`reassignTask(taskId, profile, opts?)`、`patchTask(taskId, patch)`、`fetchDiagnostics()`、`diagnostics`（`KanbanDiagnostic[]`）、`assignees`、`selectedBoard`。
- kanban api（upstream `packages/client/src/api/hermes/kanban.ts`）：`getHomeChannels(taskId, {board})`、`subscribeHomeChannel(taskId, platform, {board})`、`unsubscribeHomeChannel(taskId, platform, {board})`、`addComment(taskId, {body}, {board})`、`patchTask`。`KanbanTaskPatch` 含 `status/assignee/priority/title/body/result/block_reason/summary`。
- `KanbanDiagnosticsSection.vue` props：`{ task: KanbanTask; diagnostics: KanbanDiagnosticItem[]; assignees: string[] }`，emit `refresh`。诊断数据：`kanbanStore.diagnostics` 是 `KanbanDiagnostic[]`，每项有 `.diagnostics: KanbanDiagnosticItem[]`。
- cockpit store（`cockpit.ts`）：`submitWorkItem()` 现状（:735-766）已发 `patchTask`+`linkTasks`+`unlinkTasks`+一条决策评论 `addComment`（:758-760，body 由 decision/riskTags/opinion 拼成）。`loadTaskDetail(id)` 在 :503。`clearDraft(id)` 在 :763 调用，清空整个草稿。
- i18n：`cockpit:` 命名空间在 upstream `packages/client/src/i18n/locales/{en,zh}.ts`（en.ts:262 起），通过 overlay patch 注入。新增 key 需新建 patch 文件 + 加入 `patches/series`。
- 测试：`overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` 已有 `submitWorkItem` 测试（:293-301）和完整 mock 模式。vitest 配置 `include: ['custom/**/*.test.ts']`。
- 下一个可用 patch 编号：090。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `overlay/custom/client/cockpit/store/cockpit-kv.ts` | 草稿持久化模型 | 修改：`DraftWorkItem` 加 `pendingTitle`/`pendingComment` |
| `overlay/custom/client/cockpit/store/cockpit.ts` | cockpit store | 修改：加 `setPendingTitle`/`currentTitle`/`setPendingComment`；`submitWorkItem` flush 扩展 |
| `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` | 工作项页面主体 | 修改：A1 标题 input、动作命令区 B1-B8、评论区 C5、`execAction`、自建弹窗调用 |
| `overlay/custom/client/cockpit/components/CockpitConfirmDialog.vue` | 轻量确认弹窗 | 新建 |
| `overlay/custom/client/cockpit/components/CockpitCompletionModal.vue` | 完成校验弹窗 | 新建 |
| `overlay/patches/090-cockpit-i18n-workitem-actions-en.ts.patch` | en i18n | 新建 |
| `overlay/patches/091-cockpit-i18n-workitem-actions-zh.ts.patch` | zh i18n | 新建 |
| `overlay/patches/series` | patch 顺序 | 修改：追加 090/091 |
| `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` | store 测试 | 修改：加 title/comment flush 测试 |

不修改 `upstream/`。复用的 `KanbanDiagnosticsSection.vue` 只读引用。

---

## Task 0: 创建 feature 分支

**Files:** 无（git 操作）

- [ ] **Step 1: 基于 main 创建分支**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git checkout -b feat/cockpit-workitem-kanban-migration
```
Expected: 切到新分支 `feat/cockpit-workitem-kanban-migration`。（main 上有 2 个已修改 patch 文件 085/089，会随分支带过来，不影响本任务。）

---

## Task 1: 扩展草稿模型 — `DraftWorkItem` 加 `pendingTitle`/`pendingComment`

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit-kv.ts:9-22`

- [ ] **Step 1: 写失败测试**

在 `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` 末尾（`describe('notify...')` 块之前，约 :511 行前）新增一个 describe 块：

```ts
describe('cockpit store 工作项标题/评论草稿', () => {
  it('setPendingTitle writes pendingTitle; currentTitle reads draft over task', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: '原标题' }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(s.currentTitle).toBe('原标题')
    s.setPendingTitle('新标题')
    expect(s.currentTitle).toBe('新标题')
    expect(s.workItemForSelectedTask?.pendingTitle).toBe('新标题')
  })

  it('setPendingComment writes pendingComment', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.setPendingComment('我的评论')
    expect(s.workItemForSelectedTask?.pendingComment).toBe('我的评论')
  })

  it('submitWorkItem flushes title via patchTask + user comment via addComment', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: '原标题' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.setPendingTitle('改后标题')
    s.setPendingComment('用户自由评论')
    s.updateWorkItem({ decision: 'approve', riskTags: [], opinion: 'ok' })
    await s.submitWorkItem()
    // patchTask 被调用且含 title
    expect(patchTask).toHaveBeenCalledWith('t1', expect.objectContaining({ title: '改后标题' }), expect.anything())
    // addComment 被调用两次：决策评论 + 用户评论
    const calls = addComment.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[1][1]).toEqual({ body: '用户自由评论' })
    // 草稿清空
    expect(s.workItemForSelectedTask).toBeNull()
  })

  it('submitWorkItem omits title patch when pendingTitle equals task title', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: '原标题' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.setPendingTitle('原标题') // 未实际改动
    s.updateWorkItem({ decision: 'approve', riskTags: [], opinion: 'ok' })
    await s.submitWorkItem()
    // patchTask 不应被调用（无字段变更，只有评论）
    expect(patchTask).not.toHaveBeenCalled()
  })
})
```

注意：测试用到的 `patchTask` mock 当前未在文件顶部声明。需在 `:33-36` 的 `vi.hoisted` 块加入 `patchTask`：

```ts
const { getTask, addComment, patchTask } = vi.hoisted(() => ({
  getTask: vi.fn(async () => null),
  addComment: vi.fn(async () => ({ ok: true })),
  patchTask: vi.fn(async () => ({})),
}))
```
并在 `:37-40` 的 `vi.mock('@/api/hermes/kanban', ...)` 返回里加入 `patchTask`：
```ts
return { ...actual, getTask, addComment, patchTask }
```
并在 `beforeEach`（:128）加 `patchTask.mockClear()`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts -t "标题/评论草稿"`
Expected: FAIL — `s.setPendingTitle is not a function` / `s.currentTitle is undefined`。

- [ ] **Step 3: 扩展 `DraftWorkItem` 接口**

修改 `overlay/custom/client/cockpit/store/cockpit-kv.ts`，在 `pendingLinkRemoves` 后（:22 行后）加两行：

```ts
export interface DraftWorkItem {
  pendingAssignee?: string | null    // 待变更的 assignee（null=清空）
  pendingPriority?: number           // 待变更的 priority
  pendingBody?: string               // 待变更的 description（任务 body）
  pendingLinkAdds?: PendingLink[]    // 待新增的父子关联
  pendingLinkRemoves?: PendingLink[] // 待移除的父子关联
  pendingTitle?: string               // 待变更的标题（与 task.title 不同才 flush）
  pendingComment?: string            // 待提交的用户自由评论（非空时 flush 一条 addComment）
  decision?: WorkDecision
  riskTags?: string[]
  score?: number
  opinion?: string
  modifiedFiles?: string[]
}
```
（仅新增 `pendingTitle`/`pendingComment` 两行；其余行原样保留。若文件中 `decision` 等字段已存在则不动它们——只加这两行。）

- [ ] **Step 4: 在 cockpit store 加 `setPendingTitle`/`currentTitle`/`setPendingComment`**

在 `overlay/custom/client/cockpit/store/cockpit.ts` 找到现有 `setPendingAssignee` 附近（搜索 `function setPendingAssignee` 或 `setPendingBody`），仿照其模式新增。先定位现有 setter（它们调 `kv.saveDraft` + `bumpKv`）：

```ts
// 标题草稿
function setPendingTitle(v: string) {
  const id = selectedTaskId.value
  if (!id) return
  kv.saveDraft(id, { pendingTitle: v })
  bumpKv()
}

// 用户评论草稿
function setPendingComment(v: string) {
  const id = selectedTaskId.value
  if (!id) return
  kv.saveDraft(id, { pendingComment: v })
  bumpKv()
}
```

并在 store 的 `return` / 导出对象里加入 `setPendingTitle`、`setPendingComment`。

`currentTitle` 是 computed，加在现有 `currentAssignee`/`currentBody` 同区（这些 computed 在 `cockpit.ts` 还是 `CockpitWorkspace.vue`？——核对：现有 `currentAssignee` 等定义在 `CockpitWorkspace.vue:23-37`，**不在 store**）。因此 `currentTitle` 也放 `CockpitWorkspace.vue`（Task 5 处理），store 只需暴露 `setPendingTitle`/`setPendingComment`。本步测试里 `s.currentTitle` 会失败——把测试中 `s.currentTitle` 改为通过 `s.workItemForSelectedTask?.pendingTitle` 间接断言，或把 `currentTitle` 也作为 store computed 暴露。

**决策：把 `currentTitle` 作为 store computed 暴露**（与 `currentAssignee` 在组件内不同，但为可测性放 store 更合理）。在 store 加：

```ts
const currentTitle = computed(() => {
  const draft = workItemForSelectedTask.value
  if (draft?.pendingTitle !== undefined) return draft.pendingTitle || ''
  return selectedTaskDetail.value?.task?.title ?? ''
})
```
并加入导出。（`workItemForSelectedTask`/`selectedTaskDetail` 是 store 现有 getter，核对实际名称后使用。）

- [ ] **Step 5: 扩展 `submitWorkItem` flush**

在 `cockpit.ts` 的 `submitWorkItem()`（:735-766）中，找到 `const patch: kanbanApi.KanbanTaskPatch = {}`（:744）后、`if (Object.keys(patch).length)`（:748）前，加入 title 分支：

```ts
    const patch: kanbanApi.KanbanTaskPatch = {}
    if (draft.pendingAssignee !== undefined) patch.assignee = draft.pendingAssignee
    if (draft.pendingPriority !== undefined) patch.priority = draft.pendingPriority
    if (draft.pendingBody !== undefined) patch.body = draft.pendingBody
    // 新增：标题（仅当与当前标题不同）
    if (draft.pendingTitle !== undefined && draft.pendingTitle !== (selectedTaskDetail.value?.task?.title ?? '')) {
      patch.title = draft.pendingTitle
    }
    if (Object.keys(patch).length) {
      ops.push(kanbanApi.patchTask(id, patch, boardOpts))
    }
```

在现有决策评论 `addComment`（:758-760）**之后**，加入用户评论分支：

```ts
    // 3. 始终提交决策评论
    const text = `[决策:${draft.decision}] 风险:${draft.riskTags.join(',')} ${draft.opinion}`.trim()
    ops.push(kanbanApi.addComment(id, { body: text }, boardOpts))
    // 4. 用户自由评论（非空时额外一条）
    if (draft.pendingComment && draft.pendingComment.trim()) {
      ops.push(kanbanApi.addComment(id, { body: draft.pendingComment }, boardOpts))
    }
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts -t "标题/评论草稿"`
Expected: PASS（4 个测试全过）。

- [ ] **Step 7: 运行全量 cockpit store 测试确认无回归**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts`
Expected: PASS（原有测试 + 新测试全过）。

- [ ] **Step 8: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/store/cockpit-kv.ts custom/client/cockpit/store/cockpit.ts custom/client/cockpit/__tests__/cockpit-store.test.ts
git commit -m "feat(cockpit): add pendingTitle/pendingComment draft fields + flush

- DraftWorkItem gains pendingTitle/pendingComment
- store: setPendingTitle/setPendingComment/currentTitle
- submitWorkItem: flush title via patchTask, user comment as extra addComment
- tests: title/comment flush + no-op when unchanged"
```

---

## Task 2: 新建 i18n patch（090/091）

**Files:**
- Create: `overlay/patches/090-cockpit-i18n-workitem-actions-en.ts.patch`
- Create: `overlay/patches/091-cockpit-i18n-workitem-actions-zh.ts.patch`
- Modify: `overlay/patches/series`

- [ ] **Step 1: 确认 cockpit 块的上下文行**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
grep -n "modeTerm:" packages/client/src/i18n/locales/en.ts | head -1
grep -n "modeTerm:" packages/client/src/i18n/locales/zh.ts | head -1
```
Expected: 显示 `modeTerm:` 所在行号（en 约 :318）。这是 cockpit 块中已存在的锚点行，新 key 插在其后。

- [ ] **Step 2: 生成 en patch**

新建 `overlay/patches/090-cockpit-i18n-workitem-actions-en.ts.patch`，内容如下（hunk 上下文用 `modeTerm` 作锚，在其后插入新 key；`@@` 行号以 Step 1 实测为准，可先不写精确号，`git apply --whitespace=nowarn` 容忍）：

```diff
diff --git a/packages/client/src/i18n/locales/en.ts b/packages/client/src/i18n/locales/en.ts
--- a/packages/client/src/i18n/locales/en.ts
+++ b/packages/client/src/i18n/locales/en.ts
@@ -316,6 +316,28 @@
     modeTerm: 'Code',
+    editTitlePlaceholder: 'Title',
+    actions: 'Actions',
+    specify: 'Specify',
+    decompose: 'Decompose',
+    moveToTriage: 'Move to triage',
+    moveToReady: 'Move to ready',
+    moveToBlocked: 'Mark blocked',
+    moveToDone: 'Mark done',
+    moveToArchived: 'Archive',
+    unblock: 'Unblock',
+    reclaim: 'Reclaim',
+    reassign: 'Reassign',
+    reassignProfile: 'Reassign profile',
+    recovery: 'Recovery',
+    diagnostics: 'Diagnostics',
+    notifyHomeChannels: 'Notify home channels',
+    subscribe: 'Subscribe',
+    unsubscribe: 'Unsubscribe',
+    comments: 'Comments',
+    addCommentPlaceholder: 'Add a comment…',
+    confirmDone: 'Mark this task as done? The worker\'s claim is released and dependent children become ready.',
+    confirmArchive: 'Archive this task? It disappears from the default board view.',
+    confirmBlocked: 'Mark this task as blocked? The worker\'s claim is released.',
+    completionSummaryRequired: 'Completion summary is required before marking a task done.',
     history: 'History',
     historyTitle: 'My history',
     historySearch: 'Search events, tasks, agents…',
```

- [ ] **Step 3: 生成 zh patch**

新建 `overlay/patches/091-cockpit-i18n-workitem-actions-zh.ts.patch`，对照 en 的 key 顺序，值用中文：

```diff
diff --git a/packages/client/src/i18n/locales/zh.ts b/packages/client/src/i18n/locales/zh.ts
--- a/packages/client/src/i18n/locales/zh.ts
+++ b/packages/client/src/i18n/locales/zh.ts
@@ -316,6 +316,28 @@
     modeTerm: '代码',
+    editTitlePlaceholder: '标题',
+    actions: '操作',
+    specify: '细化',
+    decompose: '分解',
+    moveToTriage: '转入分诊',
+    moveToReady: '转入就绪',
+    moveToBlocked: '标记阻塞',
+    moveToDone: '标记完成',
+    moveToArchived: '归档',
+    unblock: '取消阻塞',
+    reclaim: '回收',
+    reassign: '改派',
+    reassignProfile: '改派 profile',
+    recovery: '恢复',
+    diagnostics: '诊断',
+    notifyHomeChannels: '主页通知频道',
+    subscribe: '订阅',
+    unsubscribe: '退订',
+    comments: '评论',
+    addCommentPlaceholder: '写评论…',
+    confirmDone: '确认将此任务标记为完成？工作线程的占会被释放，依赖的子任务变为就绪。',
+    confirmArchive: '归档此任务？它将从默认看板视图中消失。',
+    confirmBlocked: '标记此任务为阻塞？工作线程的占会被释放。',
+    completionSummaryRequired: '标记完成前必须填写完成摘要。',
     history: '历史',
     historyTitle: '我的历史',
     historySearch: '搜索事件、任务、agent…',
```

- [ ] **Step 4: 追加到 series**

修改 `overlay/patches/series`，在末尾追加两行：

```
090-cockpit-i18n-workitem-actions-en.ts.patch
091-cockpit-i18n-workitem-actions-zh.ts.patch
```

- [ ] **Step 5: 应用 patch 验证可 apply**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```
Expected: 所有 patch（含 090/091）applied，无 FAILED。

- [ ] **Step 6: 验证 key 注入成功**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
grep -c "moveToTriage\|notifyHomeChannels\|completionSummaryRequired" packages/client/src/i18n/locales/en.ts
grep -c "细化\|主页通知频道" packages/client/src/i18n/locales/zh.ts
```
Expected: en 3，zh 2（确认注入）。

- [ ] **Step 7: 还原 upstream 工作树（保持干净，inject 是构建期动作）**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean
```
Expected: upstream 工作树还原（`git -C ../upstream/hermes-studio status` 干净或只剩原有改动）。

- [ ] **Step 8: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add patches/090-cockpit-i18n-workitem-actions-en.ts.patch patches/091-cockpit-i18n-workitem-actions-zh.ts.patch patches/series
git commit -m "feat(cockpit): i18n keys for work-item actions (specify/decompose/status/recovery/diagnostics/notify/comments)"
```

---

## Task 3: 新建 `CockpitConfirmDialog.vue`（轻量确认弹窗）

**Files:**
- Create: `overlay/custom/client/cockpit/components/CockpitConfirmDialog.vue`

- [ ] **Step 1: 新建组件**

新建 `overlay/custom/client/cockpit/components/CockpitConfirmDialog.vue`：

```vue
<script setup lang="ts">
// 轻量确认弹窗：vanilla div + transition，复用 cockpit CSS 变量，不引入 Naive UI。
const props = defineProps<{
  show: boolean
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
}>()
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Transition name="cockpit-dialog">
    <div v-if="show" class="cockpit-confirm" role="dialog" aria-modal="true">
      <div class="cockpit-confirm__mask" @click="emit('cancel')" />
      <div class="cockpit-confirm__box">
        <div v-if="title" class="cockpit-confirm__title">{{ title }}</div>
        <div class="cockpit-confirm__content">{{ content }}</div>
        <div class="cockpit-confirm__actions">
          <button type="button" class="cockpit-confirm__btn" @click="emit('cancel')">
            {{ cancelText || '取消' }}
          </button>
          <button type="button" class="cockpit-confirm__btn is-pri" @click="emit('confirm')">
            {{ confirmText || '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.cockpit-confirm { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
.cockpit-confirm__mask { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
.cockpit-confirm__box { position: relative; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px 20px; max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.cockpit-confirm__title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.cockpit-confirm__content { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px; }
.cockpit-confirm__actions { display: flex; justify-content: flex-end; gap: 8px; }
.cockpit-confirm__btn { font: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}
.cockpit-dialog-enter-active, .cockpit-dialog-leave-active { transition: opacity 0.15s ease; }
.cockpit-dialog-enter-from, .cockpit-dialog-leave-to { opacity: 0; }
</style>
```

- [ ] **Step 2: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitConfirmDialog.vue
git commit -m "feat(cockpit): add lightweight CockpitConfirmDialog component"
```

---

## Task 4: 新建 `CockpitCompletionModal.vue`（完成校验弹窗）

**Files:**
- Create: `overlay/custom/client/cockpit/components/CockpitCompletionModal.vue`

- [ ] **Step 1: 新建组件**

新建 `overlay/custom/client/cockpit/components/CockpitCompletionModal.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// 完成校验弹窗：标记 done 前强制填完成摘要，summary 写入 patch.result。
const props = defineProps<{
  show: boolean
}>()
const emit = defineEmits<{
  submit: [summary: string]
  cancel: []
}>()

const { t } = useI18n()
const summary = ref('')

watch(() => props.show, (v) => {
  if (v) summary.value = ''
})
</script>

<template>
  <Transition name="cockpit-dialog">
    <div v-if="show" class="cockpit-modal" role="dialog" aria-modal="true">
      <div class="cockpit-modal__mask" @click="emit('cancel')" />
      <div class="cockpit-modal__box">
        <div class="cockpit-modal__title">{{ t('cockpit.moveToDone') }}</div>
        <div class="cockpit-modal__hint">{{ t('cockpit.completionSummaryRequired') }}</div>
        <textarea v-model="summary" class="cockpit-modal__textarea"
          :placeholder="t('cockpit.completionSummaryRequired')"
          @keydown.enter.meta="emit('submit', summary.trim())" />
        <div class="cockpit-modal__actions">
          <button type="button" class="cockpit-modal__btn" @click="emit('cancel')">
            {{ t('cockpit.handleLater') }}
          </button>
          <button type="button" class="cockpit-modal__btn is-pri"
            :disabled="!summary.trim()"
            @click="emit('submit', summary.trim())">
            {{ t('cockpit.moveToDone') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.cockpit-modal { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
.cockpit-modal__mask { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
.cockpit-modal__box { position: relative; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px 20px; max-width: 480px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.cockpit-modal__title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.cockpit-modal__hint { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }
.cockpit-modal__textarea { width: 100%; font-family: inherit; font-size: 13px; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; background: var(--bg-card); color: var(--text-primary); min-height: 80px; resize: vertical; box-sizing: border-box; }
.cockpit-modal__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.cockpit-modal__btn { font: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.cockpit-dialog-enter-active, .cockpit-dialog-leave-active { transition: opacity 0.15s ease; }
.cockpit-dialog-enter-from, .cockpit-dialog-leave-to { opacity: 0; }
</style>
```

- [ ] **Step 2: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitCompletionModal.vue
git commit -m "feat(cockpit): add CockpitCompletionModal for done-summary requirement"
```

---

## Task 5: `CockpitWorkspace.vue` — A1 标题可编辑 + C5 评论区

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`

- [ ] **Step 1: A1 标题改为可编辑 input**

`currentTitle` 已在 Task 1 作为 store computed 暴露，本步直接用 `store.currentTitle`，不在组件内重复定义。

在模板 AREA 1 header（:150）把纯显示改为 input：

```vue
        <!-- ═══ AREA 1: Task Header ═══ -->
        <div class="cockpit-workspace__header">
          <input class="cockpit-workspace__title-input"
            :value="store.currentTitle"
            :placeholder="t('cockpit.editTitlePlaceholder')"
            @input="store.setPendingTitle(($event.target as HTMLInputElement).value)" />
          <div v-if="taskSummary" class="cockpit-workspace__summary">{{ taskSummary }}</div>
          <div class="cockpit-workspace__meta-row">
            <span class="cockpit-workspace__status-chip" :class="'is-' + (task?.status ?? '')">{{ task?.status ?? '' }}</span>
            <span class="cockpit-workspace__priority-tag">{{ 'P' + (task?.priority ?? '—') }}</span>
          </div>
        </div>
```

在 `<style>` 中 `.cockpit-workspace__title`（:319）旁加 input 样式：

```scss
.cockpit-workspace__title-input { font-size: 16px; font-weight: 700; color: var(--text-primary); line-height: 1.4; margin-bottom: 6px; width: 100%; border: none; background: transparent; border-bottom: 1px solid transparent; padding: 2px 0; font-family: inherit;
  &:hover { border-bottom-color: var(--border-color); }
  &:focus { border-bottom-color: var(--accent-primary); outline: none; }
}
```

- [ ] **Step 2: C5 评论区**

在 `<script setup>` 加评论草稿绑定与列表数据：

```ts
// 评论草稿
const pendingComment = computed(() => workItem.value?.pendingComment ?? '')
function onCommentInput(e: Event) {
  store.setPendingComment((e.target as HTMLTextAreaElement).value)
}
const comments = computed(() => detail.value?.comments ?? [])
```

在模板 AREA 3 之后、Footer（:294）之前插入评论区：

```vue
        <!-- ═══ 评论区（草稿）═══ -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.comments') }}</label>
          <div class="cockpit-workspace__comment-list">
            <div v-for="c in comments" :key="c.id" class="cockpit-workspace__comment">
              <span class="cockpit-workspace__comment-author">{{ c.author || '?' }}</span>
              <span class="cockpit-workspace__comment-body">{{ c.body }}</span>
            </div>
            <div v-if="!comments.length" class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</div>
          </div>
          <textarea class="cockpit-workspace__textarea"
            :value="pendingComment"
            :placeholder="t('cockpit.addCommentPlaceholder')"
            @input="onCommentInput" />
        </div>
```

在 `<style>` 末尾加评论样式：

```scss
.cockpit-workspace__comment-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; max-height: 180px; overflow-y: auto; }
.cockpit-workspace__comment { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; background: var(--bg-secondary); border-radius: 6px; font-size: 12px; }
.cockpit-workspace__comment-author { font-weight: 600; color: var(--accent-primary); font-size: 11px; }
.cockpit-workspace__comment-body { color: var(--text-primary); line-height: 1.4; white-space: pre-wrap; }
```

- [ ] **Step 3: 验证编译**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject && npx vue-tsc --noEmit -p ../upstream/hermes-studio/packages/client/tsconfig.json 2>&1 | grep -i "CockpitWorkspace" | head
npm run clean
```
Expected: 无 CockpitWorkspace 相关类型错误（vue-tsc 全量可能有既有 noise，只看本文件）。

- [ ] **Step 4: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitWorkspace.vue
git commit -m "feat(cockpit): editable title input (A1) + comments section (C5) in work-item"
```

---

## Task 6: `CockpitWorkspace.vue` — 动作命令区 B1/B2（Specify/Decompose）

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`

- [ ] **Step 1: 加 execAction 封装 + B1/B2**

在 `<script setup>` 顶部 import 区加：

```ts
import * as kanbanApi from '@/api/hermes/kanban'
```

（`useKanbanStore` 已 import 于 :5，`kanbanStore` 已实例化于 :9。）

在 `<script setup>` 末尾（现有函数后）加：

```ts
// ── 动作命令区（即时执行）──
const actionBusy = ref(false)
const actionMsg = ref<{ ok: boolean; text: string } | null>(null)
const reassignProfile = ref('')

async function execAction(label: string, fn: () => Promise<any>) {
  const tid = store.selectedTaskId
  if (actionBusy.value || !tid) return
  actionBusy.value = true
  actionMsg.value = null
  try {
    await fn()
    await store.loadTaskDetail(tid)
    actionMsg.value = { ok: true, text: label + ' ✓' }
  } catch (err: any) {
    actionMsg.value = { ok: false, text: `${label} 失败: ${err?.message || String(err)}` }
  } finally {
    actionBusy.value = false
  }
}

// B1/B2 Specify / Decompose
function doSpecify() {
  if (!task.value) return
  execAction('Specify', async () => {
    const res = await kanbanStore.specifyTask(task.value!.id) as any
    if (res && !res.ok) throw new Error(res?.reason || 'unknown')
    if (res?.new_title) actionMsg.value = { ok: true, text: `Specified — retitled: ${res.new_title}` }
  })
}
function doDecompose() {
  if (!task.value) return
  execAction('Decompose', async () => {
    const res = await kanbanStore.decomposeTask(task.value!.id) as any
    if (res && !res.ok) throw new Error(res?.reason || 'unknown')
    if (res?.fanout && res?.child_ids?.length) {
      actionMsg.value = { ok: true, text: `Decomposed into ${res.child_ids.length} children: ${res.child_ids.join(', ')}` }
    } else if (res?.new_title) {
      actionMsg.value = { ok: true, text: `Single task (no fanout) — retitled: ${res.new_title}` }
    }
  })
}
```

- [ ] **Step 2: 模板插入动作区 Specify/Decompose**

在 AREA 2 之后、AREA 3 之前（:248 Description section 后、:249 AREA 3 前）插入动作区开头：

```vue
        <!-- ═══ 动作命令区（即时执行）═══ -->
        <div class="cockpit-workspace__section cockpit-workspace__actions">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.actions') }}</label>
          <div class="cockpit-workspace__action-row">
            <button v-if="task?.status === 'triage'" type="button" class="cockpit-workspace__btn-mini"
              :disabled="actionBusy" @click="doSpecify">✨ {{ t('cockpit.specify') }}</button>
            <button v-if="task?.status === 'triage'" type="button" class="cockpit-workspace__btn-mini"
              :disabled="actionBusy" @click="doDecompose">⚗ {{ t('cockpit.decompose') }}</button>
          </div>
```

（B3 状态按钮组、actionMsg 显示、B5/B6/B7/B8 在后续 Task 接续此区块。）

在 `<style>` 加：

```scss
.cockpit-workspace__actions { border-top: 1px solid var(--border-color); padding-top: 12px; }
.cockpit-workspace__action-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.cockpit-workspace__btn-mini { font: inherit; font-size: 12px; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.cockpit-workspace__action-msg { font-size: 11px; margin-top: 6px; padding: 4px 8px; border-radius: 4px; }
.cockpit-workspace__action-msg.is-ok { color: var(--success, #52c41a); background: rgba(82,196,26,0.08); }
.cockpit-workspace__action-msg.is-err { color: var(--error); background: rgba(255,77,79,0.08); }
```

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitWorkspace.vue
git commit -m "feat(cockpit): add Specify/Decompose actions (B1/B2) with execAction wrapper"
```

---

## Task 7: B3 状态流转 + B4 完成校验弹窗

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`

- [ ] **Step 1: 加 confirm/completion 状态与逻辑**

在 `<script setup>` 加 import 与状态：

```ts
import CockpitConfirmDialog from './CockpitConfirmDialog.vue'
import CockpitCompletionModal from './CockpitCompletionModal.vue'
import type { KanbanTaskStatus } from '@/api/hermes/kanban'

// B3/B4 状态
const confirmState = ref<{ show: boolean; status: KanbanTaskStatus; content: string } | null>(null)
const completionShow = ref(false)
const pendingDonePatch = ref<kanbanApi.KanbanTaskPatch | null>(null)

// 状态门禁（搬自 KanbanTaskDrawer.vue:344-355）
function canMoveTo(status: KanbanTaskStatus): boolean {
  if (!task.value) return false
  const s = task.value.status as KanbanTaskStatus
  switch (status) {
    case 'triage': return s !== 'triage'
    case 'ready': return s !== 'ready'
    case 'blocked': return s === 'running' || s === 'ready'
    case 'done': return s === 'running' || s === 'ready' || s === 'blocked'
    case 'archived': return s !== 'archived'
    default: return false
  }
}

function attemptStatusChange(status: KanbanTaskStatus) {
  if (!task.value || !canMoveTo(status)) return
  if (status === 'done') {
    pendingDonePatch.value = { status: 'done' }
    completionShow.value = true
    return
  }
  const confirmMap: Partial<Record<KanbanTaskStatus, string>> = {
    blocked: t('cockpit.confirmBlocked'),
    archived: t('cockpit.confirmArchive'),
  }
  const content = confirmMap[status]
  if (content) {
    confirmState.value = { show: true, status, content }
  } else {
    doStatusPatch({ status })
  }
}

function doStatusPatch(patch: kanbanApi.KanbanTaskPatch) {
  execAction('Status', () => kanbanStore.patchTask(task.value!.id, patch))
}

function confirmStatusChange() {
  if (!confirmState.value) return
  doStatusPatch({ status: confirmState.value.status })
  confirmState.value = null
}

function handleCompletionSubmit(summary: string) {
  if (!summary) return
  completionShow.value = false
  const patch = { ...(pendingDonePatch.value || {}), result: summary } as kanbanApi.KanbanTaskPatch
  pendingDonePatch.value = null
  doStatusPatch(patch)
}
```

- [ ] **Step 2: 模板加状态按钮组 + 弹窗**

在 Task 6 插入的动作区 `</div>`（action-row 闭合后、区块闭合前）追加：

```vue
          <div class="cockpit-workspace__action-row">
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('triage')" @click="attemptStatusChange('triage')">→ {{ t('cockpit.moveToTriage') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('ready')" @click="attemptStatusChange('ready')">→ {{ t('cockpit.moveToReady') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('blocked')" @click="attemptStatusChange('blocked')">⚠ {{ t('cockpit.moveToBlocked') }}</button>
            <button v-if="task?.status === 'blocked'" type="button" class="cockpit-workspace__btn-mini"
              @click="doStatusPatch({ status: 'ready' })">{{ t('cockpit.unblock') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini is-pri"
              :disabled="!canMoveTo('done')" @click="attemptStatusChange('done')">✓ {{ t('cockpit.moveToDone') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('archived')" @click="attemptStatusChange('archived')">📦 {{ t('cockpit.moveToArchived') }}</button>
          </div>
          <div v-if="actionMsg" :class="['cockpit-workspace__action-msg', actionMsg.ok ? 'is-ok' : 'is-err']">
            {{ actionMsg.text }}
          </div>
        </div>

        <!-- B3 确认弹窗 -->
        <CockpitConfirmDialog
          :show="!!confirmState?.show"
          :content="confirmState?.content || ''"
          @confirm="confirmStatusChange"
          @cancel="confirmState = null" />
        <!-- B4 完成校验弹窗 -->
        <CockpitCompletionModal
          :show="completionShow"
          @submit="handleCompletionSubmit"
          @cancel="completionShow = false" />
```

在 `<style>` 的 `.cockpit-workspace__btn-mini` 加 `.is-pri` 变体（若 Task 6 未加）：

```scss
.cockpit-workspace__btn-mini.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
```

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitWorkspace.vue
git commit -m "feat(cockpit): add status transitions (B3) + completion modal (B4)"
```

---

## Task 8: B5/B6 Reclaim & Reassign（仅 running）

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`

- [ ] **Step 1: 加 reclaim/reassign 逻辑**

在 `<script setup>` 动作命令区加：

```ts
// B5/B6 Recovery（仅 running）
function doReclaim() {
  if (!task.value) return
  execAction('Reclaim', () => kanbanStore.reclaimTask(task.value!.id))
}
function doReassign() {
  if (!task.value || !reassignProfile.value.trim()) return
  const profile = reassignProfile.value.trim()
  execAction('Reassign', () => kanbanStore.reassignTask(task.value!.id, profile, { reclaim: true }))
}
```

- [ ] **Step 2: 模板加 recovery 区**

在状态按钮组 action-msg 之后、动作区 `</div>` 闭合前（即 B3 区块内、弹窗之前）插入：

```vue
        <!-- B5/B6 Recovery（仅 running） -->
        <div v-if="task?.status === 'running'" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.recovery') }}</label>
          <div class="cockpit-workspace__action-row">
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="actionBusy" @click="doReclaim">{{ t('cockpit.reclaim') }}</button>
            <input v-model="reassignProfile" class="cockpit-workspace__link-input"
              :placeholder="t('cockpit.reassignProfile')" style="max-width:160px" />
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="actionBusy || !reassignProfile.trim()" @click="doReassign">{{ t('cockpit.reassign') }}</button>
          </div>
        </div>
```

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitWorkspace.vue
git commit -m "feat(cockpit): add Reclaim/Reassign recovery actions (B5/B6) for running tasks"
```

---

## Task 9: B7 Diagnostics（复用 `KanbanDiagnosticsSection`）

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`

- [ ] **Step 1: 加 import + 诊断数据加载**

在 `<script setup>` 顶部 import 加：

```ts
import KanbanDiagnosticsSection from '@/custom/kanban/components/KanbanDiagnosticsSection.vue'
```

加诊断数据 computed + 任务切换刷新：

```ts
// B7 Diagnostics（复用 kanban 子组件）
const diagItems = computed(() => {
  // kanbanStore.diagnostics 是 KanbanDiagnostic[]，每项含 .diagnostics: KanbanDiagnosticItem[]
  const list = (kanbanStore.diagnostics ?? []) as any[]
  // 展平：取所有项的 diagnostics 合并
  return list.flatMap((d: any) => d.diagnostics ?? [])
})
const assigneeList = computed(() => (kanbanStore.assignees ?? []) as string[])

function refreshDiagnostics() {
  if (store.selectedTaskId) {
    kanbanStore.fetchDiagnostics().catch(() => {})
  }
}
```

扩展现有 watch（:115-118）合并诊断刷新：

```ts
watch(() => store.selectedTaskId, () => {
  newParentId.value = ''
  newChildId.value = ''
  refreshDiagnostics()
  refreshHomeChannels()
})
```
（`refreshHomeChannels` 在 Task 10 定义；若先做 Task 9，临时只加 `refreshDiagnostics()`，Task 10 再补 home channels 行。）

- [ ] **Step 2: 模板挂载子组件**

在 B5/B6 recovery 区之后、动作区闭合 `</div>` 之前插入：

```vue
        <!-- B7 Diagnostics -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.diagnostics') }}</label>
          <KanbanDiagnosticsSection
            v-if="task"
            :task="task"
            :diagnostics="diagItems"
            :assignees="assigneeList"
            @refresh="refreshDiagnostics" />
        </div>
```

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitWorkspace.vue
git commit -m "feat(cockpit): mount KanbanDiagnosticsSection (B7) reusing kanban component"
```

---

## Task 10: B8 Home-channel 通知订阅

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`

- [ ] **Step 1: 加 home-channel 状态与逻辑**

在 `<script setup>` 加：

```ts
import type { HomeChannel } from '@/api/hermes/kanban'

// B8 Home-channel 通知订阅
const homeChannels = ref<HomeChannel[]>([])
const homeBusy = ref<Record<string, boolean>>({})

async function refreshHomeChannels() {
  const tid = store.selectedTaskId
  if (!tid) { homeChannels.value = []; return }
  try {
    homeChannels.value = await kanbanApi.getHomeChannels(tid, { board: kanbanStore.selectedBoard })
  } catch {
    homeChannels.value = []
  }
}

async function toggleHomeSubscription(ch: HomeChannel) {
  const tid = store.selectedTaskId
  if (!tid) return
  homeBusy.value[ch.platform] = true
  try {
    if (ch.subscribed) {
      await kanbanApi.unsubscribeHomeChannel(tid, ch.platform, { board: kanbanStore.selectedBoard })
    } else {
      await kanbanApi.subscribeHomeChannel(tid, ch.platform, { board: kanbanStore.selectedBoard })
    }
    await refreshHomeChannels()
  } catch (err: any) {
    actionMsg.value = { ok: false, text: `通知订阅失败: ${err?.message || String(err)}` }
  } finally {
    homeBusy.value[ch.platform] = false
  }
}
```

确保 Task 9 的 watch 已含 `refreshHomeChannels()` 调用（若 Task 9 临时未加，本步补上）。

- [ ] **Step 2: 模板加 home-channel 区**

在 B7 诊断区之后、动作区闭合前插入：

```vue
        <!-- B8 Home-channel 通知订阅 -->
        <div v-if="homeChannels.length" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.notifyHomeChannels') }}</label>
          <div class="cockpit-workspace__action-row">
            <button v-for="ch in homeChannels" :key="ch.platform" type="button"
              class="cockpit-workspace__btn-mini"
              :class="{ 'is-on': ch.subscribed }"
              :disabled="homeBusy[ch.platform]"
              @click="toggleHomeSubscription(ch)">
              {{ ch.platform }} · {{ ch.subscribed ? t('cockpit.unsubscribe') : t('cockpit.subscribe') }}
            </button>
          </div>
        </div>
```

在 `<style>` 加订阅态样式：

```scss
.cockpit-workspace__btn-mini.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
```

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/components/CockpitWorkspace.vue
git commit -m "feat(cockpit): add home-channel notify subscriptions (B8)"
```

---

## Task 11: 全量验证 + 收尾

**Files:** 无（验证）

- [ ] **Step 1: 注入 + 类型检查**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
npx vue-tsc --noEmit -p ../upstream/hermes-studio/packages/client/tsconfig.json 2>&1 | grep -iE "CockpitWorkspace|cockpit-kv|cockpit\.ts" | head -20
```
Expected: 无本任务相关文件的类型错误。

- [ ] **Step 2: 全量测试**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npx vitest run
```
Expected: 全部 PASS。

- [ ] **Step 3: 还原 upstream 工作树**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean
git -C ../upstream/hermes-studio status --short
```
Expected: upstream 干净（或只剩与本项目无关的既有改动）。

- [ ] **Step 4: 手测清单（人工，启动 dev server 后逐项）**

启动：
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
cd ../upstream/hermes-studio
npm run dev
```
逐项验证：
- A1：标题 input 可编辑，改后点「提交」刷新页面标题已变。
- B1/B2：triage 任务显示 Specify/Decompose 按钮，点击后 actionMsg 显示结果。
- B3：状态按钮按 canMoveTo 动态 disabled；done 弹完成弹窗（必填 summary）；blocked/archived 弹确认弹窗。
- B5/B6：running 任务显示 Reclaim/Reassign；Reassign 填 profile 后生效。
- B7：诊断区显示 KanbanDiagnosticsSection 内容。
- B8：home-channel 平台按钮可订阅/退订。
- C5：评论区显示已有评论；输入后提交，刷新出现新评论（与决策评论并存）。
- 回归：A2-A7、D1-D4 原有功能正常；草稿提交后草稿清空。

手测后还原：`cd /Volumes/nvme2230/lab/ncwk/overlay && npm run clean`

- [ ] **Step 5: 合入 main（按 AGENTS.md）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge feat/cockpit-workitem-kanban-migration
```
Expected: 合并成功无冲突（main 上 085/089 的改动与本分支无关）。

---

## Self-Review

**1. Spec coverage:**
- A1 标题 → Task 1（store）+ Task 5（UI）✓
- B1/B2 Specify/Decompose → Task 6 ✓
- B3 状态流转 → Task 7 ✓
- B4 完成校验 → Task 7 ✓
- B5/B6 Reclaim/Reassign → Task 8 ✓
- B7 Diagnostics → Task 9 ✓
- B8 Home-channel → Task 10 ✓
- C5 评论 → Task 1（store flush）+ Task 5（UI）✓
- i18n → Task 2 ✓
- 不迁移项（C1-C4、D 保留）→ 无任务，符合 spec ✓
- 验证 → Task 11 ✓

**2. Placeholder scan:** 无 TBD/TODO。每个 code step 含完整代码。git commit 命令完整。

**3. Type consistency:**
- `KanbanTaskPatch`（含 `title`/`result`/`status`）— Task 1/7 使用一致 ✓
- `setPendingTitle`/`setPendingComment`/`currentTitle` — Task 1 定义，Task 5 使用，名称一致 ✓
- `execAction(label, fn)` — Task 6 定义，Task 7/8 复用，签名一致 ✓
- `canMoveTo`/`attemptStatusChange`/`doStatusPatch` — Task 7 内部一致 ✓
- `KanbanDiagnosticsSection` props `{task, diagnostics, assignees}` — Task 9 与已确认 props 一致 ✓
- `HomeChannel` 类型 import — Task 10 与 kanban api 一致 ✓
- `refreshHomeChannels` — Task 10 定义，Task 9 watch 引用（顺序：Task 9 先做时 watch 含 refreshDiagnostics，Task 10 补 refreshHomeChannels）✓

注：Task 1 Step 4 提到 `currentTitle` 放 store（可测），而 Task 5 Step 1 又在组件内定义 `currentTitle` computed —— 二者重复。**修正：以 store 的 `currentTitle` 为准**，Task 5 Step 1 不重复定义，直接用 `store.currentTitle`。下文修正。
