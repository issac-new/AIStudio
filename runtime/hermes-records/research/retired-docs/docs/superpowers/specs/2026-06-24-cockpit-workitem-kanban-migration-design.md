# AI 协作中心「工作项」页面 — Swarm kanban 任务详情要素迁移设计

- 日期：2026-06-24
- 状态：已批准（待 spec review）
- 关联：`docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`、`overlay/docs-cockpit-workspace-redesign-design.md`

## 1. 背景与目标

「AI 协作中心」（Cockpit，路由 `hermes.cockpit`）的「工作项」页面由 `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` 渲染，是登录后主操作界面右栏的 `work` 模式。它是叠加在 kanban 任务字段之上的**人工评审表单**：A 区任务头、A 区 kanban 详情字段（草稿暂存）、A3 区 A2UI 决策（decision / riskTags / score / opinion）。

「Swarm kanban」任务详情抽屉由 `overlay/custom/client/kanban/components/KanbanTaskDrawer.vue` 渲染，是完整的**任务操作编辑器**：标题/负责人/优先级/描述可编辑，含状态机、恢复、诊断、主页通知、结果、事件、日志、运行历史、评论。

**目标**：将 kanban 详情抽屉中所有「可编辑、可配置」的要素，逐一参考其源码迁移到工作项页面，使工作项页面在保留自身 A2UI 评审能力的同时，获得与 kanban 详情页对等的任务操作能力。

## 2. 范围与要素分类

kanban 抽屉的要素按交互模型分两类。用户的规则——「所有原页面可编辑可配置项都要」+「除文件上传外其余保持草稿批量提交」——经技术核对后，精确理解为：

- **字段编辑类**：可暂存的字段值变更，保持**草稿批量提交**模型（与工作项页面现有 `pending*` 草稿通道一致）。
- **动作命令类**：对任务发起的动作（specify/decompose/状态流转/reclaim/reassign/诊断/通知订阅），本质是命令式 API 调用，动作间有先后依赖，**不可暂存批量**，保持 kanban 原有的**即时执行**模型。

这是设计成立的前提：把命令式动作塞进草稿批量提交在语义上是错的（如 decompose 会产生新子任务并可能改标题，无法与 description 一起"暂存"后批量提交）。

### 2.1 迁移清单

| # | 要素 | 模型 | kanban 源（KanbanTaskDrawer.vue 行号） |
|---|---|---|---|
| A1 | 标题可编辑 | 草稿批量 | `startEditTitle`/`saveTitle` :289-300 → `doPatch({title})` |
| B1 | Specify | 即时 | `doSpecify` :364-383 → `store.specifyTask` |
| B2 | Decompose | 即时 | `doDecompose` :385-411 → `store.decomposeTask` |
| B3 | 状态流转 triage/ready/blocked/done/archived | 即时 | `doPatch({status})` + `canMoveTo` :344-355 + 确认文案 :357-361 |
| B4 | 完成校验弹窗（done 前强制 summary） | 即时 | `handleCompletionSubmit` :276-286 + modal :1194-1219 |
| B5 | Reclaim（运行中） | 即时 | `doReclaim` :413-438 → `store.reclaimTask` |
| B6 | Reassign + profile 选择 | 即时 | `doReassign` :440-459 + profile picker |
| B7 | Diagnostics | 即时 | `KanbanDiagnosticsSection` 子组件 :911-918 |
| B8 | Home-channel 通知订阅 | 即时 | `toggleHomeSubscription` :199-224 + UI :920-943 |
| C5 | 评论列表 + 输入框 | 草稿批量 | 列表 :1146-1187 + `handleAddComment` :512-527 |

### 2.2 不迁移

- **C1 result**：工作项页面 header 已展示 `latest_summary`（`CockpitWorkspace.vue:16,151`），不单独搬 kanban 的 result markdown 渲染。
- **C2 events / C3 worker log / C4 run history**：纯只读运维信息流，非可编辑可配置项，不迁移。
- **D1-D4**：cockpit 独有的 A2UI（decision/riskTags/score/opinion），保留不动。

### 2.3 保留不动

- **A2 负责人 / A3 优先级 / A4 描述 / A5 父任务 / A6 子任务**：草稿模型已就位（`CockpitWorkspace.vue:159-247`），符合"保持草稿批量"规则，不改动交互。
- **A7 附件**：即时上传/删除（`:224-239`），已与 kanban 对齐，不动。

## 3. 方案选择

采用**方案 A：就地扩展现有 `CockpitWorkspace.vue`**。字段编辑类接进现有草稿通道，动作命令类直接调用 `useKanbanStore()` 已有的同名方法，信息展示类复用 kanban 已有子组件。

