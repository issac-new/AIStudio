// overlay/custom/client/ia2/nav-centers.ts
// 一级导航（D13 六阶段 → D18 旅程式重构，2026-10-17 设计正本 §5.0）：
// 标签单一事实源=stage-meta.ts 的 STAGE_META（六阶段定义），本模块只做
// 导航键/路径映射与高亮判定，不各自定义文案——终结三处各自定义的双轨形态。
// 需求锚 R8（导航按关注面归位）修订为旅程式归位（设计正本 §二 J2）。
// 路由纪律：全部消费既有路由记录（ia2.stage1-6 与岛屿各名），本模块不注册
// 不改动路由。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { STAGE_META } from './stage-meta'

export type CenterKey = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'stage6'

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
 * 路径 → 当前中心 key（高亮判定纯函数）。/app 家族按前缀归阶段，
 * 但 /app/sim*、/app/gov* 更长前缀先判；非 /app 家族（IDE 侧 / 上游壳页）
 * 返回 null。段边界匹配：/app/simulation 不误判为仿真中心。
 */
export function centerForPath(path: string): CenterKey | null {
  // D13 时序六阶段判定：/stage/* 前缀映射阶段；既有 /app 家族归④开发
  // （开发期的日常工具集：看板/沟通/IDE/审批待办）；D18：/app/teams 团队
  // 管理归①搭建（搭台的第三步，设计正本 §5.3）
  if (path === '/app/teams' || path.startsWith('/app/teams/')) return 'stage1'
  if (path === '/app/agents' || path.startsWith('/app/agents/')) return 'stage1'
  if (path === '/app/stage/setup' || path.startsWith('/app/stage/setup/')) return 'stage1'
  if (path === '/app/stage/reqs' || path.startsWith('/app/stage/reqs/')) return 'stage2'
  if (path === '/app/stage/design' || path.startsWith('/app/stage/design/')) return 'stage3'
  if (path === '/app/stage/build' || path.startsWith('/app/stage/build/')) return 'stage4'
  if (path === '/app/stage/accept' || path.startsWith('/app/stage/accept/')) return 'stage5'
  if (path === '/app/stage/govern' || path.startsWith('/app/stage/govern/')) return 'stage6'
  if (path === '/app/sim' || path.startsWith('/app/sim/')) return 'stage2'
  if (path === '/app/gov' || path.startsWith('/app/gov/')) return 'stage3'
  if (path === '/app' || path === '/app/') return 'stage1' // 裸路径=旅程页（默认入口，搭建区①高亮）
  if (path.startsWith('/app/')) return 'stage4'
  return null
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

/** 顶栏词条 locale（响应式跟随；同 i18n-tasks-tabs 小字典先例，不读 473 树） */
export function useCenterNavLocale() {
  const i18nCtx = useI18n()
  return computed<'zh' | 'en'>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? 'zh' : 'en'
  })
}
