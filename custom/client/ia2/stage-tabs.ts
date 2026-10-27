// overlay/custom/client/ia2/stage-tabs.ts
// 六阶段页签单一事实源（2026-10-18 阶段页页签批；2026-10-27 产品一致性
// Task 8 注册合一）：每个阶段只保留一层页签，页签的标签/组件装载/专属
// props/（仅⑥）展示分组全部登记在本表——StageShell 此前的 TAB_COMPONENTS/
// TAB_PROPS 两张映射表退役，消除「改页签要动三处」的三重登记。
// 组件装载统一为 load 懒加载 thunk（() => import(...)）：本模块仍不静态
// import 任何组件，装载只发生在 StageShell 消费时（defineAsyncComponent
// 包骨架/重试面），路由/面包屑/守门测试直接消费不触发组件树。
// 旧 /app/gov/* 路由不做删除：LEGACY_ROUTE_TAB 把旧路由名映射到「阶段 + 页签」，
// 深链照旧可达；页面本身由 StageShell 承载，不再有「治理中心」壳。
export type StageNo = 1 | 2 | 3 | 4 | 5 | 6

/** ⑥治理展示分组键（仅呈现聚类；键序/?tab= 深链语义不变） */
export type StageTabGroupKey = 'todo' | 'auditQuality' | 'improve'

export interface StageTabMeta {
  key: string
  zh: string
  en: string
  /** 稳定组件锚（StageShell 看板同源判定等机器用途；装载真身=load） */
  component: string
  /** 组件装载 thunk（一律懒加载；StageShell 包 defineAsyncComponent） */
  load: () => Promise<unknown>
  /** 页签专属 props（防串参：门禁 gates/系分 scope/⑥ proactivity 只读投影） */
  props?: Record<string, unknown>
  /** 展示分组（仅⑥治理 12 签登记；其他阶段不分组） */
  group?: StageTabGroupKey
}

