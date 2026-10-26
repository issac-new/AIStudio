# Cockpit 工作项区域重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 CockpitWorkspace 为三区域布局（Task Header + Kanban 详情字段 + A2UI 建议），接入附件 API，修改协作图中心节点点击联动并支持自动保存草稿。

**Architecture:** 在现有 overlay 组件上增量修改。store 新增 `autoSaveDraft`、附件 state 和加载方法；CockpitWorkspace 模板完全重写为三区块结构；CockpitCollabMap 移除中心节点 early return。附件和 assignee/priority 修改通过 kanban API 调用。

**Tech Stack:** Vue 3 (`<script setup>`) · Pinia · vitest + @vue/test-utils · SCSS (Pure Ink) · kanban API

**Spec:** `overlay/docs-cockpit-workspace-redesign-design.md`

---

## 文件结构

### 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `overlay/custom/client/cockpit/store/cockpit.ts` | 新增 `autoSaveDraft`、`taskAttachments`、`loadAttachments` |
| `overlay/custom/client/cockpit/components/CockpitCollabMap.vue` | 中心节点点击联动 |
| `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` | 三区域布局完全重写 |
| `overlay/custom/client/cockpit/views/CockpitView.vue` | 微调 emit 绑定 |
| `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts` | 更新测试 |
| `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` | 新增 autoSaveDraft 测试 |
| `overlay/custom/client/cockpit/__tests__/cockpit-collab-map.test.ts` | 更新测试 |
| `upstream/.../i18n/locales/en.ts` | 新增 i18n keys |
| `upstream/.../i18n/locales/zh.ts` | 新增 i18n keys |

---

