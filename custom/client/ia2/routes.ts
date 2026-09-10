// overlay/custom/client/ia2/routes.ts
// P3 Task 3 — 六区域一级导航路由树（/app/*）。
//
// 结构（总览为登录默认落点）：
//   /app                → OverviewView（总览，Task 4 实装）
//   /app/orchestrate    → OrchestrateView（编排，Task 6 实装）
//   /app/runs           → RunsView（运行，内嵌 runcenter RunCenterView）
//   /app/runs/:runId    → runcenter RunDetailView（参数名 runId 与旧路由一致）
//   /app/inbox          → InboxView（介入，Task 5 实装）
//   /app/tasks          → TasksView（工作项，内嵌 SwarmKanbanView）
//   /app/comms          → CommsView（沟通，router-view 承载 matrix-chat）
//     └─ room/:roomId   → MatrixChatView（路径参数与 cockpit 子路由原样一致）
//
// 纪律：
// - 既有子路由"吸收"而非"搬迁删除"——旧路由（cockpit 子路由、/hermes/loop/*）原样
//   保留，兼容重定向由 guard.ts 承接；cockpit 本体不删（Task 8 才退役）。
// - 本文件只产纯路由描述与区域元数据，可被 router.resolve 级测试直接消费，
//   不触发任何懒组件加载。
// - 壳层 meta.fullscreen: true —— 上游 App.vue 对 fullscreen 路由隐藏 AppSidebar，
//   区域自带 IaNav（与 cockpit 同机制）。
import type { RouteRecordRaw } from 'vue-router'

/** 六区域 key（IaNav 顺序即展示顺序） */
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
  /** 侧栏/导航文案 i18n key */
  labelKey: string
}

/** 六区域元数据（顺序 = 导航顺序 = g+1..6 键位序） */
export const IA_AREAS: IaAreaMeta[] = [
  { key: 'overview', name: 'ia2.overview', path: '/app', labelKey: 'ia2.nav.overview' },
  { key: 'orchestrate', name: 'ia2.orchestrate', path: '/app/orchestrate', labelKey: 'ia2.nav.orchestrate' },
  { key: 'runs', name: 'ia2.runs', path: '/app/runs', labelKey: 'ia2.nav.runs' },
  { key: 'inbox', name: 'ia2.inbox', path: '/app/inbox', labelKey: 'ia2.nav.inbox' },
  { key: 'tasks', name: 'ia2.tasks', path: '/app/tasks', labelKey: 'ia2.nav.tasks' },
  { key: 'comms', name: 'ia2.comms', path: '/app/comms', labelKey: 'ia2.nav.comms' },
]

/**
 * 路径 → 当前区域 key。IaNav 高亮与 ia store 的唯一投影函数。
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
          path: '',
          name: 'ia2.overview',
          component: () => import('./views/OverviewView.vue'),
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
