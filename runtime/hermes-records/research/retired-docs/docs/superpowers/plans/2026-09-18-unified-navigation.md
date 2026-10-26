# 统一导航重构（双壳驾驶舱）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「AI协作中心/IDE工作台/工作台/循环工程图」四个重叠入口收敛为双壳——驾驶舱（/app，六场景）+ IDE 工作台（/ide），旧路由直删、引用全清扫。

**Architecture:** IaShell 改造为统一壳（全局页头 IaShellHeader + 场景条 + router-view）；cockpit 三栏迁入 /app/collab 场景；/hermes/loop 与 /hermes/cockpit 全家族删除（custom 侧删注册，upstream 侧 patch 删静态路由）；AppSidebar 只留双入口 + 系统分组。

**Tech Stack:** Vue 3 + vue-router 4 + pinia + naive-ui + vitest；overlay patch 注入体系（`npm run inject`）。

**Spec:** `docs/superpowers/specs/2026-09-18-unified-navigation-design.md`

## Global Constraints

- **只改 overlay/**；upstream 行为变更一律走 patch：编辑 `upstream/hermes-studio` 工作树 → `git -C upstream/hermes-studio diff -- <file> > overlay/patches/NNN-<name>.patch` → series 追加注释行 + 文件名 → `cd overlay && npm run inject` 验证干净。新 patch 从 **296** 起编号（series 尾部现为 295）。
- **分支**：`cd overlay && git checkout -b feat/unified-navigation`（基于 main，开工先 `git status` 确认干净；并行会话可能动过仓库，先核对 HEAD）。
- **测试**：`cd overlay && npm run test`（vitest run，基线 154 文件 / 1624 测试）。单测文件用 `npx vitest run <path>`。
- **i18n**：zh/en 成对 patch（一个 locale 一个 patch 文件，series 惯例）；改完跑 i18n 覆盖率检查（若仓库有 i18n gate 脚本则跑，无则用 grep 验证 zh/en key 对齐）。
- **vite 缓存**：换树/重注入后构建或跑 dev 前删 `upstream/hermes-studio/node_modules/.vite`。
- **commit**：Conventional Commits，中文 header（跟随仓库历史）；每个 Task 结束提交一次。
- **命名**：新路由名一律 `ia2.*` 家族；`hermes.loop*`、`hermes.cockpit`、`hermes.chat/session/history/globalAgent*/matrixChat/swarmKanban` 全部退役，禁止新增引用。
- **Guard 测试惯例**：路由树测试直接消费 `buildIaRoutes()` 纯函数 + `router.resolve`，不触发懒组件加载。

## 路由名映射表（全计划单一事实源）

| 旧 | 新 | 说明 |
|---|---|---|
| ia2.overview (/app) | ia2.overview (/app) | 不变，OverviewScene |
| — | ia2.collab (/app/collab) | 新，CollabScene = cockpit 三栏 |
| hermes.chat → ia2.collabChat (/app/collab/chat) | 协作场景右栏嵌入 |
| hermes.session → ia2.collabSession (/app/collab/session/:sessionId) | 同上 |
| hermes.history → ia2.collabHistory (/app/collab/history) | 同上 |
| hermes.historySession → ia2.collabHistorySession (/app/collab/history/session/:sessionId) | 同上 |
| hermes.globalAgent → ia2.collabGlobalAgent (/app/collab/global-agent) | 同上 |
| hermes.globalAgentSession → ia2.collabGlobalAgentSession (/app/collab/global-agent/session/:sessionId) | 同上 |
| hermes.matrixChat(Room) | ia2.commsHome/ia2.commsRoom（已存在） | cockpit 的 matrix 子路由删除 |
| hermes.swarmKanban | ia2.tasks（已存在，/app/tasks） | cockpit 的 kanban 子路由删除 |
| ia2.orchestrate | ia2.eng (/app/eng)，编排 tab | OrchestrateView 降为 tab 内容 |
| ia2.manage | ia2.eng，Teams tab | ManageScene 拆分：Teams → eng；值守 tab 退役（与 /app/tasks 看板重复） |
| ia2.runs | ia2.ops (/app/ops)，运行 tab | RunCenterView 降为 tab 内容 |
| ia2.inbox | ia2.ops，介入 tab | InboxView 降为 tab 内容 |
| ia2.ops（旧 OpsScene） | ia2.ops，值守 tab | OpsScene 本体扩为三 tab 枢纽 |
| ia2.code | 删除 | CodeScene 删除，编码归 IDE |
| ia2.runDetail (/app/runs/:runId) | ia2.runDetail (/app/ops/runs/:runId) | 名不变，路径迁 |
| hermes.loop* 全家族 | 删除 | 含 loopRuns/loopRunDetail/loopDetail/graph redirect |
| ia2.tasks、ia2.comms* | 不变 | /app/tasks、/app/comms(+room/:roomId) |

---

### Task 1: 路由层重写（ia2/routes.ts）

**Files:**
- Modify: `overlay/custom/client/ia2/routes.ts`（整体重写）
- Test: `overlay/custom/client/ia2/__tests__/scene-routes.test.ts`（整体重写为 routes-tree 守门测试）

**Interfaces:**
- Produces: `IA_AREAS: IaAreaMeta[]`（key: 'overview'|'collab'|'eng'|'ops'|'tasks'|'comms'）、`areaForPath(path)`、`buildIaRoutes()`；删除 `IA_SCENES`、`SceneNames`、`IA2_SCENE_NAMES`、`LOOP_SCENE_NAMES`、`buildSceneChildren`、`sceneForRouteName`、`SceneKey`、`IaAreaKey` 中 manage/code/orchestrate/runs/inbox。
- Consumes: 无（第一个任务）。

- [ ] **Step 1: 重写测试（先红）**

`overlay/custom/client/ia2/__tests__/scene-routes.test.ts` 全文替换：

```ts
// overlay/custom/client/ia2/__tests__/scene-routes.test.ts
// 路由树守门（2026-09-18 统一导航重构）：六场景树 + 协作子路由 + 旧家族禁入。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { buildIaRoutes, IA_AREAS, areaForPath } from '../routes'