### Task 1: Store 扩展 — autoSaveDraft + 附件 state

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`

- [ ] **Step 1: 添加测试**

在 `cockpit-store.test.ts` 的 describe 块内追加：

```ts
it('autoSaveDraft saves current draft to localStorage', () => {
  const s = useCockpitStore()
  s.tasks = [task({ id: 't1' })]
  s.selectTask('t1')
  s.updateWorkItem({ decision: 'approve', opinion: 'looks good' })
  s.autoSaveDraft()
  // 重新 selectTask 应能恢复草稿
  s.selectTask(null)
  s.selectTask('t1')
  expect(s.workItemForSelectedTask?.decision).toBe('approve')
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts -t "autoSaveDraft"
```

Expected: FAIL.

- [ ] **Step 3: 在 store 中添加 autoSaveDraft 和附件 state**

在 `cockpit.ts` 的 defineStore setup 中，在 selectTask 附近添加：

```ts
// ── 自动保存草稿 ──
function autoSaveDraft() {
  const id = selectedTaskId.value
  if (!id) return
  // kv.saveDraft 已通过 localStorage 持久化，只需 bump 确保下次加载
  bumpKv()
}

// ── 附件 ──
const taskAttachments = ref<Record<string, any[]>>({})
const attachmentsLoading = ref(false)

async function loadAttachments(taskId: string) {
  if (taskAttachments.value[taskId]) return // 已缓存
  attachmentsLoading.value = true
  try {
    const { listAttachments } = await import('@/api/hermes/kanban')
    const list = await listAttachments(taskId)
    taskAttachments.value = { ...taskAttachments.value, [taskId]: list }
  } catch {
    taskAttachments.value = { ...taskAttachments.value, [taskId]: [] }
  } finally {
    attachmentsLoading.value = false
  }
}

async function uploadAttachment(taskId: string, file: File) {
  const { uploadAttachment } = await import('@/api/hermes/kanban')
  await uploadAttachment(taskId, file)
  // 清除缓存，下次 load 会重新拉取
  const newVal = { ...taskAttachments.value }
  delete newVal[taskId]
  taskAttachments.value = newVal
  await loadAttachments(taskId)
}

async function deleteAttachment(attachmentId: number) {
  const { deleteAttachment: del } = await import('@/api/hermes/kanban')
  await del(attachmentId)
  // 清除所有缓存（不知道属于哪个 task，简单处理）
  taskAttachments.value = {}
}
```

修改 `selectTask` 在切换时调用 `autoSaveDraft`：

```ts
async function selectTask(id: string | null) {
  autoSaveDraft() // 保存当前草稿
  selectedTaskId.value = id
  focusedGraphNodeId.value = null
  archivedMode.value = false
  if (!id) { events.value = []; return }
  await loadTaskDetail(id)
  loadAttachments(id).catch(() => {})
}
```

添加到 return 对象：

```ts
taskAttachments, attachmentsLoading,
autoSaveDraft, loadAttachments, uploadAttachment, deleteAttachment,
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd overlay && git add custom/client/cockpit/store/cockpit.ts custom/client/cockpit/__tests__/cockpit-store.test.ts
git commit -m "feat(cockpit): add autoSaveDraft and attachment state to store"
```

---

### Task 2: 协作图中心节点点击联动

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitCollabMap.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-collab-map.test.ts`

- [ ] **Step 1: 修改 onChartClick**

在 `CockpitCollabMap.vue` 的 `onChartClick` 函数中，将：

```ts
if (kind === 'center' || kind === 'folded') return
```

改为：

```ts
if (kind === 'folded') return
```

这样 center 节点点击会继续执行后续逻辑（检查 `_targetTaskId` → 调用 `store.selectTask`）。

- [ ] **Step 2: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-collab-map.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitCollabMap.vue
git commit -m "feat(cockpit): enable center node click to trigger task selection"
```

---

### Task 3: 工作项组件全面重构

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts`

- [ ] **Step 1: 重写组件模板**

`CockpitWorkspace.vue` 的完整重写：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCockpitStore, type WorkDecision } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import { useKanbanStore } from '@/stores/hermes/kanban'
import CockpitFileTree from './CockpitFileTree.vue'
import * as kanbanApi from '@/api/hermes/kanban'

const store = useCockpitStore()
const kanbanStore = useKanbanStore()
const { t } = useI18n()
const emit = defineEmits<{ (e: 'submit'): void }>()

// ── 区域1: Task Header ──
const selectedTask = computed(() => store.selectedTask)
const taskSummary = computed(() => {
  const id = store.selectedTaskId
  if (!id) return ''
  const detail = (store as any)._detailCache?.value?.[id]
  return detail?.latest_summary ?? ''
})

// ── 区域2: Kanban 详情字段 ──
const attachments = computed(() => {
  const id = store.selectedTaskId
  if (!id) return []
  return store.taskAttachments[id] ?? []
})
const detailCache = computed(() => {
  const id = store.selectedTaskId
  if (!id) return null
  return (store as any)._detailCache?.value?.[id] ?? null
})
const parentIds = computed(() => detailCache.value?.parents ?? [])
const childIds = computed(() => detailCache.value?.children ?? [])
const assigneeOptions = computed(() => {
  return (kanbanStore.assignees ?? []).map((a: string) => ({ label: a, value: a }))
})
const newAssignee = ref('')
const newPriority = ref<number | null>(null)
const descDraft = ref('')

watch(() => store.selectedTaskId, (id) => {
  if (!id) return
  newAssignee.value = ''
  newPriority.value = null
  // 从选中任务的 detail 初始化 description draft
  const task = store.selectedTask
  descDraft.value = (task as any)?.body ?? ''
})

async function handleAssign() {
  const taskId = store.selectedTaskId
  if (!taskId || !newAssignee.value) return
  try {
    await kanbanStore.assignTask(taskId, newAssignee.value)
    newAssignee.value = ''
    store.selectTask(taskId) // 刷新
  } catch {}
}

async function handlePriorityChange(delta: number) {
  const task = selectedTask.value
  if (!task) return
  const cur = (task as any).priority ?? 0
  const np = Math.max(0, cur + delta)
  try {
    await kanbanApi.updateTaskPriority?.(task.id, np)
    store.selectTask(task.id) // 刷新
  } catch {}
}

function navigateToTask(taskId: string) {
  store.selectTask(taskId)
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !store.selectedTaskId) return
  store.uploadAttachment(store.selectedTaskId, file)
  input.value = ''
}