否决方案 B（抽独立 `CockpitActionsBar.vue`）：多一层 props/emit 协调，与现有单文件三区域风格不一致。
否决方案 C（直接嵌 `KanbanTaskDrawer.vue`）：kanban 抽屉全是即时 `doPatch`，无法改成草稿模型；且是 drawer 形态非内嵌 form，违背规则。

## 4. 字段编辑类：草稿批量提交通道扩展

### 4.1 草稿字段（`cockpit-kv.ts`）

`DraftWorkItem` 接口（`cockpit-kv.ts:9`）新增两个字段。序列化沿用现有 `saveDraft(taskId, patch)` 的 `{...cur, ...patch}` 合并（`cockpit-kv.ts:54-59`），向后兼容旧草稿（旧草稿无新字段时 `?? undefined`）：

```ts
export interface DraftWorkItem {
  pendingAssignee?: string | null
  pendingPriority?: number
  pendingBody?: string
  pendingLinkAdds?: PendingLink[]
  pendingLinkRemoves?: PendingLink[]
  pendingTitle?: string             // 新增：待变更的标题（与 task.title 不同才 flush）
  pendingComment?: string          // 新增：待提交的评论（非空时 flush 为一条 addComment）
}
```

### 4.2 store 方法（`cockpit.ts`）

仅新增，不改现有签名。仿照现有 `setPendingAssignee`/`setPendingBody` 模式：

```ts
function setPendingTitle(v: string)
function setPendingComment(v: string)
```
（无需 `clearPendingComment`：`submitWorkItem` 末尾已调 `kv.clearDraft(id)` `cockpit.ts:763`，会连同 `pendingComment` 一起清空。）

新增 getter `currentTitle`，草稿优先回退 `task.title`，与现有 `currentAssignee`/`currentBody`（`CockpitWorkspace.vue:23-37`）同模式：

```ts
const currentTitle = computed(() => {
  const draft = workItem.value
  if (draft?.pendingTitle !== undefined) return draft.pendingTitle || ''
  return task.value?.title ?? ''
})
```

### 4.3 flush 扩展（`cockpit.ts:submitWorkItem`，现 :736-753）

现有 flush（`cockpit.ts:735-766`）已发：`patchTask`（字段）+ `linkTasks`/`unlinkTasks`（关联）+ 一条**决策评论** `addComment`（`:758-760`，body 由 `decision`/`riskTags`/`opinion` 拼成）。注意 :759 这条决策评论是 A2UI 的固有产物，与 C5 用户自由评论是两回事，**不能合并**。

扩展点：
- `patch.title` 仅当 `pendingTitle` 被设置过且与 `task.title` 不同时加入 patch（与 :745-747 的 `pendingAssignee/Priority/Body` 同模式）。
- C5 用户评论：当 `pendingComment` 非空时，**额外** push 一条 `kanbanApi.addComment(id, { body: draft.pendingComment })` 到 `ops`，与现有 :760 的决策评论并存（flush 时可能同时发两条评论：一条决策、一条用户自由评论）。flush 成功后随 `kv.clearDraft(id)`（:763）一并清空。

### 4.4 UI（`CockpitWorkspace.vue`）

- **A1 标题**：AREA 1 header 的 `.cockpit-workspace__title`（`:150`）从纯显示改为**始终可编辑 input**（`value=currentTitle` `@input=setPendingTitle`）。采用持续编辑暂存而非 kanban 的 click-to-edit 切换态，与 A4 description textarea 的"持续编辑暂存"一致——这是草稿模型的自然形态。
- **C5 评论**：在 AREA 3 之后、Footer 之前新增"评论"区块。只读列表展示 `detail.comments`（数据已在 `cockpit.ts` detail 加载中获取，见 `cockpit.ts:503` `loadTaskDetail` 合并 comments），下方 textarea 绑定 `pendingComment`。底部"提交"按钮（Footer 现有 submit）触发 flush 时一并发出评论，flush 后随 `clearDraft` 清空并刷新 detail。

## 5. 动作命令类：即时执行通道（B1-B8）

### 5.1 统一执行封装（`CockpitWorkspace.vue` `<script setup>`）

所有动作命令类走同一个封装，处理 busy、错误提示、刷新。kanban 抽屉里 specify/decompose 各自一套 busy/msg，cockpit 统一一个 `actionBusy`/`actionMsg`（这些按钮不会并发）：

```ts
import * as kanbanApi from '@/api/hermes/kanban'
const actionBusy = ref(false)
const actionMsg = ref<{ ok: boolean; text: string } | null>(null)

async function execAction(label: string, fn: () => Promise<any>) {
  if (actionBusy.value || !store.selectedTaskId) return
  actionBusy.value = true
  actionMsg.value = null
  try {
    await fn()
    await store.loadTaskDetail(store.selectedTaskId)   // 复用现有刷新（cockpit.ts:503）
    actionMsg.value = { ok: true, text: label + ' ✓' }
  } catch (err: any) {
    actionMsg.value = { ok: false, text: `${label} 失败: ${err?.message || String(err)}` }
  } finally {
    actionBusy.value = false
  }
}
```

