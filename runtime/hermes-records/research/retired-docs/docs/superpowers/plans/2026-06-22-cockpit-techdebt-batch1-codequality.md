# 驾驶舱技术债清理 · 批次 1：代码质量债（保守三件）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 CockpitView 的 83 行硬编码种子抽到 `cockpit/fixtures/seed.ts`、把内联全局样式迁到已存在的 `cockpit/styles/cockpit.scss`（死文件复活）、校正过时的审计文档——为后续批次（2–5）清路，全程保持测试 13/101 全绿。

**Architecture:** 三件相互独立的重构，各自独立提交。种子抽离只搬移不改语义；样式迁移是搬移 + 在 index.ts 加一行 import；审计校正是文档增量标注。fixtures 只用 `import type` 引 store 类型，避免循环依赖。

**Tech Stack:** Vue 3 setup store、TypeScript（`import type`）、SCSS、vitest（已有 101 断言基线）。

**Spec:** `docs/superpowers/specs/2026-06-22-cockpit-techdebt-batch1-codequality-design.md`

---

## 前置准备

**分支（遵循 AGENTS.md）：** 在 overlay 仓库基于 `main` 建 feature 分支。

**⚠️ Task 1 起点核验（本批次关键教训）：** 批次 0 曾因起点核验不严，从游离 commit 拉了分支。本批次 Task 1 Step 1 必须确认 `git rev-parse main` 与当前 HEAD 在拉分支前一致，且 `git branch --show-current` 返回 `main` 后，再用 `git rev-parse HEAD` 与 `git rev-parse main` 比对相等，才建分支。

**当前已知基线：** `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test` = `13 passed (13) / 101 passed (101)`。

**关键边界（来自 spec §2 非目标）：**
- 不拆 store、不改组件业务逻辑、不改审计条目本身
- 不实现 #4/#6/#7/#8/#9/#12（只校正文档标注）
- 不接 kanban API（种子仍是演示数据）
- 不触碰 upstream

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `overlay/custom/client/cockpit/fixtures/seed.ts` | **新建** | 演示种子数据常量 + `loadSeed(store)` 装载函数 |
| `overlay/custom/client/cockpit/views/CockpitView.vue` | **修改** | 删 onMounted 种子字面量（改调 loadSeed）、删内联全局 style 块 |
| `overlay/custom/client/cockpit/index.ts` | **修改** | 加 `import './styles/cockpit.scss'` |
| `overlay/custom/client/cockpit/styles/cockpit.scss` | 不改（复活） | 全局样式单一来源 |
| `docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md` | **修改** | 加核查状态列 + 校正真欠清单 |

---

### Task 1: 建 feature 分支（含起点核验）

**Files:** 无文件改动

- [ ] **Step 1: 严格核验起点（避免批次 0 的偏差）**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
echo "current branch:" && git branch --show-current
echo "HEAD sha:" && git rev-parse HEAD
echo "main sha:" && git rev-parse main
```

Expected: `current branch: main`，且 `HEAD sha` == `main sha`（两者字符串完全相同）。**只有两者相等才能继续**——这证明工作区 HEAD 就在 main tip，不会重蹈批次 0 从游离 commit 拉分支的覆辙。若不等，先 `git checkout main` 再重跑本步，直到相等。

- [ ] **Step 2: 基于 main 建 feature 分支**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git checkout -b refactor/cockpit-techdebt-batch1-codequality
```

Expected: 切到新分支。建后立即 `git rev-parse HEAD` 应仍等于建分支前的 main sha。

- [ ] **Step 3: 确认测试基线绿**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -5
```

Expected: `Test Files 13 passed (13)` / `Tests 101 passed (101)`。若不绿，停止——批次 0 的基线丢了，先查原因。

- [ ] **Step 4: 不提交**（仅建分支）

---

### Task 2: 抽离种子数据到 fixtures/seed.ts

**Files:**
- Create: `overlay/custom/client/cockpit/fixtures/seed.ts`
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`

- [ ] **Step 1: 新建 fixtures/seed.ts（种子数据搬移，逐字保留）**

