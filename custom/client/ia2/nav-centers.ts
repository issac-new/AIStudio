// overlay/custom/client/ia2/nav-centers.ts
// 一级导航（D13 六阶段 → D18 旅程式重构，2026-10-17 设计正本 §5.0）：
// 标签单一事实源=stage-meta.ts 的 STAGE_META（六阶段定义），本模块只做
// 导航键/路径映射与高亮判定，不各自定义文案——终结三处各自定义的双轨形态。
// 2026-10-23 最近轨迹批：常用组/推演组静态定义自 IaSideNav 迁入（见下
// COMMON_NAVS/SIM_NAVS），供侧栏渲染与轨迹标题解析共用同一文案源。
// 需求锚 R8（导航按关注面归位）修订为旅程式归位（设计正本 §二 J2）。
// 路由纪律：全部消费既有路由记录（ia2.stage1-6 与岛屿各名），本模块不注册
// 不改动路由。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { STAGE_META } from './stage-meta'
import { hasStageAttribution, stageKeyOf, stageOwnersForRouteName } from './stage-attribution'
import { stageKeyForPath, type StageKey } from './stage-path'

export type CenterKey = StageKey

export interface CenterNavMeta {
  key: CenterKey
  /** 既有路由名（vue-router push 按名跳；不新增路由） */
  name: string
  /** 中心首页路径（centerForPath 判定词表的正例锚） */
  path: string
  labelZh: string
  labelEn: string
}

/** 六阶段入口（顺序即顶栏渲染序；文案由 STAGE_META 派生，序号=阶段标记） */
// D13 时序六阶段（2026-10-17 用户裁定：全部前端功能按使用时序重组，非加导航）：
// 搭建→需求→分析设计→开发→验收→治理；功能归属按推演方案 26 步/七幕映射，
// 三中心数据页降为各阶段内的工具舱（路由全保留）。
// D20：键名与阶段对齐（stage1-6，设计正本 §5.8 第 4 条清偿）——
// 联动 routes.ts IaAreaKey / ia store / IaCentersNav / 守门测试同批改。
const STAGE_CENTER_KEYS = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6'] as const
const STAGE_PATHS = [
  '/app/stage/setup', '/app/stage/reqs', '/app/stage/design',
  '/app/stage/build', '/app/stage/accept', '/app/stage/govern',
] as const
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'] as const

export const CENTER_NAVS: readonly CenterNavMeta[] = STAGE_META.map((s, i) => ({
  key: STAGE_CENTER_KEYS[i],
  name: `ia2.stage${s.no}`,
  path: STAGE_PATHS[i],
  labelZh: `${CIRCLED[i]}${s.navLabel}`,
  labelEn: s.navLabelEn,
}))

/**
 * 路径 → 当前阶段 key（高亮判定纯函数）。唯一规则在 stage-path.ts，
 * 本函数只做 nav-centers 的类型适配；/app/sim* 返回 null（独立导航域），
 * 非 /app 家族（IDE 侧 / 上游壳页）返回 null。
 */
export function centerForPath(path: string): CenterKey | null {
  return stageKeyForPath(path)
}

/**
 * 来源阶段上下文（query.from）：从旅程页/阶段页进入中心页或末端页时带上
 * 「我从哪个阶段来」。同一页面可在不同阶段语境下服务不同阶段（如组织与资产
 * 既服务①搭建也服务⑥治理），纯路径归属只能二选一，必然有一边高亮错。
 * 非法/越界值忽略，回退路径归属。
 */
export function stageKeyFromQuery(from: unknown): CenterKey | null {
  const raw = Array.isArray(from) ? from[0] : from
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 6 ? (`stage${n}` as CenterKey) : null
}

/** 单值版（粗粒度兜底，供只接受单阶段的调用方）：来路上下文优先，其次路径归属 */
export function activeStageForRoute(path: string, from: unknown): CenterKey | null {
  if (path === '/app/sim' || path.startsWith('/app/sim/')) return null
  return stageKeyFromQuery(from) ?? centerForPath(path)
}

/**
 * 顶栏当前阶段（复数，工作台壳以此为准）：
 * 1) 来路 from 优先——答「我从哪一站来」；
 * 2) 否则按页签级归属表——答「这个工具本身归哪几站」，多归属如实返回多个；
 * 3) 表内登记为空=全程工具，返回空数组（顶栏不高亮，面包屑标「全程」）；
 * 4) 表外页面回退路径粗粒度归属（如旅程页→①）。
 */
export function activeStagesForRoute(name: string, path: string, from: unknown): CenterKey[] {
  if (path === '/app/sim' || path.startsWith('/app/sim/')) return []
  const fromKey = stageKeyFromQuery(from)
  if (fromKey) return [fromKey]
  if (hasStageAttribution(name)) return stageOwnersForRouteName(name).map(stageKeyOf)
  const fallback = centerForPath(path)
  return fallback ? [fallback] : []
}

/** 生成保留来路阶段的 query（非法值返回 undefined，不把脏参数写进 URL） */
export function stageContextQuery(from: unknown): Record<string, string> | undefined {
  return stageKeyFromQuery(from) ? { from: String(from) } : undefined
}

/** 岛屿入口（顶栏右侧收纳；路由既有，功能开关由挂载方按 featureKey 门控）。
 *  字段名用 name（vue-router 跳转目标，与 CenterNavMeta.name 同语义）——
 *  i18n 覆盖守门按 `name: 'ia2.*'` 语境豁免路由名，非文案键不进词表。 */