export const STAGE_TABS: Readonly<Record<StageNo, readonly StageTabMeta[]>> = {
  1: [
    { key: 'steps', zh: '五步进度', en: 'Setup steps', component: 'setupSteps', load: () => import('./views/stage/StageSetupSteps.vue') },
    { key: 'org', zh: '组织', en: 'Organization', component: 'org', load: () => import('./components/gov/OrgEditor.vue') },
    { key: 'accounts', zh: '账号', en: 'Accounts', component: 'accounts', load: () => import('./views/AccountAdminView.vue') },
    { key: 'teams', zh: '团队', en: 'Teams', component: 'teams', load: () => import('./views/TeamsView.vue') },
    { key: 'assets', zh: '环境与资产', en: 'Environment & assets', component: 'assets', load: () => import('./views/stage/StageAssetsPanel.vue') },
    { key: 'agents', zh: '智能体', en: 'Agents', component: 'agents', load: () => import('./views/agents/AgentsView.vue') },
  ],
  2: [
    { key: 'reqs', zh: '需求与冻结', en: 'Requirements & freeze', component: 'requirements', load: () => import('./views/stage/StageRequirementsOverview.vue') },
    { key: 'docs', zh: '文档评审', en: 'Doc review', component: 'docs', load: () => import('./views/gov/GovDocsReviewView.vue') },
    { key: 'g1', zh: '质量门 G1', en: 'Gate G1', component: 'g1', props: { gates: ['G1'] }, load: () => import('./views/stage/StageGatePanel.vue') },
    { key: 'preflight', zh: '启动准备', en: 'Launch prep', component: 'preflight', load: () => import('./views/stage/StagePreflight.vue') },
  ],
  3: [
    { key: 'tasks', zh: '任务分解', en: 'Task breakdown', component: 'board', load: () => import('@custom/kanban/views/SwarmKanbanView.vue') },
    { key: 'analysis', zh: 'G2 系统分析', en: 'G2 system analysis', component: 'docs', props: { scope: 'g2' }, load: () => import('./views/gov/GovDocsReviewView.vue') },
    { key: 'g2', zh: '质量门 G2', en: 'Gate G2', component: 'g2', props: { gates: ['G2'] }, load: () => import('./views/stage/StageGatePanel.vue') },
    { key: 'schedule', zh: '排期', en: 'Schedule', component: 'schedule', load: () => import('./views/stage/StageSchedulePanel.vue') },
  ],
  4: [
    { key: 'today', zh: '今日工作', en: 'Today', component: 'today', load: () => import('./views/stage/StageDevToday.vue') },
    { key: 'board', zh: '看板', en: 'Board', component: 'board', load: () => import('@custom/kanban/views/SwarmKanbanView.vue') },
    { key: 'approvals', zh: '审批待办', en: 'Approvals', component: 'approvals', load: () => import('./views/stage/StageDevApprovals.vue') },
    { key: 'risk', zh: '风险与交接', en: 'Risks & handoff', component: 'risk', load: () => import('./views/stage/StageRiskPanel.vue') },
    { key: 'quality', zh: '质量与测试', en: 'Quality & test', component: 'quality', props: { gates: ['G3', 'G4'] }, load: () => import('./views/stage/StageGatePanel.vue') },
  ],
  5: [
    { key: 'overview', zh: '验收总览', en: 'Acceptance overview', component: 'acceptance', load: () => import('./views/stage/StageAcceptanceOverview.vue') },
    { key: 'trace', zh: '需求追溯', en: 'Traceability', component: 'trace', load: () => import('./views/stage/DailyTracePanel.vue') },
    { key: 'delivery', zh: '交付健康', en: 'Delivery health', component: 'delivery', load: () => import('./views/stage/DailyDeliveryPanel.vue') },
    { key: 'uat', zh: 'UAT 待判', en: 'UAT unjudged', component: 'uat', load: () => import('./views/stage/DailyUatPanel.vue') },
    { key: 'g5', zh: 'G5 审批', en: 'Gate G5', component: 'g5', load: () => import('./views/stage/DailyG5Panel.vue') },
    { key: 'cases', zh: '交付案例', en: 'Delivery cases', component: 'cases', load: () => import('@custom/matrix-teams/views/DeliveryCasesView.vue') },
  ],
  6: [
    // 键序=HEAD 基线原样（Task 8 硬底线：注册序不动）；group 只标展示分组，
    // 页签条呈现按 stageTabGroups 按 key 聚类（组内序=注册序）。
    { key: 'clearance', zh: '遗留项清算', en: 'Open items', component: 'clearance', group: 'todo', load: () => import('./views/gov/ClearancePanel.vue') },
    { key: 'issues', zh: '问题清单', en: 'Issues', component: 'issues', group: 'todo', load: () => import('./views/gov/GovIssuesPanel.vue') },
    // 2026-10-21 AGT 吸收轮：治理姿态对账 + 审计链防篡改 + MCP 漂移 + 紧急停止
    { key: 'posture', zh: '治理姿态', en: 'Governance posture', component: 'posture', group: 'auditQuality', load: () => import('./views/gov/GovPostureView.vue') },
    // 2026-10-21 Cloudflare security-audit-skill 吸收轮：覆盖账本/三态裁决/独立复核
    { key: 'secAudit', zh: '安全审计', en: 'Security audit', component: 'secAudit', group: 'auditQuality', load: () => import('./views/gov/SecAuditPanel.vue') },
    { key: 'audit', zh: '审计与变更', en: 'Audit & changes', component: 'audit', group: 'auditQuality', load: () => import('./views/gov/GovAuditChangeView.vue') },
    // 2026-10-22 长程任务可信批：主张三态审计、双准入、完整性栅栏、断点核对
    { key: 'trust', zh: '长程可信', en: 'Long-horizon trust', component: 'trust', group: 'auditQuality', load: () => import('./views/gov/LongHorizonTrustPanel.vue') },
    // 2026-10-19 评审治理批：风险分档/收敛规则/度量熔断（Anthropic Code Review 文章吸收）
    { key: 'reviewGov', zh: '评审治理', en: 'Review governance', component: 'reviewGov', group: 'auditQuality', load: () => import('./views/gov/ReviewGovPanel.vue') },
    // 2026-10-19 Harness² 调研轮：提案-探测-组合-晋级-回滚的改进闭环
    { key: 'improve', zh: '改进实验', en: 'Improvement experiments', component: 'improve', group: 'improve', load: () => import('./views/gov/HarnessImprovePanel.vue') },
    { key: 'metrics', zh: '度量检查', en: 'Metrics', component: 'metrics', group: 'improve', load: () => import('./views/stage/StageMetricsPanel.vue') },
    { key: 'docs', zh: '文档评审', en: 'Doc review', component: 'docs', group: 'auditQuality', load: () => import('./views/gov/GovDocsReviewView.vue') },
    { key: 'gateLog', zh: '质量门记录', en: 'Gate records', component: 'gateLog', group: 'auditQuality', load: () => import('./views/stage/StageGatePanel.vue') },
    // 2026-10-26 Qoder 主动性吸收轮·加挂微轮：两轴裁决/执法策略/目标对齐（组件同①搭建→环境与资产；
    // ⑥为只读投影：只看执行结果/漂移状态，编辑深链回①搭建·环境与资产）
    { key: 'proactivity', zh: '主动性两轴', en: 'Proactivity two-axis', component: 'proactivity', group: 'improve', props: { readonly: true }, load: () => import('@custom/governance/components/ProactivitySection.vue') },
  ],
}