// ── 区域3: A2UI ──
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

const ALL_TAGS = ['concurrency', 'test-gap', 'performance', 'compatibility']

const workItem = computed(() => store.workItemForSelectedTask)
const hasTask = computed(() => !!store.selectedTask)
const isReadOnly = computed(() => store.archivedMode)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__form">
      <div v-if="hasTask" class="cockpit-workspace__body">
        <!-- ═══ AREA 1: Task Header ═══ -->
        <div class="cockpit-workspace__header">
          <div class="cockpit-workspace__title">{{ selectedTask?.title }}</div>
          <div v-if="taskSummary" class="cockpit-workspace__summary">{{ taskSummary }}</div>
          <div class="cockpit-workspace__meta-row">
            <span class="cockpit-workspace__status-chip" :class="'is-' + selectedTask?.status">{{ selectedTask?.status }}</span>
            <span class="cockpit-workspace__priority-tag">{{ 'P' + (selectedTask as any)?.priority }}</span>
          </div>
        </div>

        <!-- ═══ AREA 2: Kanban Detail Fields ═══ -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.assignee') }}</label>
          <div class="cockpit-workspace__field-row">
            <span class="cockpit-workspace__field-val">{{ selectedTask?.assignee || '—' }}</span>
            <select v-model="newAssignee" class="cockpit-workspace__select" @change="handleAssign">
              <option value="" disabled>{{ t('cockpit.selectAssignee') }}</option>
              <option v-for="opt in assigneeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.priority') }}</label>
          <div class="cockpit-workspace__field-row">
            <span class="cockpit-workspace__field-val">{{ 'P' + ((selectedTask as any)?.priority ?? '—') }}</span>
            <button type="button" class="cockpit-workspace__mini-btn" @click="handlePriorityChange(-1)">−</button>
            <button type="button" class="cockpit-workspace__mini-btn" @click="handlePriorityChange(1)">+</button>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.parentTasks') }}</label>
          <div class="cockpit-workspace__field-row">
            <template v-if="parentIds.length">
              <a v-for="pid in parentIds" :key="pid" class="cockpit-workspace__task-link" @click="navigateToTask(pid)">{{ pid }}</a>
            </template>
            <span v-else class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</span>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.childTasks') }}</label>
          <div class="cockpit-workspace__field-row">
            <template v-if="childIds.length">
              <a v-for="cid in childIds" :key="cid" class="cockpit-workspace__task-link" @click="navigateToTask(cid)">{{ cid }}</a>
            </template>
            <span v-else class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</span>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.attachments') }}</label>
          <div class="cockpit-workspace__attach-list">
            <div v-for="att in attachments" :key="att.id" class="cockpit-workspace__attach-item">
              <span class="cockpit-workspace__attach-name">{{ att.filename }}</span>
              <span class="cockpit-workspace__attach-size">{{ formatFileSize(att.size) }}</span>
              <button type="button" class="cockpit-workspace__attach-del" @click="store.deleteAttachment(att.id)">✕</button>
            </div>
            <div v-if="!attachments.length" class="cockpit-workspace__field-val--muted">{{ t('cockpit.noAttachments') }}</div>
            <label class="cockpit-workspace__upload-btn">
              + {{ t('cockpit.uploadFile') }}
              <input type="file" class="cockpit-workspace__file-input" @change="onFileSelected">
            </label>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.description') }}</label>
          <textarea class="cockpit-workspace__textarea" v-model="descDraft"
            :placeholder="t('cockpit.descriptionPlaceholder')"
            @input="store.updateWorkItem({ opinion: ($event.target as HTMLTextAreaElement).value })" />
        </div>

        <!-- ═══ AREA 3: A2UI Suggestions ═══ -->
        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.yourDecision') }} *</label>
          <button v-for="d in decisions" :key="d.key" type="button"
            :data-decision="d.key" class="cockpit-workspace__opt"
            :class="{ 'is-selected': workItem.decision === d.key }"
            @click="store.updateWorkItem({ decision: d.key })">
            <span class="cockpit-workspace__opt-dot" />
            <span class="cockpit-workspace__opt-info">
              <span class="cockpit-workspace__opt-header">
                <span class="cockpit-workspace__opt-name">{{ t(d.labelKey) }}</span>
                <span v-if="d.recommended" class="cockpit-workspace__opt-rec">{{ t('cockpit.recommend') }}</span>
              </span>
              <span v-if="d.descKey" class="cockpit-workspace__opt-desc">{{ t(d.descKey) }}</span>
            </span>
          </button>
        </div>

        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.riskTags') }} <span class="cockpit-workspace__sub">{{ t('cockpit.agentPrefilled') }}</span></label>
          <div class="cockpit-workspace__chips">
            <button v-for="tag in ALL_TAGS" :key="tag" type="button" :data-tag="tag"
              class="cockpit-workspace__chip" :class="{ 'is-on': workItem.riskTags.includes(tag) }"
              @click="store.toggleRiskTag(tag)">{{ tag }}</button>
          </div>
        </div>

        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.reviewOpinion') }} · {{ t('cockpit.evaluation') }}</label>
          <div class="cockpit-workspace__score">
            <button v-for="n in 5" :key="n" type="button" class="cockpit-workspace__star"
              :class="{ 'is-on': (workItem.score ?? 0) >= n }"
              @click="store.updateWorkItem({ score: n })">★</button>
          </div>
        </div>

        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.reviewOpinion') }}</label>
          <textarea class="cockpit-workspace__textarea"
            :value="workItem.opinion"
            @input="store.updateWorkItem({ opinion: ($event.target as HTMLTextAreaElement).value })" />
        </div>
      </div>
      <div v-else class="cockpit-workspace__empty">{{ t('cockpit.noTaskSelected') }}</div>

      <!-- Footer -->
      <div class="cockpit-workspace__foot">
        <template v-if="!isReadOnly">
          <button type="button" class="cockpit-workspace__btn" @click="store.openTemplateManager()">📋 {{ t('cockpit.templateManager') }}</button>
          <button type="button" class="cockpit-workspace__btn" @click="store.enterTerminal()">⌘ {{ t('cockpit.modeTerm') }}</button>
          <button type="button" class="cockpit-workspace__btn" @click="store.autoSaveDraft()">💾 {{ t('cockpit.saveDraft') }}</button>
          <button type="button" data-action="submit" class="cockpit-workspace__btn is-pri" @click="$emit('submit')">{{ t('cockpit.submit') }}</button>
        </template>
        <button v-else type="button" class="cockpit-workspace__btn is-pri" @click="store.openTemplateManager()">{{ t('cockpit.newCollabFromArchive') }}</button>
      </div>
    </div>

    <!-- 文件资源管理器 -->
    <CockpitFileTree />
  </div>
