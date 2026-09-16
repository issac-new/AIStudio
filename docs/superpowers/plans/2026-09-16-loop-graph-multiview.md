# Loop Graph 多视图重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Loop Graph 页面（`/app` 与 `/hermes/loop` 双挂载点）从单一 3D 驾驶舱重构为壳 + 四场景视图（总览/管理/Code/运维）。

**Architecture:** LoopCockpitView 瘦身为壳（页头 + 场景切换条 + router-view + 共享数据武装）；现主体原样提取为 OverviewScene；管理/Code/运维三场景全部由既有组件装配（SwarmKanbanView、CockpitFilePanel/CockpitTerminalPane 参数化、AlarmList/TriageQueue + inbox-center 纯函数）。场景子路由由单一构造器 `buildSceneChildren` 产出供双挂载点消费。

**Tech Stack:** Vue 3 `<script setup>` + vue-router 4 + pinia + naive-ui + vitest（jsdom）。

**Spec:** `docs/superpowers/specs/2026-09-16-loop-graph-multiview-design.md`（六项用户裁决见该文）

## Global Constraints

- 工作目录 = worktree `/Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat/loop-multiview`（分支 `feat/loop-multiview`）。所有相对路径以此为准。
- 只改 overlay/；upstream/ 严格只读，locale 变更唯一通路 = patches/ 五步法 + `npm run inject`。
- 零新依赖；不 bootstrap cockpit store（仅 Task 4 两组件缺省回落路径间接触达）。
- i18n 新键 zh/en 成对 patch，编号开工查重（当前尾号 275）。
- 提交风格：Conventional Commits，中文 header 跟随仓库历史（如 `feat(client): …`）。
- 每任务收口跑 `npx vitest run <本任务测试文件>`；全量门禁在 Task 10。
- 既有测试不可破坏：`ia-shell.test.ts`（workspace 流壳卸载兜底）、`appsidebar-loop-entry.test.ts`、`compat-guard.test.ts`、`ia-views.test.ts` 断言保持不变绿。

---

### Task 0: worktree 测试环境挂链

worktree 内 `vitest.config.ts` 以 `resolve(overlayRoot, '../upstream/...')` 解析上游源码与 node_modules，`../upstream` 在 worktree 父目录不存在，需按 `fix/24h-review-20260916` 既有惯例挂链（`.claude/worktrees/fix/upstream -> upstream-sb` 为先例；本任务直接指向真实上游，只读消费源码，inject 走 Task 2 的互斥流程）。

**Files:**
- Create（symlink，非 git 产物）: `.claude/worktrees/feat/upstream`、`…/loop-multiview/node_modules`

- [ ] **Step 1: 建 symlink**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
ln -sfn /Volumes/nvme2230/lab/ncwk/upstream .claude/worktrees/feat/upstream
ln -sfn /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/node_modules .claude/worktrees/feat/loop-multiview/node_modules
```

- [ ] **Step 2: 冒烟——跑一个既有测试证明 harness 可用**

```bash
cd .claude/worktrees/feat/loop-multiview
npx vitest run custom/client/ia2/__tests__/routes.test.ts
```

预期：PASS（现有 3 个用例）。若报 `@/stores` 解析失败，检查两个 symlink 指向。

- [ ] **Step 3: 无需提交**（symlink 不进 git；`.claude/` 已忽略）

---

### Task 1: 场景路由元数据与构造器（纯路由表，不改接线）

**Files:**
- Modify: `custom/client/ia2/routes.ts`（追加，不动既有导出）
- Test: `custom/client/ia2/__tests__/scene-routes.test.ts`（新建）

**Interfaces:**
- Produces（后续所有任务依赖）:
  - `type SceneKey = 'overview' | 'manage' | 'code' | 'ops'`
  - `IA_SCENES: readonly { key: SceneKey; path: string; labelKey: string }[]`
  - `interface SceneNames { overview: string; manage: string; code: string; ops: string }`
  - `IA2_SCENE_NAMES / LOOP_SCENE_NAMES: SceneNames`
  - `buildSceneChildren(names: SceneNames): RouteRecordRaw[]`
  - `sceneForRouteName(name: string | null | undefined): SceneKey | null`

- [ ] **Step 1: 写失败测试**

`custom/client/ia2/__tests__/scene-routes.test.ts`：

```ts
// overlay/custom/client/ia2/__tests__/scene-routes.test.ts
// 多视图重构（2026-09-16）：场景子路由构造器守门——双挂载点消费同一构造器防漂移。
// 纯路由表断言（懒组件保持函数态，不加载视图）。
import { describe, it, expect } from 'vitest'
import {
  buildSceneChildren, IA_SCENES, IA2_SCENE_NAMES, LOOP_SCENE_NAMES, sceneForRouteName,
} from '../routes'