### 5.2 B1/B2 Specify & Decompose

```ts
const doSpecify   = () => execAction('Specify',   () => kanbanStore.specifyTask(tid))
const doDecompose = () => execAction('Decompose', () => kanbanStore.decomposeTask(tid))
```
UI：两个按钮 + 下方 `actionMsg`。decompose 成功文案搬 kanban :385-411（区分 fanout / single）。子任务列表因 detail 刷新自动更新。

### 5.3 B3 状态流转 + B4 完成校验

状态门禁照搬 kanban `canMoveTo` (`:344-355`) 和 `statusConfirmMessages` (`:357-361`)。

**风格决策**：cockpit 全站用原生 button、0 个 Naive UI 组件（`CockpitWorkspace.vue` 现状）。为保持风格一致，**不引入** `useDialog`/`NModal`，改用自建轻量组件：
- **确认弹窗**：自建轻量 `<CockpitConfirmDialog>`（vanilla div + transition，复用现有 CSS 变量 `--bg-card`/`--border-color` 等），用于 destructive 状态变更（done/archived/blocked）。
- **B4 完成弹窗**：自建轻量 modal（textarea + 确定/取消），逻辑搬 kanban `handleCompletionSubmit` (`:276-286`)——summary 非空才能置 done，summary 写入 `patch.result`。

状态按钮组（triage/ready/blocked/done/archived）按 `canMoveTo` 动态 disabled，destructive 的走确认弹窗，done 走完成校验弹窗。

### 5.4 B5/B6 Reclaim & Reassign（仅 running 显示）

- `doReclaim` → `execAction('Reclaim', () => kanbanStore.reclaimTask(tid))`
- `doReassign` → profile 选择器（搬 kanban :440-459 的 `reassignProfile` ref + select），确认后 `execAction('Reassign', () => kanbanStore.reassignTask(tid, { profile }))`。
- 显示条件：`v-if="task?.status === 'running'"`，搬 kanban :860 的 gating。

### 5.5 B7 Diagnostics

**直接复用现有子组件，不重写**：
```vue
<KanbanDiagnosticsSection :task="task" :diagnostics="diagItems" :assignees="assignees" />
```
`KanbanDiagnosticsSection.vue` 的 props 接口为 `{ task: KanbanTask; diagnostics: KanbanDiagnosticItem[]; assignees: string[] }`，emit `refresh`。诊断数据来源：调 `kanbanStore.fetchDiagnostics()` 后读 `kanbanStore.diagnostics`（`KanbanDiagnostic[]`，每项含 `.diagnostics: KanbanDiagnosticItem[]`，需展平或取首项）。`assignees` 复用 `kanbanStore.assignees`。任务切换时刷新诊断。该组件本就是从 kanban 抽出的可复用单元，挂载即迁移。

### 5.6 B8 Home-channel 通知订阅

state（`homeChannels` ref + `homeBusy`）和 `toggleHomeSubscription` (`:199-224`) 逻辑照搬。数据来源：任务切换时 `kanbanApi.getHomeChannels(tid)`。UI：每个 platform 一个 toggle（订阅/退订），搬 kanban :920-943 模板。

`watch(store.selectedTaskId)`（现 `CockpitWorkspace.vue:115-118`）扩展：除重置 `newParentId/newChildId` 外，一并刷新 home channels。

## 6. UI 编排

`CockpitWorkspace.vue` 模板从上到下（AREA 1 → Footer 之间）：

```
AREA 1  Task Header
  └─ A1 标题 input（改自原 :150 显示）            [新-草稿]

AREA 2  字段编辑类（草稿）
  ├─ A2 负责人 / A3 优先级                         [现有]
  ├─ A5 父任务 / A6 子任务                         [现有]
  ├─ A7 附件（即时）                               [现有]
  └─ A4 描述                                       [现有]

NEW    动作命令区（即时）                          [新]
  ├─ B1/B2 Specify / Decompose 按钮 + actionMsg
  ├─ B3 状态流转按钮组（triage/ready/blocked/done/archived）
  ├─ B5/B6 Reclaim / Reassign（v-if running）
  ├─ B7 <KanbanDiagnosticsSection :task-id :detail />
  └─ B8 Home-channel toggles

AREA 3  A2UI（cockpit 独有）                       [现有]
  └─ D1 决策 / D2 风险 / D3 评分 / D4 意见

NEW    评论区                                      [新-草稿]
  ├─ C5 评论列表（detail.comments 只读）
  └─ 评论输入 textarea（pendingComment）

Footer（现有：模板管理/终端/存草稿/提交）
```

