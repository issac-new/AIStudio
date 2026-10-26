# Kanban 高级功能移植设计文档

**日期**: 2026-06-18  
**项目**: hermes-web-ui Kanban 功能增强  
**方案**: 完整功能移植（方案 2）

## 1. 背景与目标

将 `hermes-agent/plugins/kanban`（React IIFE 插件）中的高级功能移植到 `hermes-web-ui`（Vue 3 + Naive UI）中，增强现有 Kanban 看板的功能完整性。

## 2. 源项目功能分析

源项目（React IIFE 插件）包含以下核心功能模块：

### 2.1 已存在于目标项目的功能
- ✅ 看板视图（列布局、拖拽）
- ✅ 任务卡片（状态、优先级、分配人）
- ✅ 任务详情抽屉（元数据、评论、事件、运行历史）
- ✅ 批量操作栏
- ✅ 工具栏（筛选、搜索、看板切换）
- ✅ WebSocket 实时更新
- ✅ 内联创建 / 任务表单

### 2.2 需要移植的高级功能

| 功能模块 | 源文件位置 | 复杂度 | 依赖 |
|---------|-----------|--------|------|
| **AttentionStrip** | `index.js:1069-1173` | 中 | 诊断数据 |
| **DiagnosticsSection** | `index.js:1175-1464` | 高 | 诊断 API、恢复操作 |
| **OrchestrationPanel** | `index.js:1484-1553+` | 高 | 编排 API |
| **附件上传/下载** | `plugin_api.py:645-799` | 中 | 文件 API |
| **Markdown 渲染** | `index.js:264-347` | 低 | 无额外依赖 |

## 3. 移植设计

### 3.1 架构原则

1. **保持现有 Vue 3 + Naive UI 技术栈**，不引入 React 依赖
2. **复用现有 API 客户端** (`@/api/hermes/kanban`)，补充新接口
3. **复用现有 Store** (`useKanbanStore`)，扩展新状态和方法
4. **遵循现有组件命名和目录规范**
5. **保持 i18n 国际化一致性**

### 3.2 文件变更计划

#### API 层 (`src/api/hermes/kanban.ts`)
新增接口：
- `getDiagnostics()` - 获取诊断列表
- `uploadAttachment()` - 上传附件
- `downloadAttachment()` - 下载附件
- `deleteAttachment()` - 删除附件
- `listAttachments()` - 列出附件
- `getOrchestration()` - 获取编排设置
- `saveOrchestration()` - 保存编排设置
- `getProfiles()` - 获取 profile 列表（用于编排器）

#### Store 层 (`src/stores/hermes/kanban.ts`)
新增状态：
- `diagnostics: KanbanDiagnostic[]` - 诊断列表
- `orchestration: KanbanOrchestration | null` - 编排设置
- `attachments: Record<string, KanbanAttachment[]>` - 附件缓存

新增方法：
- `fetchDiagnostics()` - 获取诊断
- `fetchOrchestration()` - 获取编排设置
- `saveOrchestration()` - 保存编排设置
- `uploadAttachment()` - 上传附件
- `deleteAttachment()` - 删除附件

#### 组件层

**新增组件**（`src/components/hermes/kanban/`）：

| 组件名 | 功能 | 移植来源 |
|-------|------|---------|
| `KanbanAttentionStrip.vue` | 顶部诊断提示条 | `index.js:1069-1173` |
| `KanbanDiagnosticsSection.vue` | 任务诊断详情面板 | `index.js:1175-1464` |
| `KanbanOrchestrationPanel.vue` | 编排器设置面板 | `index.js:1484-1553+` |
| `KanbanMarkdown.vue` | Markdown 渲染器 | `index.js:264-347` |
| `KanbanAttachments.vue` | 附件管理组件 | `plugin_api.py:645-799` |

**修改现有组件**：

| 组件 | 修改内容 |
|------|---------|
| `KanbanView.vue` | 引入 AttentionStrip、OrchestrationPanel |
| `KanbanTaskDrawer.vue` | 引入 DiagnosticsSection、Attachments、Markdown 渲染 |
| `KanbanTaskCard.vue` | 添加诊断警告徽章 |

#### i18n 层
- `src/i18n/locales/en.ts` - 补充 kanban 相关翻译键
- `src/i18n/locales/zh.ts` - 补充 kanban 相关翻译键

### 3.3 数据类型扩展