创建 `overlay/custom/client/cockpit/fixtures/seed.ts`，内容如下（种子数据从 CockpitView.vue onMounted 第 30–112 行**逐字搬移**，只改结构为常量 + loadSeed 函数）：

```ts
// 驾驶舱演示种子数据。
// 从 CockpitView.vue onMounted 抽离（批次 1），视图只负责装配，数据源集中于此。
// 仅 import type 引 store 类型，编译期擦除，无运行时循环依赖。
// 后续接入 kanban API 时，用真实 fetch 替换 loadSeed 即可。
import type {
  CockpitTask,
  AttentionItem,
  CockpitEvent,
  GraphNode,
  WorkItem,
  FileNode,
  CollabChannel,
  ChatMessage,
  HistoryItem,
  A2uiTemplate,
  GraphRelation,
} from '@/custom/cockpit/store/cockpit'

// P1 种子：Kanban 任务 + 注意力条
export const seedTasks: CockpitTask[] = [
  { id: '1', title: 'PR #142 · 重构 auth', category: 'human', priority: 'P0', status: 'review', assignee: '@张三', workspace: '~/ws/auth-svc' },
  { id: '2', title: '前端联调 auth', category: 'human', priority: 'P1', status: 'blocked', assignee: '@李四', workspace: '~/ws/web-fe' },
  { id: '3', title: 'API 文档补全', category: 'human', priority: 'P1', status: 'running', assignee: '@王五', workspace: '~/ws/api-docs' },
  { id: '4', title: '发版方案评估', category: 'cluster', priority: 'P1', status: 'running', assignee: 'arch/qa', workspace: '~/ws/platform' },
  { id: '5', title: '部署架构选型', category: 'cluster', priority: 'P2', status: 'triage', assignee: 'arch', workspace: '~/ws/platform' },
  { id: '6', title: 'cli-helper · 迁移脚本', category: 'direct', priority: 'P1', status: 'todo', assignee: '你↔cli', workspace: '~/ws/db-mig' },
]

export const seedAttention: AttentionItem[] = [
  { id: 'a1', severity: 'high', title: 'PR #142 · review 标风险', taskId: '1' },
  { id: 'a2', severity: 'medium', title: '集群提问：阻塞发版？', taskId: '4' },
  { id: 'a3', severity: 'low', title: '前端联调 · 等接口', taskId: '2' },
]

// P2 种子：时序事件 + 拓扑（P5 接入 Kanban event API）
export const seedEvents: CockpitEvent[] = [
  { id: 'e1', taskId: '1', actor: '张三', kind: 'A2H', what: '提交 PR #142', when: '14:32', pending: false, ts: 1732 },
  { id: 'e2', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '自评：结构良好', when: '14:35', pending: false, ts: 1735 },
  { id: 'e3', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '2 处边界未覆盖 → 委派 qa', when: '14:36', pending: true, ts: 1736 },
  { id: 'e4', taskId: '1', actor: 'qa-agent', kind: 'A2H', what: '用例写完 → 待审', when: '现在', pending: true, ts: 1740 },
]

export const seedAppTopology: GraphNode[] = [
  { id: 'n1', taskId: '1', label: 'refresh.ts', kind: 'file', focus: true, links: ['n2'] },
  { id: 'n2', taskId: '1', label: 'auth.spec', kind: 'test', focus: false, links: [] },
]

export const seedReqTopology: GraphNode[] = [{ id: 'r1', taskId: '1', label: '认证重构', kind: 'req', focus: true }]
export const seedProjTopology: GraphNode[] = [{ id: 'p1', taskId: '1', label: 'auth-platform', kind: 'project', focus: true }]

// P3 种子：工作项 + 文件树（后续接入 listFiles API）
export const seedWorkItems: WorkItem[] = [
  {
    id: 'w1', taskId: '1', decision: 'conditional',
    riskTags: ['concurrency', 'test-gap'], opinion: '建议合并前补充 token 并发刷新用例，其余结构 OK。',
    modifiedFiles: ['refresh.ts', 'token.ts', 'auth.spec.ts'], score: 4,
  },
]

export const seedFileTrees: Record<string, FileNode[]> = {
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

// P4 种子：协作频道 + 消息（后续接入 socket）
export const seedChannels: CollabChannel[] = [
  { id: 'c1', taskId: '1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '李四', '你'] },
  { id: 'c2', taskId: '1', kind: 'chat', label: 'review-agent', members: ['review-agent'] },
]

export const seedMessages: Record<string, ChatMessage[]> = {
  c1: [
    { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'PR #142 我提交了，看看并发刷新。', ts: 1 },
    { id: 'm2', channelId: 'c1', author: 'review-agent', isMe: false, text: '结构 OK，但并发刷新 2 处边界没覆盖，已委派 qa。', ts: 2 },
    { id: 'm3', channelId: 'c1', author: '你', isMe: true, text: '收到，先别合并。李四后端能配合吗？', ts: 3 },
    { id: 'm4', channelId: 'c1', author: '李四', isMe: false, text: '可以，我加个幂等锁。', ts: 4 },
  ],
  c2: [
    { id: 'm5', channelId: 'c2', author: 'review-agent', isMe: false, text: '已委派 qa 补用例，需要你决策是否阻塞。', ts: 5 },
  ],
}

// P5 种子：历史事件（后续接入 Kanban event API）
export const seedHistory: HistoryItem[] = [
  { id: 'h1', when: '今天 14:36', taskId: '1', action: '审批', title: '审批 PR #142（有条件通过）', archived: false },
  { id: 'h2', when: '今天 13:20', taskId: '4', action: '决策', title: '决定延后发版', archived: false },
  { id: 'h3', when: '今天 11:05', taskId: '6', action: '补充', title: '确认迁移脚本参数', archived: false },
  { id: 'h4', when: '昨天 18:40', taskId: '1', action: '审批', title: '审批 v2.2 发版', archived: true },
  { id: 'h5', when: '3 天前', taskId: '1', action: '评估', title: '评估旧版 auth 重构', archived: true },
]

// P6 种子：A2UI 模板 + 拓扑关系
export const seedTemplates: A2uiTemplate[] = [
  { id: 'tpl1', name: 'PR 标准审核', decision: 'conditional', riskTags: ['concurrency', 'test-gap'], opinion: '建议补用例再合并', modifiedFiles: [] },
]

export const seedAppRelations: GraphRelation[] = [
  { id: 'rel1', taskId: '1', from: 'n1', to: 'n2', label: 'A2A' },
  { id: 'rel2', taskId: '1', from: 'n2', to: 'n1', label: 'A2H' },
]

/**
 * 把演示种子装入 store。语义与原 CockpitView.vue onMounted 完全一致（逐字搬移）。
 * 后续接 kanban API 时，用真实数据加载替换本函数体即可。
 */
export function loadSeed<
  S extends {
    tasks: CockpitTask[]
    attention: AttentionItem[]
    selectTask: (id: string) => void
    events: CockpitEvent[]
    appTopology: GraphNode[]
    reqTopology: GraphNode[]
    projTopology: GraphNode[]
    workItems: WorkItem[]
    fileTrees: Record<string, FileNode[]>
    channels: CollabChannel[]
    messages: Record<string, ChatMessage[]>
    history: HistoryItem[]
    templates: A2uiTemplate[]
    appRelations: GraphRelation[]
  },
>(store: S): void {
  store.tasks = seedTasks
  store.attention = seedAttention
  store.selectTask('1')
  store.events = seedEvents
  store.appTopology = seedAppTopology
  store.reqTopology = seedReqTopology
  store.projTopology = seedProjTopology
  store.workItems = seedWorkItems
  store.fileTrees = seedFileTrees
  store.channels = seedChannels
  store.messages = seedMessages
  store.history = seedHistory
  store.templates = seedTemplates
  store.appRelations = seedAppRelations
}
```

