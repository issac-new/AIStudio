// overlay/custom/client/ia2/stage-attribution.ts
// 工具页 → 阶段归属单一事实源（2026-10-17 层级批第二阶段）：
// 顶栏高亮（nav-centers.centerKeysForPath / routes.areaForPath）与面包屑归属圈
// 三处同源消费。此前两处各自硬编码（早先 sim→②/gov→③，本轮改判 sim→④/gov→⑥），
// 都是中心级粗粒度——坐在「需求追溯」（⑤验收工具）页上顶栏亮④、坐在「组织与
// 资产」（①搭建工具）页上亮⑥，用户实报「层次乱、不知道自己在哪」。本表把归属
// 收细到页签：每个工具页按用途时段定所属阶段，多归属如实列多阶段。
//
// 归属依据=工具的用途时段，不按首个链接者定：stage-meta 的 tools 表达的是
// 「阶段页可见性」（①搭建页也挂运行监控做环境体检），不是归属。两者关系由
// 守门测试限定为「每个工具卡目标必须在表中有条目」——阶段页挂得出、顶栏指得准，
// 两件事分开记账，互不绑架。
//
// 与 query.from 来路上下文的分工（nav-centers.stageKeyFromQuery，D20 起在用）：
// 从阶段页工具卡进入带 from，顶栏从来路——答「我从哪一站来」；无 from 的入口
// （Spotlight 搜索/直达链接/弹窗/分享 URL）回落本表——答「这工具归哪几站」。
// 两机制并存不互斥：from 是用户视角的临时上下文，本表是工具固有属性。
import { STAGE_META, SETUP_STEPS } from './stage-meta'

export type StageNo = 1 | 2 | 3 | 4 | 5 | 6

/** 阶段序号 → 顶栏导航键（与 nav-centers.CenterKey 同形，避免互相 import 成环） */
export function stageKeyOf(no: StageNo): 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'stage6' {
  return `stage${no}` as ReturnType<typeof stageKeyOf>
}

/** 圆圈序号（面包屑/页签 chip 用；与 nav-centers.CIRCLED 同序） */
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'] as const
export function stageCircles(nos: readonly StageNo[]): string {
  return nos.map(n => CIRCLED[n - 1]).join('')
}

/**
 * 路由名 → 所属阶段。空数组=全程工具（一轮运行的设置/总览类，不隶属单一阶段，
 * 顶栏不高亮——如实呈现「到处都要用」而非硬指一站）。
 */
export const STAGE_ATTRIBUTION: Readonly<Record<string, readonly StageNo[]>> = {
  // ── 仿真中心六签（按各签用途时段）──
  'ia2.sim': [], // 运行总览：一轮全程总览屏
  'ia2.simSupervision': [3, 4], // 监督面板：分析期态势研判+运行期值班盯盘
  'ia2.simOps': [1, 4], // 运行监控：搭建期环境体检+开发期日常排障
  'ia2.simEvidence': [4, 5], // 证据库：开发期锚点反查+验收期审计取证
  'ia2.simDelivery': [5], // 交付健康：验收期分支与交付物核对
  'ia2.simTrace': [5], // 需求追溯：验收期 AC 判定对账
  'ia2.simOrchestration': [2, 4], // 场景编排：需求期选模式启动+开发期断点续跑
  'ia2.simSettings': [], // 推演设置：引擎参数，跨阶段
  // ── 治理中心七签 ──
  'ia2.governance': [2, 3], // 质量门与流程：G1 需求冻结+G2 架构评审的守门记录
  'ia2.govOrgAssets': [1], // 组织与资产：搭建期家底
  'ia2.govClearance': [6], // 遗留项清算：治理期开新轮前清零
  'ia2.govIssues': [6], // 问题清单对账：治理期复盘
  'ia2.govAudit': [5, 6], // 审计与变更：验收期过审计+治理期变更管控
  'ia2.govDocs': [2, 5], // 文档评审：需求期文档入库+验收期 14 件核对
  'ia2.govMetrics': [6], // 度量检查：治理期复盘
  'ia2.govSettings': [], // 系统设置：平台配置
  'ia2.modelProviders': [], // 模型服务商：资产配置，跨阶段
  // ── 工作页 ──
  'ia2.board': [3, 4], // 看板：分析设计期任务分解+开发期日常协同
  'ia2.inbox': [4, 5], // 审批收件箱：开发期人工介入+验收期 G5 批准
  'ia2.collab': [4], // 工作台：开发期日常协调
  'ide.shell': [4], // IDE 工作区：开发阶段生产位（非 ia2 前缀，独立壳路由）
  'ia2.dash': [], // 驾驶舱概览：个人三卡，跨阶段
  'ia2.teams': [1], // 团队管理：搭建期协调关系
  'ia2.agents': [1], // 智能体工作台：搭建期编制
  'ia2.accounts': [1], // 账户管理：搭建期建号
  'ia2.deliveryCases': [5], // 交付案例：验收期交付投影
  // ── 阶段页自身（恒等归属，供路径解析与守门测试覆盖）──
  'ia2.stage1': [1], 'ia2.stage2': [2], 'ia2.stage3': [3],
  'ia2.stage4': [4], 'ia2.stage5': [5], 'ia2.stage6': [6],
  // ── 专题工作台（BPA/本体/评测/技能治理）：跨阶段专题工具 ──
  'ia2.bpa': [], 'ia2.ontology': [], 'ia2.eval': [], 'ia2.skillgov': [],
}