/** ⑥治理展示分组标签（zh/en 成对；仅 StageShell 页签条呈现用） */
export const STAGE_TAB_GROUP_LABELS: Readonly<Record<StageTabGroupKey, { zh: string; en: string }>> = {
  todo: { zh: '待处理', en: 'To resolve' },
  auditQuality: { zh: '审计与质量', en: 'Audit & quality' },
  improve: { zh: '改进与度量', en: 'Improve & metrics' },
}

/** ⑥展示分组渲染序（组间序；组内序=注册序） */
const STAGE_TAB_GROUP_ORDER: readonly StageTabGroupKey[] = ['todo', 'auditQuality', 'improve']

/**
 * 页签条展示聚类：⑥治理按三组聚类（按 group 键跨注册交错收集，组内序=
 * 注册序），其他阶段单簇无分组。仅呈现层分组——STAGE_TABS 键序、resolveTab
 * 深链、DEFAULT_TAB 落点不变。
 */
export function stageTabGroups(
  stage: StageNo,
): ReadonlyArray<{ group: StageTabGroupKey | null; tabs: readonly StageTabMeta[] }> {
  const tabs = STAGE_TABS[stage]
  if (stage !== 6) return [{ group: null, tabs }]
  return STAGE_TAB_GROUP_ORDER.map(group => ({
    group,
    tabs: tabs.filter(t => (t.group ?? 'todo') === group),
  }))
}

export const DEFAULT_TAB: Readonly<Record<StageNo, string>> = {
  1: 'steps', 2: 'reqs', 3: 'tasks', 4: 'today', 5: 'overview', 6: 'clearance',
}

/** 旧路径 → 阶段 + 页签（深链迁移表；路由本身保留为 redirect） */
export const LEGACY_ROUTE_TAB: Readonly<Record<string, { stage: StageNo; tab: string }>> = {
  'ia2.governance': { stage: 6, tab: 'gateLog' },
  'ia2.govOrgAssets': { stage: 1, tab: 'org' },
  'ia2.govClearance': { stage: 6, tab: 'clearance' },
  'ia2.govIssues': { stage: 6, tab: 'issues' },
  'ia2.govAudit': { stage: 6, tab: 'audit' },
  'ia2.govDocs': { stage: 6, tab: 'docs' },
  'ia2.govMetrics': { stage: 6, tab: 'metrics' },
  'ia2.accounts': { stage: 1, tab: 'accounts' },
  'ia2.teams': { stage: 1, tab: 'teams' },
  'ia2.agents': { stage: 1, tab: 'agents' },
  'ia2.deliveryCases': { stage: 5, tab: 'cases' },
  'ia2.simDelivery': { stage: 5, tab: 'delivery' },
  'ia2.simTrace': { stage: 5, tab: 'trace' },
}

export function tabForLegacyRoute(name: string): { stage: StageNo; tab: string } | null {
  return LEGACY_ROUTE_TAB[name] ?? null
}

/** 当前阶段页的合法页签键（未知值回退默认签；供 StageShell 与守门测试用） */
export function resolveTab(stage: StageNo, raw: unknown): string {
  const key = String(Array.isArray(raw) ? raw[0] : raw ?? '')
  // ②旧深链 ?tab=launch 已无对应页签：回退启动准备，而不是静默落到需求页。
  if (stage === 2 && key === 'launch') return 'preflight'
  return STAGE_TABS[stage].some(t => t.key === key) ? key : DEFAULT_TAB[stage]
}

export function tabMeta(stage: StageNo, key: string): StageTabMeta | null {
  return STAGE_TABS[stage].find(t => t.key === key) ?? null
}
