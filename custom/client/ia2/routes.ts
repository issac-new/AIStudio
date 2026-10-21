// overlay/custom/client/ia2/routes.ts
// 工作台路由树（/app/*）—— 2026-09-19 v12 统一视图重构：
// 双视图（沟通协作 /app 工作台 + IDE /ide 壳），六场景退役为单一「沟通协作」
// 三栏工作台（工作流导航 | 对象工作区 | 任务与决策）。旧直达链接迁移表：
//   /app/ops(/runs/:runId) → /app/runs(/:runId)；/app/tasks → /app/board；
//   /app/comms(/room/:roomId) → /app(/s/room/:roomId)；/app/collab/* → /app
//   （collab/session/:id → /app/s/chat/:id；history/global-agent 平移 /app/history、/app/agent）。
// 名称账本：ia2.overview / ia2.ops / ia2.tasks / ia2.comms 退役（白名单断言零残留）；
// ia2.collabSession 与 ia2.commsRoom 的参数名（sessionId/roomId）原样保留——
// cockpit 适配器与上游 GlobalPendingActions/KanbanTaskDrawer 的直达链接零改动。
// board/runs/eng 为工作页（不进场景条）：看板 / 全部运行 / 编排。
// 并入例外（2026-09-30 用户裁定·两批）：设置页 + 侧栏可达的 /hermes-* 功能页
// 全量并入（ANNEXED_LEGACY 同名替换上游记录，路径不变、上游按名跳零改动；
// hermes.browser 桌面桥条件注册不并入）。组件统一 IaLegacyShell：页头+注意力
// 条+IaSettingsSidebar（原三侧栏功能面并集）+ 内容区——双栏根治。
//
// 纪律：本文件只产纯路由描述和区域元数据，可被 router.resolve 级测试直接消费，
// 不触发任何懒组件加载。壳层 meta.fullscreen: true。
import type { RouteLocationNormalized, RouteLocationRaw, RouteRecordRaw } from 'vue-router'
import { features } from '../../../config/features'
import { stageKeyForPath } from './stage-path'

/** 视图 key（场景条与区域投影的词表）—— D20：键名与阶段对齐（stage1-6），终结三中心时代字面 */
export type IaAreaKey = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'stage6'

export interface IaAreaMeta {
  key: IaAreaKey
  /** 路由名（视图首页） */
  name: string
  /** 视图路径 */
  path: string
  /** 场景条文案 i18n key */
  labelKey: string
}

/** 视图元数据（场景条 + 区域投影的单一事实源；labelKey 逐行指向 ia2.nav.stageN——
 *  §5.8-3 清偿，词条由 i18n-term-overrides 从 STAGE_META 派生注册） */
export const IA_AREAS: IaAreaMeta[] = [
  { key: 'stage1', name: 'ia2.stage1', path: '/app/stage/setup', labelKey: 'ia2.nav.stage1' },
  { key: 'stage2', name: 'ia2.stage2', path: '/app/stage/reqs', labelKey: 'ia2.nav.stage2' },
  { key: 'stage3', name: 'ia2.stage3', path: '/app/stage/design', labelKey: 'ia2.nav.stage3' },
  { key: 'stage4', name: 'ia2.stage4', path: '/app/stage/build', labelKey: 'ia2.nav.stage4' },
  { key: 'stage5', name: 'ia2.stage5', path: '/app/stage/accept', labelKey: 'ia2.nav.stage5' },
  { key: 'stage6', name: 'ia2.stage6', path: '/app/stage/govern', labelKey: 'ia2.nav.stage6' },
]

/**
 * 路径 → 当前视图 key。场景条高亮与 ia store 的唯一投影函数。
 * /app 家族按阶段投影（stage1-6）；非 /app 路径返回 null（IDE 侧）。
 */
export function areaForPath(path: string): IaAreaKey | null {
  // 唯一实现=stage-path.ts；本函数只做类型适配，规则不得在此复制。
  return stageKeyForPath(path)
}

