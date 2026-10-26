# Cockpit 工作项区域重构设计

**日期**：2026-06-23
**状态**：待评审
**基线设计**：`docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.5 右栏工作区）
**原型参考**：`upstream/hermes-studio/.../KanbanTaskDrawer.vue`（Kanban 详情抽屉）
**适用项目**：`overlay/custom/client/cockpit/`

---

## 1. 背景

当前 `CockpitWorkspace.vue`（工作项标签页）仅包含 A2UI 建议选项（决策/风险标签/评审意见），缺少任务本身的元数据展示。用户需要在工作项标签页中同时看到：
- 任务的标题、摘要
- Kanban 详情字段（assignee、优先级、父子任务、附件、描述）
- A2UI 建议选项（已有）

同时需要在协作图点击中心节点时，能自动保存草稿并触发任务切换。

## 2. 设计

### 2.1 协作图中心节点点击联动

**文件**：`CockpitCollabMap.vue`

修改 `onChartClick` 函数，移除中心节点的早期返回：

```ts
function onChartClick(params: any) {
  if (params.dataType !== 'node') return
  const d = params.data
  if (!d) return
  // 不再对 center/folded 做 early return - 让它们也能触发 selectTask
  if (kind === 'folded') return  // 仅 folded 仍忽略
  if (d._targetTaskId) {
    // 自动保存当前草稿
    store.autoSaveDraft()
    store.selectTask(d._targetTaskId)
  }
}
```

需要在 store 新增 `autoSaveDraft` 方法：将当前 draft 保存到 localStorage（当前已有 `kv.saveDraft`，只需确保在切换前调用）。

### 2.2 工作项布局重构

`CockpitWorkspace.vue` 重新划分为三个垂直区域：

```
┌───────────────────────────────────────┐
│  AREA 1: TASK HEADER                  │
│  ┌─ 标题 (大号, k0色)                 │
│  │  摘要/最新结果 (灰色, 1-2行)       │
│  └─ 状态chip · 优先级标签             │
├───────────────────────────────────────┤
│  AREA 2: KANBAN DETAIL FIELDS        │
│  ┌─ Assignee  [下拉选择/修改]        │
│  ├─ Priority  [展示+微调]            │
│  ├─ 父子任务  [链接导航 + 关联]      │
│  ├─ 附件      [列表+上传+删除]        │
│  └─ Description (body) [可编辑]       │
├───────────────────────────────────────┤
│  AREA 3: A2UI SUGGESTIONS            │
│  ┌─ 决策选项 (保持现有)              │
│  ├─ 风险标签 (保持现有)              │
│  ├─ 评估打分 (保持现有)              │
│  └─ 评审意见 (保持现有)              │
├───────────────────────────────────────┤
│  FOOTER                              │
│  📋模板库 · ⌘编程 · 💾保存草稿 · 提交  │
└───────────────────────────────────────┘
```

#### 2.2.1 AREA 1 — Task Header

**数据来源**：`store.selectedTask` + `store._detailCache[taskId]?.latest_summary`

```vue
<div class="cockpit-workspace__header">
  <div class="cockpit-workspace__title">{{ selectedTask.title }}</div>
  <div v-if="taskSummary" class="cockpit-workspace__summary">{{ taskSummary }}</div>
  <div class="cockpit-workspace__meta-row">
    <span class="cockpit-workspace__status-chip" :class="'is-' + selectedTask.status">{{ t('kanban.columns.' + selectedTask.status) || selectedTask.status }}</span>
    <span class="cockpit-workspace__priority-tag">{{ selectedTask.priority }}</span>
  </div>