```typescript
// 新增类型定义
export interface KanbanDiagnostic {
  task_id: string
  task_title: string
  task_status: string
  task_assignee: string | null
  diagnostics: Array<{
    kind: string
    title: string
    detail: string
    severity: 'warning' | 'error' | 'critical'
    count: number
    last_seen_at: number
    data: Record<string, unknown>
    actions: Array<{
      kind: string
      label: string
      suggested?: boolean
      payload?: Record<string, unknown>
    }>
  }>
}

export interface KanbanOrchestration {
  orchestrator_profile?: string
  default_assignee?: string
  auto_decompose: boolean
  profiles: Array<{
    name: string
    description: string
  }>
}

export interface KanbanAttachment {
  id: number
  task_id: string
  filename: string
  content_type: string
  size: number
  uploaded_by: string
  stored_path: string
  created_at: number
}
```

### 3.4 UI 设计细节

#### AttentionStrip（注意力提示条）
- 位置：KanbanView 中 Toolbar 下方
- 样式：根据最高严重级别着色（warning=amber, error=orange, critical=red）
- 交互：可展开/折叠，显示诊断任务列表，点击 Open 打开任务抽屉
- 数据：从 `GET /api/hermes/kanban/diagnostics` 获取

#### DiagnosticsSection（诊断面板）
- 位置：KanbanTaskDrawer 中，Events 下方
- 样式：左侧边框颜色根据 severity（warning/amber, error/orange, critical/red）
- 交互：每个诊断卡片显示标题、详情、数据、恢复操作按钮
- 操作类型：reclaim、reassign、unblock、comment、cli_hint、open_docs
- 数据：从任务详情中的 `diagnostics` 字段获取

#### OrchestrationPanel（编排器面板）
- 位置：KanbanView 中，可选折叠面板
- 内容：orchestrator profile picker、default assignee picker、auto-decompose toggle
- 交互：profile 描述编辑、auto-generate 描述
- 数据：从 `GET /api/hermes/kanban/orchestration` 获取

#### Attachments（附件管理）
- 位置：KanbanTaskDrawer 中，Comments 下方
- 交互：上传（拖拽/选择）、下载、删除
- 限制：单文件 25MB
- 数据：从 `GET /api/hermes/kanban/tasks/:id/attachments` 获取

#### Markdown 渲染
- 位置：KanbanTaskDrawer 中 Body 和 Result 的渲染
- 支持：标题、粗体、斜体、内联代码、代码块、链接、列表
- 安全：HTML 转义 + 白名单标签

### 3.5 状态流转

```
KanbanView
├── AttentionStrip (diagnostics from store)
├── OrchestrationPanel (orchestration from store)
├── KanbanToolbar
├── KanbanBulkBar
└── KanbanBoard
    └── KanbanTaskCard (warning badges from task.diagnostics)
        └── KanbanTaskDrawer
            ├── Task Meta
            ├── Status Actions
            ├── Recovery Actions (reclaim/reassign)
            ├── Body (Markdown rendering)
            ├── Dependencies
            ├── Result (Markdown rendering)
            ├── Attachments
            ├── Comments
            ├── Events
            ├── DiagnosticsSection (task diagnostics)
            ├── Run History
            └── Worker Log
```

## 4. 实现顺序

1. **Phase 1: API 层扩展** - 补充 diagnostics、attachments、orchestration 接口
2. **Phase 2: Store 扩展** - 添加状态和异步方法
3. **Phase 3: Markdown 渲染** - 最独立，无依赖
4. **Phase 4: Attachments** - 需要 API 和 Store 支持
5. **Phase 5: DiagnosticsSection** - 需要 Attachments 完成（comment action 依赖）
6. **Phase 6: AttentionStrip** - 需要 DiagnosticsSection 完成
7. **Phase 7: OrchestrationPanel** - 最后，相对独立
8. **Phase 8: i18n 补充** - 同步进行
9. **Phase 9: 集成测试** - 验证所有功能

## 5. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| API 路径不一致 | 复用现有 `/api/hermes/kanban` 前缀，后端需同步适配 |
| 后端接口缺失 | 先实现前端，使用 mock 数据；后端逐步补充 |
| 组件复杂度 | 保持小组件原则，每个组件单一职责 |
| i18n 遗漏 | 使用翻译键提取工具检查 |

## 6. 验收标准

- [ ] AttentionStrip 正确显示诊断任务，支持 severity 着色
- [ ] DiagnosticsSection 正确渲染诊断卡片，恢复操作可执行
- [ ] OrchestrationPanel 可展开/折叠，设置可保存
- [ ] Attachments 支持上传、下载、删除
- [ ] Markdown 正确渲染任务描述和结果
- [ ] 所有新增功能支持中英文 i18n
- [ ] 现有功能不受影响
