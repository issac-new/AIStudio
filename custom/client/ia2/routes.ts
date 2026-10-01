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
// 收编例外（2026-09-30 用户裁定·两批）：设置页 + 侧栏可达的 /hermes-* 功能页
// 全量收编（ANNEXED_LEGACY 同名替换上游记录，路径不变、上游按名跳零改动；
// hermes.browser 桌面桥条件注册不收编）。组件统一 IaLegacyShell：页头+注意力
// 条+IaSettingsSidebar（原三侧栏功能面并集）+ 内容区——双栏根治。
//
// 纪律：本文件只产纯路由描述和区域元数据，可被 router.resolve 级测试直接消费，
// 不触发任何懒组件加载。壳层 meta.fullscreen: true。
import type { RouteRecordRaw } from 'vue-router'
import { features } from '../../../config/features'

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

/**
 * 收编页记录表（2026-09-30 双栏根治）：同名替换上游 /hermes-* 家族 + 设置页，
 * 组件统一 IaLegacyShell（视图装载表见其 VIEW_LOADERS，两者按路由名一一对应）。
 * 路径与上游逐字一致（deep link 兼容）；requiresSuperAdmin 随上游路由 meta 迁移。
 * embed=true 附加 standaloneEmbed（2026-09-30 五次反馈：模型/工作流/设备互联页
 * 自带的会话/列表侧栏也要隐）——ChatView 族走 v14 嵌入态机制（ChatPanel
 * standalone prop 隐会话列）；WorkflowView 经 patch 526 默认收起工作流列表
 * （头部既有开关可展开）。
 */
const annex = (path: string, name: string, opts: { superAdmin?: boolean; embed?: boolean } = {}): RouteRecordRaw => ({
  path,
  name,
  component: () => import('./views/IaLegacyShell.vue'),
  meta: {
    fullscreen: true,
    ...(opts.superAdmin ? { requiresSuperAdmin: true } : {}),
    ...(opts.embed ? { standaloneEmbed: true } : {}),
  },
})

