# 驾驶舱技术债清理 · 批次 1：代码质量债（保守三件）设计

**日期**：2026-06-22
**状态**：待评审
**适用范围**：`overlay/custom/client/cockpit/`（新增 fixtures、迁移样式、校正审计文档）
**前置**：批次 0（测试基建）已完成，`cd overlay && npm test` = 13 passed / 101 passed。

---

## 1. 背景：对"代码质量债"的批判性核查

本批次最初设想包含"store 491 行拆分""联动收敛"等。经核查（见下），部分为**臆想债**，剔除；只保留三件有客观证据、有明确 before/after 的真实债。

### 1.1 真实债（保留）

| 债 | 客观证据 | 严重度 |
|----|----------|--------|
| **种子数据耦合** | `CockpitView.vue` 的 `onMounted`（第 30–112 行）有 **83 行硬编码种子**，tasks/attention/events/topology/workItems/fileTrees/channels/messages/history/templates/appRelations 全塞一个 setup 函数；注释自标"P1 占位；后续接入 kanban API"。视图承担了数据装配 + 演示数据双重职责，后续接 API 时要大改。 | 高 |
| **样式重复 + 死文件** | `cockpit/styles/cockpit.scss` 已存在且内容与 `CockpitView.vue` 的全局 `<style lang="scss">`（第 182–280 行）**重复**，但该 scss 文件**无任何 import**（grep 零结果，是死文件）。两处维护必漂移。 | 中 |
| **审计文档过时** | `cockpit-implementation-gap-audit.md` 列 15 项差距，其中 #2 diff 块、#3 评估打分**已在 `CockpitWorkspace.vue` 实现**，#11 注意力→右栏已实现（`CockpitAttention.handleClick` 调 `focusOnTaskFromAttention`），但文档仍标"缺失/断裂"。后续批次（2–5）照旧清单做会重复劳动。 | 高（影响后续批次） |

### 1.2 臆想债（剔除，附理由）

| 臆想债 | 剔除理由 |
|--------|----------|
| store 491 行拆分 | setup store 按 slice 分段（P2/P3/P4/P5/P6 注释清晰）；42 个断言全绿，当前结构可测；拆分增加文件数、未必提升可读性。非急迫。 |
| 联动方法收敛 | `focusOnTaskFromAttention` / `focusOnTimelineNode` / `focusOnGraphNodeForTimeline` 三方法职责清晰，不算债。 |
| 各组件 scoped `<style>` 占比高（如 Attention 69%） | Vue SFC 常规模式，scoped 样式随组件是最佳实践，不算硬债。 |

### 1.3 审计 15 项现状快照（本批次将校正文档，此为依据）

经逐项核对组件代码：

| # | 审计原状态 | 核查后真实状态 |
|---|-----------|---------------|
| 1 顶栏 | 🔴完全没 | ✅ CockpitTopBar.vue 存在并在 CockpitView 使用（日程/时钟/搜索/状态/通知/用户菜单骨架在） |
| 2 diff 块 | 🔴没 | ✅ CockpitWorkspace.vue 已实现（diff-ln--add/del） |
| 3 评估打分 | 🔴没 | ✅ CockpitWorkspace.vue 已实现（score 星级） |
| 4 空间-组织双视图 | 🔴没 | ⬜ 仍缺（CollabMap 仅应用级单视图） |
| 5 注意力条样式 | 🟡走样 | ✅ CockpitAttention 已实现（数字徽章/严重度色条/分隔布局） |
| 6 右栏重心 | 🟡走样 | 🔶 部分（Workspace 有 max-width:640px，字号/间距对照原型待细化） |
| 7 折叠竖条 | 🟡走样 | 🔶 部分（cockpit-rail 类在，hover/icon 对照原型待细化） |
| 8 协作图画布 | 🟡走样 | 🔶 部分（网格点背景在，焦点节点标记对照原型待细化） |
| 9 图→时序 | 🟠断 | ⬜ 仍断（focusOnGraphNodeForTimeline 仅设标签，未切时序源） |
| 10 时序→右栏 | 🟠断 | ✅ focusOnTimelineNode 存在（#10 实际已接通，审计误判） |
| 11 注意力→右栏 | 🟠断 | ✅ 已接通（CockpitAttention.handleClick → focusOnTaskFromAttention） |
| 12 归档只读 | 🟠断 | 🔶 部分（archivedMode + is-readonly 类在，表单禁用/隐藏按钮细节待核） |
| 13 Kanban 优先级 | 🟢小 | ✅ 已做 |
| 14 文件树 M 标记 | 🟢小 | ✅ 已做 |
| 15 终端深色 | 🟢小 | ✅ 已做 |

**校正后真欠清单**（供批次 2–5 使用）：#4、#6（细化）、#7（细化）、#8（细化）、#9、#12（细化）共 6 项，而非审计原文的 15 项。

## 2. 目标与非目标

### 成功标准

1. `CockpitView.vue` 的 `onMounted` 不再含种子字面量；种子数据移至 `cockpit/fixtures/seed.ts`，视图只调用装载函数。
2. `CockpitView.vue` 的内联全局 `<style lang="scss">` 块删除；全局样式由 `cockpit/styles/cockpit.scss` 单一来源提供，经 `cockpit/index.ts` import 生效（死文件复活）。
3. 审计文档 `cockpit-implementation-gap-audit.md` 加状态列（✅已完成 / 🔶部分 / ⬜真欠）+ 最近核对日期；后续批次基于校正后清单。
4. `npm test` 全程保持 **13 passed / 101 passed**（不回归）。