/** 旧直达链接迁移表（v12 §4：路径重定向；无名称记录，退役名零残留） */
export const IA_LEGACY_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: '/app/ops/runs/:runId', to: '/app/runs/:runId' },
  { from: '/app/ops', to: '/app/runs' },
  { from: '/app/tasks', to: '/app/board' },
  { from: '/app/comms/room/:roomId', to: '/app/s/room/:roomId' },
  { from: '/app/comms', to: '/app' },
  { from: '/app/collab/chat', to: '/app/s/chat' },
  { from: '/app/collab/history/session/:sessionId', to: '/app/history/session/:sessionId' },
  { from: '/app/collab/history', to: '/app/history' },
  { from: '/app/collab/global-agent/session/:sessionId', to: '/app/agent/session/:sessionId' },
  { from: '/app/collab/global-agent', to: '/app/agent' },
]

/**
 * 并入页记录表（2026-09-30 双栏根治）：同名替换上游 /hermes-* 家族 + 设置页，
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
  // 设置页（路径沿用并入批已迁的 /app/settings；旧路径重定向见树尾记录）
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
  // 群聊（GroupChatView 兜底直达链接族；自带房间列是该页核心导航，不隐）
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
  // 旧版看板（横向八列、无滚动容器）与主界面看板重复；2026-10-20 收敛为
  // 重定向，保留 hermes.kanban 名称供上游按名跳转，深链不再落到重复页。
  { path: '/hermes/kanban', name: 'hermes.kanban', redirect: to => ({ path: '/app/board', query: to.query }) },
  // 旧旅程页与 /app 流程总览重复，保留路由名供上游深链改道。
  { path: '/hermes/journey', name: 'hermes.journey', redirect: () => ({ name: 'ia2.journey' }) },
  // 系统域（原 AppSidebar 系统组面）
  annex('/hermes/logs', 'hermes.logs'),
  annex('/hermes/usage', 'hermes.usage'),
  annex('/hermes/performance', 'hermes.performance', { superAdmin: true }),
  annex('/hermes/profiles', 'hermes.profiles', { superAdmin: true }),
  annex('/hermes/theme', 'hermes.theme'),
  annex('/hermes/petdex', 'hermes.petdex'),
  annex('/hermes/skills-usage', 'hermes.skillsUsage'),
  // Web 终端并入（2026-10-01 上游自用批 A1）：上游路由与 superadmin 门控本就
  // 在线（terminal/mobile-terminal 双 WS），此前零导航入口；并入进壳同域管理
  annex('/hermes/terminal', 'hermes.terminal', { superAdmin: true }),
  annex('/hermes/version-preview', 'hermes.versionPreview', { superAdmin: true }),
]

/** 旧推演深链归一（2026-10-21 IA 收口）：
 *  /app/sim?tab=orchestration|settings 是六签时代的本页页签地址；
 *  现为独立专区页，渲染前重定向到唯一 URL，保留 run/from 上下文。
 *  其余 ?tab= 原样放行（四签不使用 tab query）。 */
export function simLegacyTabGuard(to: RouteLocationNormalized) {
  const raw = Array.isArray(to.query.tab) ? to.query.tab[0] : to.query.tab
  if (raw !== 'orchestration' && raw !== 'settings') return true
  const query: Record<string, string> = {}
  for (const key of ['run', 'from'] as const) {
    const v = to.query[key]
    if (typeof v === 'string' && v) query[key] = v
  }
  return {
    name: raw === 'orchestration' ? 'ia2.simOrchestration' : 'ia2.simSettings',
    ...(Object.keys(query).length ? { query } : {}),
  }
}

/** 上游 catch-all 的路径原值（vue-router 记录 path 不做参数归一）。
 *  2026-10-21 诚实 404：未知路径先被上游 `/:pathMatch(.*)*` 静默送回 /app，
 *  全局守卫据此识别「补的是兜底记录」而非「已知旧链接重定向」。 */
export const UPSTREAM_CATCH_ALL_PATH = '/:pathMatch(.*)*'

/**
 * 诚实 404 守卫（需在 bootstrap/registerIa2 阶段挂到上游 router）：
 * - 只认上游 catch-all 产生的重定向：to.redirectedFrom.matched 含兜底记录；
 * - 已知 redirect（/hermes/kanban、/app/gov/*、/app/runs/* 等）的 matched 是
 *   各自记录，不会误判；
 * - 目标已是 notFound 时直接放行，避免二次改写形成环。
 */