</div>
```

#### 2.2.2 AREA 2 — Kanban Detail Fields

复用 KanbanTaskDrawer 的展示和数据操作模式，但不使用 Naive UI 组件（保持 Pure Ink 风格）。

- **Assignee**：显示当前值 + 下拉选择。点击下拉从 `kanbanStore.assignees` 获取可选列表，选择后调用 `kanbanStore.assignTask(id, profile)`。
- **Priority**：显示当前优先级 + 增减按钮。调用 `kanbanStore.updateTaskPriority(id, priority)`。
- **父子任务**：显示 parent IDs 和 child IDs（可点击链接导航到对应任务）。调用 `store.selectTask(parentId)` 切换。
- **附件**：
  - 加载：`kanbanApi.listAttachments(taskId)`
  - 上传：`<input type="file">` + `kanbanApi.uploadAttachment(taskId, file)`
  - 删除：`kanbanApi.deleteAttachment(attachmentId)`
- **Description**：`task.body` 的可编辑文本框（与现有评审意见 textarea 类似）。修改内容自动保存到 localStorage draft。

#### 2.2.3 AREA 3 — A2UI Suggestions

保持现有 CockpitWorkspace 中的决策选项、风险标签、评估打分、评审意见，不做功能改动。

#### 2.2.4 Footer

- "📋 模板库" → 不变
- "⌘ 编程" → 不变
- "💾 保存草稿" → 替换"稍后处理"。功能：`kv.saveDraft(id, currentDraft)`
- "提交决定" → 不变。功能：`submitWorkItem()`

### 2.3 数据流

```
store.selectTask(taskId)
  ├─ autoSaveDraft()           // 先保存当前草稿
  ├─ selectedTaskId = taskId
  ├─ loadTaskDetail(taskId)    // 拉取 detail（含 latest_summary、parents、children）
  │   ├─ events = eventAdapter.mergeDetail(detail)
  │   ├─ _fileTreeCache[id] = listWorkspaceFiles(id)
  │   └─ loadLinksChain(id)   // 递归拉父子链路 detail
  ├─ workItemForSelectedTask   // 从 localStorage 读取 draft
  └─ CockpitWorkspace 响应式渲染
```

### 2.4 新增/修改的 i18n keys

在 upstream i18n 文件中添加：

```
cockpit.saveDraft: 'Save Draft' / '保存草稿'
cockpit.priority: 'Priority' / '优先级'
cockpit.assignee: 'Assignee' / '负责人'
cockpit.parentTasks: 'Parent Tasks' / '父任务'
cockpit.childTasks: 'Child Tasks' / '子任务'
cockpit.attachments: 'Attachments' / '附件'
cockpit.uploadFile: 'Upload' / '上传'
cockpit.description: 'Description' / '描述'
```

### 2.5 样式

保持 Pure Ink 风格，使用 CSS 变量：
- 区域分隔：上下之间 16px margin，无明显区域边框分割
- Title：16px, 700 weight, k0
- Summary：12px, k3
- 字段标签：11px, 600 weight, 大写, k3
- 字段值：13px, k1
- 所有交互元素 hover 变 accent 色
- 附件文件列表：monospace 字体 + 文件大小

---

## 3. 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `CockpitWorkspace.vue` | 重写 | 三区域布局 + 新 footer |
| `CockpitCollabMap.vue` | 修改 | 中心节点点击联动 + autoSaveDraft |
| `cockpit.ts` (store) | 修改 | 新增 `autoSaveDraft`、`loadAttachments`、附件 state |
| `cockpit-kv.ts` | 不变 | 已有 `saveDraft`/`loadDraft` |
| i18n en.ts/zh.ts | 修改 | 新增 cockpit key |
| api/kanban-extras.ts | 可扩展 | 附件 API 封装 |
| `CockpitView.vue` | 微调 | 如有必要调整 emit 绑定 |

## 4. 不变事项

- 右侧文件资源管理器 (`CockpitFileTree`) 保持不变
- 模式切换器、协作入口保持不变
- 所有样式沿用 Pure Ink CSS 变量
- 测试框架 vitest + @vue/test-utils

## 5. Spec Self-Review

- 无 TBD/TODO 占位符
- 布局描述清晰，与现有 Pure Ink 风格一致
- 数据流明确：selectTask → autoSaveDraft → loadDetail → 响应式渲染
- 范围聚焦：不涉及其他标签页（聊天、终端）或中栏/左栏改动