### 非目标

- 不拆 store（§1.2 已剔除）。
- 不改组件业务逻辑、不改审计列的 🟠/🔴/🟡/🟢 条目本身（本批次只**校正文档状态标注**，不实现真欠项）。
- 不接 kanban API（种子仍是演示数据，只换存放位置）。
- 不做 #4/#6/#7/#8/#9/#12 的实现（留给后续批次）。

## 3. 设计

### 3.1 种子数据抽离（fixtures/seed.ts）

**新建 `overlay/custom/client/cockpit/fixtures/seed.ts`**：

- 导出一个 `loadSeed(store)` 函数，内部把现有 `CockpitView.vue` onMounted 里的种子赋值原样搬入（语义不变）。
- 或导出各 slice 常量（`seedTasks`/`seedAttention`/`seedEvents`/...）+ `loadSeed(store)` 用常量填 store。**选后者**——常量可被未来测试单独引用，且 store 赋值逻辑集中可读。
- **类型依赖**：从 `@/custom/cockpit/store/cockpit` 用 `import type { CockpitTask, AttentionItem, CockpitEvent, GraphNode, WorkItem, FileNode, CollabChannel, ChatMessage, HistoryItem, A2uiTemplate, GraphRelation }` 引类型。
  - 只 import type（编译期擦除），fixtures → store **无运行时依赖**；store 也不 import fixtures。无循环依赖。
- `loadSeed` 接收 store 实例（由 CockpitView 传入 `useCockpitStore()` 结果），直接赋值 store 的各 ref。store 暴露的 ref 可写，此模式与现有 onMounted 一致。

**`CockpitView.vue` 改动**：

- 删除 onMounted 内 83 行种子字面量。
- 替换为：
  ```ts
  import { loadSeed } from '@/custom/cockpit/fixtures/seed'
  onMounted(() => loadSeed(store))
  ```
- 视图的 goSettings/goCenter 路由函数保留不动。

### 3.2 样式迁移

- **删除** `CockpitView.vue` 的第二段 `<style lang="scss">`（第 182–280 行，全局样式）。
- **保留** `CockpitView.vue` 的第一段 `<style scoped lang="scss">`（第 171–173 行，`.cockpit-readonly-badge`，是组件局部样式，随组件保留）。
- **在 `cockpit/index.ts` 加 import**：
  ```ts
  import './styles/cockpit.scss'
  ```
  放在 `registerCockpit` 函数体外的模块顶层（模块加载即生效，无需等注册）。这样 `cockpit/styles/cockpit.scss`（死文件）复活，成为全局样式的单一来源。
- **验证内容一致**：迁移前 diff 两处内容确认字节级一致（已知重复，搬移不改语义）。迁移是**搬移而非改写**。

### 3.3 校正审计文档

- 在 `docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md`：
  - 文档头部加"**最近核对**：2026-06-22（批次 1）"。
  - 三张差异表（🔴/🟡/🟠/🟢）各加"**核查状态**"列，填 §1.3 的 ✅/🔶/⬜。
  - "修复优先级"段重写为基于校正后清单：真欠 = #4 #6 #7 #8 #9 #12。
  - 不删除历史记录（保留原审计作为快照），只增量加状态。

## 4. 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `cockpit/fixtures/seed.ts` | **新建** | 演示种子数据（常量）+ `loadSeed(store)` 装载函数 |
| `cockpit/views/CockpitView.vue` | **修改** | 删 onMounted 种子字面量（改调 loadSeed）、删内联全局 style 块（改由 index.ts import scss） |
| `cockpit/index.ts` | **修改** | 加 `import './styles/cockpit.scss'` |
| `cockpit/styles/cockpit.scss` | 不改（复活） | 全局样式单一来源（原本是死文件，import 后生效） |
| `docs/.../cockpit-implementation-gap-audit.md` | **修改** | 加核查状态列 + 校正真欠清单 |

## 5. 验证

1. `cd overlay && npm test` → 保持 `13 passed / 101 passed`。
2. `grep -c "tasks = \[" CockpitView.vue` → 0（种子字面量已移走）；`grep loadSeed CockpitView.vue` → 命中 import + 调用。
3. `grep -n "<style lang" CockpitView.vue` → 只剩 scoped 块，无全局块。
4. `grep "styles/cockpit.scss" cockpit/index.ts` → 命中 import。
5. 审计文档含"最近核对 2026-06-22"。

## 6. 风险与回退

| 风险 | 应对 |
|------|------|
| 样式迁移后视觉变化 | 迁移是搬移（内容字节级一致），无语义改；验证靠 build + 目检 |
| fixtures 引入循环依赖 | 只用 `import type`，编译期擦除，无运行时环 |
| loadSeed 修改 store ref 失败（响应式丢失） | 沿用现有 onMounted 的直接赋值模式（`store.tasks = [...]`），语义不变；测试覆盖 store 各 slice，回归即捕获 |
| 校正审计误判某项状态 | §1.3 已逐项核对组件代码；校正可由用户 review spec 时再质疑 |

**回退**：`git revert` 本批次 commits 即恢复。三件改动相互独立，也可单独 revert。

## 7. 开放问题

无。方案（保守三件）、种子去向（fixtures 文件）、样式 import 位置（index.ts）均已在 brainstorming 与用户确认。
