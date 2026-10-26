# 解耦 overlay Swarm 看板与 hermes-studio 原生看板

- 日期：2026-06-22
- 范围：overlay 二次开发层（`/Volumes/nvme2230/lab/ncwk/overlay`），上游 `upstream/hermes-studio`
- 类型：UI 路由/入口层解耦（不拆后端数据层）

## 背景与动机

当前 overlay 的增强看板（"Swarm kanban"）与 hermes-studio 原生看板在 UI 层耦合：

- `patches/028-client-kanbanview-enh.patch` 直接**重写**上游 `packages/client/src/views/hermes/KanbanView.vue`，把原生实现（NCollapse 列表 + stat-chip + 原生组件 `@/components/hermes/kanban/*`）替换为 overlay 增强实现（调 `@/custom/kanban/components/*`：KanbanBoard / KanbanToolbar / KanbanBulkBar / KanbanOrchestrationPanel / KanbanAttentionStrip）。
- 路由 `/hermes/kanban`（`patches/071-...-router-index.ts.patch`）的 component 被指向 overlay 的 `@/custom/kanban/components/KanbanPanel.vue`（带侧栏壳），而非原生 `KanbanView.vue`。
- chat 侧栏 `PageSidebarNav.vue`（`patches/020-...`）里，原本"api relay"外链位置被替换为一个跳转到 `/hermes/kanban` 的"看板"按钮。
- 结果：两个看板共用同一条路由、同一个视图文件，overlay 增强代码侵入上游 `KanbanView.vue`，无法独立演进。

**目标**：在 UI 路由/入口层把两者彻底分开——overlay Swarm kanban 有独立路由与独立视图文件，hermes-studio 原生 `KanbanView.vue` 回归 upstream 纯净（patch 028 移除）。

## 非目标

- 不拆后端数据层。两个看板继续共享同一份 `useKanbanStore`（`@/stores/hermes/kanban`）与 `@/api/hermes/kanban`。这是同一池子任务的两个 UI 皮，拆数据会破坏功能、属 YAGNI。
- 不改 server 侧 kanban API（patches 010/013/014/035 不动）。
- 不动 cockpit 系列（patches 070–075 中 cockpit 驾驶舱部分，CockpitView 是独立页面）。
- 不补全 8 个非 en/zh locale 的 `sidebar.swarmKanban` 翻译（fallback 到 en，不阻塞）。

## 架构总览

| 看板 | 路由 | 视图组件 | 入口 | 数据层 |
|---|---|---|---|---|
| **Swarm kanban**（协作 kanban） | `/hermes/swarm-kanban`（新增） | `@/custom/kanban/views/SwarmKanbanView.vue`（新增，overlay） | chat 页侧栏原 "api relay" 位置（patch 020） | 共享 `useKanbanStore` + `@/api/hermes/kanban` |
| **hermes 原生看板** | `/hermes/kanban`（不变） | `@/views/hermes/KanbanView.vue`（回归 upstream 纯净） | AppSidebar "agent" 分组（patch 072 已有，不动） | 同上 |

### 数据流

```
chat 页 (ChatPanel.vue)
  └─ PageSidebarNav 按钮 "Swarm kanban"
       └─ router.push({ name: 'hermes.swarmKanban' })   ← patch 020 改
            └─ /hermes/swarm-kanban                      ← patch 071 新增路由
                 └─ KanbanPanel.vue (侧栏壳, overlay)
                      ├─ PageSidebarNav active="swarm-kanban"
                      └─ <SwarmKanbanView />             ← 新 A 类文件
                           └─ @/custom/kanban/components/* (overlay 增强 UI)
                                └─ useKanbanStore (共享, patch 022)

settings → AppSidebar "agent" 分组
  └─ RouteLinkItem "看板" → hermes.kanban                ← 不变
       └─ /hermes/kanban                                  ← patch 071 改回原生
            └─ KanbanView.vue (upstream 原生, patch 028 已归档)
                 └─ @/components/hermes/kanban/* (原生 UI)
                      └─ useKanbanStore (同一份)
```

两个看板共用同一份 pinia store 单例，页面间切换数据互通（设计预期）。

## 文件级改动清单

### A. 新增（overlay，纯 A 类）

**`overlay/custom/client/kanban/views/SwarmKanbanView.vue`**
- 内容 = 当前 patch 028 重写后的 `KanbanView.vue` 全部内容（script + template + style，约 448 行）。
- 即 Swarm kanban 的视图主体：KanbanToolbar + KanbanOrchestrationPanel + KanbanAttentionStrip + KanbanBulkBar + KanbanBoard + KanbanTaskDrawer。
- 走 `@/custom/kanban/components/*`，数据用共享 `useKanbanStore`。

### B. 修改 overlay 文件

**`overlay/custom/client/kanban/components/KanbanPanel.vue`**（侧栏壳）
- `import KanbanView from '@/views/hermes/KanbanView.vue'` → `import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'`
- 模板 `<KanbanView />` → `<SwarmKanbanView />`
- `<PageSidebarNav active="kanban" ...>` → `active="swarm-kanban"`

### C. 修改 patches（B 类）

