# 解耦 overlay Swarm 看板与 hermes 原生看板 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 overlay 的 Swarm 协作看板与 hermes-studio 原生看板在 UI 路由/入口层彻底分离——Swarm kanban 走独立新路由与新视图文件，原生 `KanbanView.vue` 回归 upstream 纯净（patch 028 移除）。

**Architecture:** 新增 overlay 视图 `SwarmKanbanView.vue`（承载原 patch 028 重写内容）+ 新路由 `/hermes/swarm-kanban`（由 `KanbanPanel.vue` 侧栏壳包裹）；`/hermes/kanban` 改回指原生 `KanbanView.vue`；chat 侧栏原 "api relay" 位置按钮重命名为 "Swarm kanban" 指向新路由。数据层 `useKanbanStore` 共享不动。

**Tech Stack:** Vue 3 + vue-router + Pinia + naive-ui + i18n；overlay patch 机制（`patches/series` + `git apply`）。

**Spec:** `docs/superpowers/specs/2026-06-22-decouple-kanban-design.md`

**关键约束（贯穿全计划）:**
- 工作目录：`/Volumes/nvme2230/lab/ncwk`。overlay 在 `overlay/`，上游在 `upstream/hermes-studio/`。
- overlay 当前已 `npm run inject`（上游工作树已应用 patch）。本计划直接编辑**已应用后的上游文件** + overlay 自有文件，然后**重新生成 patch**（`git diff` 导出）。
- patch 文件命名沿用现有风格（`NNN-<scope>-<desc>.patch`）。
- 每个任务结尾用 `npm run inject --clean` 确认可逆、或 `npm run dev` 冒烟。
- 上游 patch 通过 `HERMES_CUSTOM[X] BEGIN/END` 标记包围，便于辨认与未来 rebase。

---

## File Structure

| 文件 | 动作 | 责任 |
|---|---|---|
| `overlay/custom/client/kanban/views/SwarmKanbanView.vue` | 新建 | Swarm kanban 视图主体（Toolbar/Orchestration/Attention/Bulk/Board/Drawer） |
| `overlay/custom/client/kanban/components/KanbanPanel.vue` | 修改 | 侧栏壳，改用 SwarmKanbanView + active="swarm-kanban" |
| `overlay/patches/028-client-kanbanview-enh.patch` | 归档 | 移到 `.archived-patches/`，从 series 删除 |
| `overlay/patches/020-client-pagesidebarnav-nav.patch` | 重生成 | 侧栏按钮改名 swarm-kanban、跳新路由 |
| `overlay/patches/071-cockpit-...-router-index.ts.patch` | 重生成 | 新增 swarm-kanban 路由；kanban 回归原生 |
| `overlay/patches/070-cockpit-...-App.vue.patch` | 重生成 | usesPageSidebar 清单 hermes.kanban → hermes.swarmKanban |
| `overlay/patches/074-...-en.ts.patch` / `075-...-zh.ts.patch` | 重生成 | 加 `sidebar.swarmKanban` key |
| `overlay/patches/series` | 修改 | 删 028 条目 |

---

### Task 1: 新建 SwarmKanbanView.vue（承载原 patch 028 增强内容）

**Files:**
- Create: `overlay/custom/client/kanban/views/SwarmKanbanView.vue`

本任务把"当前 patch 028 重写后的 `KanbanView.vue`"原样搬到 overlay 自有文件。由于上游已 inject，该内容当前就在 `upstream/hermes-studio/packages/client/src/views/hermes/KanbanView.vue`。

- [ ] **Step 1: 读取当前（已 inject）的 KanbanView.vue 全文**

Run:
```bash
cat upstream/hermes-studio/packages/client/src/views/hermes/KanbanView.vue
```
确认其首行是 `<!-- HERMES_CUSTOM[Kanban] BEGIN: Enhanced Kanban view ... -->`，末行是 `<!-- HERMES_CUSTOM[Kanban] END -->`。这就是要搬走的内容。