## 7. i18n

新增 key（en/zh 双 patch，命名空间 `cockpit.*`，沿用 `074-en`/`075-zh` patch 模式）：

```
cockpit.editTitlePlaceholder       标题 / Title
cockpit.actions                    操作 / Actions
cockpit.specify                    细化 / Specify
cockpit.decompose                  分解 / Decompose
cockpit.moveToTriage               转入分诊 / Move to triage
cockpit.moveToReady                转入就绪 / Move to ready
cockpit.moveToBlocked              标记阻塞 / Mark blocked
cockpit.moveToDone                 标记完成 / Mark done
cockpit.moveToArchived             归档 / Archive
cockpit.reclaim                    回收 / Reclaim
cockpit.reassign                   改派 / Reassign
cockpit.reassignProfile            改派 profile / Reassign profile
cockpit.diagnostics                诊断 / Diagnostics
cockpit.notifyHomeChannels         主页通知频道 / Notify home channels
cockpit.subscribe                  订阅 / Subscribe
cockpit.unsubscribe                退订 / Unsubscribe
cockpit.comments                   评论 / Comments
cockpit.addCommentPlaceholder      写评论… / Add a comment…
cockpit.confirmDone                确认完成文案（照搬 kanban.confirmDone）
cockpit.confirmArchive             确认归档文案（照搬 kanban.confirmArchive）
cockpit.confirmBlocked             确认阻塞文案（照搬 kanban.confirmBlocked）
cockpit.completionSummaryRequired  完成前必须填写摘要 / Completion summary required
```

## 8. store 改动边界

`cockpit.ts` 仅新增，不改现有签名：
- `setPendingTitle` / `currentTitle`（getter）
- `setPendingComment`
- `submitWorkItem()` flush 内增 `patch.title` 分支、新增 `addComment(pendingComment)` 一条
- `loadTaskDetail()` 已存在（:503），B 区动作成功后复用它刷新，无需新方法

动作命令类（B1-B8）不进 store，全部在 `CockpitWorkspace.vue` 内通过 `useKanbanStore()` + `kanbanApi` 调用——与 kanban 抽屉同源，保持单一数据路径。

## 9. 草稿与动作的交互规则

动作命令类执行后 `loadTaskDetail` 刷新 `task`，而字段编辑类草稿 `pending*` 仍留 localStorage。规则：**草稿优先显示**（现有 `currentAssignee`/`currentBody` 已如此，`currentTitle` 同理）。

B3 将 status 改为 done/archived 后，A 区部分操作语义变化——但 cockpit 是评审表单，done 后仍可改 description，保持现状不额外禁用字段。

## 10. 验证计划

- **单元测试**：`submitWorkItem` flush 新增 `patch.title` / `addComment(pendingComment)` 分支（扩展现有 kanban store 测试 `037/038/039`，或在 cockpit 加 vitest）。
- **手动测试**：逐一点击 B 区每个按钮，确认即时生效 + detail 刷新 + `actionMsg` 正确；草稿 A1/C5 提交后确认字段落库。
- **类型检查**：`DraftWorkItem` 新增字段需同步 `cockpit-kv.ts` 序列化/反序列化（已用 `?? undefined`，向后兼容）。
- **构建**：`npm run inject` 后 `overlay` 内启动，确认无类型/编译错误。

## 11. 改动文件清单

| 文件 | 改动 |
|---|---|
| `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` | 主体：A1 标题 input、动作命令区 B1-B8、评论区 C5、`execAction` 封装、自建 confirm/completion 弹窗、home-channel 状态 |
| `overlay/custom/client/cockpit/store/cockpit.ts` | `setPendingTitle`/`currentTitle`/`setPendingComment`/`clearPendingComment`；`submitWorkItem` flush 扩展 |
| `overlay/custom/client/cockpit/store/cockpit-kv.ts` | `DraftWorkItem` 新增 `pendingTitle`/`pendingComment` |
| `overlay/custom/client/cockpit/components/CockpitConfirmDialog.vue` | 新建：自建轻量确认弹窗 |
| `overlay/custom/client/cockpit/components/CockpitCompletionModal.vue` | 新建：自建轻量完成校验弹窗 |
| `overlay/patches/074-...en.ts.patch` / `075-...zh.ts.patch` | 新增 `cockpit.*` i18n key |

不修改 `upstream/`。动作命令类复用的 `KanbanDiagnosticsSection.vue`/`KanbanMarkdown.vue` 等子组件为 overlay 自有 custom 代码，只读引用不改。