**`patches/028-client-kanbanview-enh.patch`** → **归档到 `overlay/.archived-patches/`**
- 含义：不再改写 `KanbanView.vue`，它回归 upstream 原生。
- 其增强逻辑转移到 A 类 `SwarmKanbanView.vue`。
- 同步从 `patches/series` 移除该条目。

**`patches/020-client-pagesidebarnav-nav.patch`**
- `ActiveSection` type：`'kanban'` → `'swarm-kanban'`（含 type 定义、`openKanban` 内的判断、模板 `:class` 判断共 3 处）。
- `openKanban()`：跳转目标 `hermes.kanban` → `hermes.swarmKanban`。
- 按钮 label：`t('sidebar.kanban')` → `t('sidebar.swarmKanban')`。

**`patches/071-cockpit-packages_client_src_router_index.ts.patch`**
- 新增路由：`{ path: '/hermes/swarm-kanban', name: 'hermes.swarmKanban', component: () => import('@/custom/kanban/components/KanbanPanel.vue') }`
- `/hermes/kanban` 的 component：`@/custom/kanban/components/KanbanPanel.vue` → `@/views/hermes/KanbanView.vue`（原生）。
- 登录后默认跳转、superAdmin 兜底跳转里的 `hermes.cockpit` 引用不变。

**`patches/070-cockpit-packages_client_src_App.vue.patch`**
- `usesPageSidebar` 路由名清单：`'hermes.kanban'` → `'hermes.swarmKanban'`（chat 侧栏壳现在属于 swarm-kanban 路由；原生 `/hermes/kanban` 由 AppSidebar 包裹，不进该清单）。

### D. i18n（最小改动）

- `patches/074-...-en.ts.patch` 与 `patches/075-...-zh.ts.patch`：新增 key `sidebar.swarmKanban`。
  - en: `"Swarm kanban"`
  - zh: `"Swarm 协作看板"`
- `sidebar.kanban` 保留（AppSidebar agent 分组下的原生看板链接仍用）。
- 其余 8 个 locale 不改（fallback 到 en）。

### E. 不改动

- patch 022（store 增强）、010/013/014/035（server kanban）、cockpit 相关（070–075 中 cockpit 部分）。
- `AppSidebar.vue` agent 分组下的 `hermes.kanban` 链接（指向原生）。

## 决策记录

1. **chat 侧栏 `ActiveSection` 改名 `'kanban'` → `'swarm-kanban'`**（非保留字面量只改跳转）——语义清晰，波及面小（PageSidebarNav + KanbanPanel 共 4 处 `kanban` 字面量）。
2. **i18n 只改 en/zh**——其余 locale fallback 到 en，后续补翻译不阻塞。
3. **Swarm kanban 走独立新路由 `/hermes/swarm-kanban`**（非 query 参数模式）——真正解耦，原生 `KanbanView.vue` 回归 upstream 纯净，patch 028 可彻底移除。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| patch 028 归档后，store 增强字段（diagnostics/orchestration/attachments/selectedIds/searchQuery，patch 022 加）在原生 KanbanView 不被消费 | 无功能影响（原生视图不读这些字段） | 可接受。patch 022 是纯增量，不调用即不触发。极致纯净可后续拆 022，本次范围外 YAGNI。 |
| `ActiveSection` 改名漏改 `active==="kanban"` | TS literal type 编译报错 | 已 grep 全仓，仅 PageSidebarNav + KanbanPanel 两文件 4 处，清单明确。 |
| swarm-kanban 路由权限 | 路由守卫 | 不加 `requiresSuperAdmin`，普通用户可进（与当前 /hermes/kanban 一致）。 |
| i18n 只改 en/zh，其余 locale 缺 key | vue-i18n 回退到 key 字面量或 fallback locale | en 是 fallback，可接受。 |
| `inject --clean` 时旧 manifest 仍列 028，找不到文件 | clean 日志 warn，不中断 | inject 脚本已处理（`!existsSync` 时 warn 继续）；重跑 inject 刷新 manifest。 |

## 验证策略

1. `cd overlay && npm run clean && npm run inject`——无 patch 失败，series 一致，manifest 不再含 028。
2. `npm run dev`——浏览器手测：
   - chat 侧栏"Swarm kanban" → `/hermes/swarm-kanban` → 增强看板（Toolbar/Orchestration/Attention/Bulk/Board）。
   - settings → AppSidebar agent 分组"看板" → `/hermes/kanban` → 原生简洁看板（NCollapse + stat-chip）。
   - 两页数据互通（一处建任务，另一处刷新可见）。
3. `npm run verify`——上游工作树状态符合预期。
4. `npm test`（vitest）——kanban 相关测试（patches 037/038/039）通过（测 store/controller/routes，不受 view 拆分影响）。
5. `git -C upstream/hermes-studio diff packages/client/src/views/hermes/KanbanView.vue`——应为空（回归原生）。

## 解耦验证（移除 overlay 后）

`npm run clean` + 删 `overlay/custom/` 后：
- upstream `/hermes/kanban` 完全可用（原生 KanbanView 不再被改写）。
- chat 侧栏的 Swarm kanban 入口消失（按钮跳转的路由组件不存在）。
- 即"两个项目代码分离"成立。