- [ ] **Step 2: 新建 SwarmKanbanView.vue，内容 = 上一步读到的全文，去掉首尾的 HERMES_CUSTOM 注释行**

Create `overlay/custom/client/kanban/views/SwarmKanbanView.vue`，把上一步的内容粘进去，并：
- 删除第一行 `<!-- HERMES_CUSTOM[Kanban] BEGIN: ... -->`
- 删除最后一行 `<!-- HERMES_CUSTOM[Kanban] END -->`
- 其余 `<script setup>` / `<template>` / `<style scoped>` 三段原样保留。
- import 路径不变（仍 `@/custom/kanban/components/*`、`@/stores/hermes/kanban`、`@/api/hermes/kanban`）。

文件应以 `<script setup lang="ts">` 开头（即原 patch 第 7 行 `+<script setup lang="ts">` 去掉 `+` 后的内容）。

- [ ] **Step 3: 校验文件结构（无 HERMES_CUSTOM 标记残留、三段齐全）**

Run:
```bash
head -3 overlay/custom/client/kanban/views/SwarmKanbanView.vue
echo "---tail---"
tail -3 overlay/custom/client/kanban/views/SwarmKanbanView.vue
echo "---markers check (应无输出)---"
grep -n "HERMES_CUSTOM" overlay/custom/client/kanban/views/SwarmKanbanView.vue
echo "---sections---"
grep -n "^<script\|^</script>\|^<template>\|^</template>\|^<style\|^</style>" overlay/custom/client/kanban/views/SwarmKanbanView.vue
```
Expected: 首行 `<script setup lang="ts">`；末行 `</style>`；HERMES_CUSTOM grep 无输出；三段标签各出现一次。

- [ ] **Step 4: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/kanban/views/SwarmKanbanView.vue
git commit -m "feat(kanban): add SwarmKanbanView (decouple from native KanbanView)"
```

---

### Task 2: 改 KanbanPanel.vue 用 SwarmKanbanView + active="swarm-kanban"

**Files:**
- Modify: `overlay/custom/client/kanban/components/KanbanPanel.vue:5-6,51,80`

- [ ] **Step 1: 改 import 与模板引用**

在 `overlay/custom/client/kanban/components/KanbanPanel.vue`：

把
```ts
import KanbanView from '@/views/hermes/KanbanView.vue'
```
改为
```ts
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
```

把模板里的
```vue
      <KanbanView />
```
改为
```vue
      <SwarmKanbanView />
```

把
```vue
        <PageSidebarNav
          active="kanban"
```
改为
```vue
        <PageSidebarNav
          active="swarm-kanban"
```

- [ ] **Step 2: 校验无残留旧引用**

Run:
```bash
grep -n "KanbanView\|active=\"kanban\"" overlay/custom/client/kanban/components/KanbanPanel.vue
```
Expected: 应只剩 `import SwarmKanbanView from ...` 这一行命中 `KanbanView`（子串匹配），无 `active="kanban"`。

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/kanban/components/KanbanPanel.vue
git commit -m "refactor(kanban): KanbanPanel uses SwarmKanbanView, active=swarm-kanban"
```

---

### Task 3: 上游路由——新增 swarm-kanban 路由，kanban 回归原生

本任务直接编辑**已 inject 的上游** `router/index.ts`，再在 Task 8 重新导出 patch。

**Files:**
- Modify: `upstream/hermes-studio/packages/client/src/router/index.ts:57-61`

- [ ] **Step 1: 改 `/hermes/kanban` 的 component 回原生**