export const ANNEXED_LEGACY: RouteRecordRaw[] = [
  // 设置页（路径沿用收编批已迁的 /app/settings；旧路径重定向见树尾记录）
  annex('/app/settings', 'hermes.settings'),
  // ChatView 族（standaloneEmbed 隐自带会话列；路径不变 → 页内按 path 分派行为不变）
  annex('/hermes/chat', 'hermes.chat', { embed: true }),
  annex('/hermes/session/:sessionId', 'hermes.session', { embed: true }),
  annex('/hermes/global-agent', 'hermes.globalAgent', { embed: true }),
  annex('/hermes/global-agent/session/:sessionId', 'hermes.globalAgentSession', { embed: true }),
  annex('/hermes/models', 'hermes.models', { embed: true }),
  annex('/hermes/connections', 'hermes.connections', { embed: true }),
  // agent 管理中心随 features.agentManager 门控（S3 既定语义补上消费方——此前
  // flag 定义零消费，中心对 superadmin 常开；关闭时上游同名路由仍在但侧栏不可达，
  // 属 UI 裁剪而非权限边界，真权限由上游 requiresSuperAdmin 把守）
  ...(features.agentManager
    ? [annex('/studio/agents', 'hermes.agentManager', { superAdmin: true, embed: true })]
    : []),
  // 群聊（GroupChatView 兜底深链族；自带房间列是该页核心导航，不隐）
  annex('/hermes/group-chat', 'hermes.groupChat'),
  annex('/hermes/group-chat/room/:roomId', 'hermes.groupChatRoom'),
  // 工具页（workflow 收起列表侧栏=patch 526；files 无侧栏）
  annex('/hermes/workflow', 'hermes.workflow', { embed: true }),
  annex('/hermes/files', 'hermes.files'),
  // 配置域（原 HermesConfigSidebar 面）
  annex('/hermes/skills', 'hermes.skills'),
  annex('/hermes/plugins', 'hermes.plugins'),
  annex('/hermes/mcp', 'hermes.mcp'),
  annex('/hermes/memory', 'hermes.memory'),
  annex('/hermes/channels', 'hermes.channels'),
  annex('/hermes/config/settings', 'hermes.configSettings'),
  annex('/hermes/jobs', 'hermes.jobs'),
  annex('/hermes/kanban', 'hermes.kanban'),
  annex('/hermes/journey', 'hermes.journey'),
  // 系统域（原 AppSidebar 系统组面）
  annex('/hermes/logs', 'hermes.logs'),
  annex('/hermes/usage', 'hermes.usage'),
  annex('/hermes/performance', 'hermes.performance', { superAdmin: true }),
  annex('/hermes/profiles', 'hermes.profiles', { superAdmin: true }),
  annex('/hermes/theme', 'hermes.theme'),
  annex('/hermes/petdex', 'hermes.petdex'),
  annex('/hermes/skills-usage', 'hermes.skillsUsage'),
  // Web 终端收编（2026-10-01 上游自用批 A1）：上游路由与 superadmin 门控本就
  // 在线（terminal/mobile-terminal 双 WS），此前零导航入口；收编进壳同域管理
  annex('/hermes/terminal', 'hermes.terminal', { superAdmin: true }),
  annex('/hermes/version-preview', 'hermes.versionPreview', { superAdmin: true }),
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
          // P5 驾驶舱概览（我的待办/评审闸口/交付进度）：显式路由，
          // 不占对象选择轴（ia2.collab 的 auto-select 语义不动）
          path: 'dash',
          name: 'ia2.dash',
          component: workbench,
        },
        {
          // hermes agent 会话画布（upstream ChatView 经路由参数绑定；新会话态）
          path: 's/chat',
          name: 'ia2.collabChat',
          component: workbench,
          // v14 统一聊天：嵌入态隐藏 ChatPanel 自带会话侧栏（standaloneEmbed
          // 是独立 key——App.vue 不消费，不连带砍六个全局弹层，见 v14 文档 §1.2）
          meta: { standaloneEmbed: true },
        },
        {
          path: 's/chat/:sessionId',
          name: 'ia2.collabSession',
          component: workbench,
          meta: { standaloneEmbed: true },
        },
        {
          // matrix 房间画布（roomId 参数名与旧 comms 一致，深链免改）
          path: 's/room/:roomId',
          name: 'ia2.commsRoom',
          component: workbench,
        },
        {
          // hermes 群聊画布（v12.3 R4b 三聊天合一：upstream GroupChatView 经
          // 路由参数绑定，自装载 connect/loadRooms/joinRoom；roomId 缺席时
          // GroupChatView 兜底跳上游群聊路由）
          path: 's/group/:roomId',
          name: 'ia2.groupRoom',
          component: workbench,
          // v14 统一聊天：嵌入态隐藏 GroupChatPanel 自带房间侧栏（左栏即唯一导航）
          meta: { standaloneEmbed: true },
        },
        {
          // V5 补遗⑤ M6（R-C1 用户裁决合一）：循环运行画布并入运行中心详情页，
          // /app/l 画布入口退役——本路由降为兼容重定向（旧深链/name 落运行列表，
          // 详情页内嵌 RunCanvas 承接实时画布能力）
          path: 'l/:loopId',
          name: 'ia2.loopCanvas',
          redirect: () => ({ name: 'ia2.runs' }),
        },
        {
          // 看板（工作页）
          path: 'board',
          name: 'ia2.board',
          component: () => import('./views/TasksView.vue'),
        },
        {
          // 审批收件箱（工作页，P1 §二 2026-09-28：待审聚合 + 审批历史）
          path: 'inbox',
          name: 'ia2.inbox',
          component: () => import('./views/InboxView.vue'),
        },
        {
          // 治理中心独立路由（2026-10-01 单层页签重构退役整页承载）：治理四分区
          // 升 /app/board 平级页签后，FlowNavPanel 入口与旧深链经重定向不死链
          // ——落治理首分区「组织与知识」。
          path: 'gov',
          name: 'ia2.governance',
          redirect: () => ({ name: 'ia2.board', query: { tab: 'gov-org' } }),
        },
        {
          // 账户管理（P6 补遗④）：matrix 系统管理员——建号/绑定/停用，roster 入仓
          path: 'accounts',
          name: 'ia2.accounts',
          component: () => import('./views/AccountAdminView.vue'),
        },
        {
          // V5 补遗⑤ S5：/app/eng 页退役（编排编辑器/Teams 管理推演不走 UI——循环
          // 脚本建、团队脚本装配、组织走治理中心 OrgEditor）；重定向交付案例，
          // loop 组件库保留（/app/l 详情内嵌与 /app/runs 依赖）
          path: 'eng',
          name: 'ia2.eng',
          redirect: () => ({ name: 'ia2.deliveryCases' }),
        },
        {
          // 交付案例（M2：delivery 协议事件投影，工程场景 tab 的深链直达）
          path: 'cases',
          name: 'ia2.deliveryCases',
          component: () => import('@/custom/matrix-teams/views/DeliveryCasesView.vue'),
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
    // ── 收编页（2026-09-30 用户裁定：双栏根治）──────────────────────────────
    // 「左边栏功能点开后右边又出现一个边栏」根因：侧栏可达的 /hermes-* 页仍活在
    // 上游 App.vue 布局（AppSidebar/HermesConfigSidebar 又挂一层）。收编=同名
    // addRoute 替换上游记录：路径/路由名不变（上游按名跳与深链零改动），组件
    // 统一 IaLegacyShell（IaGlobalTop + IaSettingsSidebar + 内容区），meta
    // fullscreen=true 压掉 App.vue 侧栏。权限语义保真：requiresSuperAdmin
    // 随迁。hermes.browser 不收编（上游桌面桥运行时条件注册，保持桌面专属）。
    ...ANNEXED_LEGACY,
    {
      // 旧深链兜底（收编配套）：/hermes/settings → /app/settings；
      // 函数式重定向保 query（?tab=display 等 SettingsView 页签深链不丢）。
      path: '/hermes/settings',
      redirect: to => ({ path: '/app/settings', query: to.query }),
    },
  ]
}