describe('场景子路由构造器', () => {
  it('四场景：overview 为默认子路由，manage/code/ops 为静态段', () => {
    const children = buildSceneChildren(IA2_SCENE_NAMES)
    expect(children.map(c => c.path)).toEqual(['', 'manage', 'code', 'ops'])
    expect(children.map(c => c.name)).toEqual(['ia2.overview', 'ia2.manage', 'ia2.code', 'ia2.ops'])
    for (const c of children) expect(typeof c.component).toBe('function')
  })

  it('双挂载点名表：/app 家族 ia2.*，/hermes/loop 家族 hermes.loop*', () => {
    expect(buildSceneChildren(LOOP_SCENE_NAMES).map(c => c.name))
      .toEqual(['hermes.loop', 'hermes.loopManage', 'hermes.loopCode', 'hermes.loopOps'])
  })

  it('IA_SCENES 元数据：四场景 i18n key 齐全且与路径同序', () => {
    expect(IA_SCENES.map(s => s.key)).toEqual(['overview', 'manage', 'code', 'ops'])
    for (const s of IA_SCENES) expect(s.labelKey).toBe(`loopCockpit.scene.${s.key}`)
  })

  it('sceneForRouteName 投影两家族；非场景路由返回 null', () => {
    expect(sceneForRouteName('ia2.ops')).toBe('ops')
    expect(sceneForRouteName('hermes.loopCode')).toBe('code')
    expect(sceneForRouteName('hermes.loop')).toBe('overview')
    expect(sceneForRouteName('ia2.runs')).toBeNull()
    expect(sceneForRouteName(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run custom/client/ia2/__tests__/scene-routes.test.ts
```

预期：FAIL（`buildSceneChildren is not exported`）。

- [ ] **Step 3: 实现——routes.ts 末尾追加**

```ts
// ── 场景视图（2026-09-16 多视图重构）：驾驶舱壳 + 四场景，双挂载点共用构造器 ──
export type SceneKey = 'overview' | 'manage' | 'code' | 'ops'

export interface SceneMeta {
  key: SceneKey
  /** 场景相对路径（overview = '' 默认子路由） */
  path: string
  /** 切换条文案 i18n key */
  labelKey: string
}

export const IA_SCENES: readonly SceneMeta[] = [
  { key: 'overview', path: '', labelKey: 'loopCockpit.scene.overview' },
  { key: 'manage', path: 'manage', labelKey: 'loopCockpit.scene.manage' },
  { key: 'code', path: 'code', labelKey: 'loopCockpit.scene.code' },
  { key: 'ops', path: 'ops', labelKey: 'loopCockpit.scene.ops' },
]

/** 双挂载点路由名表（单一事实源，防双份漂移） */
export interface SceneNames {
  overview: string
  manage: string
  code: string
  ops: string
}

export const IA2_SCENE_NAMES: SceneNames = {
  overview: 'ia2.overview', manage: 'ia2.manage', code: 'ia2.code', ops: 'ia2.ops',
}
export const LOOP_SCENE_NAMES: SceneNames = {
  overview: 'hermes.loop', manage: 'hermes.loopManage', code: 'hermes.loopCode', ops: 'hermes.loopOps',
}

/** 场景子路由构造器：/app 与 /hermes/loop 双挂载点共用 */
export function buildSceneChildren(names: SceneNames): RouteRecordRaw[] {
  return [
    { path: '', name: names.overview, component: () => import('./views/scenes/OverviewScene.vue') },
    { path: 'manage', name: names.manage, component: () => import('./views/scenes/ManageScene.vue') },
    { path: 'code', name: names.code, component: () => import('./views/scenes/CodeScene.vue') },
    { path: 'ops', name: names.ops, component: () => import('./views/scenes/OpsScene.vue') },
  ]
}

/** 路由名 → 场景 key（壳切换条高亮的唯一投影） */
export function sceneForRouteName(name: string | null | undefined): SceneKey | null {
  if (!name) return null
  for (const scene of IA_SCENES) {
    if (IA2_SCENE_NAMES[scene.key] === name || LOOP_SCENE_NAMES[scene.key] === name) return scene.key
  }
  return null
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run custom/client/ia2/__tests__/scene-routes.test.ts custom/client/ia2/__tests__/routes.test.ts
```

预期：PASS（新 4 例 + 既有 routes 用例不受影响——本任务不改 buildIaRoutes 接线）。

- [ ] **Step 5: Commit**

```bash
git add custom/client/ia2/routes.ts custom/client/ia2/__tests__/scene-routes.test.ts
git commit -m "feat(ia2): 场景子路由元数据与构造器——双挂载点单一事实源"
```

---

### Task 2: i18n 键 patch（zh/en 成对，B 类五步法）

后续场景的切换条与面板文案全部在此落地。patch 编号开工查重：`ls patches/ | grep -E '^27[67]'` 应为空；被占则顺延并改本节编号。

**Files:**
- Create: `patches/276-loop-scenes-i18n-zh.patch`、`patches/277-loop-scenes-i18n-en.patch`
- Modify: `patches/series`（尾部追加两行 + 段注）
- 注入目标（只经 inject 触碰）: `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts:1084`（`loopCockpit: {` 块内）、`:2228`（`kanban: {` 块内）；en.ts 同位

**Interfaces:**
- Produces（场景组件消费的键，全量清单）:
  - `loopCockpit.scene.{overview,manage,code,ops}`
  - `loopScenes.manage.{people,unassigned,gotoBoard,rooms,noRooms,trace,openCount}`
  - `loopScenes.code.{selectTask,noTask,noWorkspace,context,openDrawer,openChat,runs}`
  - `loopScenes.ops.{duty,quickActions,newLoop,schedule,cockpitLink,activeRuns}`
  - `kanban.createTaskRoom`、`kanban.gotoTaskRoom`

- [ ] **Step 1: 互斥确认 + 上游回 pristine**

```bash
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio status --short | head -5   # 现状快照
cd /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat/loop-multiview
npm run clean   # 逆序 reverse 全部 patch；经 feat/upstream symlink 作用于真实上游
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio status --short   # 预期：干净
```

- [ ] **Step 2: 临时改上游 zh.ts**（五步法第 1 步；仅本会话操作期间有效）

`upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts`：

a) `loopCockpit: {` 块内（`back: '返回驾驶舱',` 之后）插入：

```ts
    scene: {
      overview: '总览',
      manage: '管理',
      code: '编码',
      ops: '运维',
    },
```

b) `loopCockpit` 块结束后插入新命名空间：

```ts
  loopScenes: {
    manage: {
      people: '人员',
      unassigned: '未指派',
      gotoBoard: '全屏看板',
      rooms: '任务群组',
      noRooms: '暂无关联群组',
      trace: '追溯矩阵',
      openCount: '在办',
    },
    code: {
      selectTask: '选择任务',
      noTask: '从上方选择任务以打开工作区与终端',
      noWorkspace: '任务尚未领取 workspace，等待 agent claim 后重试',
      context: '任务上下文',
      openDrawer: '任务详情',
      openChat: '完整 Chat',
      runs: '关联运行',
    },
    ops: {
      duty: '值班台',
      quickActions: '快捷动作',
      newLoop: '新建循环',
      schedule: '日程管理',
      cockpitLink: '协作中心',
      activeRuns: '进行中运行',
    },
  },
```

c) `kanban: {` 块内追加：

```ts
    createTaskRoom: '建群沟通',
    gotoTaskRoom: '进入群聊',
```

- [ ] **Step 3: 生成 zh patch 并还原**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git diff packages/client/src/i18n/locales/zh.ts > /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat/loop-multiview/patches/276-loop-scenes-i18n-zh.patch
git checkout -- packages/client/src/i18n/locales/zh.ts
```

- [ ] **Step 4: en.ts 同样流程**（同位块）：

```ts
    scene: {
      overview: 'Overview',
      manage: 'Manage',
      code: 'Code',
      ops: 'Ops',
    },
```

```ts
  loopScenes: {
    manage: {
      people: 'Members',
      unassigned: 'Unassigned',
      gotoBoard: 'Full board',
      rooms: 'Task rooms',
      noRooms: 'No linked rooms',
      trace: 'Traceability',
      openCount: 'Open',
    },
    code: {
      selectTask: 'Select task',
      noTask: 'Select a task above to open the workspace and terminal',
      noWorkspace: 'Workspace not claimed yet — waiting for the agent',
      context: 'Task context',
      openDrawer: 'Task detail',
      openChat: 'Full chat',
      runs: 'Related runs',
    },
    ops: {
      duty: 'Duty desk',
      quickActions: 'Quick actions',
      newLoop: 'New loop',
      schedule: 'Schedule',
      cockpitLink: 'Cockpit',
      activeRuns: 'Active runs',
    },
  },
```

```ts
    createTaskRoom: 'Create room',
    gotoTaskRoom: 'Open room',
```

```bash
git diff packages/client/src/i18n/locales/en.ts > /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat/loop-multiview/patches/277-loop-scenes-i18n-en.patch
git checkout -- packages/client/src/i18n/locales/en.ts
```

- [ ] **Step 5: 入 series + inject 验证**

`patches/series` 尾部追加（段注格式跟随 274/275 先例）：

```
# 276/277 = loop 多视图场景 i18n——壳切换条 + 管理/Code/运维场景面板 +
#           kanban 抽屉建群/跳群按钮，zh/en 成对。2026-09-16。
276-loop-scenes-i18n-zh.patch
277-loop-scenes-i18n-en.patch
```

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat/loop-multiview
npm run inject && npm run verify
# 上游 i18n 覆盖门禁（18/18）：
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio && npx vitest run packages/client/src/i18n --silent 2>&1 | tail -5
```

预期：inject 无冲突；i18n-coverage 全绿。若 zh/en 键不对称，coverage 测试会点名缺失键。

- [ ] **Step 6: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat/loop-multiview
git add patches/276-loop-scenes-i18n-zh.patch patches/277-loop-scenes-i18n-en.patch patches/series
git commit -m "feat(i18n): loop 多视图场景键 zh/en 成对（276/277）"
```

---

### Task 3: 壳提取——LoopCockpitView 瘦身 + OverviewScene 迁入 + 双挂载接线

最大原子任务：提取是不可拆的中间态。完成后 `/app` 与 `/hermes/loop` 行为与今日完全一致（总览场景），三个新场景为骨架组件。

**Files:**
- Create: `custom/client/ia2/views/scenes/OverviewScene.vue`（现 LoopCockpitView 主体迁入）
- Create: `custom/client/ia2/views/scenes/ManageScene.vue`、`CodeScene.vue`、`OpsScene.vue`（骨架，Task 7/8/9 填充）
- Modify: `custom/client/ia2/views/LoopCockpitView.vue`（瘦身为壳）
- Modify: `custom/client/ia2/routes.ts`（buildIaRoutes 接线场景子路由）
- Modify: `custom/client/loop/index.ts`（导出 buildLoopRoutes + 场景子路由）
- Test: `custom/client/ia2/__tests__/overview-scene.test.ts`（由 cockpit-view.test.ts 迁移）
- Test: `custom/client/ia2/__tests__/cockpit-shell.test.ts`（新建壳守门）
- Test: `custom/client/ia2/__tests__/scene-routes.test.ts`（追加接线断言）
- Delete: `custom/client/ia2/__tests__/cockpit-view.test.ts`（被前两者取代）

**Interfaces:**
- Consumes: Task 1 的 `buildSceneChildren / IA2_SCENE_NAMES / LOOP_SCENE_NAMES / IA_SCENES / sceneForRouteName`；Task 2 的 `loopCockpit.scene.*` 键。
- Produces: 四个场景组件的挂载点与 `data-testid`（`scene-manage` / `scene-code` / `scene-ops`）；壳切换条 `data-testid="lcp-scene-<key>"`。

- [ ] **Step 1: 写失败测试（接线断言追加进 scene-routes.test.ts）**

```ts
// 追加到 scene-routes.test.ts 顶部 import：
// import { createRouter, createMemoryHistory } from 'vue-router'
// import { buildIaRoutes } from '../routes'
// import { buildLoopRoutes } from '@/custom/loop/index'

describe('场景接线（Task 3）', () => {
  it('/app 场景深链可解析，ia2.overview 名称保留在默认子路由', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() })
    expect(router.resolve('/app').name).toBe('ia2.overview')
    expect(router.resolve('/app/manage').name).toBe('ia2.manage')
    expect(router.resolve('/app/code').name).toBe('ia2.code')
    expect(router.resolve('/app/ops').name).toBe('ia2.ops')
    // 既有兄弟路由不受影响
    expect(router.resolve('/app/runs').name).toBe('ia2.runs')
  })

  it('/hermes/loop 场景深链可解析；静态段排名高于 :id 详情', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildLoopRoutes() })
    expect(router.resolve('/hermes/loop').name).toBe('hermes.loop')
    expect(router.resolve('/hermes/loop/manage').name).toBe('hermes.loopManage')
    expect(router.resolve('/hermes/loop/ops').name).toBe('hermes.loopOps')
    // 静态段不被 :id 吞掉；真 id 仍落详情
    expect(router.resolve('/hermes/loop/abc123').name).toBe('hermes.loopDetail')
    expect(router.resolve('/hermes/loop/runs').name).toBe('hermes.loopRuns')
  })
})
```

跑 `npx vitest run custom/client/ia2/__tests__/scene-routes.test.ts` → FAIL（`buildLoopRoutes` 未导出 / `/app/manage` 解析不到）。

- [ ] **Step 2: OverviewScene.vue——整体复制现 LoopCockpitView 后删减**

```bash
mkdir -p custom/client/ia2/views/scenes
cp custom/client/ia2/views/LoopCockpitView.vue custom/client/ia2/views/scenes/OverviewScene.vue
```

对 `OverviewScene.vue` 做如下精确编辑：

a) **script 删除**（这些职责迁壳）：`MORE_ITEMS`、`moreOpen`、`goRuns`；`goInbox`、`goTasks` 保留（收件箱面板与 StatusDistributionCard 仍用）。`clockLabel` 删除（页头时钟迁壳）；`nowTick` 与 `tickTimer` 保留（inboxAgg/metrics/todayPlan 的时间基准）。

b) **onMounted 瘦身为**（workspace 流武装迁壳，场景只管自己的 mind 投影）：

```ts
onMounted(() => {
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 60_000)
  void boot()
})
onUnmounted(() => {
  cockpitDisposed = true
  if (tickTimer) clearInterval(tickTimer)
  if (mindRefreshTimer) clearTimeout(mindRefreshTimer)
  mindUnsubscribe?.()
  mindUnsubscribe = null
})
```

c) **boot() 瘦身为**（runs fetch 幂等保留以维持 booted 门控语义；订阅域/metrics/loops 已迁壳）：

```ts
async function boot(): Promise<void> {
  await runsStore.fetchRuns()
  if (cockpitDisposed) return
  await refreshMind()
  if (cockpitDisposed) return
  mindUnsubscribe = workspace.onBoardEvent(scheduleMindRefresh)
  booted.value = true
}
```

d) **template 删除** `<header class="lcp-top">…</header>` 整段；根元素 class 改 `lcp lcp--scene`，`data-testid="loop-cockpit"` 保留（行为零变化，测试断言不漂）。

e) **style 删除**仅页头相关类（`.lcp-top*`、`.lcp-pill*`、`.lcp-btn`、`.lcp-more*`、`@keyframes lcp-throb`）；其余原样保留。

- [ ] **Step 3: LoopCockpitView.vue 瘦身为壳——整文件替换**

```vue
<!-- overlay/custom/client/ia2/views/LoopCockpitView.vue -->
<!-- 循环驾驶舱壳（2026-09-16 多视图重构）：页头 + 场景切换条 + router-view。
     四场景（总览/管理/Code/运维）由 buildSceneChildren 双挂载（/app 与
     /hermes/loop）。壳武装四场景共享数据流（workspace 聚合/runs/loops），
     场景专属武装在场景内（总览 = mind 投影订阅）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useWorkspaceStore } from '../store/workspace'
import { IA_SCENES, IA2_SCENE_NAMES, LOOP_SCENE_NAMES, sceneForRouteName } from '../routes'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const workspace = useWorkspaceStore()

/** 订阅域上限（awaiting + running 实时生长订阅；超出裁 running 尾部） */
const SUBSCRIBE_CAP = 30

// ── 页头时钟（60s 步进，卸载即停） ──
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
/** 卸载标记：bootShared 的 await 间隙用户可能已离开 */
let shellDisposed = false

const clockLabel = computed(() => {
  const d = new Date(nowTick.value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
})

// ── 场景切换（当前挂载点家族内跳转，不跨挂载点） ──
const sceneNames = computed(() =>
  String(route.name ?? '').startsWith('hermes.loop') ? LOOP_SCENE_NAMES : IA2_SCENE_NAMES)
const activeScene = computed(() => sceneForRouteName(route.name as string))

onMounted(() => {
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 60_000)
  // 四场景共享武装（与重构前同一序列，幂等）
  workspace.loadTodos()
  workspace.startReminderScheduler()
  workspace.watchKanbanTasks()
  workspace.initFleetStream()
  void workspace.refreshAllBoards()
  void bootShared()
})
onUnmounted(() => {
  shellDisposed = true
  if (tickTimer) clearInterval(tickTimer)
  workspace.unwatchKanbanTasks()
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
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

// ── 页头动作区（跨挂载点行为与重构前一致：固定跳 ia2.* 家族路由） ──
const moreOpen = ref(false)
const goRuns = () => void router.push({ name: 'ia2.runs' })
const MORE_ITEMS = [
  { key: 'inbox', label: 'ia2.nav.inbox', go: () => void router.push({ name: 'ia2.inbox' }) },
  { key: 'tasks', label: 'ia2.nav.tasks', go: () => void router.push({ path: '/app/tasks' }) },
  { key: 'comms', label: 'ia2.nav.comms', go: () => void router.push({ name: 'ia2.comms' }) },
  { key: 'settings', label: 'ia2.nav.settings', go: () => void router.push('/hermes/settings') },
]
</script>

<template>
  <div class="lcp" data-testid="loop-cockpit">
    <!-- ═══ 页头：品牌 + 状态 + 动作（驾驶舱指令区） ═══ -->
    <header class="lcp-top">
      <div class="lcp-top__brand">
        <span class="lcp-top__mark" aria-hidden="true" />
        <div class="lcp-top__titles">
          <h2 class="lcp-top__title">{{ t('loopMind.title') }}</h2>
          <span class="lcp-top__tagline">{{ t('loopMind.tagline') }}</span>
        </div>
      </div>

      <div class="lcp-top__status">
        <span class="lcp-pill" :class="runsStore.connection === 'connected' ? 'lcp-pill--on' : 'lcp-pill--off'">
          <i />{{ runsStore.connection === 'connected' ? t('loopCockpit.status.connected') : t('loopCockpit.status.disconnected') }}
        </span>
        <span class="lcp-pill lcp-pill--time">{{ clockLabel }}</span>
      </div>

      <div class="lcp-top__actions">
        <button type="button" class="lcp-btn" data-testid="lcp-all-runs" @click="goRuns">
          {{ t('loopMind.viewRuns') }}
        </button>
        <div class="lcp-more">
          <button
            type="button"
            class="lcp-btn lcp-btn--ghost"
            data-testid="lcp-more"
            :aria-expanded="moreOpen"
            @click="moreOpen = !moreOpen"
          >⋯</button>
          <div v-if="moreOpen" class="lcp-more__menu" data-testid="lcp-more-menu">
            <button
              v-for="item in MORE_ITEMS"
              :key="item.key"
              type="button"
              class="lcp-more__item"
              :data-testid="`lcp-more-${item.key}`"
              @click="moreOpen = false; item.go()"
            >{{ t(item.label) }}</button>
          </div>
        </div>
      </div>
    </header>

    <!-- ═══ 场景切换条（当前挂载点家族内 router-link） ═══ -->
    <nav class="lcp-scenes" data-testid="lcp-scenes">
      <router-link
        v-for="scene in IA_SCENES"
        :key="scene.key"
        :to="{ name: sceneNames[scene.key] }"
        class="lcp-scenes__btn"
        :class="{ 'lcp-scenes__btn--on': activeScene === scene.key }"
        :data-testid="`lcp-scene-${scene.key}`"
      >{{ t(scene.labelKey) }}</router-link>
    </nav>

    <!-- ═══ 场景主体（四场景子路由出口） ═══ -->
    <router-view />
  </div>
</template>

<style scoped>
/* 壳容器 + 页头样式块：自重构前 LoopCockpitView 原样保留
   (.lcp / .lcp-top / .lcp-top__* / .lcp-pill* / .lcp-btn* / .lcp-more* /
   @keyframes lcp-throb / prefers-reduced-motion)，此处不重复粘贴——
   从 git 历史（4fc6c5b 之前的 LoopCockpitView.vue）逐字搬移。 */

/* ═══ 场景切换条 ═══ */
.lcp-scenes {
  display: flex; gap: 2px; flex: 0 0 auto;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 2px;
  align-self: flex-start;
}
.lcp-scenes__btn {
  padding: 4px 14px; border-radius: calc(var(--radius-standard) - 2px);
  color: var(--text-secondary); font-size: 12px; text-decoration: none;
  white-space: nowrap;
}
.lcp-scenes__btn:hover { color: var(--color-primary, #3b82f6); }
.lcp-scenes__btn--on {
  background: var(--color-primary, #3b82f6); color: var(--bg-primary); font-weight: 600;
}

/* 壳内场景出口占满剩余高度 */
.lcp > :last-child { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
</style>
```

注意：上面 style 注释提到的页头样式块必须从重构前文件**逐字搬移**（执行时从 `git show 109dc79:custom/client/ia2/views/LoopCockpitView.vue` 取 `.lcp` 容器到 `@media (prefers-reduced-motion)` 之间页头相关类）。

- [ ] **Step 4: 三个场景骨架组件**（Task 7/8/9 填充面板；本任务交付可渲染可导航的壳内页面）

`custom/client/ia2/views/scenes/ManageScene.vue`（CodeScene/OpsScene 同构，`data-testid` 与 labelKey 分别换 `scene-code`/`loopCockpit.scene.code`、`scene-ops`/`loopCockpit.scene.ops`）：

```vue
<!-- overlay/custom/client/ia2/views/scenes/ManageScene.vue -->
<!-- 管理场景（Task 7 填充：人员聚合条 + 看板 + 群栏目）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <section class="scene-frame" data-testid="scene-manage">
    <header class="scene-frame__head">{{ t('loopCockpit.scene.manage') }}</header>
  </section>
</template>

<style scoped>
.scene-frame { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 12px 16px; }
.scene-frame__head { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
</style>
```

- [ ] **Step 5: 接线——routes.ts 的 buildIaRoutes 默认子路由改造**

将 `buildIaRoutes()` 中 `{ path: '', name: 'ia2.overview', component: () => import('./views/LoopCockpitView.vue') }` 改为：

```ts
        {
          // 驾驶舱壳：四场景子路由的挂载点（ia2.overview 名称落在场景默认子路由上，
          // IaShell 返回按钮 / 既有深链 router.push({name:'ia2.overview'}) 不变）
          path: '',
          component: () => import('./views/LoopCockpitView.vue'),
          children: buildSceneChildren(IA2_SCENE_NAMES),
        },
```

- [ ] **Step 6: 接线——loop/index.ts 导出 buildLoopRoutes**

`custom/client/loop/index.ts` 整文件替换为：

```ts
// overlay/custom/client/loop/index.ts
// Loop Engineering — A 类注册:路由、样式。
//
// 导航条目由 patch 246 直接注入到上游 AppSidebar.vue（冻结），故此处无需
// registerNavEntry。路由用 registerRoute 注册,bootstrap 在 mount 前统一挂载。
//
// 2026-09-16 多视图重构：/hermes/loop 与 /app 渲染同一个 LoopCockpitView 壳，
// 四场景子路由经 ia2/routes.ts 的 buildSceneChildren 构造（双挂载点单一事实源，
// hermes.loop 名称落在默认场景子路由上——AppSidebar isLoopArea 家族高亮不变）。
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute } from '../../../registries/client'
import { features } from '../../../config/features'
import { buildSceneChildren, LOOP_SCENE_NAMES } from '../ia2/routes'

// 全局布局样式
import './styles/loop.scss'

/** 循环区路由表（纯函数导出：scene-routes 守门测试直接消费，不触发懒组件加载） */
export function buildLoopRoutes(): RouteRecordRaw[] {
  return [
    {
      path: '/hermes/loop',
      component: () => import('@/custom/ia2/views/LoopCockpitView.vue'),
      children: buildSceneChildren(LOOP_SCENE_NAMES),
    },
    {
      // P2 Task 5 — 运行中心。静态段须排在 '/hermes/loop/:id' 之前。
      path: '/hermes/loop/runs',
      name: 'hermes.loopRuns',
      component: () => import('./runcenter/views/RunCenterView.vue'),
    },
    {
      // P2 Task 6 — 运行详情（执行图 + 时间轴回放 + 三级分辨率）。
      path: '/hermes/loop/runs/:runId',
      name: 'hermes.loopRunDetail',
      component: () => import('./runcenter/views/RunDetailView.vue'),
    },
    {
      path: '/hermes/loop/:id',
      name: 'hermes.loopDetail',
      component: () => import('./views/LoopDetailView.vue'),
    },
  ]
}

export async function registerLoopEngineering(_app: App): Promise<void> {
  // I4: 功能开关。默认开启(import.meta.env.VITE_CUSTOM_LOOP !== 'false')。
  if (!features.loopEngineering) return

  for (const r of buildLoopRoutes()) registerRoute(r)
}
```

- [ ] **Step 7: 测试迁移——cockpit-view.test.ts → overview-scene.test.ts**

```bash
git mv custom/client/ia2/__tests__/cockpit-view.test.ts custom/client/ia2/__tests__/overview-scene.test.ts
```

对迁移后文件做如下编辑：

a) 头部注释改写为「总览场景装配守门（2026-09-16 多视图重构：由 cockpit-view.test.ts 迁移；壳职责断言在 cockpit-shell.test.ts）」。

b) 导入与挂载目标换场景组件：

```ts
import OverviewScene from '../views/scenes/OverviewScene.vue'
```

`mountView` 改为挂载 `OverviewScene`（其余不变——AREA 桩路由表保留，场景内 router.push 断言照旧）。

c) **删除两个 describe 块**（职责迁壳，断言在 cockpit-shell.test.ts 重建）：`LoopCockpitView — 页头动作区` 整块（主按钮导航 + 溢出菜单两例）。

d) **改写「数据源武装与回收」用例**：workspace 武装断言（loadTodos/initFleetStream 等）删除（迁壳）；保留并断言：挂载后 `runRest.listRuns` 被调（boot 门控）、`getMind` 被调、`workspaceStubs.state.onBoardEvent` 被调且卸载后其返回的退订函数被调。用例名改「场景武装与回收：挂载拉 runs + mind 投影并订阅看板事件；卸载退订」。

e) 首个装配用例删除「页头」断言（`lcp-top` 已不在场景内），保留 KPI×5/三栏/图例断言；用例名改「骨架：KPI×5/三栏（收件箱·生长舞台·循环面板）/图例」。

f) workspace 桩补一个字段（壳测试也要用，两处共享形状）：在 `workspaceStubs.state` 增加 `openSchedule: vi.fn()` 与 `scheduleOpen: false`。