在 `upstream/hermes-studio/packages/client/src/router/index.ts`，把
```ts
    {
      path: '/hermes/kanban',
      name: 'hermes.kanban',
      component: () => import('@/custom/kanban/components/KanbanPanel.vue'),
    },
```
改为
```ts
    {
      path: '/hermes/kanban',
      name: 'hermes.kanban',
      component: () => import('@/views/hermes/KanbanView.vue'),
    },
    {
      path: '/hermes/swarm-kanban',
      name: 'hermes.swarmKanban',
      component: () => import('@/custom/kanban/components/KanbanPanel.vue'),
    },
```

- [ ] **Step 2: 校验路由表**

Run:
```bash
grep -n "hermes.kanban\|hermes.swarmKanban\|KanbanPanel\|KanbanView" upstream/hermes-studio/packages/client/src/router/index.ts
```
Expected: 命中 4 行——`hermes.kanban` 对应 `KanbanView.vue`；`hermes.swarmKanban` 对应 `KanbanPanel.vue`。

- [ ] **Step 3: Commit（上游工作树的改动，最后统一导 patch；此处先记录到 overlay 的 patch 待生成）**

本步不单独 commit 上游（上游归 upstream 仓所有）。改动留作 Task 8 导出 patch 用。

---

### Task 4: 上游 PageSidebarNav——侧栏按钮改名 Swarm kanban + 跳新路由

**Files:**
- Modify: `upstream/hermes-studio/packages/client/src/components/layout/PageSidebarNav.vue:8,32,45,64`

- [ ] **Step 1: ActiveSection type 改名**

把
```ts
// HERMES_CUSTOM[MatrixChat, Kanban] BEGIN: ActiveSection includes matrix and kanban
type ActiveSection = 'chat' | 'history' | 'group' | 'global' | 'matrix' | 'kanban'
// HERMES_CUSTOM[MatrixChat, Kanban] END
```
改为
```ts
// HERMES_CUSTOM[MatrixChat, SwarmKanban] BEGIN: ActiveSection includes matrix and swarm-kanban
type ActiveSection = 'chat' | 'history' | 'group' | 'global' | 'matrix' | 'swarm-kanban'
// HERMES_CUSTOM[MatrixChat, SwarmKanban] END
```

- [ ] **Step 2: openKanban → openSwarmKanban，跳新路由**

把
```ts
// HERMES_CUSTOM[Kanban] BEGIN: openKanban navigation
function openKanban() {
  if (props.active === 'kanban') return
  void router.push({ name: 'hermes.kanban' })
}
// HERMES_CUSTOM[Kanban] END
```
改为
```ts
// HERMES_CUSTOM[SwarmKanban] BEGIN: openSwarmKanban navigation
function openSwarmKanban() {
  if (props.active === 'swarm-kanban') return
  void router.push({ name: 'hermes.swarmKanban' })
}
// HERMES_CUSTOM[SwarmKanban] END
```

- [ ] **Step 3: 模板按钮——active 判断、click、label**

把
```vue
      <!-- HERMES_CUSTOM[Kanban] BEGIN: Kanban tab button -->
      <button class="page-sidebar-tab" :class="{ active: active === 'kanban' }" type="button" @click="openKanban">
```
改为
```vue
      <!-- HERMES_CUSTOM[SwarmKanban] BEGIN: Swarm kanban tab button -->
      <button class="page-sidebar-tab" :class="{ active: active === 'swarm-kanban' }" type="button" @click="openSwarmKanban">
```

把该按钮内的
```vue
        <span>{{ t('sidebar.kanban') }}</span>
```
改为
```vue
        <span>{{ t('sidebar.swarmKanban') }}</span>
```

并把紧随的
```vue
      <!-- HERMES_CUSTOM[Kanban] END -->
```
改为
```vue
      <!-- HERMES_CUSTOM[SwarmKanban] END -->
```

- [ ] **Step 4: 校验无残留旧字面量**

Run:
```bash
grep -n "'kanban'\|openKanban\|sidebar.kanban\|active === 'kanban'" upstream/hermes-studio/packages/client/src/components/layout/PageSidebarNav.vue
```
Expected: 无输出（所有 `kanban` 字面量已改为 `swarm-kanban` / `swarmKanban` / `openSwarmKanban`）。

