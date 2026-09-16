// overlay/custom/client/ia2/routes.ts
// 驾驶舱路由树（/app/*）—— 2026-09-14 重构：IaNav 六菜单栏退役；
// 2026-09-16 多视图重构：总览不再是驾驶舱单页，/app 默认子路由 = LoopCockpitView 壳，
// 四场景子路由（总览/管理/Code/运维）经 buildSceneChildren 挂载，
// 与 /hermes/loop 双挂载点共用同一构造器。
//
// 结构（驾驶舱为登录默认落点）：
//   /app                → IaShell（壳层）
//     └─ ''             → LoopCockpitView 壳（默认子路由）
//       ├─ ''（总览）   → OverviewScene
//       ├─ manage       → ManageScene（管理）
//       ├─ code         → CodeScene（Code）
//       └─ ops          → OpsScene（运维）
//   /app/orchestrate    → OrchestrateView（编排，slim 子页头）
//   /app/runs           → RunsView（运行，内嵌 runcenter RunCenterView）
//   /app/runs/:runId    → runcenter RunDetailView（参数名 runId 与旧路由一致）
//   /app/inbox          → InboxView（介入）
//   /app/tasks          → TasksView（工作项，内嵌 SwarmKanbanView）
//   /app/comms          → CommsView（沟通，router-view 承载 matrix-chat）
//     └─ room/:roomId   → MatrixChatView（路径参数与 cockpit 子路由原样一致）
//
// 纪律：
// - 既有子路由"吸收"而非"搬迁删除"——旧路由（cockpit 子路由、/hermes/loop/*）原样
//   保留，兼容重定向由 guard.ts 承接；cockpit 本体不删。
// - 本文件只产纯路由描述和区域元数据，可被 router.resolve 级测试直接消费，
//   不触发任何懒组件加载。
// - 壳层 meta.fullscreen: true —— 上游 App.vue 对 fullscreen 路由隐藏 AppSidebar。
import type { RouteRecordRaw } from 'vue-router'

/** 六区域 key（子页头标题与驾驶舱动作区的区域词表） */
export type IaAreaKey =
  | 'overview'
  | 'orchestrate'
  | 'runs'
  | 'inbox'
  | 'tasks'
  | 'comms'

export interface IaAreaMeta {
  key: IaAreaKey
  /** 路由名（区域首页） */
  name: string
  /** 区域路径 */
  path: string
  /** 子页头/动作区文案 i18n key */
  labelKey: string
}

/** 区域元数据（IaNav 退役后仍保留：子页头标题 + 驾驶舱动作词表的事实源） */
export const IA_AREAS: IaAreaMeta[] = [
  { key: 'overview', name: 'ia2.overview', path: '/app', labelKey: 'ia2.nav.overview' },
  { key: 'orchestrate', name: 'ia2.orchestrate', path: '/app/orchestrate', labelKey: 'ia2.nav.orchestrate' },
  { key: 'runs', name: 'ia2.runs', path: '/app/runs', labelKey: 'ia2.nav.runs' },
  { key: 'inbox', name: 'ia2.inbox', path: '/app/inbox', labelKey: 'ia2.nav.inbox' },
  { key: 'tasks', name: 'ia2.tasks', path: '/app/tasks', labelKey: 'ia2.nav.tasks' },
  { key: 'comms', name: 'ia2.comms', path: '/app/comms', labelKey: 'ia2.nav.comms' },
]

/**
 * 路径 → 当前区域 key。子页头显隐与 ia store 的唯一投影函数。
 * 最长前缀优先：/app/runs/:runId 归 runs、/app/comms/room/:roomId 归 comms；
 * 未知 /app 子路径回退总览；非 /app 路径返回 null（不在新 IA 内）。
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
          // 驾驶舱壳：四场景子路由的挂载点（ia2.overview 名称落在场景默认子路由上，
          // IaShell 返回按钮 / 既有深链 router.push({name:'ia2.overview'}) 不变）
          path: '',
          component: () => import('./views/LoopCockpitView.vue'),
          children: buildSceneChildren(IA2_SCENE_NAMES),
        },
        {
          path: 'orchestrate',
          name: 'ia2.orchestrate',
          component: () => import('./views/OrchestrateView.vue'),
        },
        {
          path: 'runs',
          name: 'ia2.runs',
          component: () => import('./views/RunsView.vue'),
        },
        {
          // 运行详情直挂 runcenter 既有视图（参数名 runId 与旧路由一致）
          path: 'runs/:runId',
          name: 'ia2.runDetail',
          component: () => import('@/custom/loop/runcenter/views/RunDetailView.vue'),
        },
        {
          path: 'inbox',
          name: 'ia2.inbox',
          component: () => import('./views/InboxView.vue'),
        },
        {
          path: 'tasks',
          name: 'ia2.tasks',
          component: () => import('./views/TasksView.vue'),
        },
        {
          // 沟通区：router-view 承载 matrix-chat 子路由（路径参数原样搬迁）
          path: 'comms',
          name: 'ia2.comms',
          component: () => import('./views/CommsView.vue'),
          children: [
            {
              path: '',
              name: 'ia2.commsHome',
              component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue'),
            },
            {
              path: 'room/:roomId',
              name: 'ia2.commsRoom',
              component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue'),
            },
          ],
        },
      ],
    },
  ]
}

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