export function ia2NotFoundGuard(
  to: RouteLocationNormalized,
): true | RouteLocationRaw {
  if (to.name === 'ia2.notFound') return true
  const from = to.redirectedFrom
  if (!from) return true
  const caughtByUpstream = from.matched.some(record => record.path === UPSTREAM_CATCH_ALL_PATH)
  if (!caughtByUpstream) return true
  return { name: 'ia2.notFound', query: { from: from.fullPath } }
}

/** 构造 /app 路由树（每次调用返回新对象，调用方负责 addRoute） */
export function buildIaRoutes(): RouteRecordRaw[] {
  const workbench = () => import('./views/WorkbenchView.vue')
  // 全流程推演专区壳（B1）：四签兄弟路由共用同一懒组件；编排/设置为独立页
  const simShell = () => import('./views/sim/SimCenterView.vue')
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
          // D18 旅程式重构（2026-10-17 用户裁定，设计正本 §5.1）：/app 默认=旅程页，
          // 按 0→1 时序呈现五搭建步骤+五交付阶段；①搭建阶段页在 stage/setup，
          // 顶栏①入口落它。旧 /app/journey 书签经重定向可达，零断链。
          path: '',
          name: 'ia2.journey',
          component: () => import('./views/journey/JourneyView.vue'),
        },
        { path: 'journey', redirect: () => ({ name: 'ia2.journey' }) },
        {
          // 诚实 404（2026-10-21 战线A）：未知路径不再被上游 catch-all 静默送回首页；
          // 全局守卫 ia2NotFoundGuard 把兜底重定向改写到本页，保留原始 from 路径。
          path: 'not-found',
          name: 'ia2.notFound',
          component: () => import('./views/NotFoundView.vue'),
        },
        {
          // 全站检索（2026-10-18 左侧栏批）：会话/任务/运行/文档/人员五类对象，
          // 支持工作区/状态/负责人/时间过滤；顶栏快搜回车也落这里。
          path: 'search',
          name: 'ia2.search',
          component: () => import('./views/SearchView.vue'),
        },
        {
          path: 'stage/setup',
          name: 'ia2.stage1',
          component: () => import('./views/stage/StageShell.vue'),
          props: { stage: 1 },
        },
        { path: 'stage/reqs', name: 'ia2.stage2', component: () => import('./views/stage/StageShell.vue'), props: { stage: 2 } },
        { path: 'stage/design', name: 'ia2.stage3', component: () => import('./views/stage/StageShell.vue'), props: { stage: 3 } },
        { path: 'stage/build', name: 'ia2.stage4', component: () => import('./views/stage/StageShell.vue'), props: { stage: 4 } },
        { path: 'stage/accept', name: 'ia2.stage5', component: () => import('./views/stage/StageShell.vue'), props: { stage: 5 } },
        { path: 'stage/govern', name: 'ia2.stage6', component: () => import('./views/stage/StageShell.vue'), props: { stage: 6 } },
        {
          path: 'collab',
          name: 'ia2.collab',
          component: workbench,
          // 原生工作台三栏内嵌 GroupChatView/ChatView：标记嵌入态，避免上游视图
          // 把父路由替换成 hermes.groupChatRoom（2026-10-19 全页走查实证）。
          meta: { standaloneEmbed: true },
        },
        {
          // P5 工作台概览（我的待办/评审闸口/交付进度）：显式路由，
          // 不占对象选择轴（ia2.collab 的 auto-select 语义不动）
          path: 'dash',
          name: 'ia2.dash',
          component: workbench,
          meta: { standaloneEmbed: true },
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
          // matrix 房间画布（roomId 参数名与旧 comms 一致，直达链接免改）
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
          // /app/l 画布入口退役——本路由降为兼容重定向（旧直达链接/name 落运行列表，
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
          // 2026-10-18 阶段页页签批：治理中心壳解体，七签按用途归入六阶段页签。
          // 旧路径全部保留为 redirect（书签/通知/测试直达链接零断链）；
          // 页面由 StageShell 承载，顶栏/左侧栏不再出现「治理中心」。
          path: 'gov',
          name: 'ia2.governance',
          redirect: to => ({ name: 'ia2.stage6', query: { ...to.query, tab: 'gateLog' } }),
        },
        {
          path: 'gov/org-assets',
          name: 'ia2.govOrgAssets',
          redirect: to => ({ name: 'ia2.stage1', query: { ...to.query, tab: 'org' } }),
        },
        {
          path: 'gov/clearance',
          name: 'ia2.govClearance',
          redirect: to => ({ name: 'ia2.stage6', query: { ...to.query, tab: 'clearance' } }),
        },
        {
          path: 'gov/issues',
          name: 'ia2.govIssues',
          redirect: to => ({ name: 'ia2.stage6', query: { ...to.query, tab: 'issues' } }),
        },
        {
          path: 'gov/audit',
          name: 'ia2.govAudit',
          redirect: to => ({ name: 'ia2.stage6', query: { ...to.query, tab: 'audit' } }),
        },
        {
          path: 'gov/docs',
          name: 'ia2.govDocs',
          redirect: to => ({ name: 'ia2.stage6', query: { ...to.query, tab: 'docs' } }),
        },
        {
          path: 'gov/metrics',
          name: 'ia2.govMetrics',
          redirect: to => ({ name: 'ia2.stage6', query: { ...to.query, tab: 'metrics' } }),
        },
        {
          // C9 治理·系统设置页（R9：既有设置页按治理域分区的导航层，E/F/G 合账）
          path: 'gov/settings',
          name: 'ia2.govSettings',
          component: () => import('./views/gov/GovSettingsView.vue'),
        },
        {
          // 独立整页收敛到①搭建页签，避免团队管理出现双 URL 双入口。
          path: 'teams',
          name: 'ia2.teams',
          redirect: to => ({ name: 'ia2.stage1', query: { ...to.query, tab: 'teams' } }),
        },
        {
          // 独立整页收敛到①搭建页签。
          path: 'agents',
          name: 'ia2.agents',
          redirect: to => ({ name: 'ia2.stage1', query: { ...to.query, tab: 'agents' } }),
        },
        {
          // D20 模型服务商统一入口（治理·系统设置 资产域）：IDE 引擎模型目录
          // 的组织级平铺面（与 IDE 弹窗同源端点，合并铁律不复制表单逻辑）。
          path: 'gov/model-providers',
          name: 'ia2.modelProviders',
          component: () => import('./views/gov/GovModelProvidersView.vue'),
        },
        {
          // 独立整页收敛到①搭建·账户管理签。
          path: 'accounts',
          name: 'ia2.accounts',
          redirect: to => ({ name: 'ia2.stage1', query: { ...to.query, tab: 'accounts' } }),
        },
        {
          // B9（2026-10-16）：/app/eng 重定向编排挂面新家 /app/sim/orchestration
          // （OrchestrateView 整件迁入，A8+D9）；旧链保留一个版本周期后移除本记录。
          // V5 旧语义（重定向交付案例）由新家承接。
          path: 'eng',
          name: 'ia2.eng',
          redirect: () => ({ name: 'ia2.simOrchestration' }),
        },
        {
          // 交付案例（M2）：独立整页退役，保留旧名改道⑤验收·交付案例签。
          path: 'cases',
          name: 'ia2.deliveryCases',
          redirect: to => ({ name: 'ia2.stage5', query: { ...to.query, tab: 'cases' } }),
        },
        // ── 全流程推演专区（2026-10-18 推演区批，原「仿真中心」）──────────────
        // 四签单层页签共用 SimCenterView：运行总览（默认 /app/sim）/ 监督面板 /
        // 运行监控 / 证据库；运行编排与推演设置是专区级动作。
        // 交付健康/需求追溯已迁⑤验收阶段页，旧路由保留 redirect（深链零断链）。
        {
          path: 'sim',
          name: 'ia2.sim',
          component: simShell,
          beforeEnter: simLegacyTabGuard,
        },
        {
          path: 'sim/supervision',
          name: 'ia2.simSupervision',
          component: simShell,
        },
        {
          path: 'sim/ops',
          name: 'ia2.simOps',
          component: simShell,
        },
        {
          path: 'sim/evidence',
          name: 'ia2.simEvidence',
          component: simShell,
        },
        {
          // 导演运行详情（2026-10-21 战线A 按 run 类型分流）：导演 run 走图运行时
          // 详情（状态/节点步骤/人工闸/事件），不再静默改道 26 步面板。
          // 独立子路由而非 query 态：深链可分享、返回键行为正确。
          path: 'sim/director/:runId',
          name: 'ia2.simDirectorRun',
          component: () => import('./views/sim/DirectorRunDetail.vue'),
        },
        {
          path: 'sim/delivery',
          name: 'ia2.simDelivery',
          redirect: to => ({ name: 'ia2.stage5', query: { ...to.query, tab: 'delivery' } }),
        },
        {
          path: 'sim/trace',
          name: 'ia2.simTrace',
          redirect: to => ({ name: 'ia2.stage5', query: { ...to.query, tab: 'trace' } }),
        },
        {
          // B8 推演设置（E28 四区引擎参数页，独立页非第七签）
          path: 'sim/settings',
          name: 'ia2.simSettings',
          component: () => import('./views/sim/SimSettingsView.vue'),
        },
        {
          // B9 场景编排挂面（A8+D9，壳层挂面非第七签；OrchestrateView 整件迁入）
          path: 'sim/orchestration',
          name: 'ia2.simOrchestration',
          component: () => import('./views/sim/SimOrchestrationView.vue'),
        },
        {
          // 全部运行 → 全流程推演（B1，2026-10-16）：RunCenter 整页退役为重定向，
          // 保留一个版本周期（A13 升格=运行列表能力并入全流程推演后移除本记录）；
          // 按名跳的既有调用面（IaGlobalTop/SpotlightPanel 等）随
          // 重定向链落全流程推演，零改动。?tab=runs/?loop= 等 RunCenter 专属
          // query 无消费者（loop 预填随整页退役；vue-router redirect 会把
          // 原 query 并入目标 URL，落点路由不受影响）
          path: 'runs',
          name: 'ia2.runs',
          redirect: () => ({ path: '/app/sim' }),
        },
        {
          // 运行详情 → 全流程推演（B1，2026-10-16）：run 参数保留为轮次定位锚
          // （签 1 轮次总览消费；A13 升格同上——详情能力由轮次总览/锚点抽屉承接）。
          // path 式重定向（非 name 式）：vue-router 4.1.4+ 按名目标会并入原导航
          // params 触发 Discarded invalid param 告警，含参重定向走 path 拼接
          //（同上方 IA_LEGACY_REDIRECTS 先例）
          path: 'runs/:runId',
          name: 'ia2.runDetail',
          redirect: (loc: { params: Record<string, string | string[]> }) =>
            ({ path: '/app/sim', query: { run: String(loc.params.runId) } }),
        },
        {
          // hermes 会话历史 / 全局智能体（隐藏直达链接面，上游 PageSidebarNav 依赖）
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
    // ── 并入页（2026-09-30 用户裁定：双栏根治）──────────────────────────────
    // 「左边栏功能点开后右边又出现一个边栏」根因：侧栏可达的 /hermes-* 页仍活在
    // 上游 App.vue 布局（AppSidebar/HermesConfigSidebar 又挂一层）。并入=同名
    // addRoute 替换上游记录：路径/路由名不变（上游按名跳与直达链接零改动），组件
    // 统一 IaLegacyShell（IaGlobalTop + IaSettingsSidebar + 内容区），meta
    // fullscreen=true 压掉 App.vue 侧栏。权限语义保真：requiresSuperAdmin
    // 随迁。hermes.browser 不并入（上游桌面桥运行时条件注册，保持桌面专属）。
    ...ANNEXED_LEGACY,
    {
      // 旧直达链接兜底（并入配套）：/hermes/settings → /app/settings；
      // 函数式重定向保 query（?tab=display 等 SettingsView 页签直达链接不丢）。
      path: '/hermes/settings',
      redirect: to => ({ path: '/app/settings', query: to.query }),
    },
  ]
}