> 注意：`t('sidebar.kanban')` 改成 `t('sidebar.swarmKanban')` 后，`sidebar.kanban` 字符串不应再出现在本文件。但要确认 AppSidebar.vue 仍用 `sidebar.kanban`（那是另一个文件，不动）。

---

### Task 5: 上游 App.vue——usesPageSidebar 清单改名

**Files:**
- Modify: `upstream/hermes-studio/packages/client/src/App.vue:28-30`

- [ ] **Step 1: 把 usesPageSidebar 数组里的 'hermes.kanban' 改为 'hermes.swarmKanban'**

当前（已 inject）：
```ts
// HERMES_CUSTOM[All] BEGIN: page sidebar routes include MatrixChat and Kanban
const usesPageSidebar = computed(() =>
  ['hermes.chat', 'hermes.session', 'hermes.history', 'hermes.historySession', 'hermes.globalAgent', 'hermes.globalAgentSession', 'hermes.matrixChat', 'hermes.matrixChatRoom', 'hermes.groupChat', 'hermes.groupChatRoom', 'hermes.kanban'].includes(route.name as string),
)
// HERMES_CUSTOM[All] END
```
改为（仅替换 `hermes.kanban` → `hermes.swarmKanban`，并把注释里的 Kanban 改为 SwarmKanban）：
```ts
// HERMES_CUSTOM[All] BEGIN: page sidebar routes include MatrixChat and SwarmKanban
const usesPageSidebar = computed(() =>
  ['hermes.chat', 'hermes.session', 'hermes.history', 'hermes.historySession', 'hermes.globalAgent', 'hermes.globalAgentSession', 'hermes.matrixChat', 'hermes.matrixChatRoom', 'hermes.groupChat', 'hermes.groupChatRoom', 'hermes.swarmKanban'].includes(route.name as string),
)
// HERMES_CUSTOM[All] END
```

> 原因：`/hermes/kanban` 现在是原生 KanbanView，由 AppSidebar 包裹（同 settings/models），不应进 usesPageSidebar；而 `/hermes/swarm-kanban` 是 chat 同级的 page-sidebar 路由（KanbanPanel 自带侧栏）。

- [ ] **Step 2: 校验**

Run:
```bash
grep -n "hermes.kanban\|hermes.swarmKanban" upstream/hermes-studio/packages/client/src/App.vue
```
Expected: 仅命中 `hermes.swarmKanban`，无 `hermes.kanban`。

---

### Task 6: 上游 i18n——加 sidebar.swarmKanban（en/zh）

**Files:**
- Modify: `upstream/hermes-studio/packages/client/src/i18n/locales/en.ts:209`
- Modify: `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts:207`

- [ ] **Step 1: en.ts 在 kanban 后加 swarmKanban**

在 `upstream/hermes-studio/packages/client/src/i18n/locales/en.ts`，定位到（约 209 行）：
```ts
    kanban: 'Kanban',
```
在其**下方**新加一行：
```ts
    kanban: 'Kanban',
    swarmKanban: 'Swarm kanban',
```

- [ ] **Step 2: zh.ts 在 kanban 后加 swarmKanban**

在 `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts`，定位到（约 207 行）：
```ts
    kanban: '看板',
```
在其**下方**新加一行：
```ts
    kanban: '看板',
    swarmKanban: 'Swarm 协作看板',
```

- [ ] **Step 3: 校验**

Run:
```bash
grep -n "swarmKanban" upstream/hermes-studio/packages/client/src/i18n/locales/en.ts upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts
```
Expected: en.ts 与 zh.ts 各命中 1 行。

---

### Task 7: 冒烟验证（dev server + 浏览器）

在导出 patch 前，先用当前已改的上游工作树跑一次 dev，确认功能正常。