const Dummy = { template: '<div />' }

function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  // 测试不触发懒加载：把 component 全部替换为 Dummy
  const strip = (rs: any[]): any[] =>
    rs.map(r => ({ ...r, component: r.component ? Dummy : undefined, children: r.children ? strip(r.children) : undefined }))
  for (const r of strip(buildIaRoutes())) router.addRoute(r)
  return router
}

describe('ia2 路由树（六场景）', () => {
  it('IA_AREAS = 总览/协作/工程/运行/工作项/沟通', () => {
    expect(IA_AREAS.map(a => a.key)).toEqual(['overview', 'collab', 'eng', 'ops', 'tasks', 'comms'])
  })

  it.each([
    ['/app', 'ia2.overview'],
    ['/app/collab', 'ia2.collab'],
    ['/app/collab/session/s1', 'ia2.collabSession'],
    ['/app/collab/history', 'ia2.collabHistory'],
    ['/app/collab/global-agent/session/s1', 'ia2.collabGlobalAgentSession'],
    ['/app/eng', 'ia2.eng'],
    ['/app/ops', 'ia2.ops'],
    ['/app/ops/runs/r1', 'ia2.runDetail'],
    ['/app/tasks', 'ia2.tasks'],
    ['/app/comms', 'ia2.comms'],
    ['/app/comms/room/!x:host', 'ia2.commsRoom'],
  ])('%s → %s', (path, name) => {
    const router = makeRouter()
    const resolved = router.resolve(path)
    expect(resolved.name).toBe(name)
    expect(resolved.matched.length).toBeGreaterThan(0)
  })

  it('areaForPath 投影六场景', () => {
    expect(areaForPath('/app')).toBe('overview')
    expect(areaForPath('/app/collab/history')).toBe('collab')
    expect(areaForPath('/app/eng')).toBe('eng')
    expect(areaForPath('/app/ops/runs/r1')).toBe('ops')
    expect(areaForPath('/app/tasks')).toBe('tasks')
    expect(areaForPath('/app/comms/room/!x')).toBe('comms')
    expect(areaForPath('/ide')).toBeNull()
  })

  it('壳 meta.fullscreen = true', () => {
    const shell = buildIaRoutes()[0]
    expect(shell.meta?.fullscreen).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd overlay && npx vitest run custom/client/ia2/__tests__/scene-routes.test.ts`
Expected: FAIL（ia2.collab 等路由不存在）

- [ ] **Step 3: 重写 routes.ts**

`overlay/custom/client/ia2/routes.ts` 全文替换：

```ts
// overlay/custom/client/ia2/routes.ts
// 驾驶舱路由树（/app/*）—— 2026-09-18 统一导航重构：
// 双壳收敛（驾驶舱 + IDE 工作台），IaShell = 全局页头 + 六场景条 + router-view。
// 六场景：总览 / 协作(cockpit 三栏迁入) / 工程(编排+Teams) / 运行(RunCenter+介入+值守) /
// 工作项 / 沟通。/hermes/loop 与 /hermes/cockpit 全家族直删（spec: docs/superpowers/
// specs/2026-09-18-unified-navigation-design.md）。
//
// 纪律：本文件只产纯路由描述和区域元数据，可被 router.resolve 级测试直接消费，
// 不触发任何懒组件加载。壳层 meta.fullscreen: true。
import type { RouteRecordRaw } from 'vue-router'

/** 六场景 key（场景条与区域投影的词表） */
export type IaAreaKey =
  | 'overview'
  | 'collab'
  | 'eng'
  | 'ops'
  | 'tasks'
  | 'comms'

export interface IaAreaMeta {
  key: IaAreaKey
  /** 路由名（场景首页） */
  name: string
  /** 场景路径 */
  path: string
  /** 场景条文案 i18n key */
  labelKey: string
}

/** 场景元数据（场景条 + 区域投影的单一事实源） */
export const IA_AREAS: IaAreaMeta[] = [
  { key: 'overview', name: 'ia2.overview', path: '/app', labelKey: 'ia2.nav.overview' },
  { key: 'collab', name: 'ia2.collab', path: '/app/collab', labelKey: 'ia2.nav.collab' },
  { key: 'eng', name: 'ia2.eng', path: '/app/eng', labelKey: 'ia2.nav.eng' },
  { key: 'ops', name: 'ia2.ops', path: '/app/ops', labelKey: 'ia2.nav.ops' },
  { key: 'tasks', name: 'ia2.tasks', path: '/app/tasks', labelKey: 'ia2.nav.tasks' },
  { key: 'comms', name: 'ia2.comms', path: '/app/comms', labelKey: 'ia2.nav.comms' },
]

/**
 * 路径 → 当前场景 key。场景条高亮与 ia store 的唯一投影函数。
 * 最长前缀优先；未知 /app 子路径回退总览；非 /app 路径返回 null。
 */
export function areaForPath(path: string): IaAreaKey | null {
  if (path !== '/app' && !path.startsWith('/app/')) return null
  const area = [...IA_AREAS]
    .sort((a, b) => b.path.length - a.path.length)
    .find(a => path === a.path || path.startsWith(`${a.path}/`))
  return area?.key ?? 'overview'
}

/** 构造 /app 路由树（每次调用返回新对象，调用方负责 addRoute） */
export function buildIaRoutes(): RouteRecordRaw[] {
  return [
    {
      path: '/app',
      name: 'ia2.shell',
      component: () => import('./views/IaShell.vue'),
      meta: { fullscreen: true },
      children: [
        {
          path: '',
          name: 'ia2.overview',
          component: () => import('./views/scenes/OverviewScene.vue'),
        },
        {
          // 协作场景：cockpit 三栏（右栏经子路由嵌入 chat/history/global-agent 页）
          path: 'collab',
          name: 'ia2.collab',
          component: () => import('./views/scenes/CollabScene.vue'),
          children: [
            { path: 'chat', name: 'ia2.collabChat', component: () => import('@/views/hermes/ChatView.vue') },
            { path: 'session/:sessionId', name: 'ia2.collabSession', component: () => import('@/views/hermes/ChatView.vue') },
            { path: 'history', name: 'ia2.collabHistory', component: () => import('@/views/hermes/HistoryView.vue') },
            { path: 'history/session/:sessionId', name: 'ia2.collabHistorySession', component: () => import('@/views/hermes/HistoryView.vue') },
            { path: 'global-agent', name: 'ia2.collabGlobalAgent', component: () => import('@/views/hermes/GlobalAgentView.vue') },
            { path: 'global-agent/session/:sessionId', name: 'ia2.collabGlobalAgentSession', component: () => import('@/views/hermes/GlobalAgentView.vue') },
          ],
        },
        {
          // 工程场景：编排 + Teams 管理（页内 tab）
          path: 'eng',
          name: 'ia2.eng',
          component: () => import('./views/scenes/EngScene.vue'),
        },
        {
          // 运行场景：RunCenter + 介入收件箱 + 值守（页内 tab）
          path: 'ops',
          name: 'ia2.ops',
          component: () => import('./views/scenes/OpsScene.vue'),
        },
        {
          // 运行详情（参数名 runId 与旧路由一致）
          path: 'ops/runs/:runId',
          name: 'ia2.runDetail',
          component: () => import('@/custom/loop/runcenter/views/RunDetailView.vue'),
        },
        {
          path: 'tasks',
          name: 'ia2.tasks',
          component: () => import('./views/TasksView.vue'),
        },
        {
          // 沟通场景：router-view 承载 matrix-chat（路径参数不变）
          path: 'comms',
          name: 'ia2.comms',
          component: () => import('./views/CommsView.vue'),
          children: [
            { path: '', name: 'ia2.commsHome', component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue') },
            { path: 'room/:roomId', name: 'ia2.commsRoom', component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue') },
          ],
        },
      ],
    },
  ]
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `cd overlay && npx vitest run custom/client/ia2/__tests__/scene-routes.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd overlay && git add custom/client/ia2/routes.ts custom/client/ia2/__tests__/scene-routes.test.ts
git commit -m "feat(ia2): 路由树重写为六场景（协作/工程/运行场景落地，loop/cockpit 家族退役）"
```

---

### Task 2: IaShell 统一壳（页头 IaShellHeader + 场景条）

**Files:**
- Create: `overlay/custom/client/ia2/components/IaShellHeader.vue`
- Modify: `overlay/custom/client/ia2/views/IaShell.vue`（整体重写）
- Test: `overlay/custom/client/ia2/__tests__/ia-shell.test.ts`（重写）、`overlay/custom/client/ia2/__tests__/cockpit-shell.test.ts`（删除，由 ia-shell + scene-routes 覆盖）

**Interfaces:**
- Consumes: Task 1 的 `IA_AREAS`、`areaForPath`；`useIaStore.syncFromPath`；`useWorkspaceStore`（loadTodos/startReminderScheduler/watchKanbanTasks/initFleetStream/refreshAllBoards/unwatchKanbanTasks/stopFleetStream/stopReminderScheduler/openSchedule）；`useRunCenterStore`（fetchRuns/awaitingRuns/sortedRuns/syncVisibleRunIds/fetchMetrics/connection）；`useLoopStore.fetchLoops`；`useCockpitStore`（bootstrap/disconnectOnUnmount/inboxCount/scheduleDatesWithEvents/currentUserName/openNotify/closeNotify/notifyOpen/searchQuery/runSearch/clearSearch/_sessionSearching）。
- Produces: `IaShellHeader.vue`（props: `notifyCount?: number`、`userName?: string`；emits: `notify`）；IaShell 武装序列（原 LoopCockpitView onMounted 序列上移）。

- [ ] **Step 1: 写 IaShellHeader 测试（先红）** — 新建 `overlay/custom/client/ia2/__tests__/ia-shell-header.test.ts`：挂载 IaShellHeader，断言：品牌文案存在；⇄ IDE 按钮 data-testid="ia-header-ide" 点击后 `router.push({name:'ide.shell'})`（mock useRouter）；通知按钮点击 emit('notify')；Gateway 探测区渲染（mock fetch `/agent-health/detailed` 返回 `{gateway_state:'running',loaded_platforms:{}}`）。参照 `cockpit-topbar-health.test.ts` 的 fetch mock 写法（读该文件复用模式）。

- [ ] **Step 2: 跑测试确认红**（组件不存在）

- [ ] **Step 3: 实现 IaShellHeader.vue**

内容 = CockpitTopBar 的裁剪迁移（读 `overlay/custom/client/cockpit/components/CockpitTopBar.vue` 全文，搬以下部分，删掉 schedule/loop/runtrace 按钮、时钟、"Swarm Studio" 字样）：
- 品牌：连接点（appStore.connected）+ `t('ia2.brand')`
- 场景条放本组件第二行或直接放 IaShell——**实现选择：场景条放 IaShell**（本组件只做页头一行）
- 全局搜索（cockpit store searchQuery/runSearch/clearSearch）
- CockpitTeamSwitcher、Gateway 探测组（countdown/platforms/manualProbe/详情面板，整段搬运含样式）
- ThemeSwitch/LanguageSwitch
- 通知按钮（emit('notify')，badge=notifyCount）
- 用户按钮（跳 `{name:'hermes.settings'}`，avatar=userName 首字符）
- **⇄ IDE 按钮（固定最右侧）**：`<button data-testid="ia-header-ide" @click="router.push({ name: 'ide.shell' })">{{ t('ia2.shell.gotoIde') }}</button>`

- [ ] **Step 4: 重写 IaShell.vue**

```vue
<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 驾驶舱统一壳（2026-09-18 统一导航重构）：全局页头 IaShellHeader + 六场景条 + router-view。
     共享武装（workspace 聚合/runs/loops）自 LoopCockpitView 上移；cockpit store 在此
     bootstrap（页头通知/搜索依赖），卸载 disconnect。全局弹窗：通知/日程/RunTrace。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { IA_AREAS } from '@/custom/ia2/routes'
import IaShellHeader from '../components/IaShellHeader.vue'
import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const store = useIaStore()
const workspace = useWorkspaceStore()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const cockpit = useCockpitStore()

const SUBSCRIBE_CAP = 30
let shellDisposed = false

watch(() => route.path, path => store.syncFromPath(path), { immediate: true })

onMounted(() => {
  workspace.loadTodos()
  workspace.startReminderScheduler()
  workspace.watchKanbanTasks()
  workspace.initFleetStream()
  void workspace.refreshAllBoards()
  void bootShared()
  void cockpit.bootstrap()
})
onUnmounted(() => {
  shellDisposed = true
  workspace.unwatchKanbanTasks()
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
  cockpit.disconnectOnUnmount()
})

async function bootShared(): Promise<void> {
  await runsStore.fetchRuns()
  if (shellDisposed) return
  const awaiting = runsStore.awaitingRuns.map(r => r.runId)
  const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
  runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
}

const activeArea = computed(() => store.currentArea)
</script>

<template>
  <div class="ia-shell">
    <IaShellHeader
      :notify-count="cockpit.inboxCount"
      :user-name="cockpit.currentUserName"
      @notify="cockpit.openNotify()"
    />
    <nav class="ia-scenes" data-testid="ia-scenes">
      <router-link
        v-for="area in IA_AREAS"
        :key="area.key"
        :to="{ name: area.name }"
        class="ia-scenes__btn"
        :class="{ 'ia-scenes__btn--on': activeArea === area.key }"
        :data-testid="`ia-scene-${area.key}`"
      >{{ $t(area.labelKey) }}</router-link>
    </nav>
    <div class="ia-shell__main">
      <router-view />
    </div>

    <div v-if="cockpit.notifyOpen" class="ia-overlay" @click="cockpit.closeNotify()" />
    <CockpitNotifyModal v-if="cockpit.notifyOpen" />
    <div v-if="workspace.scheduleOpen" class="ia-overlay" @click="workspace.closeSchedule()" />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
    <div v-if="cockpit.runTraceOpen" class="ia-overlay" @click="cockpit.closeRunTrace()" />
    <CockpitRunTraceModal />
  </div>
</template>
```

样式：场景条复用 LoopCockpitView 的 `.lcp-scenes` 样式（改名为 `.ia-scenes`，拷贝其 scss）；`.ia-shell` flex column 100% 高度；`.ia-shell__main { flex:1; min-height:0; display:flex; flex-direction:column }`；`.ia-overlay` 复用 cockpit overlay 样式。注意 `cockpit.bootstrap` 幂等性——读 cockpit store 的 bootstrap/disconnectOnUnmount 实现确认重复调用安全（CollabScene 不再 bootstrap）；若不幂等，给 bootstrap 加 `if (bootstrapped) return` 守卫并在 store 测试补断言。

- [ ] **Step 5: 重写 ia-shell.test.ts**（挂载 IaShell，stub 子组件，断言场景条六入口渲染 + active 态跟随路由 + 卸载时 stop 调用）；删除 cockpit-shell.test.ts。

- [ ] **Step 6: 跑测试** `npx vitest run custom/client/ia2/__tests__/ia-shell.test.ts custom/client/ia2/__tests__/ia-shell-header.test.ts` → 绿。

- [ ] **Step 7: 提交** `feat(ia2): IaShell 统一壳——全局页头 + 六场景条 + 共享武装/弹窗上移`

---

### Task 3: CollabScene 迁移（cockpit 三栏 → /app/collab）

**Files:**
- Create: `overlay/custom/client/ia2/views/scenes/CollabScene.vue`
- Delete: `overlay/custom/client/cockpit/views/CockpitView.vue`、`overlay/custom/client/cockpit/components/CockpitTopBar.vue`
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`（删 loopOpen/openLoop/closeLoop 及 return 导出）、`overlay/custom/client/cockpit/adapters/inbox-adapter.ts:109-110,127-128`（hermes.session→ia2.collabSession）、`overlay/custom/client/cockpit/adapters/notify-adapter.ts:74-75`（同）、`overlay/custom/client/cockpit/index.ts`（registerNavEntry 删 cockpit 条目）
- Test: 新建 `overlay/custom/client/ia2/__tests__/collab-scene.test.ts`；删除 `cockpit-topbar-loop-entry.test.ts`；改写 `swarm-studio-contract.test.ts`、`cockpit-topbar-health.test.ts`（探测逻辑已迁 IaShellHeader → 移到 ia2/__tests__ 或改为针对 header）；adapter 测试更新路由名断言。

**Interfaces:**
- Consumes: Task 1 的 ia2.collab* 路由名；Task 2 的壳级弹窗（Notify/Schedule/RunTrace 不在场景内重复渲染）。
- Produces: CollabScene（chatSubRoutes = ia2.collab* 六名 + hermes.groupChat/groupChatRoom/workflow 保留集）。

- [ ] **Step 1: 写 collab-scene.test.ts（先红）**：stub 全部 cockpit 子组件 + router-view；断言三栏渲染（data-testid 或 class）、chatSubRoutes 判定函数对 `ia2.collabChat` 为 true、对 `ia2.overview` 为 false（把 chatSubRoutes 抽成导出纯函数 `isCollabEmbedRoute(name)` 放 CollabScene 或单独 helper，便于测试）。

- [ ] **Step 2: 创建 CollabScene.vue** = CockpitView.vue 全文拷贝后改：
  - 删 CockpitTopBar import/渲染及 goSettings；删 LoopModal import/渲染与 `@loop`；删 cockpit.scss 导入注释中「必须在 CockpitView 导入」→ 改为 CollabScene 导入（样式必须保留在某个同步加载点）。
  - `chatSubRoutes` 集合改为 `ia2.collabChat/ia2.collabSession/ia2.collabHistory/ia2.collabHistorySession/ia2.collabGlobalAgent/ia2.collabGlobalAgentSession/hermes.groupChat/hermes.groupChatRoom/hermes.workflow`。
  - `goCenter` 改 `router.push({ name: 'ia2.tasks' })`。
  - 删 `onMounted(() => { store.bootstrap() })` 与 `onUnmounted(disconnectOnUnmount)`（已上移 IaShell）。
  - 弹窗群保留：History/TemplateManager/titleDetail/kanbanDetail/swarmKanban 全屏弹窗；Notify/Schedule/RunTrace 删除（壳级已有）。
  - 场景内加 slim 工具条（日程 + Run Observatory 两个按钮，调 `workspace.openSchedule()` / `store.openRunTraceGlobal()`），样式从简（一排小按钮，参照 ManageScene 的 `.mscene__tabs` 风格）。
  - 文件头注释改写为迁移说明。

- [ ] **Step 3: store 瘦身**：cockpit.ts 删 `loopOpen`、`openLoop`、`closeLoop`（含 return 导出两行）；`grep -rn 'openLoop\|loopOpen' custom/` 确认零残留（LoopModal 在 Task 5 删除）。

- [ ] **Step 4: adapters 改目标**：inbox-adapter.ts、notify-adapter.ts 的 `{ name: 'hermes.session' ... }` → `{ name: 'ia2.collabSession' ... }`（params 不变）；同步改 inbox-adapter.test.ts / notify-adapter.test.ts / collab-adapter.test.ts 断言。cockpit/index.ts 删 registerNavEntry 块。

- [ ] **Step 5: 全仓引用清扫**：`grep -rn "hermes\.cockpit\|hermes\.chat\|hermes\.session\|hermes\.history\|hermes\.globalAgent\|hermes\.matrixChat\|hermes\.swarmKanban" custom/ --include='*.ts' --include='*.vue' | grep -v __tests__` → 逐点改 ia2.collab* 或 ia2.comms*/ia2.tasks（已知点：CockpitModeBar.vue、CockpitFleetGrid.vue、matrix-chat/index.ts 注释）。测试文件同步更新。

- [ ] **Step 6: 跑 cockpit + ia2 全部测试** `npx vitest run custom/client/cockpit custom/client/ia2` → 绿。

- [ ] **Step 7: 提交** `feat(collab): cockpit 三栏迁入 /app/collab 场景，CockpitTopBar/LoopModal 引用拆除`

---

### Task 4: EngScene + OpsScene 枢纽（管理/Code 场景退役）

**Files:**
- Create: `overlay/custom/client/ia2/views/scenes/EngScene.vue`
- Modify: `overlay/custom/client/ia2/views/scenes/OpsScene.vue`（扩为三 tab 枢纽）
- Delete: `overlay/custom/client/ia2/views/scenes/ManageScene.vue`、`overlay/custom/client/ia2/views/scenes/CodeScene.vue`、`overlay/custom/client/ia2/views/LoopCockpitView.vue`、`overlay/custom/client/ia2/views/OrchestrateView.vue`（内容迁入 EngScene tab，若 OrchestrateView 自带给头部则保留组件整体作为 tab 子组件）、`overlay/custom/client/ia2/views/RunsView.vue`（RunCenterView 直接作 tab）、`overlay/custom/client/ia2/views/InboxView.vue`（迁入 tab）
- Test: 新建 eng-scene.test.ts；改写 ops-scene.test.ts；删除 manage-scene.test.ts、code-scene.test.ts；改写 ia-views.test.ts。

**Interfaces:**
- Consumes: Task 1 路由；OrchestrateView/InboxView/RunCenterView 作为 tab 子组件。
- Produces: EngScene（tabs: orchestrate|teams）、OpsScene 枢纽（tabs: runs|inbox|duty，duty = 现 OpsScene 三栏本体）。

- [ ] **Step 1: eng-scene.test.ts（先红）**：tabs 两枚渲染、默认 orchestrate tab、切 teams 渲染 TeamsManagePanel（stub）。

- [ ] **Step 2: EngScene.vue**：二级 tab 条（复用 ManageScene `.mscene__tabs` 样式模式）：tab1 `ia2.nav.orchestrate` → `<OrchestrateView />`（读 OrchestrateView 确认无路由耦合；如有 router.push 到 ia2.orchestrate 的点改为 eng 内 tab 切换）；tab2 `loopScenes.manage.tabTeams` → `<TeamsManagePanel />`（defineAsyncComponent，同 ManageScene:24-25）。

- [ ] **Step 3: OpsScene.vue 扩枢纽**：顶部加同款 tab 条（runs|inbox|duty）：runs → `<RunCenterView />`；inbox → `<InboxView />`；duty → 现有三栏本体（告警/值班台/快捷动作）。`goCockpit` 改 `router.push({ name: 'ia2.collab' })`；`runDetailName` computed 删除 hermes.loop 分支，恒 `ia2.runDetail`。

- [ ] **Step 4: 删除退役文件**（Delete 清单）+ 其测试；`grep -rn "LoopCockpitView\|ManageScene\|CodeScene\|OrchestrateView\|RunsView\|InboxView" custom/ --include='*.ts' --include='*.vue' | grep -v __tests__` 确认仅剩 EngScene/OpsScene 引用。

- [ ] **Step 5: ia-views.test.ts 改写**（TasksView/CommsView 保留组件的渲染断言）；ops-scene.test.ts 改写为枢纽断言（三 tab + duty 默认 + goCockpit→ia2.collab）。

- [ ] **Step 6: 跑 ia2 测试** → 绿。**Step 7: 提交** `feat(ia2): 工程/运行场景枢纽化，管理/Code/LoopCockpit 壳退役`

---

### Task 5: loop 模块瘦身 + 兼容守卫退役

**Files:**
- Delete: `overlay/custom/client/loop/index.ts`（buildLoopRoutes/registerLoopEngineering）、`overlay/custom/client/loop/graph/`（整目录）、`overlay/custom/client/loop/components/LoopModal.vue`、`overlay/custom/client/loop/views/LoopDetailView.vue`、`overlay/custom/client/ia2/guard.ts`
- Modify: `overlay/custom/client/ia2/index.ts`（删 guard import/导出）、`overlay/registries/client/bootstrap.ts`（删 loopEngineering 块、registerIaCompatGuard/applyIaColdStartRedirect 调用、`/ide → /hermes/cockpit` 兜底改 `/app`）、`overlay/config/features.ts`（删 loopEngineering——先 grep 确认仅 loop/index.ts 与 graph 使用）
- Test: 删除 compat-guard.test.ts、appsidebar-loop-entry.test.ts、loop/__tests__ 中引用被删文件者；保留 runcenter 测试（hermes.loopRunDetail 引用改 ia2.runDetail）。

- [ ] **Step 1: grep 确认 LoopModal/LoopDetailView/loop 组件的存活引用**（LoopListPanel/LoopGraph/LoopHealthPanel 等若仅被 LoopModal/LoopDetailView 引用则一并删；LoopCreateWizard 被 OpsScene 用，保留；loop store/runcenter 保留）。

- [ ] **Step 2: 删除 + 改 bootstrap/ia2/index/features**（代码见 Files 描述；bootstrap 中 `/ide` 兜底改 `router.addRoute({ path: '/ide', redirect: '/app' })`）。

- [ ] **Step 3: 测试清理与改写**（runcenter 两测试文件内 hermes.loopRunDetail → ia2.runDetail；cocket 测试无 loop 残留）。

- [ ] **Step 4: 全量 `npm run test`** → 绿。**Step 5: 提交** `refactor(loop): /hermes/loop 家族与兼容守卫退役，runcenter 并入 /app/ops`

---

### Task 6: upstream patches（路由/登录/侧边栏/深链）

**Files（全部走 patch 流程，见 Global Constraints；编号 296-300）:**
- 296 `router/index.ts`：删 `/hermes/cockpit` 子树（:36-88）与 6 条路径别名（:92-97）；登录默认 `next(resolved === '/hermes/chat' ? '/ide' : resolved)` → `'/app'`（:364）；superadmin 兜底 `next('/ide')` → `next('/app')`（:379）；routes 末尾加 `{ path: '/:pathMatch(.*)*', redirect: '/app' }`。
- 297 `LoginView.vue`：:31 `resolved === '/hermes/chat' ? '/ide' : resolved` → `'/app'`，注释同步。
- 298 `AppSidebar.vue`：删 cockpit 入口（:155-175）与 loopGraph 入口（:176-200）及 `isLoopArea`（:31）、`selectedKey` 中 cockpit 精确匹配改为删除；ia2 入口注释更新；logs/usage/performance/skillsUsage/browser/versionPreview/theme/petdex/profiles/settings 包进「系统」折叠分组（`ref systemOpen = ref(false)` + 分组头按钮 `t('sidebar.systemGroup')` + `v-show`）；删底部返回 `/app` 的 RouteLinkItem（:556-575 中 sidebar-return-tab，保留折叠按钮）。
- 299 `PageSidebarNav.vue`：:29 hermes.chat→ia2.collabChat；:34 hermes.history→ia2.collabHistory（其余 connections/agentManager/models/groupChat/workflow 不变）。
- 300 `GlobalPendingActions.vue`：:311 `hermes.globalAgentSession`/`hermes.session` → `ia2.collabGlobalAgentSession`/`ia2.collabSession`；:339-340 URL 构建 `/hermes/global-agent/session/` → `/app/collab/global-agent/session/`、`/hermes/session/` → `/app/collab/session/`。

- [ ] **Step 1: 逐文件编辑 upstream 工作树**（五个文件）。
- [ ] **Step 2: 逐文件生成 patch**：`git -C upstream/hermes-studio diff -- packages/client/src/router/index.ts > overlay/patches/296-client-router-cockpit-removal.patch`（余同），series 追加带注释条目（格式跟随 290-295 惯例）。
- [ ] **Step 3: `cd overlay && npm run inject`** → 全部应用干净；`git -C upstream/hermes-studio status` 确认无意外脏文件。
- [ ] **Step 4: 跑全量测试** → 绿（AppSidebar 相关守门测试若断言旧入口，此处同步改写——见 Task 9，本 Task 允许先改写 appsidebar 类测试）。
- [ ] **Step 5: 提交** `feat(nav): upstream patch 296-300——cockpit 静态路由/别名删除、登录落点 /app、侧边栏双入口+系统分组、深链改指`

---

### Task 7: i18n patches（zh/en 成对）

**Files:** 301 `zh.ts`、302 `en.ts`（patch 流程同 Task 6）

- [ ] **Step 1: 改 zh.ts**：`ia2.brand: '工作台'` → `'驾驶舱'`；`ia2.nav` 增 `collab: '协作'`、`eng: '工程'`、`ops: '运行'`（删 `orchestrate/runs/inbox` 若 grep 确认零引用——OrchestrateView 等 tab 文案可复用 `ia2.nav.orchestrate` 作 eng tab 标签，此时保留 orchestrate；以 grep 结果为准，引用的保留、零引用删除）；新增 `ia2.shell: { gotoIde: 'IDE 工作台' }`；`sidebar` 增 `systemGroup: '系统'`；删 `sidebar.loopGraph`、`sidebar.loop`（grep 确认零引用）、`ide.links.cockpit`、`ide.links.loopGraph`（Task 8 后零引用）。
- [ ] **Step 2: en.ts 同步**（'Cockpit'/'Collab'/'Engineering'/'Runs'/'IDE Workbench'/'System'）。
- [ ] **Step 3: 生成 301/302 patch + series + inject 验证**。
- [ ] **Step 4: zh/en key 对齐检查**：`grep -c` 或 diff 两侧 ia2/sidebar/ide.links 键集；跑全量测试。
- [ ] **Step 5: 提交** `feat(i18n): 统一导航 zh/en 键（驾驶舱品牌、六场景词表、系统分组、死键清理）`

---

### Task 8: IDE 壳收敛（⇄ 互跳 + 死链清理）

**Files:**
- Modify: `overlay/custom/client/ide/views/IdeNavRail.vue`（删 3 个跨页按钮，加分隔后单个 ⇄ 驾驶舱按钮 `data-testid="ide-nav-cockpit"` → `{name:'ia2.overview'}`，图标用四宫格）、`overlay/custom/client/ide/views/IdeTopBar.vue`（linkGroups：删 workbench/cockpit/loopGraph；kanban→`{name:'ia2.tasks'}`；history→`{name:'ia2.collabHistory'}`；余不变）、`overlay/custom/client/ide/components/IdeCommandPalette.vue`（NAV_TARGETS 同步）
- Test: `overlay/custom/client/ide/__tests__/appsidebar-ide-entry.test.ts` 等 ide 测试更新（断言单 ⇄ 按钮 + 新目标）。

- [ ] **Step 1: 测试改写（先红）**。**Step 2: 实现**。**Step 3: `npx vitest run custom/client/ide` → 绿**。
- [ ] **Step 4: 提交** `feat(ide): NavRail 收敛为 ⇄ 驾驶舱单按钮，功能导航/命令面板死链清理`

---

### Task 9: 守门测试补齐 + 全量验证收口

**Files:**
- Test: 新建 `overlay/custom/client/ia2/__tests__/unified-nav-guard.test.ts`：六场景条渲染与跳转目标（IA_AREAS 与 buildIaRoutes 一致性）、`hermes.*` 退役名在 buildIaRoutes 产物中零出现、areaForPath 全场景覆盖。
- 全量验证（无新代码）。

- [ ] **Step 1: 写守门测试并跑绿**。
- [ ] **Step 2: `cd overlay && npm run test` 全量** → 绿（基线 154 文件/1624 测试，允许文件数变化但零 fail）。
- [ ] **Step 3: `npm run inject` 复核 + 注入树漂移检查**：`git -C upstream/hermes-studio status` 仅预期 patch 文件；`git -C upstream/hermes-studio diff --stat` 与 patches 目录对账。
- [ ] **Step 4: 构建验证**：`cd overlay && npm run build`（vite build 门禁；先删 `upstream/hermes-studio/node_modules/.vite`）。
- [ ] **Step 5: 手工验收清单**（写进提交信息/任务报告）：六场景逐一点击可达；⇄ 双壳互跳；旧深链 `#/hermes/loop`、`#/hermes/cockpit` → catch-all → /app 不白屏；侧边栏仅 驾驶舱/IDE + 系统分组。
- [ ] **Step 6: 提交 + 合并 main**：

```bash
cd overlay && git checkout main && git merge feat/unified-navigation
```

## Self-Review 记录

- Spec 覆盖：§4.1 壳/页头→Task 2；§4.2 IDE→Task 8；§4.3 六场景→Task 1/3/4；§4.4 删除清单→Task 3/5/6；§4.5 兜底→Task 6（catch-all/登录落点/bootstrap 兜底）；§五 测试→各 Task + Task 9；§六 约束→Global Constraints。
- 计划级细化（spec 未逐字覆盖，已裁决）：ManageScene 值守 tab 退役（人员聚合筛选与 /app/tasks 看板 assignee 过滤重复）；ia2.runDetail 路径迁 /app/ops/runs/:runId（名不变）；协作场景 slim 工具条承接日程/RunObservatory（页头按 spec 不含）。
- 类型一致性：路由名以「路由名映射表」为单一事实源，各 Task 引用须与之一致。