跑 `npx vitest run custom/client/ia2/__tests__/overview-scene.test.ts` → PASS。若有遗漏断言引用已删除的页头 testid（`lcp-all-runs`/`lcp-more`），按 c/d 规则迁壳测试。

- [ ] **Step 8: 新壳测试 cockpit-shell.test.ts**

```ts
// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/cockpit-shell.test.ts
// 驾驶舱壳守门（2026-09-16 多视图重构）：页头 + 场景切换条 + 共享武装/回收。
// 场景主体行为断言在 overview-scene.test.ts 等场景测试；此处场景组件全桩化。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── REST 桩（与 overview-scene.test.ts 同一形状） ──
const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [] as Array<Record<string, unknown>>),
    replay: vi.fn(async () => []),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'f', forkedFrom: 'x', superStep: 0 })),
    startRun: vi.fn(async () => ({ runId: 'f', instance: {} })),
    exportRun: vi.fn(async () => ({ run: {}, spec: null, events: [] })),
    getSpec: vi.fn(async () => null),
    getMind: vi.fn(async () => ({ thoughts: [], runs: [], available: true })),
  },
  loopRest: {
    listLoops: vi.fn(async () => [] as Array<Record<string, unknown>>),
    getEvents: vi.fn(async () => []),
    tickLoop: vi.fn(async () => ({})),
    pauseLoop: vi.fn(async () => ({})),
    deleteLoop: vi.fn(async () => ({})),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest,
  connectGraph: vi.fn(() => ({ connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
  disconnectGraph: vi.fn(),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [] as Array<Record<string, unknown>>,
    userTodos: [] as Array<Record<string, unknown>>,
    scheduleOpen: false,
    loadTodos: vi.fn(),
    startReminderScheduler: vi.fn(),
    stopReminderScheduler: vi.fn(),
    initFleetStream: vi.fn(),
    stopFleetStream: vi.fn(),
    watchKanbanTasks: vi.fn(),
    unwatchKanbanTasks: vi.fn(),
    onBoardEvent: vi.fn(() => () => {}),
    refreshAllBoards: vi.fn(async () => true),
    openSchedule: vi.fn(),
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

// 四场景桩（壳测试不加载场景实现）
const SCENE_STUB = { template: '<div class="scene-stub" />' }
vi.mock('../views/scenes/OverviewScene.vue', () => ({ default: SCENE_STUB }))
vi.mock('../views/scenes/ManageScene.vue', () => ({ default: SCENE_STUB }))
vi.mock('../views/scenes/CodeScene.vue', () => ({ default: SCENE_STUB }))
vi.mock('../views/scenes/OpsScene.vue', () => ({ default: SCENE_STUB }))

import LoopCockpitView from '../views/LoopCockpitView.vue'
import { buildSceneChildren, IA2_SCENE_NAMES, LOOP_SCENE_NAMES } from '../routes'

function makeRouter(loopFamily = false): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/',
      children: buildSceneChildren(loopFamily ? LOOP_SCENE_NAMES : IA2_SCENE_NAMES),
    }],
  })
}

async function mountShell(path = '/', loopFamily = false) {
  const router = makeRouter(loopFamily)
  router.push(path)
  await router.isReady()
  const wrapper = mount(LoopCockpitView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  workspaceStubs.state.tasks = []
  workspaceStubs.state.userTodos = []
})

describe('LoopCockpitView 壳 — 页头与动作区', () => {
  it('页头：品牌/连接状态/时钟 + 主按钮跳 ia2.runs + 溢出菜单四入口', async () => {
    const { wrapper, router } = await mountShell()
    expect(wrapper.find('[data-testid="lcp-all-runs"]').exists()).toBe(true)
    await wrapper.find('[data-testid="lcp-all-runs"]').trigger('click')
    expect(router.currentRoute.value.name).toBe('ia2.runs')
  })

  it('溢出菜单收拢次要入口：介入/工作项/沟通/设置', async () => {
    const { wrapper } = await mountShell()
    expect(wrapper.find('[data-testid="lcp-more-menu"]').exists()).toBe(false)
    await wrapper.find('[data-testid="lcp-more"]').trigger('click')
    for (const key of ['inbox', 'tasks', 'comms', 'settings']) {
      expect(wrapper.find(`[data-testid="lcp-more-${key}"]`).exists()).toBe(true)
    }
  })
})

describe('LoopCockpitView 壳 — 场景切换条', () => {
  it('四场景入口渲染；默认总览高亮；点击切 manage', async () => {
    const { wrapper, router } = await mountShell('/')
    for (const key of ['overview', 'manage', 'code', 'ops']) {
      expect(wrapper.find(`[data-testid="lcp-scene-${key}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="lcp-scene-overview"].lcp-scenes__btn--on').exists()).toBe(true)
    await wrapper.find('[data-testid="lcp-scene-manage"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.manage')
    expect(wrapper.find('[data-testid="lcp-scene-manage"].lcp-scenes__btn--on').exists()).toBe(true)
  })

  it('hermes.loop 家族：切换条在家族内跳转（不跨挂载点）', async () => {
    const { wrapper, router } = await mountShell('/ops', true)
    expect(router.currentRoute.value.name).toBe('hermes.loopOps')
    await wrapper.find('[data-testid="lcp-scene-code"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('hermes.loopCode')
  })
})