- [ ] **Step 1: 启动 overlay dev server**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run dev
```
保持运行（后台）。打开浏览器到 dev server 提示的 URL（通常 http://localhost:5173 或 vite 分配端口）。

- [ ] **Step 2: 验证 Swarm kanban 入口**

在 chat 页（登录后默认 cockpit 或 chat），看左侧 `PageSidebarNav`：
- 原"api relay"位置的按钮文案应是 **"Swarm kanban"**（en）/ **"Swarm 协作看板"**（zh，若界面切到中文）。
- 点击它 → URL 变为 `#/hermes/swarm-kanban` → 看到**增强看板**（顶部 KanbanToolbar 含 board/assignee/tenant/search；其下 OrchestrationPanel、AttentionStrip、BulkBar、Board）。
- 侧栏该按钮呈选中态（active 高亮）。

- [ ] **Step 3: 验证原生 kanban 入口**

进入 settings（右上角齿轮或侧栏底部齿轮）→ 左侧 AppSidebar 的 **agent** 分组下点 **"看板"**（`sidebar.kanban`）：
- URL 变为 `#/hermes/kanban` → 看到**原生简洁看板**（page-header + stats-bar 的 stat-chip + NCollapse 列表 + 原生 KanbanTaskCard/KanbanCreateForm）。**没有** Toolbar/Orchestration/Bulk。

- [ ] **Step 4: 验证数据互通**

在 `/hermes/swarm-kanban` 建一个新任务（如 "解耦验证-001"）→ 切到 `/hermes/kanban` → 该任务应出现在对应状态列（triage/todo）。反之亦然。

- [ ] **Step 5: 停止 dev server**

Ctrl-C 停止后台 dev。

> 若 Step 2/3/4 任一失败：用 `systematic-debugging` skill 排查（常见：import 路径错、HERMES_CUSTOM 标记未删净导致 vite 报错、ActiveSection type 不匹配 TS 报错）。修复后重跑本任务。

---

### Task 8: 重新导出 patches 020/070/071/074/075 + 归档 028

上游工作树现在包含了 Task 3–6 的全部改动。把这些改动重新导出为 overlay patch，并归档 028。

**Files:**
- Modify: `overlay/patches/020-client-pagesidebarnav-nav.patch`（重生成）
- Modify: `overlay/patches/070-cockpit-packages_client_src_App.vue.patch`（重生成）
- Modify: `overlay/patches/071-cockpit-packages_client_src_router_index.ts.patch`（重生成）
- Modify: `overlay/patches/074-cockpit-packages_client_src_i18n_locales_en.ts.patch`（重生成）
- Modify: `overlay/patches/075-cockpit-packages_client_src_i18n_locales_zh.ts.patch`（重生成）
- Archive: `overlay/patches/028-client-kanbanview-enh.patch` → `overlay/.archived-patches/`
- Modify: `overlay/patches/series`（删 028 条目）

- [ ] **Step 1: 先 clean 还原上游（让 020/070/071/074/075 回到 inject 前状态），再重新应用我们的新逻辑**

⚠️ 关键：导出 patch 必须"基于 upstream 干净状态"。但 Task 3–6 是在"已 inject"状态上改的，现在上游工作树 = upstream + 旧 patches + 我们的新改动。直接 diff 会把旧 patch 内容也算进新 patch。

正确流程：
1. 先把 Task 3–6 的上游改动**暂存**（git stash 在上游仓）。
2. `npm run clean`（在上游仓 reverse 掉所有旧 patch，回到纯净 upstream）。
3. 重新应用 020/070/071/074/075 之外的所有 patch（即先 inject 除这 5 个 + 028 之外的 patch），得到"upstream + 其他 patch"的基线。
4. 把 Task 3–6 的暂存改动 pop 回来——此时 git diff（上游仓）就是"这 6 个 patch 的最终净改动"。
5. 对每个目标文件分别 `git diff` 导出，覆盖对应 patch 文件。

