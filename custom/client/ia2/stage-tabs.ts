// overlay/custom/client/ia2/stage-tabs.ts
// 六阶段页签单一事实源（2026-10-18 阶段页页签批）：
// 每个阶段只保留一层页签，页签直接挂可操作组件；标签 zh/en 成对，组件键由
// StageShell 的 TAB_COMPONENTS 映射（本模块不 import 组件，保持纯数据，可被
// 路由/面包屑/守门测试直接消费）。
// 旧 /app/gov/* 路由不做删除：LEGACY_ROUTE_TAB 把旧路由名映射到「阶段 + 页签」，
// 深链照旧可达；页面本身由 StageShell 承载，不再有「治理中心」壳。
export type StageNo = 1 | 2 | 3 | 4 | 5 | 6

export interface StageTabMeta {
  key: string
  zh: string
  en: string
  /** StageShell 内的组件键（TAB_COMPONENTS 一一对应） */
  component: string
}

export const STAGE_TABS: Readonly<Record<StageNo, readonly StageTabMeta[]>> = {
  1: [
    { key: 'steps', zh: '五步进度', en: 'Setup steps', component: 'setupSteps' },
    { key: 'org', zh: '组织', en: 'Organization', component: 'org' },
    { key: 'accounts', zh: '账号', en: 'Accounts', component: 'accounts' },
    { key: 'teams', zh: '团队', en: 'Teams', component: 'teams' },
    { key: 'assets', zh: '环境与资产', en: 'Environment & assets', component: 'assets' },
    { key: 'agents', zh: '智能体', en: 'Agents', component: 'agents' },
  ],
  2: [
    { key: 'reqs', zh: '需求与冻结', en: 'Requirements & freeze', component: 'requirements' },
    { key: 'docs', zh: '文档评审', en: 'Doc review', component: 'docs' },
    { key: 'g1', zh: '质量门 G1', en: 'Gate G1', component: 'g1' },
    { key: 'preflight', zh: '启动准备', en: 'Launch prep', component: 'preflight' },
  ],
  3: [
    { key: 'tasks', zh: '任务分解', en: 'Task breakdown', component: 'board' },
    { key: 'analysis', zh: '系统分析', en: 'System analysis', component: 'docs' },
    { key: 'g2', zh: '质量门 G2', en: 'Gate G2', component: 'g2' },
    { key: 'schedule', zh: '排期', en: 'Schedule', component: 'schedule' },
  ],
  4: [
    { key: 'today', zh: '今日工作', en: 'Today', component: 'today' },
    { key: 'board', zh: '看板', en: 'Board', component: 'board' },
    { key: 'approvals', zh: '审批待办', en: 'Approvals', component: 'approvals' },
    { key: 'risk', zh: '风险与交接', en: 'Risks & handoff', component: 'risk' },
    { key: 'quality', zh: '质量与测试', en: 'Quality & test', component: 'quality' },
  ],
  5: [
    { key: 'overview', zh: '验收总览', en: 'Acceptance overview', component: 'acceptance' },
    { key: 'trace', zh: '需求追溯', en: 'Traceability', component: 'trace' },
    { key: 'delivery', zh: '交付健康', en: 'Delivery health', component: 'delivery' },
    { key: 'uat', zh: 'UAT 判定', en: 'UAT verdicts', component: 'uat' },
    { key: 'g5', zh: 'G5 审批', en: 'Gate G5', component: 'g5' },
    { key: 'cases', zh: '交付案例', en: 'Delivery cases', component: 'cases' },
  ],
  6: [
    { key: 'clearance', zh: '遗留项清算', en: 'Open items', component: 'clearance' },
    { key: 'issues', zh: '问题清单', en: 'Issues', component: 'issues' },
    { key: 'audit', zh: '审计与变更', en: 'Audit & changes', component: 'audit' },
    { key: 'metrics', zh: '度量检查', en: 'Metrics', component: 'metrics' },
    { key: 'docs', zh: '文档评审', en: 'Doc review', component: 'docs' },
    { key: 'gateLog', zh: '质量门记录', en: 'Gate records', component: 'gateLog' },
  ],
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
  return STAGE_TABS[stage].some(t => t.key === key) ? key : DEFAULT_TAB[stage]
}

export function tabMeta(stage: StageNo, key: string): StageTabMeta | null {
  return STAGE_TABS[stage].find(t => t.key === key) ?? null
}