describe('LoopCockpitView 壳 — 共享武装与回收', () => {
  it('挂载武装 workspace 流 + runs/loops 拉取；卸载停止', async () => {
    const { wrapper } = await mountShell()
    expect(workspaceStubs.state.loadTodos).toHaveBeenCalled()
    expect(workspaceStubs.state.startReminderScheduler).toHaveBeenCalled()
    expect(workspaceStubs.state.watchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.initFleetStream).toHaveBeenCalled()
    expect(runRest.listRuns).toHaveBeenCalled()
    expect(loopRest.listLoops).toHaveBeenCalled()
    wrapper.unmount()
    expect(workspaceStubs.state.unwatchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.stopFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.stopReminderScheduler).toHaveBeenCalled()
  })
})
```

注：首例中 `lcp-all-runs` 点击跳 `ia2.runs`——路由表只挂了场景子路由，`router.push` 到未注册名只会 warn 不改路由。把断言改为「点击后 `router.push` 被以 `{name:'ia2.runs'}` 调用」：改用 `vi.spyOn(router, 'push')` 断言参数。修正首例：

```ts
  it('页头：主按钮以 ia2.runs 路由名导航 + 溢出菜单四入口', async () => {
    const { wrapper, router } = await mountShell()
    const push = vi.spyOn(router, 'push')
    await wrapper.find('[data-testid="lcp-all-runs"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.runs' })
    expect(wrapper.find('[data-testid="lcp-more"]').exists()).toBe(true)
  })
```

（溢出菜单例不变。）

- [ ] **Step 9: 跑全部 ia2 + loop 测试**

```bash
npx vitest run custom/client/ia2 custom/client/loop
```

预期：全绿。重点看 `ia-shell.test.ts`（壳卸载兜底——workspace 流停止断言仍过，因为 LoopCockpitView 壳保留同一回收序列）与 `appsidebar-loop-entry.test.ts`（hermes.loop 家族名不变）。

- [ ] **Step 10: Commit**

```bash
git add -A custom/client/ia2 custom/client/loop/index.ts
git commit -m "feat(ia2): 驾驶舱壳+四场景骨架——LoopCockpitView 瘦身，OverviewScene 原样提取"
```

---

### Task 4: cockpit 组件就地参数化（Code 场景复用的前提）

**Files:**
- Modify: `custom/client/cockpit/components/CockpitTerminalPane.vue:24,70,361`
- Modify: `custom/client/cockpit/components/CockpitFilePanel.vue:17-89`
- Test: `custom/client/cockpit/__tests__/cockpit-terminal-pane.test.ts`（追加 props 模式用例）
- Test: `custom/client/cockpit/__tests__/cockpit-file-panel.test.ts`（追加 props 模式用例）

**Interfaces:**
- Produces:
  - `CockpitTerminalPane` props `{ workspacePath?: string }`——提供时优先于 store，且隐藏退出按钮
  - `CockpitFilePanel` props `{ workspacePath?: string }`——提供时优先于 store 选中任务

- [ ] **Step 1: 写失败测试（terminal）**

`cockpit-terminal-pane.test.ts` 末尾追加（复用文件内既有 mount 包装器与 MockWebSocket/工具探测桩）：

```ts
describe('CockpitTerminalPane — props 参数化（loop Code 场景）', () => {
  it('workspacePath prop 注入时优先于 store 选中任务，且隐藏退出按钮', async () => {
    const wrapper = await mountPane({ props: { workspacePath: '/tmp/code-scene-ws' } })
    expect(wrapper.find('.cockpit-terminal-pane__root').text()).toBe('/tmp/code-scene-ws')
    expect(wrapper.find('[data-action="exit"]').exists()).toBe(false)
  })

  it('缺省回落 store.selectedTask.workspace，退出按钮保留（现状不变）', async () => {
    const wrapper = await mountPane()
    expect(wrapper.find('[data-action="exit"]').exists()).toBe(true)
  })
})
```

若既有 `mountPane` 不接收参数，将其签名改为 `mountPane(opts: { props?: Record<string, unknown> } = {})` 并透传 `mount(CockpitTerminalPane, { props: opts.props, ... })`。跑测试 → FAIL（props 未定义，root 仍读 store）。

- [ ] **Step 2: 实现 terminal 参数化**

`CockpitTerminalPane.vue` script 中，`const store = useCockpitStore()` 之后加：

```ts
// loop Code 场景参数化（2026-09-16 多视图重构，裁决#6 就地参数化）：
// workspacePath prop 提供时优先于 cockpit store 选中任务；prop 模式下隐藏
// 退出按钮（退出语义 = cockpit workspaceMode 切换，loop 页无此概念）。
const props = defineProps<{
  workspacePath?: string
}>()
```

第 70 行改为：

```ts
const workspacePath = computed(() => props.workspacePath ?? store.selectedTask?.workspace ?? '~')
```

模板退出按钮加 `v-if`：

```vue
      <button
        v-if="!props.workspacePath"
        type="button"
        data-action="exit"
        class="cockpit-terminal-pane__exit"
        @click="store.exitTerminal()"
      >✕ {{ t('cockpit.termExit') }}</button>
