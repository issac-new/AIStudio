// overlay/custom/client/ia2/routes.ts
// 驾驶舱路由树（/app/*）—— 2026-09-18 统一导航重构：
// 双壳收敛（驾驶舱 + IDE 工作台），IaShell = 全局页头 + 六场景条 + router-view。
// 六场景：总览 / 协作(cockpit 三栏迁入) / 工程(编排+Teams) / 运行(RunCenter+介入+值守) /
// 工作项 / 沟通。/hermes/loop 与 /hermes/cockpit 全家族直删（spec: docs/superpowers/
// specs/2026-09-18-unified-navigation-design.md）。
//
// 纪律：本文件只产纯路由描述和区域元数据，可被 router.resolve 级测试直接消费，
// 不触发任何懒组件加载。壳层 meta.fullscreen: true。
//
// 与简报的偏差（Task 1 实施记录）：comms 场景的 name 'ia2.comms' 落在 '' 默认子路由上
// （父记录不具名，ia2.commsHome 不再存在）——简报测试要求 resolve('/app/comms').name ===
// 'ia2.comms'，而 vue-router 以最深匹配记录的名字为准，名字挂在父记录上会被默认子路由
// 'ia2.commsHome' 覆盖。导航侧不变：push({ name: 'ia2.comms' }) 仍落 matrix-chat 首页。
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
          // 沟通场景：router-view 承载 matrix-chat（路径参数不变）。
          // name 'ia2.comms' 挂在 '' 默认子路由上：resolve('/app/comms') 的名字取最深
          // 匹配记录（见文件头偏差说明）。
          path: 'comms',
          component: () => import('./views/CommsView.vue'),
          children: [
            { path: '', name: 'ia2.comms', component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue') },
            { path: 'room/:roomId', name: 'ia2.commsRoom', component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue') },
          ],
        },
      ],
    },
  ]
}