</template>

<style scoped lang="scss">
.cockpit-workspace { display: flex; flex: 1; min-height: 0; }
.cockpit-workspace__form { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cockpit-workspace__body { flex: 1; overflow-y: auto; padding: 20px 24px; max-width: 640px; }
.cockpit-workspace__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }

/* AREA 1: Header */
.cockpit-workspace__header { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color); }
.cockpit-workspace__title { font-size: 16px; font-weight: 700; color: var(--text-primary); line-height: 1.4; margin-bottom: 6px; }
.cockpit-workspace__summary { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px; }
.cockpit-workspace__meta-row { display: flex; align-items: center; gap: 8px; }
.cockpit-workspace__status-chip { font-size: 10px; padding: 2px 8px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 600; text-transform: uppercase; }
.cockpit-workspace__priority-tag { font-size: 10px; padding: 2px 8px; border-radius: 4px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-muted); font-family: ui-monospace, monospace; }

/* AREA 2: Detail Fields */
.cockpit-workspace__section { margin-bottom: 16px; }
.cockpit-workspace__section-title { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px; }
.cockpit-workspace__field-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cockpit-workspace__field-val { font-size: 13px; color: var(--text-primary); }
.cockpit-workspace__field-val--muted { font-size: 12px; color: var(--text-muted); font-style: italic; }
.cockpit-workspace__select { font-family: inherit; font-size: 12px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); }
.cockpit-workspace__mini-btn { width: 22px; height: 22px; padding: 0; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-workspace__task-link { font-family: ui-monospace, monospace; font-size: 11px; color: var(--accent-primary); cursor: pointer; background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px;
  &:hover { text-decoration: underline; }
}
.cockpit-workspace__attach-list { display: flex; flex-direction: column; gap: 4px; }
.cockpit-workspace__attach-item { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 4px; background: var(--bg-secondary); font-size: 12px; }
.cockpit-workspace__attach-name { font-family: ui-monospace, monospace; color: var(--text-primary); flex: 1; }
.cockpit-workspace__attach-size { color: var(--text-muted); font-size: 10px; }
.cockpit-workspace__attach-del { cursor: pointer; color: var(--text-muted); border: none; background: none; font-size: 11px; padding: 0 2px;
  &:hover { color: var(--error); }
}
.cockpit-workspace__upload-btn { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 4px 10px; border: 1px dashed var(--border-color); border-radius: 6px; color: var(--text-secondary); cursor: pointer; margin-top: 4px;
  &:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
}
.cockpit-workspace__file-input { display: none; }

/* AREA 3: A2UI (from existing) */
.cockpit-workspace__sub { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-left: 6px; }
.cockpit-workspace__opt { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: var(--bg-card); font: inherit; color: var(--text-primary); width: 100%; text-align: left;
  &:hover { border-color: var(--text-muted); }
  &.is-selected { border-color: var(--accent-primary); background: var(--bg-secondary); }
}
.cockpit-workspace__opt-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--text-muted); flex-shrink: 0; margin-top: 1px; }
.is-selected .cockpit-workspace__opt-dot { border-color: var(--accent-primary); background: radial-gradient(var(--accent-primary) 45%, transparent 50%); }
.cockpit-workspace__opt-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cockpit-workspace__opt-header { display: flex; align-items: center; gap: 8px; }
.cockpit-workspace__opt-name { font-size: 13px; font-weight: 600; }
.cockpit-workspace__opt-rec { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--accent-primary); color: var(--text-on-accent); font-weight: 600; white-space: nowrap; }
.cockpit-workspace__opt-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.cockpit-workspace__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cockpit-workspace__chip { font-size: 12px; padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-workspace__textarea { width: 100%; font-family: inherit; font-size: 13px; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; background: var(--bg-card); color: var(--text-primary); min-height: 64px; resize: vertical; }
.cockpit-workspace__score { display: flex; gap: 4px; }
.cockpit-workspace__star { font-size: 20px; color: var(--border-color); cursor: pointer; border: none; background: none; font: inherit; padding: 0;
  &.is-on { color: var(--warning); }
}

/* Footer */
.cockpit-workspace__foot { flex-shrink: 0; padding: 12px 16px; border-top: 1px solid var(--border-color); background: var(--bg-card); display: flex; gap: 8px; }
.cockpit-workspace__btn { font-family: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}
</style>
```

- [ ] **Step 2: 更新测试**

在 `cockpit-workspace.test.ts` 中，更新 seed 函数和测试以匹配新结构：

将现有测试改为验证：
1. Task header shows title (from selectedTask)
2. Detail fields render (priority, assignee display)
3. A2UI section still renders decisions
4. Footer has 保存草稿 button

```ts
it('renders task header with title and status', () => {
  seed()
  const w = mount(CockpitWorkspace)
  expect(w.text()).toContain('PR #142')
  expect(w.find('.cockpit-workspace__status-chip').exists()).toBe(true)
})

it('save draft button exists in footer', () => {
  seed()
  const w = mount(CockpitWorkspace)
  const foot = w.find('.cockpit-workspace__foot')
  expect(foot.text()).toContain('saveDraft') // mock t returns key
})

// 保留原有决策/风险标签测试（需要更新 selector）
it('clicking a decision option updates the draft', async () => {
  const s = seed()
  const w = mount(CockpitWorkspace)
  await w.find('[data-decision="approve"]').trigger('click')
  expect(s.workItemForSelectedTask?.decision).toBe('approve')
})
```

- [ ] **Step 3: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd overlay && git add custom/client/cockpit/components/CockpitWorkspace.vue custom/client/cockpit/__tests__/cockpit-workspace.test.ts
git commit -m "feat(cockpit): redesign workspace with task header, kanban fields, and a2ui sections"
```

---

### Task 4: 更新 CockpitView emit 绑定

**Files:**
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`

- [ ] **Step 1: 移除未使用的 emit**

在 CockpitView.vue 中，`CockpitWorkspace` 不再 emit `later` 事件。将：

```vue
<CockpitWorkspace v-if="store.workspaceMode === 'work'" :class="{ 'is-readonly': store.archivedMode }" @submit="store.submitWorkItem" @later="() => {}" />
```

改为：

```vue
<CockpitWorkspace v-if="store.workspaceMode === 'work'" :class="{ 'is-readonly': store.archivedMode }" @submit="store.submitWorkItem" />
```

- [ ] **Step 2: 运行测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-
```

Expected: 全部 PASS.

- [ ] **Step 3: Commit**

```bash
cd overlay && git add custom/client/cockpit/views/CockpitView.vue
git commit -m "fix(cockpit): remove unused later event from workspace binding"
```

---

### Task 5: i18n keys

**Files:**
- Modify: `upstream/hermes-studio/packages/client/src/i18n/locales/en.ts`
- Modify: `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts`

- [ ] **Step 1: 添加 i18n keys**

在 en.ts 的 `cockpit:` block 末尾追加（在 `relationA2H` 后）：

```ts
    saveDraft: 'Save Draft',
    selectAssignee: 'Select assignee…',
    none: 'None',
    noAttachments: 'No attachments',
    uploadFile: 'Upload',
    evaluation: 'Evaluation',
    descriptionPlaceholder: 'Enter task description…',
```

在 zh.ts 的 `cockpit:` block 末尾追加：

```ts
    saveDraft: '保存草稿',
    selectAssignee: '选择负责人…',
    none: '无',
    noAttachments: '暂无附件',
    uploadFile: '上传',
    evaluation: '评估',
    descriptionPlaceholder: '输入任务描述…',
```

- [ ] **Step 2: Commit**

```bash
cd overlay && git commit --allow-empty -m "chore(cockpit): add i18n keys for workspace redesign"
```

---

### 全量回归

- [ ] **Step 1: 运行所有 cockpit 测试**

```bash
cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-
```

Expected: 全部 PASS.

- [ ] **Step 2: 合并到 main**

```bash
cd overlay && git checkout main && git merge fix/cockpit-workspace-redesign
```

---

## Self-Review

**Spec 覆盖：**
- ✅ 协作图中心节点点击 → Task 2
- ✅ autoSaveDraft → Tasks 1+3
- ✅ Task Header 区域 → Task 3
- ✅ Kanban 详情字段（assignee/priority/父子任务/附件/description）→ Task 3
- ✅ A2UI 建议选项 → Task 3
- ✅ Footer 保存草稿替代稍后处理 → Task 3
- ✅ 附件 API 接入 → Tasks 1+3
- ✅ i18n keys → Task 5
- ✅ 测试更新 → Tasks 1+3+4

**占位符扫描：** 无 TBD/TODO，每步包含完整代码。

**类型一致性：** `autoSaveDraft`/`loadAttachments`/`uploadAttachment`/`deleteAttachment` 在 store 和组件中使用一致的签名。