具体命令：
```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio

# 1. 暂存我们的上游改动
git stash push -- packages/client/src/router/index.ts \
  packages/client/src/components/layout/PageSidebarNav.vue \
  packages/client/src/App.vue \
  packages/client/src/i18n/locales/en.ts \
  packages/client/src/i18n/locales/zh.ts
# 注意：不要 stash KanbanView.vue（Task 1 已把内容搬走，Task 9 会让它回归纯净）

cd /Volumes/nvme2230/lab/ncwk/overlay

# 2. clean 还原上游到纯净 upstream
npm run clean
```

- [ ] **Step 2: 建立基线——inject 除 020/070/071/074/075/028 之外的 patch**

临时建一个排除清单：
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
# 备份 series
cp patches/series patches/series.bak
# 从 series 临时删掉这 6 个
grep -v -E "^(020-client-pagesidebarnav-nav|070-cockpit-packages_client_src_App\.vue|071-cockpit-packages_client_src_router_index\.ts|074-cockpit-packages_client_src_i18n_locales_en\.ts|075-cockpit-packages_client_src_i18n_locales_zh\.ts|028-client-kanbanview-enh)\.patch$" patches/series.bak > patches/series
npm run inject
```
确认 inject 成功（无 FAILED）。

- [ ] **Step 3: pop 暂存，得到净改动**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git stash pop
```
若有冲突：说明 Task 3–6 改的行在基线里也被别的 patch 动了——手动解决（保留我们的新内容），然后 `git add` 标记解决。

- [ ] **Step 4: 逐文件导出新 patch**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio

git diff -- packages/client/src/components/layout/PageSidebarNav.vue > /Volumes/nvme2230/lab/ncwk/overlay/patches/020-client-pagesidebarnav-nav.patch
git diff -- packages/client/src/App.vue > /Volumes/nvme2230/lab/ncwk/overlay/patches/070-cockpit-packages_client_src_App.vue.patch
git diff -- packages/client/src/router/index.ts > /Volumes/nvme2230/lab/ncwk/overlay/patches/071-cockpit-packages_client_src_router_index.ts.patch
git diff -- packages/client/src/i18n/locales/en.ts > /Volumes/nvme2230/lab/ncwk/overlay/patches/074-cockpit-packages_client_src_i18n_locales_en.ts.patch
git diff -- packages/client/src/i18n/locales/zh.ts > /Volumes/nvme2230/lab/ncwk/overlay/patches/075-cockpit-packages_client_src_i18n_locales_zh.ts.patch
```

- [ ] **Step 5: 校验导出的 patch 含 swarm-kanban/swarmKanban 内容**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
grep -l "swarmKanban\|swarm-kanban\|openSwarmKanban" patches/020-*.patch patches/070-*.patch patches/071-*.patch patches/074-*.patch patches/075-*.patch
```
Expected: 命中全部 5 个 patch 文件（020 含 openSwarmKanban/swarm-kanban；070/071 含 hermes.swarmKanban；074/075 含 swarmKanban key）。

- [ ] **Step 6: 恢复 series 完整清单（含 020/070/071/074/075，不含 028）+ 归档 028**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
# 用备份恢复，但删掉 028
grep -v "^028-client-kanbanview-enh.patch$" patches/series.bak > patches/series
rm patches/series.bak

# 归档 028
git mv patches/028-client-kanbanview-enh.patch .archived-patches/028-client-kanbanview-enh.patch
```

- [ ] **Step 7: 全量 clean + inject 验证幂等**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean
npm run inject
```
Expected: 全部 patch applied 成功，无 FAILED。确认 `.overlay-injected.json` 的 `appliedPatches` 不再含 `028-...`。

- [ ] **Step 8: 校验上游 KanbanView.vue 已回归原生（无 HERMES_CUSTOM 标记）**

