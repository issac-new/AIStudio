// overlay/custom/client/ia2/routes.ts
// 驾驶舱路由树（/app/*）—— 2026-09-19 v12 统一视图重构：
// 双视图（沟通协作 /app 工作台 + IDE /ide 壳），六场景退役为单一「沟通协作」
// 三栏工作台（工作流导航 | 对象工作区 | 任务与决策）。旧深链迁移表：
//   /app/ops(/runs/:runId) → /app/runs(/:runId)；/app/tasks → /app/board；
//   /app/comms(/room/:roomId) → /app(/s/room/:roomId)；/app/collab/* → /app
//   （collab/session/:id → /app/s/chat/:id；history/global-agent 平移 /app/history、/app/agent）。
// 名称账本：ia2.overview / ia2.ops / ia2.tasks / ia2.comms 退役（守门断言零残留）；
// ia2.collabSession 与 ia2.commsRoom 的参数名（sessionId/roomId）原样保留——
// cockpit 适配器与上游 GlobalPendingActions/KanbanTaskDrawer 的深链零改动。
// board/runs/eng 为工作页（不进场景条）：看板 / 全部运行 / 编排。
//
// 纪律：本文件只产纯路由描述和区域元数据，可被 router.resolve 级测试直接消费，
// 不触发任何懒组件加载。壳层 meta.fullscreen: true。
import type { RouteRecordRaw } from 'vue-router'

/** 视图 key（场景条与区域投影的词表）—— v12 双视图的 /app 侧；IDE 侧经 ide.shell 直链 */
export type IaAreaKey = 'collab'

export interface IaAreaMeta {
  key: IaAreaKey
  /** 路由名（视图首页） */
  name: string
  /** 视图路径 */
  path: string
  /** 场景条文案 i18n key */
  labelKey: string
}

/** 视图元数据（场景条 + 区域投影的单一事实源） */
export const IA_AREAS: IaAreaMeta[] = [
  { key: 'collab', name: 'ia2.collab', path: '/app', labelKey: 'ia2.nav.collab' },
]

/**
 * 路径 → 当前视图 key。场景条高亮与 ia store 的唯一投影函数。
 * /app 家族（含 board/runs/eng 等工作页）→ 'collab'；非 /app 路径返回 null（IDE 侧）。
 */
export function areaForPath(path: string): IaAreaKey | null {
  if (path !== '/app' && !path.startsWith('/app/')) return null
  return 'collab'
}

/** 旧深链迁移表（v12 §4：路径重定向；无名称记录，退役名零残留） */
export const IA_LEGACY_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: '/app/ops/runs/:runId', to: '/app/runs/:runId' },
  { from: '/app/ops', to: '/app/runs' },
  { from: '/app/tasks', to: '/app/board' },
  { from: '/app/comms/room/:roomId', to: '/app/s/room/:roomId' },
  { from: '/app/comms', to: '/app' },
  { from: '/app/collab/session/:sessionId', to: '/app/s/chat/:sessionId' },
  { from: '/app/collab/chat', to: '/app/s/chat' },
  { from: '/app/collab/history/session/:sessionId', to: '/app/history/session/:sessionId' },
  { from: '/app/collab/history', to: '/app/history' },
  { from: '/app/collab/global-agent/session/:sessionId', to: '/app/agent/session/:sessionId' },
  { from: '/app/collab/global-agent', to: '/app/agent' },
  { from: '/app/collab', to: '/app' },
]

/** 构造 /app 路由树（每次调用返回新对象，调用方负责 addRoute） */
export function buildIaRoutes(): RouteRecordRaw[] {
  const workbench = () => import('./views/WorkbenchView.vue')
  // 含参目标转函数式重定向：vue-router 字符串重定向不透传源路径参数
  // （roomId 等含 !/: 特殊字符，经 path 直拼不经 params 序列化）
  const legacy: RouteRecordRaw[] = IA_LEGACY_REDIRECTS.map(({ from, to }) => {
    if (!to.includes(':')) return { path: from, redirect: to }
    const param = to.slice(to.lastIndexOf(':') + 1)
    const base = to.slice(0, to.lastIndexOf(':'))
    return {
      path: from,
      redirect: (loc: { params: Record<string, string | string[]> }) =>
        ({ path: `${base}${loc.params[param]}` }),
    }
  })
  return [
    {
      path: '/app',
      name: 'ia2.shell',
      component: () => import('./views/IaShell.vue'),
      meta: { fullscreen: true },
      children: [
        {
          // 沟通协作工作台（v12 三栏）。''=无选择（组件内自动选首个会话，不写 URL）；
          // s/chat|s/room|l 承载对象选择，中栏画布按选择分派（对话画布/运行画布）。
          path: '',
          name: 'ia2.collab',
          component: workbench,
        },
        {
          // hermes agent 会话画布（upstream ChatView 经路由参数绑定；新会话态）
          path: 's/chat',
          name: 'ia2.collabChat',
          component: workbench,
        },
        {
          path: 's/chat/:sessionId',
          name: 'ia2.collabSession',
          component: workbench,
        },
        {
          // matrix 房间画布（roomId 参数名与旧 comms 一致，深链免改）
          path: 's/room/:roomId',
          name: 'ia2.commsRoom',
          component: workbench,
        },
        {
          // 循环 → 运行画布（实时|历史）
          path: 'l/:loopId',
          name: 'ia2.loopCanvas',
          component: workbench,
        },
        {
          // 看板（工作页）
          path: 'board',
          name: 'ia2.board',
          component: () => import('./views/TasksView.vue'),
        },
        {
          // 编排（工程）：＋新循环入口
          path: 'eng',
          name: 'ia2.eng',
          component: () => import('./views/scenes/EngScene.vue'),
        },
        {
          // 全部运行（RunCenter 自带 runs|inbox tab）
          path: 'runs',
          name: 'ia2.runs',
          component: () => import('@/custom/loop/runcenter/views/RunCenterView.vue'),
        },
        {
          // 运行详情（参数名 runId 与旧路由一致）
          path: 'runs/:runId',
          name: 'ia2.runDetail',
          component: () => import('@/custom/loop/runcenter/views/RunDetailView.vue'),
        },
        {
          // hermes 会话历史 / 全局智能体（隐藏深链面，上游 PageSidebarNav 依赖）
          path: 'history',
          name: 'ia2.collabHistory',
          component: () => import('@/views/hermes/HistoryView.vue'),
        },
        {
          path: 'history/session/:sessionId',
          name: 'ia2.collabHistorySession',
          component: () => import('@/views/hermes/HistoryView.vue'),
        },
        {
          path: 'agent',
          name: 'ia2.collabGlobalAgent',
          component: () => import('@/views/hermes/GlobalAgentView.vue'),
        },
        {
          path: 'agent/session/:sessionId',
          name: 'ia2.collabGlobalAgentSession',
          component: () => import('@/views/hermes/GlobalAgentView.vue'),
        },
        ...legacy,
      ],
    },
  ]
}