export interface IslandNavMeta {
  testid: string
  /** 既有路由名 */
  name: string
  /** config/features.ts 开关键（与 FlowNavPanel 各 NavEntry 门控同源） */
  featureKey: 'ide' | 'bpa' | 'ontology' | 'eval' | 'skillgov'
  labelZh: string
  labelEn: string
}

// D18 术语标准化（设计正本 §5.5）：BPA 裸缩写→流程架构（全称「业务流程架构」
// 在治理工作台区首现展开）；本体保留（GB/T 48000.3 本体建模标准依据，与知识
// 图谱是不同实体）；技能治理与页内「技能安全扫描」按位置分工同名合一。
export const ISLAND_NAVS: readonly IslandNavMeta[] = [
  { testid: 'ia-nav-island-ide', name: 'ide.shell', featureKey: 'ide', labelZh: 'IDE', labelEn: 'IDE' },
  { testid: 'ia-nav-island-bpa', name: 'ia2.bpa', featureKey: 'bpa', labelZh: '流程架构', labelEn: 'BPA' },
  { testid: 'ia-nav-island-ontology', name: 'ia2.ontology', featureKey: 'ontology', labelZh: '本体', labelEn: 'Ontology' },
  { testid: 'ia-nav-island-eval', name: 'ia2.eval', featureKey: 'eval', labelZh: '评测', labelEn: 'Eval' },
  { testid: 'ia-nav-island-skillgov', name: 'ia2.skillgov', featureKey: 'skillgov', labelZh: '技能治理', labelEn: 'Skill Gov' },
]

// ── 常用组与推演组注册表（2026-10-23 最近轨迹批迁入）────────────────────────
// 此前两组定义内联在 IaSideNav.vue；「最近」轨迹的页面名解析需要同一份文案，
// 与其复制字符串造成双轨，不如把静态定义迁入本注册表（单一事实源），组件侧
// 只留依赖响应式路由的 match 高亮判定。行为不变（键/路由名/文案原样搬移）。

/** 常用组入口（日常高频；match 高亮判定在组件内按 key 关联） */
export interface CommonNavMeta {
  key: string
  lead: string
  zh: string
  en: string
  name: string
  testid: string
}

export const COMMON_NAVS: readonly CommonNavMeta[] = [
  { key: 'journey', lead: '◫', zh: '流程总览', en: 'Overview', name: 'ia2.journey', testid: 'ia-side-nav-journey' },
  { key: 'workbench', lead: '▤', zh: '工作台', en: 'Workbench', name: 'ia2.collab', testid: 'ia-side-nav-workbench' },
  { key: 'board', lead: '▦', zh: '看板', en: 'Board', name: 'ia2.board', testid: 'ia-side-nav-board' },
  { key: 'inbox', lead: '◷', zh: '审批收件箱', en: 'Approvals Inbox', name: 'ia2.inbox', testid: 'ia-side-nav-inbox' },
]

/** 工作台兄弟路由（会话/房间/群聊都算工作台；侧栏高亮与轨迹标题共用同一集合） */
export const WORKBENCH_ROUTE_NAMES: ReadonlySet<string> = new Set([
  'ia2.collab', 'ia2.collabChat', 'ia2.collabSession', 'ia2.commsRoom', 'ia2.groupRoom',
  'ia2.dash', 'ia2.collabHistory', 'ia2.collabHistorySession',
  'ia2.collabGlobalAgent', 'ia2.collabGlobalAgentSession',
])

/** 推演专区六签（与 SimCenterView 六签同序；文案原样自 IaSideNav 迁入） */
export interface SimNavMeta {
  key: string
  lead: string
  zh: string
  en: string
  name: string
  testid: string
}

export const SIM_NAVS: readonly SimNavMeta[] = [
  { key: 'sim-overview', lead: '◎', zh: '导演台', en: 'Director', name: 'ia2.sim', testid: 'ia-side-nav-sim' },
  { key: 'sim-supervision', lead: '◉', zh: '监督面板', en: 'Supervision', name: 'ia2.simSupervision', testid: 'ia-side-nav-sim-supervision' },
  { key: 'sim-ops', lead: '◈', zh: '运行监控', en: 'Run monitoring', name: 'ia2.simOps', testid: 'ia-side-nav-sim-ops' },
  { key: 'sim-evidence', lead: '▤', zh: '证据库', en: 'Evidence', name: 'ia2.simEvidence', testid: 'ia-side-nav-sim-evidence' },
  { key: 'sim-orchestration', lead: '⟐', zh: '运行编排', en: 'Orchestration', name: 'ia2.simOrchestration', testid: 'ia-side-nav-sim-orchestration' },
  { key: 'sim-map', lead: '⬡', zh: '业务地图', en: 'Business map', name: 'ia2.simMap', testid: 'ia-side-nav-sim-map' },
  { key: 'sim-settings', lead: '⚙', zh: '推演设置', en: 'Simulation settings', name: 'ia2.simSettings', testid: 'ia-side-nav-sim-settings' },
]

/** 顶栏词条 locale（响应式跟随；同 i18n-tasks-tabs 小字典先例，不读 473 树） */
export function useCenterNavLocale() {
  const i18nCtx = useI18n()
  return computed<'zh' | 'en'>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? 'zh' : 'en'
  })
}