```

跑 `npx vitest run custom/client/cockpit/__tests__/cockpit-terminal-pane.test.ts` → 全绿（新旧用例）。

- [ ] **Step 3: 写失败测试（file panel）**

`cockpit-file-panel.test.ts` 末尾追加（复用文件内既有 filesStore/cockpit store 桩与 mount 包装器；同样按需给包装器加 props 透传）：

```ts
describe('CockpitFilePanel — props 参数化（loop Code 场景）', () => {
  it('workspacePath prop 注入时作为文件根目录并刷新', async () => {
    const { wrapper, filesStore } = await mountPanel({ props: { workspacePath: '/tmp/code-scene-ws' } })
    await flushPromises()
    expect(filesStore.workspaceRoot).toBe('/tmp/code-scene-ws')
    expect(filesStore.fetchEntries).toHaveBeenCalledWith('')
    expect(wrapper.find('.cockpit-file-panel__no-workspace').exists()).toBe(false)
  })

  it('缺省回落 store 选中任务（现状不变）', async () => {
    const { filesStore } = await mountPanel()
    await flushPromises()
    expect(filesStore.fetchEntries).toHaveBeenCalled()
  })
})
```

（若既有包装器不返回 `filesStore`，改为返回 `{ wrapper, filesStore }`；fetchEntries 桩名以文件内既有为准。）跑 → FAIL。

- [ ] **Step 4: 实现 file panel 参数化**

`CockpitFilePanel.vue`：

a) `const { t } = useI18n()` 后加：

```ts
// loop Code 场景参数化（2026-09-16 多视图重构）：workspacePath prop 提供时
// 优先于 cockpit store 选中任务；watch 源同口径切换。
const props = defineProps<{
  workspacePath?: string
}>()
```

b) `hasWorkspace` 改为：

```ts
const hasWorkspace = computed(() => {
  if (props.workspacePath) return true
  const detailWs = store.selectedTaskDetail?.task?.workspace_path
  const listWs = store.selectedTask?.workspace
  return !!(detailWs ?? listWs)
})
```

c) `syncWorkspaceRoot` 首两行改为：

```ts
async function syncWorkspaceRoot() {
  const wsPath = props.workspacePath
    ?? store.selectedTaskDetail?.task?.workspace_path
    ?? store.selectedTask?.workspace
  // …余下逻辑不变
```

d) watch 源改为：

```ts
watch(
  () => [props.workspacePath, store.selectedTaskId, store.selectionSeq] as const,
  () => { syncWorkspaceRoot() },
  { immediate: true },
)
```

跑 `npx vitest run custom/client/cockpit/__tests__/cockpit-file-panel.test.ts custom/client/cockpit/__tests__/files-root-plumbing.test.ts` → 全绿。

- [ ] **Step 5: 回归——cockpit 全部测试**

```bash
npx vitest run custom/client/cockpit
```

预期：全绿（AI 协作中心页行为零变化由既有用例守门）。

- [ ] **Step 6: Commit**

```bash
git add custom/client/cockpit/components/CockpitTerminalPane.vue custom/client/cockpit/components/CockpitFilePanel.vue custom/client/cockpit/__tests__/cockpit-terminal-pane.test.ts custom/client/cockpit/__tests__/cockpit-file-panel.test.ts
git commit -m "feat(cockpit): 终端/文件面板就地参数化——workspacePath 可选 props，缺省回落 store"
```

---

### Task 5: manage 适配器纯函数

**Files:**
- Create: `custom/client/ia2/adapters/manage.ts`
- Test: `custom/client/ia2/__tests__/manage-adapter.test.ts`

**Interfaces:**
- Produces:
  - `interface AssigneeTaskInput { assignee?: string | null; status: string }`
  - `interface AssigneeRow { name: string; open: number; blocked: number; review: number; total: number }`
  - `aggregateByAssignee(tasks: readonly AssigneeTaskInput[]): AssigneeRow[]`
  - `taskRoomPrefix(taskId: string): string`
  - `interface RoomLike { roomId: string; name?: string | null }`
  - `matchRoomByPrefix(rooms: readonly RoomLike[], prefix: string): RoomLike | null`

- [ ] **Step 1: 写失败测试**

```ts
// overlay/custom/client/ia2/__tests__/manage-adapter.test.ts
// 管理场景适配器守门：人员聚合 + 任务↔群弱锚点（[taskId前8位] 前缀约定）。
import { describe, it, expect } from 'vitest'
import { aggregateByAssignee, taskRoomPrefix, matchRoomByPrefix } from '../adapters/manage'

describe('aggregateByAssignee — 人员在办聚合', () => {
  it('按 assignee 分桶：open/blocked/review 计数；done/archived 不计入', () => {
    const rows = aggregateByAssignee([
      { assignee: 'alice', status: 'running' },
      { assignee: 'alice', status: 'blocked' },
      { assignee: 'alice', status: 'done' },
      { assignee: 'bob', status: 'review' },
      { assignee: null, status: 'todo' },
      { assignee: '  ', status: 'triage' },
    ])
    const alice = rows.find(r => r.name === 'alice')!
    expect([alice.open, alice.blocked, alice.review, alice.total]).toEqual([1, 1, 0, 2])
    const bob = rows.find(r => r.name === 'bob')!
    expect([bob.open, bob.review]).toEqual([0, 1])
    // null 与纯空白都归未指派桶（name=''）
    const none = rows.find(r => r.name === '')!
    expect(none.open).toBe(2)
  })

  it('排序：total 降序，平手按 name locale；空输入空输出', () => {
    expect(aggregateByAssignee([])).toEqual([])
    const rows = aggregateByAssignee([
      { assignee: 'b', status: 'todo' },
      { assignee: 'a', status: 'todo' },
      { assignee: 'c', status: 'todo' }, { assignee: 'c', status: 'running' },
    ])
    expect(rows.map(r => r.name)).toEqual(['c', 'a', 'b'])
  })
})

describe('任务↔群弱锚点', () => {
  it('taskRoomPrefix = [taskId 前 8 位]', () => {
    expect(taskRoomPrefix('abcdef12-3456-7890')).toBe('[abcdef12]')
    expect(taskRoomPrefix('short')).toBe('[short]')
  })

  it('matchRoomByPrefix 命中首个前缀匹配；无命中返回 null', () => {
    const rooms = [
      { roomId: '!a:sv', name: '[abcdef12] 需求评审' },
      { roomId: '!b:sv', name: '日常闲聊' },
      { roomId: '!c:sv', name: null },
    ]
    expect(matchRoomByPrefix(rooms, '[abcdef12]')?.roomId).toBe('!a:sv')
    expect(matchRoomByPrefix(rooms, '[ffffff00]')).toBeNull()
  })
})
```

跑 → FAIL（模块不存在）。

- [ ] **Step 2: 实现**

```ts
// overlay/custom/client/ia2/adapters/manage.ts
// 管理场景适配器（2026-09-16 多视图重构）：纯函数，视图不自算。

export interface AssigneeTaskInput {
  assignee?: string | null
  status: string
}

export interface AssigneeRow {
  /** assignee 原文；未指派桶为 ''（展示层翻 i18n） */
  name: string
  open: number
  blocked: number
  review: number
  total: number
}

/**
 * 按 assignee 聚合在办任务。done/archived 不计入（人员在办口径）；
 * null/空白 assignee 归未指派桶（name=''）。排序：total 降序 → name locale。
 */
export function aggregateByAssignee(tasks: readonly AssigneeTaskInput[]): AssigneeRow[] {
  const map = new Map<string, AssigneeRow>()
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'archived') continue
    const name = (t.assignee ?? '').trim()
    const row = map.get(name) ?? { name, open: 0, blocked: 0, review: 0, total: 0 }
    if (t.status === 'blocked') row.blocked++
    else if (t.status === 'review') row.review++
    else row.open++
    row.total++
    map.set(name, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** 任务↔群弱锚点：群名前缀约定 `[<taskId 前 8 位>]`（裁决#4，不持久化字段） */
export function taskRoomPrefix(taskId: string): string {
  return `[${taskId.slice(0, 8)}]`
}

export interface RoomLike {
  roomId: string
  name?: string | null
}

/** 按前缀匹配群（sortedRooms 已按最近活跃排序，首个命中即最近活跃群） */
export function matchRoomByPrefix(rooms: readonly RoomLike[], prefix: string): RoomLike | null {
  return rooms.find(r => (r.name ?? '').startsWith(prefix)) ?? null
}
```

跑 `npx vitest run custom/client/ia2/__tests__/manage-adapter.test.ts` → PASS。

- [ ] **Step 3: Commit**

```bash
git add custom/client/ia2/adapters/manage.ts custom/client/ia2/__tests__/manage-adapter.test.ts
git commit -m "feat(ia2): 管理场景适配器——assignee 聚合 + 任务↔群弱锚点纯函数"
```

---

### Task 6: 拉群弱锚点——建群对话框预填 + 任务抽屉按钮

**Files:**
- Modify: `custom/client/matrix-chat/components/MatrixCreateRoomDialog.vue:11`（`const roomName = ref('')` 一行改）
- Modify: `custom/client/kanban/components/KanbanTaskDrawer.vue`（`.drawer-header-actions` 锚点加按钮 + script 接线）
- Test: `custom/client/matrix-chat/__tests__/create-room-dialog.test.ts`（新建目录与文件）
- Test: `custom/client/kanban/__tests__/drawer-room-actions.test.ts`（新建目录与文件）

**Interfaces:**
- Consumes: Task 5 的 `taskRoomPrefix / matchRoomByPrefix / RoomLike`；Task 2 的 `kanban.createTaskRoom / kanban.gotoTaskRoom` 键。
- Produces: `MatrixCreateRoomDialog` props `{ initialName?: string }`；抽屉按钮 testid `drawer-create-room` / `drawer-goto-room`。

- [ ] **Step 1: 写失败测试（对话框预填）**

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-chat/__tests__/create-room-dialog.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { createRoom } = vi.hoisted(() => ({ createRoom: vi.fn(async () => ({})) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ createRoom }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import MatrixCreateRoomDialog from '../components/MatrixCreateRoomDialog.vue'

describe('MatrixCreateRoomDialog — initialName 预填（弱锚点建群）', () => {
  it('initialName prop 预填群名输入框', () => {
    setActivePinia(createPinia())
    const wrapper = mount(MatrixCreateRoomDialog, { props: { initialName: '[abcdef12] 需求评审' } })
    expect((wrapper.find('.dialog-input').element as HTMLInputElement).value).toBe('[abcdef12] 需求评审')
  })

  it('缺省空串（现状不变）；创建走 createRoom 并 close', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(MatrixCreateRoomDialog, { props: {} })
    const input = wrapper.find('.dialog-input')
    expect((input.element as HTMLInputElement).value).toBe('')
    await input.setValue('[abcdef12] x')
    await wrapper.find('.dialog-btn.primary').trigger('click')
    expect(createRoom).toHaveBeenCalledWith({ name: '[abcdef12] x', isPublic: false })
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
```

跑 → FAIL（props 未定义，预填为空）。

- [ ] **Step 2: 对话框加 initialName prop**

`MatrixCreateRoomDialog.vue` script：

```ts
// 弱锚点建群（2026-09-16 loop 多视图）：调用方可预填群名（[taskId前8位] 前缀约定）
const props = withDefaults(defineProps<{ initialName?: string }>(), { initialName: '' })
```

`const roomName = ref('')` 改为 `const roomName = ref(props.initialName)`。

跑对话框测试 → PASS。

- [ ] **Step 3: 写失败测试（抽屉按钮）**

```ts
// @vitest-environment jsdom
// overlay/custom/client/kanban/__tests__/drawer-room-actions.test.ts
// 任务↔群弱锚点（2026-09-16 多视图重构，裁决#4）：抽屉头部建群/跳群按钮。
// matrix store 桩化（抽屉按需动态 import，vitest mock 对动态 import 同样生效）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const { sortedRooms, kanbanApi } = vi.hoisted(() => ({
  sortedRooms: { value: [] as Array<{ roomId: string; name?: string | null }> },
  kanbanApi: {
    getTask: vi.fn(async () => null),
    getTaskDetail: vi.fn(async () => null),
  },
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ sortedRooms: sortedRooms.value }),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, ...kanbanApi }
})
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ tasks: [], fetchTasks: vi.fn(async () => {}) }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import KanbanTaskDrawer from '../components/KanbanTaskDrawer.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/comms/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } }],
  })
}

async function mountDrawer() {
  const router = makeRouter()
  const wrapper = mount(KanbanTaskDrawer, {
    props: { show: true, taskId: 'abcdef12-3456-7890' },
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

describe('KanbanTaskDrawer — 拉群弱锚点按钮', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sortedRooms.value = []
  })

  it('建群按钮恒在（有 taskId）；无匹配群时跳群按钮隐藏', async () => {
    const { wrapper } = await mountDrawer()
    expect(wrapper.find('[data-testid="drawer-create-room"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="drawer-goto-room"]').exists()).toBe(false)
  })

  it('匹配群存在时跳群按钮渲染，点击 → ia2.commsRoom 并关抽屉', async () => {
    sortedRooms.value = [{ roomId: '!r1:sv', name: '[abcdef12] 需求评审' }]
    const { wrapper, router } = await mountDrawer()
    const push = vi.spyOn(router, 'push')
    const btn = wrapper.find('[data-testid="drawer-goto-room"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!r1:sv' } })
    expect(wrapper.emitted('update:show')?.[0]).toEqual([false])
  })

  it('matrix 不可用（import 抛错）时静默隐藏跳群，不影响抽屉', async () => {
    // 桩返回 sortedRooms 抛错路径由「空列表」等价覆盖；此处断言无群即隐藏即可
    const { wrapper } = await mountDrawer()
    expect(wrapper.find('[data-testid="drawer-goto-room"]').exists()).toBe(false)
  })
})
```

跑 → FAIL（按钮不存在）。

- [ ] **Step 4: 抽屉接线**

`KanbanTaskDrawer.vue` script 编辑：

a) import 区追加：

```ts
import { defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
// HERMES_CUSTOM[loop-multiview] 任务↔群弱锚点（ia2/adapters/manage 纯函数）
import { taskRoomPrefix, matchRoomByPrefix, type RoomLike } from '@/custom/ia2/adapters/manage'
const MatrixCreateRoomDialog = defineAsyncComponent(
  () => import('@/custom/matrix-chat/components/MatrixCreateRoomDialog.vue'))
```

b) `const store = useKanbanStore()` 后追加：

```ts
const router = useRouter()

// ── 任务↔群弱锚点（[taskId前8位] 群名前缀约定；不持久化字段） ──
const roomDialogOpen = ref(false)
const matchedRoom = ref<RoomLike | null>(null)
const roomPrefix = computed(() => (props.taskId ? taskRoomPrefix(props.taskId) : ''))
const roomInitialName = computed(() => `${roomPrefix.value} ${task.value?.title ?? ''}`.trim())

/** 匹配群刷新（matrix store 动态 import：抽屉在纯 kanban 测试环境不拉 matrix 重图） */
async function refreshMatchedRoom(): Promise<void> {
  matchedRoom.value = null
  if (!props.show || !props.taskId) return
  try {
    const { useMatrixRoomStore } = await import('@/custom/matrix-chat/stores/matrix-room')
    matchedRoom.value = matchRoomByPrefix(useMatrixRoomStore().sortedRooms as RoomLike[], roomPrefix.value)
  } catch { /* matrix 未初始化：跳群按钮隐藏 */ }
}
watch(() => [props.show, props.taskId] as const, () => { void refreshMatchedRoom() }, { immediate: true })

function gotoTaskRoom(): void {
  if (!matchedRoom.value) return
  void router.push({ name: 'ia2.commsRoom', params: { roomId: matchedRoom.value.roomId } })
  emit('update:show', false)
}
```

c) 模板 `.drawer-header-actions` div 内、最大化按钮之前插入：

```vue
            <NButton
              v-if="matchedRoom"
              size="tiny"
              text
              data-testid="drawer-goto-room"
              @click="gotoTaskRoom"
            >{{ t('kanban.gotoTaskRoom') }}</NButton>
            <NButton
              size="tiny"
              text
              data-testid="drawer-create-room"
              @click="roomDialogOpen = true"
            >{{ t('kanban.createTaskRoom') }}</NButton>
```

d) 模板根（`</NDrawerContent>` 之后、`</NDrawer>` 之前）追加：

```vue
      <MatrixCreateRoomDialog
        v-if="roomDialogOpen"
        :initial-name="roomInitialName"
        @close="roomDialogOpen = false; void refreshMatchedRoom()"
      />
```

跑 `npx vitest run custom/client/kanban/__tests__/drawer-room-actions.test.ts` → PASS。若抽屉挂载因其他 API 桩缺口报错，按报错向 `@/api/hermes/kanban` 的 mock 补同名 vi.fn（抽屉 detail 加载链）。

- [ ] **Step 5: 回归——kanban + matrix + ia2 测试**

```bash
npx vitest run custom/client/kanban custom/client/matrix-chat custom/client/ia2
```

预期：全绿。注意抽屉被 overview 场景桩化引用，桩形状（props show/taskId）不变不受影响。

- [ ] **Step 6: Commit**

```bash
git add custom/client/matrix-chat custom/client/kanban
git commit -m "feat(kanban): 任务抽屉拉群弱锚点——建群预填 + 前缀匹配跳群"
```

---

### Task 7: ManageScene 实现

**Files:**
- Modify: `custom/client/ia2/views/scenes/ManageScene.vue`（骨架 → 全量）
- Test: `custom/client/ia2/__tests__/manage-scene.test.ts`（新建）