- [ ] **Step 2: 修改 CockpitView.vue 的 script setup**

把 `CockpitView.vue` 第 1–113 行的 `<script setup lang="ts">` 整段替换为：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import CockpitAttention from '@/custom/cockpit/components/CockpitAttention.vue'
import CockpitKanban from '@/custom/cockpit/components/CockpitKanban.vue'
import CockpitColumnRail from '@/custom/cockpit/components/CockpitColumnRail.vue'
import CockpitCollabMap from '@/custom/cockpit/components/CockpitCollabMap.vue'
import CockpitTimeline from '@/custom/cockpit/components/CockpitTimeline.vue'
import CockpitWorkspace from '@/custom/cockpit/components/CockpitWorkspace.vue'
import CockpitModeBar from '@/custom/cockpit/components/CockpitModeBar.vue'
import CockpitCollabBar from '@/custom/cockpit/components/CockpitCollabBar.vue'
import CockpitChatPane from '@/custom/cockpit/components/CockpitChatPane.vue'
import CockpitTerminalPane from '@/custom/cockpit/components/CockpitTerminalPane.vue'
import CockpitHistoryModal from '@/custom/cockpit/components/CockpitHistoryModal.vue'
import CockpitTemplateManager from '@/custom/cockpit/components/CockpitTemplateManager.vue'
import CockpitTopBar from '@/custom/cockpit/components/CockpitTopBar.vue'
import { loadSeed } from '@/custom/cockpit/fixtures/seed'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