/**
 * 路径 → 路由名（最长前缀优先，段边界匹配：/app/simulation 不误判仿真中心）。
 * 只收 /app 家族里归属表涉及的页面；重定向路由按落点归属（/app/eng、/app/runs）。
 */
const PATH_TO_ROUTE: ReadonlyArray<readonly [string, string]> = [
  ['/app/sim/orchestration', 'ia2.simOrchestration'],
  ['/app/sim/settings', 'ia2.simSettings'],
  ['/app/sim/supervision', 'ia2.simSupervision'],
  ['/app/sim/ops', 'ia2.simOps'],
  ['/app/sim/evidence', 'ia2.simEvidence'],
  ['/app/sim/delivery', 'ia2.simDelivery'],
  ['/app/sim/trace', 'ia2.simTrace'],
  ['/app/sim', 'ia2.sim'],
  ['/app/gov/model-providers', 'ia2.modelProviders'],
  ['/app/gov/org-assets', 'ia2.govOrgAssets'],
  ['/app/gov/clearance', 'ia2.govClearance'],
  ['/app/gov/issues', 'ia2.govIssues'],
  ['/app/gov/audit', 'ia2.govAudit'],
  ['/app/gov/docs', 'ia2.govDocs'],
  ['/app/gov/metrics', 'ia2.govMetrics'],
  ['/app/gov/settings', 'ia2.govSettings'],
  ['/app/gov', 'ia2.governance'],
  ['/app/stage/setup', 'ia2.stage1'],
  ['/app/stage/reqs', 'ia2.stage2'],
  ['/app/stage/design', 'ia2.stage3'],
  ['/app/stage/build', 'ia2.stage4'],
  ['/app/stage/accept', 'ia2.stage5'],
  ['/app/stage/govern', 'ia2.stage6'],
  ['/app/board', 'ia2.board'],
  ['/app/inbox', 'ia2.inbox'],
  ['/app/collab', 'ia2.collab'],
  ['/app/ide', 'ide.shell'],
  ['/app/dash', 'ia2.dash'],
  ['/app/teams', 'ia2.teams'],
  ['/app/agents', 'ia2.agents'],
  ['/app/accounts', 'ia2.accounts'],
  ['/app/cases', 'ia2.deliveryCases'],
  // 重定向路由：路径即旧入口，归属按落点页（/app/runs/:id 同规则）
  ['/app/eng', 'ia2.simOrchestration'],
  ['/app/runs', 'ia2.sim'],
  // 专题工作台（跨阶段，登记为“全程”而非缺失）
  ['/app/bpa', 'ia2.bpa'],
  ['/app/ontology', 'ia2.ontology'],
  ['/app/eval', 'ia2.eval'],
  ['/app/skillgov', 'ia2.skillgov'],
]

export function routeNameForPath(path: string): string | null {
  for (const [prefix, name] of PATH_TO_ROUTE) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return name
  }
  return null
}

/** 路由名 → 所属阶段（未登记=空数组，调用方按「未登记」与「全程工具」分别处置） */
export function stageOwnersForRouteName(name: string): StageNo[] {
  return [...(STAGE_ATTRIBUTION[name] ?? [])]
}

/** 路径 → 所属阶段（表外路径=空数组） */
export function stageOwnersForPath(path: string): StageNo[] {
  const name = routeNameForPath(path)
  return name ? stageOwnersForRouteName(name) : []
}

/** 表内登记的全部路由名（守门测试消费） */
export function attributedRouteNames(): string[] {
  return Object.keys(STAGE_ATTRIBUTION)
}

/** 路由名是否已登记（用于区分「全程工具」与「未登记页面」） */
export function hasStageAttribution(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(STAGE_ATTRIBUTION, name)
}

/** 表内登记的全部路径前缀（守门测试消费） */
export function attributedPathPrefixes(): string[] {
  return PATH_TO_ROUTE.map(([p]) => p)
}

/**
 * 阶段页挂出的全部工具卡目标（stage-meta 单一事实源正向投影）：
 * 守门测试用它断言「阶段页挂得出去的每个目标，归属表里都有条目」——
 * 阶段页可见性与工具归属两本题，账目不混。
 */
export function stageToolTargetPaths(): string[] {
  const paths: string[][] = STAGE_META.map(s => s.tools.map(t => t.to))
  return paths.flat()
}

export function setupStepTargetNames(): string[] {
  return SETUP_STEPS.map(s => {
    const t = s.target as { name?: string }
    return t.name ?? ''
  }).filter(Boolean)
}