**Interfaces:**
- Consumes: Task 5 适配器；`useKanbanStore().setAssigneeFilter(assignee?: string)`（upstream store 既有）；`SwarmKanbanView`（自武装：onMounted fetchTasks + connectEvents）；`ia2.commsRoom` 路由。
- Produces: 场景 testid `scene-manage`（保留）、人员条 `mscene-person-<name|none>`、群组栏 `mscene-room-*`。

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/manage-scene.test.ts
// 管理场景守门：人员聚合条 + 看板内嵌 + 群栏目（弱锚点列表 + 跳群深链）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [
      { id: 't1', title: '需求 A', status: 'running', assignee: 'alice' },
      { id: 't2', title: '需求 B', status: 'blocked', assignee: 'alice' },
      { id: 't3', title: '需求 C', status: 'review', assignee: 'bob' },
      { id: 't4', title: '需求 D', status: 'todo', assignee: null },
    ] as Array<Record<string, unknown>>,
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const kanbanStubs = vi.hoisted(() => ({
  setAssigneeFilter: vi.fn(),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ setAssigneeFilter: kanbanStubs.setAssigneeFilter }),
}))
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { name: 'SwarmKanbanStub', template: '<div class="kanban-stub" />' },
}))
const { sortedRooms } = vi.hoisted(() => ({
  sortedRooms: { value: [
    { roomId: '!r1:sv', name: '[abcdef12] 需求评审' },
    { roomId: '!r2:sv', name: '日常闲聊' },
  ] as Array<{ roomId: string; name?: string | null }> },
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ sortedRooms: sortedRooms.value }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import ManageScene from '../views/scenes/ManageScene.vue'

async function mountScene() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/comms/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } },
      { path: '/app/tasks', name: 'ia2.tasks', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(ManageScene, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

describe('ManageScene — 装配', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('人员条聚合在办：alice open1+blocked1 / bob review1 / 未指派 open1；done 不入桶', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="mscene-person-alice"]').text()).toContain('1')
    expect(wrapper.find('[data-testid="mscene-person-bob"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mscene-person-none"]').exists()).toBe(true)
  })

  it('点击人员 → setAssigneeFilter 按人筛选；再点同人取消；卸载清理筛选', async () => {
    const { wrapper } = await mountScene()
    await wrapper.find('[data-testid="mscene-person-alice"]').trigger('click')
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenCalledWith('alice')
    await wrapper.find('[data-testid="mscene-person-alice"]').trigger('click')
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith(undefined)
    await wrapper.find('[data-testid="mscene-person-bob"]').trigger('click')
    wrapper.unmount()
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith(undefined)
  })

  it('看板内嵌渲染；群栏目只列弱锚点群（[ 前缀），点击跳 ia2.commsRoom', async () => {
    const { wrapper, router } = await mountScene()
    const push = vi.spyOn(router, 'push')
    expect(wrapper.find('.kanban-stub').exists()).toBe(true)
    const room = wrapper.find('[data-testid="mscene-room-!r1:sv"]')
    expect(room.exists()).toBe(true)
    expect(wrapper.find('[data-testid="mscene-room-!r2:sv"]').exists()).toBe(false)
    await room.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!r1:sv' } })
  })
})
```

跑 → FAIL（骨架无这些元素）。

- [ ] **Step 2: 实现 ManageScene 全量**

```vue
<!-- overlay/custom/client/ia2/views/scenes/ManageScene.vue -->
<!-- 管理场景（2026-09-16 多视图重构）：研发管理治理——
     顶部人员聚合条（assignee 在办分桶，点击按人筛选看板）+ 左看板主区
     （SwarmKanbanView 自武装内嵌，/app/tasks 同款先例）+ 右群栏目
     （任务↔群弱锚点列表 + 治理入口）。指派走看板既有 assignee 字段；
     建群在任务抽屉（Task 6 接线）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../store/workspace'
import { useKanbanStore } from '@/stores/hermes/kanban'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
import { aggregateByAssignee, type RoomLike } from '../../adapters/manage'

const router = useRouter()
const { t } = useI18n()
const workspace = useWorkspaceStore()
const kanban = useKanbanStore()

// ── 人员聚合条（纯函数适配器，视图不自算） ──
const people = computed(() => aggregateByAssignee(workspace.tasks))
const activeAssignee = ref<string | null>(null)
function filterAssignee(name: string): void {
  const key = name === '' ? null : name
  const next = activeAssignee.value === key ? null : key
  activeAssignee.value = next
  kanban.setAssigneeFilter(next ?? undefined)
}
// 筛选态属本场景临时视图态：离开即清，不外泄到 /app/tasks
onUnmounted(() => {
  if (activeAssignee.value !== null) kanban.setAssigneeFilter(undefined)
})

// ── 群栏目（弱锚点群 = 群名以 '[' 前缀约定开头；matrix 不可用则整栏隐藏） ──
const rooms = ref<RoomLike[] | null>(null)
onMounted(async () => {
  try {
    const { useMatrixRoomStore } = await import('@/custom/matrix-chat/stores/matrix-room')
    rooms.value = (useMatrixRoomStore().sortedRooms as RoomLike[])
      .filter(r => (r.name ?? '').startsWith('['))
  } catch { rooms.value = null }
})
function openRoom(room: RoomLike): void {
  void router.push({ name: 'ia2.commsRoom', params: { roomId: room.roomId } })
}

const goBoard = () => void router.push({ path: '/app/tasks' })
const goTrace = () => void router.push({ path: '/app/tasks', query: { tab: 'trace' } })
</script>