Run:
```bash
grep -c "HERMES_CUSTOM" upstream/hermes-studio/packages/client/src/views/hermes/KanbanView.vue
```
Expected: `0`（纯净 upstream）。

- [ ] **Step 9: Commit（overlay 仓）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add patches/020-*.patch patches/070-*.patch patches/071-*.patch patches/074-*.patch patches/075-*.patch patches/series .archived-patches/028-*.patch
git commit -m "refactor(kanban): decouple swarm-kanban route, archive patch 028 (native KanbanView restored)"
```

---

### Task 9: 最终验证（verify + test + dev 冒烟）

**Files:** 无（验证任务）

- [ ] **Step 1: verify 上游状态**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run verify
```
Expected: 通过（上游工作树状态 = 干净 upstream + 当前 series 全部 patch applied）。

- [ ] **Step 2: 运行 vitest**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm test
```
Expected: 全部通过。重点关注 kanban 相关测试（patches 037/038/039 引入的 service/controller/routes 测试）不受影响。

- [ ] **Step 3: dev 冒烟（同 Task 7，快速复验）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run dev
```
浏览器快速验证：
- chat 侧栏 "Swarm kanban" → `/hermes/swarm-kanban` → 增强看板 ✓
- settings → AppSidebar agent "看板" → `/hermes/kanban` → 原生看板 ✓
- 数据互通 ✓

停止 dev。

- [ ] **Step 4: 解耦验证——clean 后原生 kanban 仍可用**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean
npm run dev
```
浏览器访问 `#/hermes/kanban`：应仍显示原生看板（upstream 自带，不依赖 overlay）。
访问 `#/hermes/swarm-kanban`：应 404 或空白（路由组件 `@/custom/kanban/...` 在 clean 后仍存在——因为 custom 是 overlay 自有目录不参与 clean；但 chat 侧栏按钮应仍可点，因 PageSidebarNav 也回退到 upstream 原生的 api relay 外链版本）。

> 这一步确认：clean 后 upstream `/hermes/kanban` 独立可用，overlay 解耦成立。

- [ ] **Step 5: 重新 inject 恢复开发态**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```

- [ ] **Step 6: 最终 Commit（如有剩余改动）**

```bash
cd /Volumes/nvme2230/lab/ncwk
git status
# 若 docs 或其他有未提交改动
git add docs/superpowers/specs/2026-06-22-decouple-kanban-design.md docs/superpowers/plans/2026-06-22-decouple-kanban.md
git commit -m "docs: add decouple-kanban spec & plan"
```

---

## Self-Review 记录

**Spec coverage（逐条对照 spec §2 文件清单）:**
- ✅ A. 新增 SwarmKanbanView.vue → Task 1
- ✅ B. 改 KanbanPanel.vue → Task 2
- ✅ C. 归档 028 → Task 8 Step 6
- ✅ C. 改 020（ActiveSection + openKanban + label）→ Task 4 + Task 8 导出
- ✅ C. 改 071（新路由 + kanban 回原生）→ Task 3 + Task 8 导出
- ✅ C. 改 070（usesPageSidebar）→ Task 5 + Task 8 导出
- ✅ D. i18n en/zh 加 swarmKanban → Task 6 + Task 8 导出
- ✅ series 删 028 → Task 8 Step 6
- ✅ 不动 022/010/013/014/035/cockpit → 全程未涉及
- ✅ 验证策略（spec §3.4）→ Task 7 + Task 9

**Placeholder 扫描:** 无 TBD/TODO；所有代码块为完整可用内容；命令含 expected 输出。

**类型一致性:** `hermes.swarmKanban`（路由名）/ `'swarm-kanban'`（ActiveSection 字面量）/ `openSwarmKanban`（函数名）/ `sidebar.swarmKanban`（i18n key）/ `SwarmKanbanView`（组件名）—— 五处命名贯穿一致，已在各 Task 中统一。