// 右上角用户/设置按钮 → 返回 overlay 项目原生 settings 页面
const goSettings = () => router.push({ name: 'hermes.settings' })
// Kanban 下方"AI协作中心"入口 → 进入原生 Kanban 管理面板
const goCenter = () => router.push({ name: 'hermes.kanban' })

// 演示种子（批次 1 抽离到 fixtures/seed.ts；后续接 kanban API 时替换 loadSeed）
onMounted(() => loadSeed(store))
</script>
```

- [ ] **Step 3: 运行测试确认无回归**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -5
```

Expected: `Test Files 13 passed (13)` / `Tests 101 passed (101)`。fixtures 只被 CockpitView 用，store 测试自建数据不受影响，应全绿。若有失败，检查 loadSeed 的 store 泛型约束是否漏了某个字段（对照 store return 对象）。

- [ ] **Step 4: 验证种子字面量已移走**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
echo "CockpitView tasks literal count:" && grep -c "store.tasks = \[" custom/client/cockpit/views/CockpitView.vue
echo "loadSeed import:" && grep "loadSeed" custom/client/cockpit/views/CockpitView.vue
```

Expected: 第一个 `0`（字面量已不在视图）；第二个两行命中（`import { loadSeed }` + `onMounted(() => loadSeed(store))`）。

- [ ] **Step 5: 提交**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/fixtures/seed.ts custom/client/cockpit/views/CockpitView.vue && git commit -m "refactor(cockpit): extract seed data to fixtures/seed.ts

CockpitView.vue onMounted had 83 lines of hardcoded seed data (tasks,
attention, events, topology, workItems, fileTrees, channels, messages,
history, templates, appRelations) mixed into the view setup. Move them
to fixtures/seed.ts as named constants + a loadSeed(store) loader.

View now only calls loadSeed(store). Semantics unchanged (verbatim
move). fixtures imports only types from store (compile-time erased, no
runtime cycle). Paves the way for kanban API integration later."
```

Expected: 提交成功，2 个文件改动（1 新增 1 修改）。

---

### Task 3: 迁移内联全局样式到 cockpit.scss（死文件复活）

**Files:**
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`（删第二段 style 块）
- Modify: `overlay/custom/client/cockpit/index.ts`（加 scss import）

- [ ] **Step 1: 确认两处样式内容字节一致（搬移前提）**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
echo "=== CockpitView 全局 style 块（182-280行）行数 ===" && sed -n '182,280p' custom/client/cockpit/views/CockpitView.vue | wc -l
echo "=== cockpit.scss 总行数 ===" && wc -l < custom/client/cockpit/styles/cockpit.scss
echo "=== diff（应为空或仅注释差异）==="
diff <(sed -n '182,280p' custom/client/cockpit/views/CockpitView.vue | grep -v '^$\|^[[:space:]]*//' | sed 's/^[[:space:]]*//') <(grep -v '^$\|^[[:space:]]*//' custom/client/cockpit/styles/cockpit.scss | sed 's/^[[:space:]]*//') | head -30
```