<template>
  <section class="mscene" data-testid="scene-manage">
    <!-- 人员聚合条 -->
    <div class="mscene__people" data-testid="mscene-people">
      <span class="mscene__people-label">{{ t('loopScenes.manage.people') }}</span>
      <button
        v-for="p in people"
        :key="p.name || '__none__'"
        type="button"
        class="mscene__person"
        :class="{ 'mscene__person--on': activeAssignee === (p.name || null) }"
        :data-testid="`mscene-person-${p.name || 'none'}`"
        @click="filterAssignee(p.name)"
      >
        <span class="mscene__person-name">{{ p.name || t('loopScenes.manage.unassigned') }}</span>
        <span class="mscene__person-count">{{ t('loopScenes.manage.openCount') }} {{ p.open }}</span>
        <span v-if="p.review" class="mscene__person-count mscene__person-count--warn">
          {{ t('kanban.columns.review') }} {{ p.review }}</span>
        <span v-if="p.blocked" class="mscene__person-count mscene__person-count--bad">
          {{ t('kanban.columns.blocked') }} {{ p.blocked }}</span>
      </button>
    </div>

    <div class="mscene__body">
      <!-- 左：看板主区（自武装内嵌） -->
      <main class="mscene__board">
        <SwarmKanbanView />
      </main>

      <!-- 右：群栏目 + 治理入口 -->
      <aside class="mscene__rail">
        <div class="mscene__rail-head">{{ t('loopScenes.manage.rooms') }}</div>
        <template v-if="rooms !== null">
          <div v-if="rooms.length === 0" class="mscene__rail-empty">{{ t('loopScenes.manage.noRooms') }}</div>
          <button
            v-for="r in rooms"
            :key="r.roomId"
            type="button"
            class="mscene__room"
            :data-testid="`mscene-room-${r.roomId}`"
            :title="r.name ?? r.roomId"
            @click="openRoom(r)"
          >{{ r.name ?? r.roomId }}</button>
        </template>

        <div class="mscene__rail-links">
          <button type="button" class="mscene__link" data-testid="mscene-goto-board" @click="goBoard">
            {{ t('loopScenes.manage.gotoBoard') }} ›</button>
          <button type="button" class="mscene__link" data-testid="mscene-goto-trace" @click="goTrace">
            {{ t('loopScenes.manage.trace') }} ›</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.mscene { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.mscene__people {
  flex: 0 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary));
}
.mscene__people-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.mscene__person {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px; cursor: pointer; font-size: 12px; font-family: inherit;
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
}
.mscene__person:hover { border-color: var(--color-primary, #3b82f6); }
.mscene__person--on { border-color: var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); }
.mscene__person-name { font-weight: 600; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mscene__person-count { font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.mscene__person--on .mscene__person-count { color: inherit; }
.mscene__person-count--warn { color: var(--color-warning, #f59e0b); }
.mscene__person-count--bad { color: var(--color-danger, #e11d48); }
.mscene__person--on .mscene__person-count--warn, .mscene__person--on .mscene__person-count--bad { color: inherit; }
.mscene__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.mscene__board { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-standard); overflow: hidden; }
.mscene__rail {
  flex: 0 0 240px; min-height: 0; overflow-y: auto;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.mscene__rail-head { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.mscene__rail-empty { font-size: 12px; color: var(--text-secondary); }
.mscene__room {
  border: none; background: transparent; text-align: left; cursor: pointer;
  padding: 6px 8px; border-radius: var(--radius-standard); font-size: 12.5px; font-family: inherit;
  color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mscene__room:hover { background: var(--bg-hover, var(--bg-card)); color: var(--color-primary, #3b82f6); }
.mscene__rail-links { margin-top: auto; border-top: 1px solid var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.mscene__link { border: none; background: none; padding: 2px 0; text-align: left; cursor: pointer; font-size: 12px; font-family: inherit; color: var(--color-primary, #3b82f6); }
</style>
```

跑 `npx vitest run custom/client/ia2/__tests__/manage-scene.test.ts` → PASS。

- [ ] **Step 3: Commit**

```bash
git add custom/client/ia2/views/scenes/ManageScene.vue custom/client/ia2/__tests__/manage-scene.test.ts
git commit -m "feat(ia2): 管理场景——人员聚合条 + 看板内嵌 + 群栏目弱锚点"
```

---

### Task 8: CodeScene 实现

**Files:**
- Modify: `custom/client/ia2/views/scenes/CodeScene.vue`（骨架 → 全量）
- Test: `custom/client/ia2/__tests__/code-scene.test.ts`（新建）

**Interfaces:**
- Consumes: Task 4 的 `CockpitFilePanel`/`CockpitTerminalPane` props；`RunLinks` props `{ taskId: string | null; show: boolean }`；workspace store `tasks`（`CockpitTask`，`workspace?: string` 字段——执行时先 `grep -n "workspace" custom/client/cockpit/store/cockpit.ts | grep -i "interface\|workspace?"` 确认字段名，若实为 `workspace_path` 则取它）。
- Produces: 场景 testid `scene-code`（保留）、`cscene-task-select` / `cscene-empty` / `cscene-no-workspace`。

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/code-scene.test.ts
// Code 场景守门：任务上下文条 + IDE 三区（文件/终端/上下文），
// cockpit 组件 props 注入 + 无任务/无 workspace 空态。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [
      { id: 't1', title: '编码任务 A', status: 'running', workspace: '/ws/a' },
      { id: 't2', title: '编码任务 B', status: 'todo' },
    ] as Array<Record<string, unknown>>,
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// cockpit 组件桩（props 捕获断言注入）
const FilePanelStub = {
  name: 'FilePanelStub',
  props: ['workspacePath'],
  template: '<div class="file-panel-stub" :data-ws="workspacePath" />',
}
const TerminalPaneStub = {
  name: 'TerminalPaneStub',
  props: ['workspacePath'],
  template: '<div class="term-pane-stub" :data-ws="workspacePath" />',
}
vi.mock('@/custom/cockpit/components/CockpitFilePanel.vue', () => ({ default: FilePanelStub }))
vi.mock('@/custom/cockpit/components/CockpitTerminalPane.vue', () => ({ default: TerminalPaneStub }))
vi.mock('@/custom/ia2/components/RunLinks.vue', () => ({
  default: { name: 'RunLinksStub', props: ['taskId', 'show'], template: '<div class="runlinks-stub" />' },
}))
vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: { name: 'TaskDrawerStub', props: ['show', 'taskId'], emits: ['update:show', 'close'], template: '<div class="task-drawer-stub" />' },
}))

import CodeScene from '../views/scenes/CodeScene.vue'

async function mountScene() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/comms', name: 'ia2.comms', component: { template: '<div />' } }],
  })
  const wrapper = mount(CodeScene, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

describe('CodeScene — 装配', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('未选任务：空态引导，三区不渲染', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="cscene-empty"]').exists()).toBe(true)
    expect(wrapper.find('.term-pane-stub').exists()).toBe(false)
  })

  it('选中任务：文件/终端以 props 注入 workspace；上下文栏渲染 RunLinks', async () => {
    const { wrapper } = await mountScene()
    await wrapper.findComponent({ name: 'NSelect' }).vm.$emit('update:value', 't1')
    await flushPromises()
    expect(wrapper.find('.file-panel-stub').attributes('data-ws')).toBe('/ws/a')
    expect(wrapper.find('.term-pane-stub').attributes('data-ws')).toBe('/ws/a')
    expect(wrapper.find('.runlinks-stub').exists()).toBe(true)
  })

  it('任务无 workspace：三区位置渲染未领取空态，不注入 undefined props', async () => {
    const { wrapper } = await mountScene()
    await wrapper.findComponent({ name: 'NSelect' }).vm.$emit('update:value', 't2')
    await flushPromises()
    expect(wrapper.find('[data-testid="cscene-no-workspace"]').exists()).toBe(true)
    expect(wrapper.find('.term-pane-stub').exists()).toBe(false)
  })
})
```

跑 → FAIL（骨架无这些元素）。若 naive-ui NSelect 在桩环境解析异常，改用 `vi.mock('naive-ui', ...)` 轻桩 NSelect（`{ name: 'NSelect', props: ['value', 'options'], emits: ['update:value'], template: '<select />' }`）——以实际报错为准。

- [ ] **Step 2: 实现 CodeScene 全量**

```vue
<!-- overlay/custom/client/ia2/views/scenes/CodeScene.vue -->
<!-- Code 场景（2026-09-16 多视图重构）：IDE 习惯三区——
     左文件树 + 中终端 + 右任务上下文，顶部任务上下文条。
     cockpit 组件经 Task 4 可选 props 注入任务 workspace（不 bootstrap
     cockpit store）。终端会话 MVP 切任务/切场景即断开重建（:key 换任务，
     场景卸载组件销毁）——与 AI 协作中心切 mode 现状一致，代价已声明。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NSelect } from 'naive-ui'
import { useWorkspaceStore } from '../../store/workspace'
import CockpitFilePanel from '@/custom/cockpit/components/CockpitFilePanel.vue'
import CockpitTerminalPane from '@/custom/cockpit/components/CockpitTerminalPane.vue'
import RunLinks from '../../components/RunLinks.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'

const router = useRouter()
const { t } = useI18n()
const workspace = useWorkspaceStore()

const currentTaskId = ref<string | null>(null)
const currentTask = computed(() =>
  workspace.tasks.find(x => x.id === currentTaskId.value) ?? null)
const workspacePath = computed(() =>
  (currentTask.value as { workspace?: string } | null)?.workspace)
const drawerOpen = ref(false)

const taskOptions = computed(() =>
  workspace.tasks.map(x => ({ label: x.title, value: x.id })))

const goComms = () => void router.push({ name: 'ia2.comms' })
</script>

<template>
  <section class="cscene" data-testid="scene-code">
    <!-- 任务上下文条 -->
    <div class="cscene__bar">
      <NSelect
        :value="currentTaskId"
        :options="taskOptions"
        :placeholder="t('loopScenes.code.selectTask')"
        clearable
        filterable
        class="cscene__bar-select"
        data-testid="cscene-task-select"
        @update:value="v => { currentTaskId = (v as string | null) }"
      />
      <template v-if="currentTask">
        <span class="cscene__bar-title" :title="currentTask.title">{{ currentTask.title }}</span>
        <button type="button" class="cscene__bar-btn" data-testid="cscene-open-drawer" @click="drawerOpen = true">
          {{ t('loopScenes.code.openDrawer') }}</button>
      </template>
    </div>

    <div v-if="!currentTask" class="cscene__empty" data-testid="cscene-empty">
      {{ t('loopScenes.code.noTask') }}
    </div>
    <div v-else-if="!workspacePath" class="cscene__empty" data-testid="cscene-no-workspace">
      {{ t('loopScenes.code.noWorkspace') }}
    </div>

    <div v-else class="cscene__body">
      <aside class="cscene__files">
        <CockpitFilePanel :workspace-path="workspacePath" />
      </aside>
      <main class="cscene__term">
        <CockpitTerminalPane :key="currentTask.id" :workspace-path="workspacePath" />
      </main>
      <aside class="cscene__ctx">
        <div class="cscene__ctx-head">{{ t('loopScenes.code.context') }}</div>
        <div class="cscene__ctx-row">{{ t(`kanban.columns.${currentTask.status}`) }}</div>
        <div class="cscene__ctx-sub">{{ t('loopScenes.code.runs') }}</div>
        <RunLinks :task-id="currentTask.id" :show="true" />
        <button type="button" class="cscene__bar-btn cscene__ctx-chat" data-testid="cscene-open-chat" @click="goComms">
          {{ t('loopScenes.code.openChat') }}</button>
      </aside>
    </div>

    <KanbanTaskDrawer v-model:show="drawerOpen" :task-id="currentTaskId" @close="drawerOpen = false" />
  </section>
</template>

<style scoped>
.cscene { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.cscene__bar {
  flex: 0 0 auto; display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary));
}
.cscene__bar-select { max-width: 320px; }
.cscene__bar-title { font-size: 12.5px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cscene__bar-btn {
  padding: 4px 12px; border-radius: var(--radius-standard); cursor: pointer;
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  font-size: 12px; font-family: inherit; white-space: nowrap;
}
.cscene__bar-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.cscene__empty { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 13px; }
.cscene__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.cscene__files { flex: 0 0 260px; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-standard); overflow: hidden; }
.cscene__term { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-standard); overflow: hidden; }
.cscene__ctx {
  flex: 0 0 260px; min-height: 0; overflow-y: auto; padding: 10px 12px;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); display: flex; flex-direction: column; gap: 6px;
}
.cscene__ctx-head { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cscene__ctx-row { font-size: 12px; color: var(--text-secondary); }
.cscene__ctx-sub { font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-top: 6px; }
.cscene__ctx-chat { margin-top: auto; }
</style>
```

跑 `npx vitest run custom/client/ia2/__tests__/code-scene.test.ts` → PASS。

- [ ] **Step 3: Commit**

```bash
git add custom/client/ia2/views/scenes/CodeScene.vue custom/client/ia2/__tests__/code-scene.test.ts
git commit -m "feat(ia2): Code 场景——任务上下文条 + 文件/终端/上下文 IDE 三区"
```

---

### Task 9: OpsScene 实现

**Files:**
- Modify: `custom/client/ia2/views/scenes/OpsScene.vue`（骨架 → 全量）
- Test: `custom/client/ia2/__tests__/ops-scene.test.ts`（新建）

**Interfaces:**
- Consumes: `adapters/inbox-center` 全组纯函数（`buildTriageEntries / projectTriage / loadTriagedMap / markTriaged / unmarkTriaged / writeTriagedMap / pruneTriaged / loadResolvedMap / resolveEntry / pruneResolved / writeResolvedMap`，kv 键与 /app/inbox 同源）；`adapters/overview` 的 `buildTodayPlan / localDateStr / formatDuration`；`AlarmList`（props `entries`，emit `open`）；`TriageQueue`（props `pending / done / runs`，emits `triage / untriage / open`）；`RunListTable`（props `runs`，emits `select / action`）；`LoopCreateWizard`（emits `close / created`）；`CockpitScheduleModal`（挂 workspace.scheduleOpen）。
- Produces: 场景 testid `scene-ops`（保留）、`ops-new-loop` / `ops-schedule` / `ops-cockpit`。

数据武装说明：壳已武装 runs fetch + fetchMetrics + fetchLoops + workspace 流（Task 3），OpsScene 零新增武装，只算投影。

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ops-scene.test.ts
// 运维场景守门：告警 + 工单分诊（inbox-center 同源 kv）+ 值班台 + 快捷动作。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [
      { runId: 'r1', graphId: 'l1', status: 'awaiting-input', updatedAt: '2026-09-16T01:00:00Z',
        stage: 'discovery', iteration: 1, lastActivityAt: '2026-09-16T01:00:00Z',
        cost: 0, events: [], pendingInterruptId: 'i1' },
      { runId: 'r2', graphId: 'l1', status: 'running', updatedAt: '2026-09-16T01:00:00Z',
        stage: 'exec', iteration: 0, lastActivityAt: '2026-09-16T01:00:00Z',
        cost: 0, events: [], pendingInterruptId: null },
    ] as Array<Record<string, unknown>>),
    replay: vi.fn(async () => []),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'r1', instance: {} })),
    forkRun: vi.fn(async () => ({})),
    startRun: vi.fn(async () => ({})),
    exportRun: vi.fn(async () => ({})),
    getSpec: vi.fn(async () => null),
    getMind: vi.fn(async () => ({ thoughts: [], runs: [], available: true })),
  },
  loopRest: {
    listLoops: vi.fn(async () => [{
      id: 'l1', name: '日报循环', goal: '', stopCondition: '', pattern: 'daily-report',
      schedule: { type: 'cron', cron: '0 9 * * *' }, stage: 'discovery', status: 'idle',
      autonomyLevel: 'level-2', stateAdapter: 'local',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
      lastTickAt: null, nextTickAt: null,
      budget: { maxCostTotal: 10 }, stats: { tasksCompleted: 0, tasksDiscovered: 0, totalCost: 0 },
    }] as Array<Record<string, unknown>>),
    getEvents: vi.fn(async () => []),
    tickLoop: vi.fn(async () => ({})),
    pauseLoop: vi.fn(async () => ({})),
    deleteLoop: vi.fn(async () => ({})),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest,
  connectGraph: vi.fn(() => ({ connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
  disconnectGraph: vi.fn(),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [] as Array<Record<string, unknown>>,
    userTodos: [] as Array<Record<string, unknown>>,
    scheduleOpen: false,
    openSchedule: vi.fn(() => { state.scheduleOpen = true }),
    loadTodos: vi.fn(),
    startReminderScheduler: vi.fn(),
    stopReminderScheduler: vi.fn(),
    initFleetStream: vi.fn(),
    stopFleetStream: vi.fn(),
    watchKanbanTasks: vi.fn(),
    unwatchKanbanTasks: vi.fn(),
    onBoardEvent: vi.fn(() => () => {}),
    refreshAllBoards: vi.fn(async () => true),
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/custom/loop/components/LoopCreateWizard.vue', () => ({
  default: { name: 'WizardStub', emits: ['close', 'created'], template: '<div class="wizard-stub" />' },
}))
vi.mock('@/custom/cockpit/components/CockpitScheduleModal.vue', () => ({
  default: { name: 'ScheduleStub', template: '<div class="schedule-stub" />' },
}))

import OpsScene from '../views/scenes/OpsScene.vue'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'

async function mountScene() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/runs/:runId', name: 'ia2.runDetail', component: { template: '<div />' } },
      { path: '/hermes/loop/runs/:runId', name: 'hermes.loopRunDetail', component: { template: '<div />' } },
      { path: '/hermes/cockpit', name: 'hermes.cockpit', component: { template: '<div />' } },
      { path: '/app/runs', name: 'ia2.runs', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(OpsScene, { global: { plugins: [router] }, attachTo: document.body })
  // 场景依赖壳武装的数据：测试里手动补一轮（壳测试已守门武装序列）
  await useRunCenterStore().fetchRuns()
  await useLoopStore().fetchLoops()
  await flushPromises()
  return { wrapper, router }
}

describe('OpsScene — 装配', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('告警空态 + 工单分诊渲染待决审批（同源 inbox-center 投影）', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-alarm-list]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ia2.inbox.alarmEmpty')
    // 待分诊区出现 r1（awaiting 审批条目）
    expect(wrapper.text()).toContain('日报循环')
  })

  it('值班台：进行中/待介入 runs 表渲染两行', async () => {
    const { wrapper } = await mountScene()
    const rows = wrapper.findAll('[data-testid="ops-runs"] tbody tr, [data-testid="ops-runs"] .run-row')
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('快捷动作：新建循环开 wizard；日程走 workspace.openSchedule；协作中心跳 /hermes/cockpit', async () => {
    const { wrapper, router } = await mountScene()
    const push = vi.spyOn(router, 'push')
    expect(wrapper.find('.wizard-stub').exists()).toBe(false)
    await wrapper.find('[data-testid="ops-new-loop"]').trigger('click')
    expect(wrapper.find('.wizard-stub').exists()).toBe(true)
    await wrapper.find('[data-testid="ops-schedule"]').trigger('click')
    expect(workspaceStubs.state.openSchedule).toHaveBeenCalled()
    expect(wrapper.find('.schedule-stub').exists()).toBe(true)
    await wrapper.find('[data-testid="ops-cockpit"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/hermes/cockpit')
  })

  it('runs 表选择跳运行详情（家族感知：默认 ia2.runDetail）', async () => {
    const { wrapper, router } = await mountScene()
    const push = vi.spyOn(router, 'push')
    const table = wrapper.findComponent({ name: 'RunListTable' })
    table.vm.$emit('select', { runId: 'r2' })
    expect(push).toHaveBeenCalledWith({ name: 'ia2.runDetail', params: { runId: 'r2' } })
  })
})
```

跑 → FAIL（骨架无这些元素）。

- [ ] **Step 2: 实现 OpsScene 全量**

```vue
<!-- overlay/custom/client/ia2/views/scenes/OpsScene.vue -->
<!-- 运维场景（2026-09-16 多视图重构）：值班/告警/工单——
     左 告警+工单分诊（inbox-center 五源聚合与 kv 分诊状态，/app/inbox 同源同键）；
     中 值班台（今日计划 + 进行中/待介入 runs 表）；右 快捷动作。
     零新增武装：runs/metrics/loops/workspace 流由壳统一武装（Task 3）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useWorkspaceStore } from '../../store/workspace'
import AlarmList from '../../components/AlarmList.vue'
import TriageQueue from '../../components/TriageQueue.vue'
import RunListTable from '@/custom/loop/runcenter/components/RunListTable.vue'
import LoopCreateWizard from '@/custom/loop/components/LoopCreateWizard.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import {
  buildTriageEntries, projectTriage,
  loadTriagedMap, markTriaged, unmarkTriaged, writeTriagedMap, pruneTriaged,
  loadResolvedMap, resolveEntry, pruneResolved, writeResolvedMap,
  type TriageEntry, type TriageProjection,
} from '../../adapters/inbox-center'
import { buildTodayPlan, formatDuration, localDateStr } from '../../adapters/overview'
import type { RunSummary } from '@/custom/loop/runcenter/types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const workspace = useWorkspaceStore()

/** 视图时间锚（与 InboxView 同语义：挂载时刻为稳定基准） */
const nowTick = ref(Date.now())
const dayKey = computed(() => localDateStr(new Date(nowTick.value)))

// ── 本地 kv：已分诊 ∪ 自动归档（与 InboxView 同源同键，单一事实源；
//    挂载即裁剪写回——onMounted 时机与 InboxView 一致） ──
const triagedMap = ref<Record<string, string>>(
  pruneTriaged(loadTriagedMap(), dayKey.value))
const resolvedMap = ref(
  pruneResolved(loadResolvedMap(), nowTick.value))
onMounted(() => {
  writeTriagedMap(triagedMap.value)
  writeResolvedMap(resolvedMap.value)
})

// ── 五源聚合投影（纯函数，视图不自算） ──
const loopNames = computed<Record<string, string>>(() =>
  Object.fromEntries(loopStore.loops.map(l => [l.id, l.name])))

const entries = computed<TriageEntry[]>(() =>
  buildTriageEntries({
    approvals: runsStore.awaitingRuns,
    tasks: workspace.tasks,
    alarms: runsStore.metricsRaw?.loopEvents ?? [],
    reminders: workspace.userTodos,
  }, nowTick.value, dayKey.value, loopNames.value))

/** 审批离场自动记档（与 InboxView 同一规则：loading 窗口不判离场） */
watch(entries, (curr, prev) => {
  if (runsStore.loading) return
  const currIds = new Set(curr.map(e => e.id))
  for (const e of prev) {
    if (e.kind !== 'approval' || currIds.has(e.id)) continue
    resolvedMap.value = resolveEntry(e.id, e, new Date().toISOString())
  }
})

const projection = computed<TriageProjection>(() =>
  projectTriage(entries.value, {
    triaged: triagedMap.value,
    resolved: resolvedMap.value,
    dayKey: dayKey.value,
    now: nowTick.value,
  }))

const alarmEntries = computed(() => entries.value.filter(e => e.kind === 'alarm'))

function onTriage(entry: TriageEntry): void {
  triagedMap.value = markTriaged(entry.id, dayKey.value)
}
function onUntriage(entry: TriageEntry): void {
  triagedMap.value = unmarkTriaged(entry.id)
}
function onOpen(entry: TriageEntry): void {
  void router.push(entry.route)
}

// ── 值班台 ──
const todayPlan = computed(() =>
  buildTodayPlan(loopStore.loops, workspace.userTodos, new Date(nowTick.value)))
const activeRuns = computed(() =>
  runsStore.sortedRuns
    .filter(r => r.status === 'running' || r.status === 'awaiting-input')
    .slice(0, 12))

/** 运行详情路由家族感知（/hermes/loop 挂载下跳 hermes.loopRunDetail） */
const runDetailName = computed(() =>
  String(route.name ?? '').startsWith('hermes.loop') ? 'hermes.loopRunDetail' : 'ia2.runDetail')
function onRunSelect(run: RunSummary): void {
  void router.push({ name: runDetailName.value, params: { runId: run.runId } })
}
// 行内动作（approve/peek/replay 等）统一进详情页处理——详情页动作链完整，
// 值班台不复制（MVP 取舍，已声明）
function onRunAction(payload: { kind: string; run: RunSummary }): void {
  onRunSelect(payload.run)
}

// ── 快捷动作 ──
const wizardOpen = ref(false)
const goCockpit = () => void router.push('/hermes/cockpit')

function planTimeLabel(at: number | null): string {
  if (at === null) return t('ia2.overview.planNoTime')
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="ops" data-testid="scene-ops">
    <div class="ops__body">
      <!-- 左：告警 + 工单分诊 -->
      <aside class="ops__left">
        <AlarmList :entries="alarmEntries" @open="onOpen" />
        <div class="ops__triage">
          <TriageQueue
            :pending="projection.pending"
            :done="projection.done"
            :runs="runsStore.awaitingRuns"
            @triage="onTriage"
            @untriage="onUntriage"
            @open="onOpen"
          />
        </div>
      </aside>

      <!-- 中：值班台 -->
      <main class="ops__mid">
        <div class="ops__panel">
          <div class="ops__panel-head">{{ t('loopScenes.ops.duty') }} · {{ t('ia2.overview.todayPlan') }}</div>
          <div v-if="todayPlan.length === 0" class="ops__empty">{{ t('ia2.overview.planEmpty') }}</div>
          <div
            v-for="item in todayPlan.slice(0, 8)"
            :key="`${item.kind}-${item.id}`"
            class="ops__plan-row"
            :class="{ 'ops__plan-row--overdue': item.overdue }"
          >
            <span class="ops__plan-kind">{{ t(item.kind === 'loop' ? 'ia2.overview.planKindLoop' : 'ia2.overview.planKindTodo') }}</span>
            <span class="ops__plan-title" :title="item.title">{{ item.title }}</span>
            <span class="ops__plan-time">{{ planTimeLabel(item.at) }}</span>
          </div>
        </div>

        <div class="ops__panel ops__panel--runs">
          <div class="ops__panel-head">{{ t('loopScenes.ops.activeRuns') }}</div>
          <div class="ops__runs" data-testid="ops-runs">
            <RunListTable :runs="activeRuns" @select="onRunSelect" @action="onRunAction" />
          </div>
        </div>
      </main>

      <!-- 右：快捷动作 -->
      <aside class="ops__right">
        <div class="ops__panel-head">{{ t('loopScenes.ops.quickActions') }}</div>
        <button type="button" class="ops__action" data-testid="ops-new-loop" @click="wizardOpen = true">
          {{ t('loopScenes.ops.newLoop') }}</button>
        <button type="button" class="ops__action" data-testid="ops-schedule" @click="workspace.openSchedule()">
          {{ t('loopScenes.ops.schedule') }}</button>
        <button type="button" class="ops__action" data-testid="ops-cockpit" @click="goCockpit">
          {{ t('loopScenes.ops.cockpitLink') }} ›</button>
        <div class="ops__right-note">{{ t('loopCockpit.kpi.runsRunning') }} {{ activeRuns.length }}</div>
      </aside>
    </div>

    <LoopCreateWizard
      v-if="wizardOpen"
      @close="wizardOpen = false"
      @created="wizardOpen = false"
    />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
  </section>
</template>

<style scoped>
.ops { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ops__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.ops__left {
  flex: 0 0 320px; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;
}
.ops__triage { flex: 1 1 auto; min-height: 0; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-standard); }
.ops__mid { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.ops__panel {
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 10px 12px;
}
.ops__panel--runs { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ops__panel-head { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.ops__empty { font-size: 12px; color: var(--text-secondary); }
.ops__runs { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.ops__plan-row { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 0; }
.ops__plan-kind { flex: 0 0 auto; font-size: 10px; padding: 0 5px; border-radius: 3px; background: var(--bg-hover, var(--bg-card)); color: var(--color-primary, #3b82f6); }
.ops__plan-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.ops__plan-time { flex: 0 0 auto; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.ops__plan-row--overdue .ops__plan-time { color: var(--color-danger, #e11d48); }
.ops__right {
  flex: 0 0 180px; display: flex; flex-direction: column; gap: 6px;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 10px 12px;
}
.ops__action {
  padding: 6px 10px; border-radius: var(--radius-standard); cursor: pointer;
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  font-size: 12px; font-family: inherit; text-align: left;
}
.ops__action:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.ops__right-note { margin-top: auto; font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
</style>
```

跑 `npx vitest run custom/client/ia2/__tests__/ops-scene.test.ts` → PASS。若 RunListTable 行选择器与桩 DOM 不符，改用 `findComponent({ name: 'RunListTable' })` emit 断言（第四例已是此形态，第二例同步调整即可）。

- [ ] **Step 3: Commit**

```bash
git add custom/client/ia2/views/scenes/OpsScene.vue custom/client/ia2/__tests__/ops-scene.test.ts
git commit -m "feat(ia2): 运维场景——告警/分诊 + 值班台 + 快捷动作"
```

---

### Task 10: 收口门禁

- [ ] **Step 1: 全量 overlay 测试**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat/loop-multiview
npm test 2>&1 | tail -15
```

预期：140+ 个测试文件全绿（含本计划新增 7 个）。失败项逐项修复，不许跳过。

- [ ] **Step 2: clean && inject 重放（互斥确认后）**

```bash
npm run clean && npm run inject && npm run verify
```

预期：无冲突、verify-clean 通过。注意此操作经 `feat/upstream` symlink 作用于真实上游，执行前确认无其他会话在跑 inject/dev。

- [ ] **Step 3: 全链构建**

```bash
npm run build:full 2>&1 | tail -10
```

预期：openapi → vite build → server tsc 全链通过（vue-tsc 类型门禁含新增场景组件）。

- [ ] **Step 4: 上游 i18n coverage 复核**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio && npx vitest run packages/client/src/i18n --silent 2>&1 | tail -5
```

- [ ] **Step 5: Commit（如有门禁修复）+ 合并 main**

按仓库纪律：worktree 内提交完 → 切主 checkout 合入：

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge feat/loop-multiview
```

（仓库惯例：feat 分支合 main 后保留不删——见记忆「ncwk 结构与 v0.7 迁移地图」。worktree 移除：`git worktree remove .claude/worktrees/feat/loop-multiview`。）

---

## Self-Review 记录

1. **Spec 覆盖**：D1 壳+场景 → Task 3；D2 子路由 → Task 1/3；D3 总览原样提取 → Task 3 Step 2；D4 管理 → Task 5/6/7；D5 Code → Task 4/8；D6 运维 → Task 9；D7 不 bootstrap cockpit store → Task 3/4/8 设计内嵌；D8 i18n patch → Task 2；验证 1-7 → 各任务测试 + Task 10。覆盖全。
2. **占位符扫描**：Task 3 Step 3 style 块标注「从 git 历史逐字搬移」——不是占位符，是重构保留指令（锚点 `git show 109dc79:...` 已给出）。Task 8 workspace 字段名需执行时确认（`workspace` vs `workspace_path`）——已在 Interfaces 块给出确认命令。
3. **类型一致性**：`SceneNames/IA_SCENES/sceneForRouteName`（Task 1）= 壳（Task 3）与测试消费的一致；`AssigneeRow/RoomLike/taskRoomPrefix/matchRoomByPrefix`（Task 5）= Task 6/7 消费的一致；`workspacePath` prop 名（Task 4）= Task 8 消费一致（kebab `workspace-path`）；`ia2.commsRoom` 路由名为既有路由表事实。
4. **已知取舍（诚实声明）**：运维场景行内动作统一进详情页；管理场景群列表为挂载时快照（非实时）；Code 场景终端切任务/切场景断开重建；跨场景跳沟通区统一落 ia2.commsRoom（/hermes/loop 挂载下会切到 /app 家族页面，与今日页头溢出菜单行为一致）。