Expected: 两处实际样式规则一致（diff 仅可能因注释/空行差异而非规则差异）。若发现规则差异，**停止**——说明 scss 文件与内联块不同步，需先以 CockpitView 内联块为准更新 scss 再继续（记录差异，不要静默合并）。spec §3.2 前提是"已知重复"，若实际有差异要据实处理。

- [ ] **Step 2: 删除 CockpitView.vue 的第二段 style 块**

删除 `CockpitView.vue` 第 175 行到第 280 行（从 `<!-- ... -->` 注释块到文件末尾的 `</style>`），即删除：

```
<!--
  驾驶舱布局样式 · Pure Ink（仅用 CSS 变量，无自定义色值）
  ...（注释）
-->
<style lang="scss">
.cockpit { ... }
... （全局样式全部内容）
.cockpit-modal-anchor { position: fixed; ... }
</style>
```

保留第一段 `<style scoped lang="scss">`（`.cockpit-readonly-badge`，局部样式）不动。

- [ ] **Step 3: 在 cockpit/index.ts 加 scss import**

把 `overlay/custom/client/cockpit/index.ts` 顶部的 import 区改为（在现有 import 之后、`export async function registerCockpit` 之前加一行）：

```ts
// overlay/custom/client/cockpit/index.ts
// Cockpit (Swarm Studio) — AI Collaboration Center
// A 类注册:路由、导航、组件、store、样式、i18n 增量的运行时注册。
import type { App } from 'vue';
import type { Router } from 'vue-router';
import { registerRoute, registerNavEntry } from '../../../registries/client';
import { features } from '../../../config/features';

// 全局布局样式（Pure Ink）：三列布局、折叠竖条、统一选中态、modal overlay。
// 原本内联在 CockpitView.vue，批次 1 迁此为单一来源（模块加载即生效）。
import './styles/cockpit.scss';

export async function registerCockpit(_app: App) {
  ...（其余不变）
```

即：在 `import { features }` 行之后插入一空行 + 两行注释 + `import './styles/cockpit.scss';`。其余文件内容不动。

- [ ] **Step 4: 运行测试确认无回归**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -5
```

Expected: `13 passed / 101 passed`。样式迁移不影响单元测试（jsdom 不渲染样式），全绿属预期。

- [ ] **Step 5: 验证迁移结果**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
echo "CockpitView style 块数（应只剩 scoped）:" && grep -c "<style lang=\"scss\">" custom/client/cockpit/views/CockpitView.vue
echo "index.ts scss import:" && grep "styles/cockpit.scss" custom/client/cockpit/index.ts
```

Expected: 第一个 `0`（全局 style 块已删，只剩 scoped）；第二个命中 `import './styles/cockpit.scss';`。

- [ ] **Step 6: （可选）build 验证样式仍生效**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && timeout 180 npm run build 2>&1 | tail -15
```

Expected: build 成功，无 scss 解析错。若 build 因 vite.config.overlay.ts（inject 生成）不存在而失败，跳过本步（单测已足够验证无回归），记录"build 未验证，待 inject 环境"。**不要**为此跑 `npm run inject`（会污染 upstream 工作树）。

- [ ] **Step 7: 提交**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/views/CockpitView.vue custom/client/cockpit/index.ts && git commit -m "refactor(cockpit): move global styles to styles/cockpit.scss (revive dead file)

cockpit/styles/cockpit.scss existed but was never imported (dead file),
while its content was duplicated as an inline <style lang=scss> block in
CockpitView.vue. Two copies would inevitably drift.

Delete the inline block; import the scss in cockpit/index.ts (module
entry) so it loads once at module init. Pure move, no rule changes."
```

Expected: 提交成功，2 文件改动。

---

### Task 4: 校正审计文档

**Files:**
- Modify: `docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md`

> **注意：** 此文件在 overlay 仓库之外（`ncwk/docs/`），不被 git 跟踪。改动是纯文档增量，无法 commit（与批次 0 的 spec/plan 同样）。Task 4 不产生 git commit，只更新文件内容。

- [ ] **Step 1: 在文档头部加核对日期**

在 `docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md` 第 6 行（`## 审计结论` 之前）插入：

```markdown
**最近核对**：2026-06-22（批次 1 代码质量债清理时逐项核查组件代码）。15 项中 ✅已完成 8 项、🔶部分 4 项、⬜真欠 3 项。详见各表"核查状态"列与文末"校正后真欠清单"。
```

- [ ] **Step 2: 给四张差异表加"核查状态"列**

按 spec §1.3 的核查结果，给 🔴/🟡/🟠/🟢 四张表的每行加"核查状态"列（在"修复"列后）。逐项填：

**🔴 严重缺失表**：
| # | 核查状态 |
|---|---------|
| 1 | ✅已完成（CockpitTopBar.vue 已实现并在 CockpitView 使用） |
| 2 | ✅已完成（CockpitWorkspace.vue diff-ln--add/del） |
| 3 | ✅已完成（CockpitWorkspace.vue score 星级） |
| 4 | ⬜真欠（CollabMap 仅应用级单视图，无空间/组织双栏） |

**🟡 视觉走样表**：
| # | 核查状态 |
|---|---------|
| 5 | ✅已完成（CockpitAttention 数字徽章/严重度色条/分隔布局） |
| 6 | 🔶部分（Workspace 有 max-width:640px，字号/间距对照原型待细化） |
| 7 | 🔶部分（cockpit-rail 类在，hover/icon 对照原型待细化） |
| 8 | 🔶部分（网格点背景在，焦点节点标记对照原型待细化） |

**🟠 联动断裂表**：
| # | 核查状态 |
|---|---------|
| 9 | ⬜真欠（focusOnGraphNodeForTimeline 仅设标签，未切时序源） |
| 10 | ✅已完成（focusOnTimelineNode 存在；审计原判误，实际已接通） |
| 11 | ✅已完成（CockpitAttention.handleClick → focusOnTaskFromAttention） |
| 12 | 🔶部分（archivedMode + is-readonly 类在，表单禁用/隐藏按钮细节待核） |

**🟢 小差异表**：
| # | 核查状态 |
|---|---------|
| 13 | ✅已完成 |
| 14 | ✅已完成 |
| 15 | ✅已完成 |

- [ ] **Step 3: 重写"修复优先级"段为校正后真欠清单**

把文档第 52–60 行（`## 修复优先级` 到 `## 执行方式` 之前）替换为：

```markdown
## 修复优先级（2026-06-22 批次 1 校正后）

**校正后真欠 6 项**（原 15 项经核查，8 项已完成、4 项部分、3 项真欠）：

1. **联动断（P0）**：#9 图→时序切源（focusOnGraphNodeForTimeline 未切时序源）
2. **部分→细化（P1）**：#6 右栏重心字号/间距、#7 折叠竖条 hover/icon、#8 协作图焦点节点标记、#12 归档只读表单禁用细节
3. **功能缺（P2）**：#4 空间-组织双视图（CollabMap 加左右两栏）

**已完成不需再做**：#1 #2 #3 #5 #10 #11 #13 #14 #15（共 8 项）。

## 历史修复优先级（2026-06-22 首版，已被上方校正版取代）

<details>
<summary>展开首版优先级（归档）</summary>

1. **P0（最影响"像不像设计"）**：#1 顶栏、#5 注意力条样式、#6 右栏重心、#2 diff 块
2. **P1（联动断裂）**：#9 #10 #11 #12 四个联动
3. **P2（增强）**：#3 打分、#4 空间-组织视图、#7 #8 样式细化

</details>
```

- [ ] **Step 4: 验证文档更新**

Run:
```bash
grep -c "最近核对" /Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md
grep -c "校正后真欠" /Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md
```

Expected: 第一个 `1`（头部标记）；第二个 `>=1`（校正段）。

- [ ] **Step 5: 不提交**（docs 在 overlay git 之外）

---

### Task 5: 合并验证与收尾

**Files:** 无文件改动

- [ ] **Step 1: 最终全量测试**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -5
```

Expected: `13 passed / 101 passed`（与批次 0 基线一致，无回归）。

- [ ] **Step 2: 确认分支提交清单**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git log --oneline main..HEAD && echo "--- diff stat ---" && git diff --stat main..HEAD
```

Expected: 2 个 commit（Task 2、Task 3 各一；Task 4 文档在 git 外无 commit；Task 1/5 无 commit）。diff stat 含 `fixtures/seed.ts`（新增）、`CockpitView.vue`（改）、`cockpit/index.ts`（改）。**不应**含任何 matrix-chat 或 patches 改动（若含，说明又从错误起点拉分支，回 Task 1 Step 1 重做）。

- [ ] **Step 3: 确认未污染 upstream**

Run:
```bash
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio status --short
```

Expected: 空或仅原本就存在的未跟踪文件（批次 0 时已存在的那些）。不应有 `vitest.config.ts`/`vite.config.ts` 等被改。

- [ ] **Step 4: 合入 main**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge refactor/cockpit-techdebt-batch1-codequality --no-ff -m "Merge refactor/cockpit-techdebt-batch1-codequality: seed extraction, style consolidation, audit doc correction"
```

Expected: 合并成功。

- [ ] **Step 5: main 上复测**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -5
```

Expected: `13 passed / 101 passed`。

- [ ] **Step 6: 删 feature 分支**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git branch -d refactor/cockpit-techdebt-batch1-codequality
```

Expected: 删除成功（已合并）。

---

## Self-Review

**1. Spec 覆盖检查：**

| Spec 要求 | 对应 Task |
|-----------|----------|
| §2 成功标准 1：种子移到 fixtures，视图调 loadSeed | Task 2（Step 1 建 fixtures + Step 2 改视图） |
| §2 成功标准 2：删内联全局 style，scss 经 index.ts import | Task 3（Step 2 删 + Step 3 import） |
| §2 成功标准 3：审计文档加状态列 + 校正清单 | Task 4（Step 1-3） |
| §2 成功标准 4：测试保持 13/101 | Task 2 Step 3、Task 3 Step 4、Task 5 Step 1/5 |
| §2 非目标：不拆 store | 全计划无 store 改动 |
| §2 非目标：不改组件业务逻辑 | CockpitView 只抽种子 + 删 style，不改 template/router 逻辑 |
| §2 非目标：不实现 #4/#6/#7/#8/#9/#12 | 仅 Task 4 校正文档标注，无实现代码 |
| §3.1 fixtures 只 import type | Task 2 Step 1 代码含 `import type { ... }` |
| §3.2 迁移是搬移不改 | Task 3 Step 1 先 diff 验证一致 |
| §4 文件结构 | 文件结构表与各 Task Files 一致 |

无遗漏。

**2. 占位符扫描：** 无 TBD/TODO。每个 code step 含完整代码（Task 2 Step 1 的 fixtures 是完整逐字搬移，非占位）。Task 3 Step 2 的"删除 175-280 行"给出确切范围。Task 4 给出每行核查状态的完整填值。

**3. 类型一致性：** fixtures 的 `loadSeed<S extends {...}>` 泛型约束字段名（tasks/attention/selectTask/events/appTopology/reqTopology/projTopology/workItems/fileTrees/channels/messages/history/templates/appRelations）逐一对照 store return 对象（cockpit.ts 466-490 行）——全部存在且拼写一致。seed 常量的类型（CockpitTask[] 等）与 store interface 定义一致。

**4. 额外稳健性：**
- Task 1 Step 1 加了"HEAD sha == main sha"严格核验，直接针对批次 0 的偏差教训。
- Task 3 Step 1 在删 style 前先 diff 验证两处一致，避免"以为是重复其实有差异"的静默合并。
- Task 5 Step 2 明确"不应含 matrix-chat/patches 改动"作为分支纯净度检查。
- 各 Task 提交粒度独立，可单独 revert。

---

## 执行移交

Plan complete and saved to `docs/superpowers/plans/2026-06-22-cockpit-techdebt-batch1-codequality.md`。

两种执行方式：
1. **Subagent-Driven（推荐）**
2. **Inline Execution**

选哪种？
